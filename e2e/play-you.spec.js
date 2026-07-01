// Play + You: private simulations run, save, and never leak into real truth.
import { test, expect } from '@playwright/test';
import { gotoApp, tapTab, expectNoHorizontalOverflow, screenshot } from './helpers.js';

test.describe('Play', () => {
  test('What-If Match simulates without touching the real hero', async ({ page }, testInfo) => {
    await gotoApp(page);
    const heroBefore = await page.locator('.score-stage').innerText();
    await tapTab(page, 'play');
    await page.locator('#wi-run').click();
    await expect(page.locator('.wi-result')).toBeVisible();
    await expectNoHorizontalOverflow(page, expect, 'play');
    await screenshot(page, testInfo, 'play-whatif');
    await tapTab(page, 'home');
    expect(await page.locator('.score-stage').innerText()).toBe(heroBefore);
  });

  test('My World Cup simulates to a champion, saves to You, and reset works', async ({ page }, testInfo) => {
    await gotoApp(page);
    await tapTab(page, 'play');
    await page.locator('#mwc-start').click();
    await expect(page.locator('.mwc-round, .mwc-champion')).toBeVisible();
    for (let i = 0; i < 8; i++) {
      if (await page.locator('.mwc-champion').count()) break;
      const next = page.locator('#mwc-next');
      if (await next.count() === 0) break;
      // the button re-renders after every simulated round — tolerate the swap
      await next.click({ timeout: 2000 }).catch(() => {});
    }
    await expect(page.locator('.mwc-champion')).toBeVisible();
    await screenshot(page, testInfo, 'play-champion');
    await page.locator('#mwc-save').click();
    await tapTab(page, 'you');
    await expect(page.locator('.you-sim')).toHaveCount(1);
    await expect(page.locator('.dock-tab[aria-selected="true"]')).toHaveCount(1);
    await expect(page.locator('.dock-tab[aria-selected="true"]')).toHaveAttribute('data-tab', 'you');
    await expectNoHorizontalOverflow(page, expect, 'you');
    await screenshot(page, testInfo, 'you-saved');
    // real truth untouched after a full simulated tournament
    await tapTab(page, 'home');
    await expect(page.locator('.score-stage')).toHaveClass(/live/);
    await expect(page.locator('.score-stage .ss-status')).toContainText('LIVE');
  });
});
