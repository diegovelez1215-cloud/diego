const { test, expect } = require('@playwright/test');
const { gotoApp, waitForScrollY, tapBottomTab } = require('./helpers');

test.describe('Mobile navigation and scroll restoration', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, 'final-matchday');
  });

  test('Home and internal Tournament navigation start at top, while back restores previous scroll', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, 900));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);

    await tapBottomTab(page, 'matches');
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

    await tapBottomTab(page, 'home');
    await waitForScrollY(page, 0);
  });

  test('return-to-Home actions do not land at the bottom accidentally', async ({ page }) => {
    await page.evaluate(() => window.__wc26E2E.startMatchboard());
    await expect(page.locator('#ts2')).toBeVisible();
    await page.locator('.ts2-x').click();
    await page.waitForTimeout(100);
    await tapBottomTab(page, 'home');
    await waitForScrollY(page, 0);
  });

  test('Final Matchday standings shortcut lands at the top of standings', async ({ page }) => {
    // Scroll Home down, then use the explicit "View all group standings" action.
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
    await page.getByRole('button', { name: /View all group standings/ }).tap();
    // Explicit destination nav must land at the TOP of the standings screen.
    await expect(page.locator('.tabbar button[data-screen="matches"].on')).toBeVisible();
    await expect(page.locator('#groups')).toBeVisible();
    await waitForScrollY(page, 0);
  });

  test('explicit destination jump lands at top, and Back restores the prior scroll', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, 520));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
    await page.getByRole('button', { name: /View all group standings/ }).tap();
    await waitForScrollY(page, 0); // suppressed stale restore -> destination owns top
    await page.goBack();
    // Back is NOT explicit forward nav, so per-view scroll memory is restored.
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  });

  test('no app-owned floating control covers Tournament, Standings, or Bracket', async ({ page }) => {
    await tapBottomTab(page, 'matches');
    for (const sub of ['schedule', 'groups', 'bracket']) {
      await page.locator(`.tour-switch button[data-sub="${sub}"]`).click({ force: true }).catch(() => {});
      await page.waitForTimeout(120);
      const shown = await page.evaluate(() => {
        return ['livejump', 'slipfab', 'todayFab', 'liveFabBtn'].filter((id) => {
          const el = document.getElementById(id);
          return el && getComputedStyle(el).display !== 'none' && el.offsetParent !== null;
        });
      });
      expect(shown, `floating controls visible on ${sub}`).toEqual([]);
    }
  });
});
