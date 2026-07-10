import { test, expect } from '@playwright/test';
import { gotoApp, tapTab, screenshot, expectNoHorizontalOverflow } from './helpers.js';

async function openShotLab(page) {
  await tapTab(page, 'play');
  await page.locator('[data-goto="shotlab"]').first().tap();
  await expect(page.locator('.shot-lab.setup')).toBeVisible();
}

test.describe('Shot Lab flagship game', () => {
  test('direct touch run reaches a complete result and the You museum keeps it', async ({ page }, testInfo) => {
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push(e.message));
    await gotoApp(page);
    await openShotLab(page);
    await expect(page.locator('.sl-ranked-lock')).toContainText('Ranked locked');
    await page.locator('[data-shot-start="practice"]').tap();
    await expect(page.locator('.shot-lab.live')).toBeVisible();
    await expect(page.locator('.dock')).not.toBeVisible();
    await expect(page.locator('#shot-goal')).toBeVisible();
    await expect(page.locator('#shot-fire')).toBeVisible();

    // Shape one finesse strike, then complete all eight shots through the
    // actual touch surface and Strike control.
    await page.locator('[data-shot-type="finesse"]').tap();
    await page.locator('[data-contact-x="0"][data-contact-y="1"]').tap();
    await page.locator('#shot-power').fill('68');
    await page.locator('#shot-curve').fill('-35');
    await screenshot(page, testInfo, 'shot-lab-live');
    for (let i = 0; i < 8; i++) {
      const goal = page.locator('#shot-goal');
      await goal.tap({ position: { x: 220 + (i % 2) * 24, y: 62 + (i % 3) * 18 } });
      await page.locator('#shot-fire').tap();
    }
    await expect(page.locator('.shot-lab.result')).toBeVisible();
    await expect(page.locator('.dock')).toBeVisible();
    await expect(page.locator('.sl-map')).toBeVisible();
    await expect(page.locator('.sl-final-score')).toContainText('points');
    await expect(page.locator('.sl-ranked-lock')).toContainText('Not submitted globally');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('u26v2.play') || '{}').shotLab);
    expect(saved.played).toBe(1);
    expect(saved.bestPractice).toBeGreaterThan(0);
    await screenshot(page, testInfo, 'shot-lab-result');
    await expectNoHorizontalOverflow(page, expect, 'Shot Lab result');

    await tapTab(page, 'you');
    await expect(page.locator('.you-shot-lab')).toBeVisible();
    await expect(page.locator('.you-shot-lab')).toContainText('studio best');
    expect(consoleErrors).toEqual([]);
  });

  test('keyboard aim, pause, sound and target sizes are honest', async ({ page }) => {
    await gotoApp(page);
    await openShotLab(page);
    await page.locator('[data-shot-start="timed"]').tap();
    const goal = page.locator('#shot-goal');
    const before = await page.locator('.sl-reticle').getAttribute('style');
    await goal.focus();
    await page.keyboard.press('ArrowLeft');
    const after = await page.locator('.sl-reticle').getAttribute('style');
    expect(after).not.toBe(before);
    await page.locator('#shot-pause').tap();
    await expect(page.locator('.sl-pause-screen')).toBeVisible();
    const frozen = await page.locator('#shot-time').textContent();
    await page.waitForTimeout(450);
    await expect(page.locator('#shot-time')).toHaveText(frozen);
    await page.locator('#shot-pause').tap();
    await page.locator('#shot-sound').tap();
    await expect(page.locator('#shot-sound')).toHaveAttribute('aria-label', /off/);
    const undersized = await page.locator('.sl-icon, .sl-shot-types button, .sl-contact button, .sl-shoot').evaluateAll((els) =>
      els.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width < 44 || r.height < 44;
      }).length);
    expect(undersized).toBe(0);
  });

  test('320px through desktop widths stay navigable without page overflow', async ({ page }) => {
    await gotoApp(page);
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: width < 700 ? 844 : 980 });
      await openShotLab(page);
      await page.locator('[data-shot-start="practice"]').tap();
      await expect(page.locator('#shot-goal')).toBeVisible();
      await expect(page.locator('#shot-fire')).toBeVisible();
      await expectNoHorizontalOverflow(page, expect, `Shot Lab ${width}px`);
      await page.locator('#shot-exit').tap();
    }
  });
});
