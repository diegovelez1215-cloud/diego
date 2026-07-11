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
    // instructions readable in under 20 seconds: three steps, records, two starts
    await expect(page.locator('.rondo.setup .sl-rules span')).toHaveCount(3);
    await expect(page.locator('[data-rondo-start="challenge"]')).toBeVisible();
    await expect(page.locator('[data-rondo-start="practice"]')).toBeVisible();
    await expect(page.locator('.sl-ranked-lock')).toContainText('Ranked locked');
    await page.screenshot({ fullPage: true, path: 'output/rondo/setup.png' });

    await page.locator('[data-rondo-start="practice"]').click();
    await expect(page.locator('.rondo.live')).toBeVisible();
    await expect(page.locator('.rondo-mate')).toHaveCount(6);
    await expect(page.locator('.rondo-def').first()).toBeVisible();
    // the dock steps aside during a live run — controls are never covered
    await expect(page.locator('body')).toHaveClass(/rondo-active/);
    // tap a non-carrier teammate: a pass launches and completes
    await page.locator('.rondo-mate:not(.carrier)').first().dispatchEvent('pointerdown');
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
    // replay the exact run: same seed relaunches
    await page.locator('#rondo-exact').click();
    await expect(page.locator('.rondo.live')).toBeVisible();
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
    // challenge shows three lives; holding the ball loses them honestly:
    // never passing must end the run with a readable reason — no crash,
    // no arbitrary failure.
    await expect(page.locator('.rondo-life')).toHaveCount(3);
    await expect(page.locator('.rondo.result')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.rondo-why')).toContainText(/Tackled|Cut/);
    await expect(page.locator('.rondo-final-score')).toBeVisible();
  });
});
