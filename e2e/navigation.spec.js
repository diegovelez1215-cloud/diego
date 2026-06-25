const { test, expect } = require('@playwright/test');
const { gotoApp, waitForScrollY } = require('./helpers');

test.describe('Mobile navigation and scroll restoration', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, 'final-matchday');
  });

  test('Home and internal Tournament navigation start at top, while back restores previous scroll', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, 900));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);

    await page.locator('.tabbar button[data-screen="matches"]').click({ force: true });
    await waitForScrollY(page, 0);

    await page.evaluate(() => window.scrollTo(0, 720));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);

    await page.locator('.tour-switch button[data-sub="groups"]').click({ force: true });
    await waitForScrollY(page, 0);

    await page.evaluate(() => window.scrollTo(0, 640));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);

    await page.locator('.tour-switch button[data-sub="bracket"]').click({ force: true });
    await waitForScrollY(page, 0);

    await page.goBack();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(0);

    await page.locator('.tabbar button[data-screen="home"]').click({ force: true });
    await waitForScrollY(page, 0);
  });

  test('return-to-Home actions do not land at the bottom accidentally', async ({ page }) => {
    await page.evaluate(() => window.__wc26E2E.startMatchboard());
    await expect(page.locator('#ts2')).toBeVisible();
    await page.locator('.ts2-x').click();
    await page.waitForTimeout(100);
    await page.locator('.tabbar button[data-screen="home"]').click({ force: true });
    await waitForScrollY(page, 0);
  });
});
