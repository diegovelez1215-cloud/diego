// Home + Tournament truth surfaces at 390/430: live hero with resolved
// identity, editorial matchday board, honest groups, and the full graphical
// bracket in both modes. No blank states, no clipping, no overflow.
import { test, expect } from '@playwright/test';
import {
  gotoApp, tapTab, openTournamentSection, expectNoHorizontalOverflow, screenshot,
  RESULTS_EMPTY, OUTAGE, LIVE_FIXTURE,
} from './helpers.js';

test.describe('Home', () => {
  test('live match owns the score stage with real names and an honest live score', async ({ page }, testInfo) => {
    await gotoApp(page);
    const stage = page.locator('.score-stage');
    await expect(stage).toHaveClass(/live/);
    await expect(stage.locator('.ss-status')).toContainText('LIVE');
    await expect(stage.locator('.ss-score .ss-num').first()).toHaveText('1');
    await expect(stage.locator('.ss-round')).toContainText('Round of 32');
    await expect(stage.locator('.ss-team.pending')).toHaveCount(0);
    await expectNoHorizontalOverflow(page, expect, 'home');
    await screenshot(page, testInfo, 'home');
  });

  test('unresolved live tie stays scoreless — status only, never an invented number', async ({ page }) => {
    await gotoApp(page, { results: RESULTS_EMPTY });
    const stage = page.locator('.score-stage');
    await expect(stage).toHaveClass(/live/);
    await expect(stage.locator('.ss-pending-score')).toBeVisible();
    await expect(stage.locator('.ss-num')).toHaveCount(0);
  });

  test('full provider outage keeps the official schedule with an honest note', async ({ page }) => {
    await gotoApp(page, { results: OUTAGE, live: OUTAGE });
    await expect(page.locator('.score-stage .ss-round')).toContainText('Round of 32');
    await expect(page.locator('.data-note')).toContainText('temporarily unavailable');
  });
});

test.describe('Tournament', () => {
  test('Matches is an editorial board: Live Now, Up Today, lanes intact', async ({ page }, testInfo) => {
    await gotoApp(page);
    await tapTab(page, 'tournament');
    const pane = page.locator('.matches-pane');
    await expect(pane.locator('.md-lane.live-lane h3')).toHaveText('Live Now');
    await expect(pane.locator('.md-lane.live-lane .match-row')).toHaveCount(1);
    await expect(pane.getByText('Up Today')).toBeVisible();
    await expectNoHorizontalOverflow(page, expect, 'matches');
    await screenshot(page, testInfo, 'matches');
  });

  test('Groups: 12 final tables with Q marks and the third-place race integrated', async ({ page }, testInfo) => {
    await gotoApp(page);
    await openTournamentSection(page, 'groups');
    await expect(page.locator('.group-card')).toHaveCount(12);
    await expect(page.locator('.group-state.final')).toHaveCount(12);
    await expect(page.locator('.q-mark.in')).toHaveCount(24);
    await expect(page.locator('.q-mark.third')).toHaveCount(8);
    // the third-place race lives with the tables that decide it
    await expect(page.locator('.groups-pane .ko-thirds .ko-third')).toHaveCount(12);
    await expect(page.locator('.groups-pane .ko-third.in')).toHaveCount(8);
    await expectNoHorizontalOverflow(page, expect, 'groups');
    await screenshot(page, testInfo, 'groups');
  });

  test('Groups honesty: incomplete data never shows Final', async ({ page }) => {
    await gotoApp(page, { results: RESULTS_EMPTY });
    await openTournamentSection(page, 'groups');
    await expect(page.locator('.group-state.final')).toHaveCount(0);
    await expect(page.locator('.group-state.idle')).toHaveCount(12);
  });

  test('Full Bracket: complete graphical tree, connectors, the Final crest, round jump', async ({ page }, testInfo) => {
    await gotoApp(page);
    await openTournamentSection(page, 'knockout');
    // Follow a Team is the default — switch to the full field
    await page.locator('[data-segmented="bracket-mode"] [data-value="full"]').click();
    const scroll = page.locator('.knockout-pane .bk-scroll');
    await expect(scroll).toBeVisible();
    await expect(page.locator('.knockout-pane .bk-card')).toHaveCount(32); // 16+8+4+2 + final + third place
    await expect(page.locator('.knockout-pane .bk-links path')).toHaveCount(32); // 30 winner + 2 loser
    await expect(page.locator('.knockout-pane .bk-card.live')).toHaveCount(1);
    await expect(page.locator('.knockout-pane .bk-final-crest')).toHaveCount(1);
    await expectNoHorizontalOverflow(page, expect, 'bracket');
    // capture at the Round-of-32 position where the tree is densest
    await screenshot(page, testInfo, 'bracket-full');
    // round jump drives horizontal scroll
    const before = await scroll.evaluate((el) => el.scrollLeft);
    await page.locator('.ko-jump-chip[data-jump="final"]').click();
    await page.waitForTimeout(600);
    const after = await scroll.evaluate((el) => el.scrollLeft);
    expect(after).toBeGreaterThan(before);
  });

  test('Follow a Team is the default: pick a nation, its route lights, the field dims', async ({ page }, testInfo) => {
    await gotoApp(page);
    await openTournamentSection(page, 'knockout');
    // default mode is follow, with the tactile nation-chip rail
    await expect(page.locator('#ko-follow-team')).toBeVisible();
    await page.locator('.ko-team-chip[data-follow="FRA"]').click();
    await expect(page.locator('.ko-team-chip[data-follow="FRA"]')).toHaveClass(/on/);
    await expect(page.locator('.bk-card.lit').first()).toBeVisible();
    const dimmed = await page.locator('.bk-card.dim').count();
    expect(dimmed).toBeGreaterThan(20);
    // the route summary spells out the road
    await expect(page.locator('.ko-route')).toBeVisible();
    await screenshot(page, testInfo, 'bracket-follow');
  });

  test('Match Center opens from the live stage with factual content and a real score', async ({ page }) => {
    await gotoApp(page);
    await page.locator('.score-stage .ss-open').click();
    const sheet = page.locator('.mc-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.mc-status')).toContainText('LIVE');
    await expect(sheet.locator('.mc-score')).toContainText('1');
    await sheet.locator('.mc-close').click();
    await expect(page.locator('.mc-sheet')).toHaveCount(0);
  });
});
