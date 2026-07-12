import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { gotoApp, openPlayMode, tapTab, expectNoHorizontalOverflow } from './helpers.js';

test.describe('Rondo — flagship skill game', () => {
  test('setup teaches in one screen and practice starts with real touch controls', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
    page.on('console', (message) => {
      // cross-origin resource failures (e.g. blocked font CDNs in sandboxes)
      // are environmental; the app itself must stay error-free.
      if (message.type() !== 'error') return;
      const src = message.location()?.url || '';
      if (/^https?:\/\/(?!127\.0\.0\.1|localhost)/.test(src)) return;
      errors.push(`console: ${message.text()}`);
    });
    await mkdir('output/rondo', { recursive: true });
    await gotoApp(page);
    await openPlayMode(page, 'rondo');
    // the landing answers everything in one screen: what it is, which mode,
    // what to tap — both actions inside the initial 390×844 viewport
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator('.rondo.setup h2')).toHaveText('Rondo');
    await expect(page.locator('.rondo.setup .sl-rules')).toHaveCount(0); // the card stack is gone
    for (const [sel, label] of [['[data-rondo-start="challenge"]', 'challenge'], ['[data-rondo-start="practice"]', 'practice']]) {
      const box = await page.locator(sel).boundingBox();
      expect(box, `${label} action present`).not.toBeNull();
      expect(box.y, `${label} action starts on the first screen`).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, `${label} action fully inside 390×844`).toBeLessThanOrEqual(844);
    }
    await expect(page.locator('.sl-controls')).toBeVisible();
    // the mode rail scrolls away on phones — never pinned under the status bar
    const railPosition = await page.locator('.mode-rail').evaluate((el) => getComputedStyle(el).position);
    expect(railPosition, 'mode rail is not sticky on phone widths').not.toBe('sticky');
    await expectNoHorizontalOverflow(page, expect, 'rondo setup');
    await page.screenshot({ fullPage: true, path: 'output/rondo/setup.png' });

    await page.locator('[data-rondo-start="practice"]').click();
    await expect(page.locator('.rondo.live')).toBeVisible();
    await expect(page.locator('.rondo-mate')).toHaveCount(6);
    await expect(page.locator('.rondo-def').first()).toBeVisible();
    await expect(page.locator('.rondo-def[data-role="CHASE"]')).toHaveCount(1);
    await expect(page.locator('.rondo-def[data-role="CUT"]')).toHaveCount(1);
    await expect(page.locator('.rondo-def[data-role="SHADOW"]')).toHaveCount(1);
    // the dock steps aside during a live run — controls are never covered
    await expect(page.locator('body')).toHaveClass(/rondo-active/);
    // tap a non-carrier teammate: a pass launches, and a rapid second touch
    // is acknowledged as the visible one-touch buffer.
    const outlets = page.locator('.rondo-mate:not(.carrier)');
    await outlets.first().dispatchEvent('pointerdown');
    await outlets.nth(1).dispatchEvent('pointerdown');
    await expect(page.locator('.rondo-mate.queued')).toHaveCount(1);
    await page.waitForTimeout(1600);
    const passes = await page.locator('#rondo-passes').innerText();
    expect(Number(passes)).toBeGreaterThanOrEqual(1);
    await page.screenshot({ fullPage: true, path: 'output/rondo/practice-live.png' });
    await expectNoHorizontalOverflow(page, expect, 'rondo live');

    // pause freezes the run, resume continues, exit returns to the lobby
    await page.locator('#rondo-pause').click();
    await expect(page.locator('.rondo-pause-screen')).toBeVisible();
    const frozen = await page.locator('#rondo-score').innerText();
    await page.waitForTimeout(700);
    await expect(page.locator('#rondo-score')).toHaveText(frozen);
    await page.locator('#rondo-pause').click();
    await expect(page.locator('.rondo-pause-screen')).toHaveCount(0);
    await page.locator('#rondo-exit').click();
    await expect(page.locator('.lobby')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a practice session finishes with a complete result and a local record', async ({ page }) => {
    await mkdir('output/rondo', { recursive: true });
    await gotoApp(page);
    await openPlayMode(page, 'rondo');
    await page.locator('[data-rondo-start="practice"]').click();
    await expect(page.locator('.rondo.live')).toBeVisible();
    // keyboard controls: number keys pass from the pitch
    await page.locator('#rondo-pitch').focus();
    await page.keyboard.press('3');
    await page.waitForTimeout(1400);
    await page.locator('#rondo-finish').click();
    await expect(page.locator('.rondo.result')).toBeVisible();
    await expect(page.locator('.rondo-final-score')).toBeVisible();
    await expect(page.locator('.rondo-breakdown span')).toHaveCount(4);
    await expect(page.locator('#rondo-new')).toBeVisible();
    await expect(page.locator('#rondo-exact')).toBeVisible();
    await page.screenshot({ fullPage: true, path: 'output/rondo/result.png' });
    // the run went to the local record — no network, all on this phone
    const record = await page.evaluate(() => JSON.parse(window.localStorage.getItem('u26v2.play')).rondo);
    expect(record.played).toBeGreaterThanOrEqual(1);
    // retry the same setup: same seed relaunches, without pretending this is playback
    await expect(page.locator('#rondo-exact')).toHaveText('Retry same setup');
    await page.locator('#rondo-exact').click();
    await expect(page.locator('.rondo.live')).toBeVisible();
    await page.locator('#rondo-exit').click();
  });

  test('the result score stays width-safe on 320, 390 and 430 phones', async ({ page }) => {
    await gotoApp(page);
    await openPlayMode(page, 'rondo');
    await page.locator('[data-rondo-start="practice"]').click();
    await expect(page.locator('.rondo.live')).toBeVisible();
    await page.locator('#rondo-pitch').focus();
    await page.keyboard.press('3');
    await page.waitForTimeout(1200);
    await page.locator('#rondo-finish').click();
    await expect(page.locator('.rondo.result')).toBeVisible();

    // Reproduce the real-iPhone worst case: a long grade next to a four-digit
    // score. The layout — not the card's overflow clip — must contain it.
    await page.evaluate(() => {
      const grade = document.querySelector('.rondo-result-head h2');
      if (grade) grade.textContent = 'CAROUSEL MASTER';
      const score = document.querySelector('.rondo-final-score');
      if (score && score.firstChild) score.firstChild.nodeValue = '1,412';
    });

    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(80); // let clamp typography settle
      // 1) nothing pushes the document wider than the phone
      await expectNoHorizontalOverflow(page, expect, `rondo result @ ${width}`);
      // 2) the head and score contain their own content (not merely clipped)
      const fit = await page.evaluate(() => {
        const probe = (sel) => {
          const el = document.querySelector(sel);
          return el ? el.scrollWidth - el.clientWidth : 0;
        };
        return { head: probe('.rondo-result-head'), score: probe('.rondo-final-score') };
      });
      expect(fit.head, `head content fits @ ${width}`).toBeLessThanOrEqual(1);
      expect(fit.score, `score content fits @ ${width}`).toBeLessThanOrEqual(1);
      // 3) the POINTS label is fully on-screen
      const points = await page.locator('.rondo-final-score small').boundingBox();
      expect(points, `POINTS box @ ${width}`).not.toBeNull();
      expect(points.x + points.width, `POINTS visible @ ${width}`).toBeLessThanOrEqual(width);
      expect(points.x, `POINTS not clipped left @ ${width}`).toBeGreaterThanOrEqual(0);
      // 4) the grade never breaks inside a word — each word sits on one line
      const wordRects = await page.evaluate(() => {
        const h2 = document.querySelector('.rondo-result-head h2');
        const node = h2.firstChild;
        const text = node.nodeValue;
        const rects = [];
        let at = 0;
        for (const word of text.split(' ')) {
          const start = text.indexOf(word, at);
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, start + word.length);
          rects.push(range.getClientRects().length);
          at = start + word.length;
        }
        return rects;
      });
      for (const lines of wordRects) {
        expect(lines, `no word of the grade splits across lines @ ${width}`).toBe(1);
      }
      // 5) the retry actions sit above the app dock, not underneath it
      await page.locator('#rondo-new').scrollIntoViewIfNeeded();
      const runAgain = await page.locator('#rondo-new').boundingBox();
      const dock = await page.locator('.dock').boundingBox();
      expect(runAgain, `Run it again present @ ${width}`).not.toBeNull();
      if (dock) {
        expect(runAgain.y + runAgain.height, `result controls clear the dock @ ${width}`)
          .toBeLessThanOrEqual(dock.y + 1);
      }
    }
  });

  test('reduced motion keeps the live press, touch controls, and restart playable', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoApp(page);
    await openPlayMode(page, 'rondo');
    await page.locator('[data-rondo-start="practice"]').click();
    await expect(page.locator('.rondo.live')).toBeVisible();
    const transition = await page.locator('.rondo-def').first().evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(Math.max(...transition.split(',').map((value) => Number.parseFloat(value)))).toBeLessThan(0.01);
    await page.locator('.rondo-mate:not(.carrier)').first().dispatchEvent('pointerdown');
    await expect.poll(async () => Number(await page.locator('#rondo-passes').innerText())).toBeGreaterThanOrEqual(1);
    await page.locator('#rondo-finish').click();
    await expect(page.locator('.rondo.result')).toBeVisible();
    await page.locator('#rondo-exact').click();
    await expect(page.locator('.rondo.live')).toBeVisible();
    await expectNoHorizontalOverflow(page, expect, 'rondo reduced motion');
    await page.locator('#rondo-exit').click();
  });

  test('a buffered pass dies with the possession — a turnover never fires it', async ({ page }) => {
    await gotoApp(page);
    await openPlayMode(page, 'rondo');
    await page.locator('[data-rondo-start="practice"]').click();
    await expect(page.locator('.rondo.live')).toBeVisible();
    // Repeatedly pass into pressure with a follow-up armed until the press
    // cuts one out. Practice never ends, so the loop can retry honestly.
    let sawCut = false;
    let sawArmedBuffer = false;
    for (let attempt = 0; attempt < 12 && !sawCut; attempt++) {
      await page.waitForFunction(() => {
        const ball = document.querySelector('.rondo-ball');
        return ball && !ball.classList.contains('flight');
      });
      const risky = page.locator('.rondo-mate.lane-closed, .rondo-mate.lane-tight');
      if (!(await risky.count())) { await page.waitForTimeout(300); continue; }
      await risky.first().dispatchEvent('pointerdown');
      // arm the visible one-touch buffer on the old carrier (always legal)
      await page.locator('.rondo-mate.carrier').dispatchEvent('pointerdown');
      if (await page.locator('.rondo-mate.queued').count()) sawArmedBuffer = true;
      const outcome = await page.waitForFunction(() => {
        const callout = document.querySelector('#rondo-callout')?.textContent || '';
        if (/Cut out/.test(callout)) return 'cut';
        const ball = document.querySelector('.rondo-ball');
        const queued = document.querySelectorAll('.rondo-mate.queued').length;
        if (ball && !ball.classList.contains('flight') && queued === 0) return 'settled';
        return false;
      }, { timeout: 8000 }).then((h) => h.jsonValue());
      if (outcome === 'cut') sawCut = true;
    }
    expect(sawCut, 'the press cut at least one risky pass').toBe(true);
    expect(sawArmedBuffer, 'the one-touch buffer was visibly armed before a cut').toBe(true);
    // the turnover retired any armed buffer — and nothing fires by itself
    await expect(page.locator('.rondo-mate.queued')).toHaveCount(0);
    const passes = Number(await page.locator('#rondo-passes').innerText());
    await page.waitForTimeout(900);
    await expect(page.locator('.rondo-ball.flight')).toHaveCount(0);
    expect(Number(await page.locator('#rondo-passes').innerText()), 'the dead buffer never scores').toBe(passes);
    await page.locator('#rondo-exit').click();
  });

  test('the daily challenge is seeded, fair to lose, and the lobby leads with it', async ({ page }) => {
    await gotoApp(page);
    await tapTab(page, 'play');
    // the lobby leads with the flagship: play now, record to beat, time chip
    const hero = page.locator('.lobby-rondo');
    await expect(hero).toBeVisible();
    await expect(hero.locator('.time-chip').first()).toContainText('min');
    await hero.click();
    await expect(page.locator('.rondo.setup')).toBeVisible();
    await page.locator('[data-rondo-start="challenge"]').click();
    await expect(page.locator('.rondo.live')).toBeVisible();
    // Challenge shows three lives, and the press waits until the player's
    // first touch. Orientation time is free; holding after kickoff is not.
    await expect(page.locator('.rondo-life')).toHaveCount(3);
    await page.waitForTimeout(1400);
    await expect(page.locator('.rondo-life.on')).toHaveCount(3);
    await expect(page.locator('#rondo-callout')).toContainText('starts with your touch');
    await page.locator('.rondo-mate:not(.carrier)').first().dispatchEvent('pointerdown');
    await expect(page.locator('.rondo.result')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.rondo-why')).toContainText(/Held too long|Cut out/);
    await expect(page.locator('.rondo-final-score')).toBeVisible();
  });
});
