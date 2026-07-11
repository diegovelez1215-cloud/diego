import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { gotoApp, tapTab, openPlayMode, expectNoHorizontalOverflow } from './helpers.js';

const WIDTHS = [320, 375, 390, 430, 768, 1024, 1280, 1440];

test.describe('Play catalog v3', () => {
  test('canonical rail, contextual campaign and every required width stay usable', async ({ page }, testInfo) => {
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
    await mkdir('output/play-consolidation', { recursive: true });
    await gotoApp(page);
    await tapTab(page, 'play');
    await expect(page.locator('[data-segmented="play-mode"] .seg-btn')).toHaveCount(6);
    const labels = await page.locator('[data-segmented="play-mode"] .seg-btn').allTextContents();
    expect(labels.map((s) => s.trim())).toEqual(['Play', 'Rondo', 'Penalty Rush', 'Match Lab', 'Prediction Run', 'My World Cup']);
    await page.locator('[data-segmented="play-mode"] [data-value="lobby"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-segmented="play-mode"] [data-value="rondo"]')).toHaveAttribute('aria-selected', 'true');
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

  test('the retired Shot Lab route is unreachable and old saves land safely', async ({ page }) => {
    await gotoApp(page);
    // Seed a legacy v2 save that still owns a Shot Lab record.
    await page.evaluate(() => {
      window.localStorage.setItem('u26v2.play', JSON.stringify({
        catalogVersion: 2,
        shotLab: { played: 12, bestTimed: 5200, bestPractice: 4400, bestAccuracy: 88, bestCombo: 4 },
        penaltyRush: { dateKey: '2026-07-01', bestEver: 6, perfects: 1, played: 4 },
      }));
    });
    await page.reload();
    await page.waitForSelector('.dock');
    await tapTab(page, 'play');
    // No rail chip and no lobby card points at the retired route.
    await expect(page.locator('[data-segmented="play-mode"] [data-value="shotlab"]')).toHaveCount(0);
    await expect(page.locator('[data-goto="shotlab"]')).toHaveCount(0);
    // The record still exists — on the You legacy shelf, clearly labelled.
    await tapTab(page, 'you');
    await expect(page.locator('.you-legacy')).toContainText('Shot Lab (retired)');
    await expect(page.locator('.you-legacy')).toContainText('5,200');
    // And the migrated store is versioned.
    const migrated = await page.evaluate(() => JSON.parse(window.localStorage.getItem('u26v2.play')));
    expect(migrated.catalogVersion).toBe(3);
    expect(migrated.shotLab).toBeUndefined();
    expect(migrated.legacy.shotLab.record.bestTimed).toBe(5200);
    expect(migrated.penaltyRush.bestEver).toBe(6);
  });

  test('Penalty Rush duel and Final Minute state carry through real controls', async ({ page }) => {
    await mkdir('output/play-consolidation', { recursive: true });
    await gotoApp(page);
    await openPlayMode(page, 'shootout');
    // scout card, six zones, feint, run-up pulse, strike
    await expect(page.locator('.duel-scout')).toBeVisible();
    await expect(page.locator('[data-duel-zone]')).toHaveCount(6);
    await page.locator('#duel-feint').click();
    await expect(page.locator('#duel-feint')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-duel-zone="bl"]').click();
    await expect(page.locator('[data-duel-zone="bl"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#duel-go').click();
    await expect(page.locator('.duel-pulse')).toBeVisible();
    await expect(page.locator('#duel-strike')).toBeVisible();
    await page.locator('#duel-strike').click();
    await expect(page.locator('.rush-dots .rush-dot:not(.pending)')).toHaveCount(1);
    await expect(page.locator('.rush-callout')).toContainText(/Kick 1/);
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
