// Home + Tournament truth surfaces at 390/430: live hero, today rail,
// groups, complete knockout — no blank states, no clipping, no overflow.
import { test, expect } from '@playwright/test';
import { gotoApp, tapTab, expectNoHorizontalOverflow, screenshot } from './helpers.js';

test.describe('Home', () => {
  test('live match owns the score stage with an honest live score', async ({ page }, testInfo) => {
    await gotoApp(page);
    const stage = page.locator('.score-stage');
    await expect(stage).toHaveClass(/live/);
    await expect(stage.locator('.ss-status')).toContainText('LIVE');
    await expect(stage.locator('.ss-score')).toContainText('1');
    await expect(stage.locator('.ss-round')).toContainText('Round of 32');
    await expectNoHorizontalOverflow(page, expect, 'home');
    await screenshot(page, testInfo, 'home-live');
  });

  test('provider outage keeps the correct fixture with a pending state — never a substitute', async ({ page }, testInfo) => {
    await gotoApp(page, {
      results: { configured: false, finished: [], live: [], hold: [], scheduled: [] },
      live: { configured: false, response: [], finished: [] },
    });
    const stage = page.locator('.score-stage');
    await expect(stage.locator('.ss-round')).toContainText('Round of 32');
    await expect(page.locator('.data-note')).toContainText('temporarily unavailable');
    await expectNoHorizontalOverflow(page, expect, 'home-outage');
    await screenshot(page, testInfo, 'home-outage');
  });
});

test.describe('Tournament', () => {
  test('Matches shows all of today exactly once; Groups and Knockout are complete', async ({ page }, testInfo) => {
    await gotoApp(page);
    await tapTab(page, 'tournament');
    await expect(page.locator('.outlet.active .matches-list .match-row')).toHaveCount(3);
    await screenshot(page, testInfo, 'tournament-matches');

    await page.locator('[data-segmented="tournament-view"] [data-value="groups"]').click();
    await expect(page.locator('.group-card')).toHaveCount(12);
    await expectNoHorizontalOverflow(page, expect, 'groups');
    await screenshot(page, testInfo, 'tournament-groups');

    await page.locator('[data-segmented="tournament-view"] [data-value="knockout"]').click();
    await expect(page.locator('.ko-round')).toHaveCount(6);
    await expect(page.locator('.knockout-pane .match-row')).toHaveCount(32);
    await expectNoHorizontalOverflow(page, expect, 'knockout');
    await screenshot(page, testInfo, 'tournament-knockout');
  });

  test('Match Center opens from a live row with factual content', async ({ page }, testInfo) => {
    await gotoApp(page);
    await page.locator('.score-stage .ss-open').click();
    const sheet = page.locator('.mc-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.mc-round')).toContainText('Round of 32');
    await expect(sheet.locator('.mc-status')).toContainText('LIVE');
    await expect(sheet.locator('.mc-facts')).toContainText('Atlanta');
    await screenshot(page, testInfo, 'match-center');
    await sheet.locator('.mc-close').click();
    await expect(page.locator('.mc-sheet')).toHaveCount(0);
  });
});
