import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { gotoApp, tapTab, openPlayMode, expectNoHorizontalOverflow } from './helpers.js';

const WIDTHS = [320, 375, 390, 430, 768, 1024, 1280, 1440];

test.describe('Play catalog v2', () => {
  test('canonical rail, contextual campaign and every required width stay usable', async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
    await mkdir('output/play-consolidation', { recursive: true });
    await gotoApp(page);
    await tapTab(page, 'play');
    await expect(page.locator('[data-segmented="play-mode"] .seg-btn')).toHaveCount(6);
    const labels = await page.locator('[data-segmented="play-mode"] .seg-btn').allTextContents();
    expect(labels.map((s) => s.trim())).toEqual(['Play', 'Shot Lab', 'Penalty Rush', 'Match Lab', 'Prediction Run', 'My World Cup']);
    await page.locator('[data-segmented="play-mode"] [data-value="lobby"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-segmented="play-mode"] [data-value="shotlab"]')).toHaveAttribute('aria-selected', 'true');
    await openPlayMode(page, 'cup');
    await expect(page.locator('[data-segmented="play-mode"] [data-value="cup"]')).toBeVisible();

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      await openPlayMode(page, 'lobby');
      await expect(page.locator('.play-view')).toBeVisible();
      await expectNoHorizontalOverflow(page, expect, `Play ${width}px`);
      const body = await page.screenshot({ fullPage: true, path: `output/play-consolidation/play-${width}.png` });
      await testInfo.attach(`play-${width}`, { body, contentType: 'image/png' });
    }
    expect(errors).toEqual([]);
  });

  test('Penalty Rush rhythm and Final Minute state carry through real controls', async ({ page }) => {
    await mkdir('output/play-consolidation', { recursive: true });
    await gotoApp(page);
    await openPlayMode(page, 'shootout');
    await expect(page.locator('.rush-runup')).toHaveCount(3);
    await page.locator('[data-rush-runup="stutter"]').click();
    await expect(page.locator('[data-rush-runup="stutter"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-rush-aim="left"]').click();
    await expect(page.locator('.rush-duel')).toContainText(/Settled|Building|Sudden-death heat/);
    await page.screenshot({ fullPage: true, path: 'output/play-consolidation/penalty-rush.png' });

    await openPlayMode(page, 'lobby');
    await page.locator('#side-open').click();
    await page.locator('[data-side-pick="USA"]').click();
    await openPlayMode(page, 'finalminute');
    const before = await page.locator('.fm-state').innerText();
    await page.locator('[data-fm-choice="hunt"]').click();
    const after = await page.locator('.fm-state').innerText();
    expect(after).not.toBe(before);
    await page.screenshot({ fullPage: true, path: 'output/play-consolidation/final-minute.png' });
    await expectNoHorizontalOverflow(page, expect, 'rebuilt games');
  });
});
