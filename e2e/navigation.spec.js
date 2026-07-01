// Navigation purity on a real mobile viewport: taps are instant, blank-free,
// and touch neither the network nor storage.
import { test, expect } from '@playwright/test';
import { gotoApp, tapTab, expectNoHorizontalOverflow } from './helpers.js';

test.describe('bottom-tab navigation', () => {
  test('tab taps trigger no API request and no storage write, and never show a blank screen', async ({ page }) => {
    await gotoApp(page);
    // storage write counter installed after boot settles
    await page.evaluate(() => {
      window.__writes = 0;
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function (...a) { window.__writes++; return real.apply(this, a); };
    });
    const apiRequests = [];
    page.on('request', (r) => { if (r.url().includes('/api/')) apiRequests.push(r.url()); });

    for (const tab of ['tournament', 'play', 'you', 'home', 'tournament']) {
      await tapTab(page, tab);
      const active = page.locator('.outlet.active');
      await expect(active).toHaveCount(1);
      expect((await active.innerHTML()).trim().length).toBeGreaterThan(40);
      await expectNoHorizontalOverflow(page, expect, 'tab ' + tab);
    }
    expect(apiRequests, 'no provider fetch during tab taps').toHaveLength(0);
    expect(await page.evaluate(() => window.__writes), 'no storage write during tab taps').toBe(0);
  });

  test('rapid Home → Tournament → Play → You ends on a correct, non-empty You', async ({ page }) => {
    await gotoApp(page);
    await tapTab(page, 'home');
    await tapTab(page, 'tournament');
    await tapTab(page, 'play');
    await tapTab(page, 'you');
    const active = page.locator('.outlet.active');
    await expect(active).toHaveCount(1);
    await expect(active).toHaveAttribute('data-tab', 'you');
    await expect(active.locator('h1')).toHaveText('You');
    await expect(active.getByText('Saved simulations')).toBeVisible();
  });

  test('warm tab return keeps content instantly visible', async ({ page }) => {
    await gotoApp(page);
    await tapTab(page, 'tournament');
    await expect(page.locator('.outlet.active .segmented').first()).toBeVisible();
    await tapTab(page, 'home');
    await tapTab(page, 'tournament');
    // no wait: content must already be there
    expect((await page.locator('.outlet.active').innerHTML()).includes('segmented')).toBeTruthy();
  });
});
