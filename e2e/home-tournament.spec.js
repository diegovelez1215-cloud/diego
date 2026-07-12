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

  test('Full Bracket: readable staged bracket with real teams, live score, and round movement', async ({ page }, testInfo) => {
    await gotoApp(page);
    await openTournamentSection(page, 'knockout');
    await expect(page.locator('[data-segmented="bracket-mode"] [data-value="full"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.full-road .road-stage')).toHaveCount(6);
    await expect(page.locator('.full-road .road-match')).toHaveCount(32);
    await expect(page.locator('.full-road .road-match.live')).toHaveCount(1);
    await expect(page.locator('.full-road .road-stage.destination')).toContainText('Final');
    await expect(page.locator('.full-road')).not.toContainText('Best third');
    await expect(page.locator('.full-road')).not.toContainText('Group D winners');
    await expectNoHorizontalOverflow(page, expect, 'full road');
    await screenshot(page, testInfo, 'full-road');
    const strip = page.locator('.full-road .road-stage-strip');
    const before = await strip.evaluate((el) => el.scrollLeft);
    await page.locator('.ko-jump-chip[data-jump="final"]').click();
    await page.waitForTimeout(600);
    const after = await strip.evaluate((el) => el.scrollLeft);
    expect(after).toBeGreaterThan(before);
  });

  test('My Team: pick a nation, its route lights, the field dims', async ({ page }, testInfo) => {
    await gotoApp(page);
    await openTournamentSection(page, 'knockout');
    await page.locator('[data-segmented="bracket-mode"] [data-value="follow"]').click();
    await expect(page.locator('#ko-follow-team')).toBeVisible();
    await page.locator('.ko-team-chip[data-follow="FRA"]').click();
    await expect(page.locator('.ko-team-chip[data-follow="FRA"]')).toHaveClass(/on/);
    await expect(page.locator('.bk-card.lit').first()).toBeVisible();
    const dimmed = await page.locator('.bk-card.dim').count();
    expect(dimmed).toBeGreaterThan(20);
    // the route summary spells out the road
    await expect(page.locator('.ko-route')).toBeVisible();
    await screenshot(page, testInfo, 'follow-team');
  });

  test('Venues: stadium explorer lists chronological match history', async ({ page }, testInfo) => {
    await gotoApp(page);
    await openTournamentSection(page, 'venues');
    await expect(page.locator('.venue-card').first()).toBeVisible();
    await expect(page.locator('.venue-card').first().locator('.match-row').first()).toBeVisible();
    await expectNoHorizontalOverflow(page, expect, 'venues');
    await screenshot(page, testInfo, 'venues');
  });

  test('Stats: verified scorers, honest G+A, no standalone assist board', async ({ page }, testInfo) => {
    await gotoApp(page);
    await openTournamentSection(page, 'stats');
    await expect(page.locator('.stats-card').first()).toContainText('A Player');
    // G+A is back; with no verified assist fields in the mock it must say so
    // honestly rather than invent a zero. No standalone Assists board exists.
    await expect(page.locator('.stats-card')).toHaveCount(4);
    await expect(page.locator('.stats-card').nth(1)).toContainText('Goals + assists');
    await expect(page.locator('.stats-card').nth(1)).toContainText('unavailable right now');
    await expect(page.locator('.stats-pane .stats-card h3').nth(1)).not.toHaveText('Assists');
    await expect(page.locator('.stats-card').nth(2)).toContainText('Team goals');
    await expect(page.locator('.stats-card').nth(3)).toContainText('Clean sheets');
    await expectNoHorizontalOverflow(page, expect, 'stats');
    await screenshot(page, testInfo, 'stats');
  });

  test('Match Center opens from the live stage with factual content and a real score', async ({ page }) => {
    await gotoApp(page);
    const opener = page.locator('.score-stage .ss-open');
    await opener.click();
    const sheet = page.locator('.mc-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.mc-status')).toContainText('LIVE');
    await expect(sheet.locator('.mc-score')).toContainText('1');
    const close = sheet.locator('.mc-close');
    await expect(close).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.mc-sheet')).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('Match Center holds focus through live repaints and survives a vanished model', async ({ page }) => {
    await gotoApp(page);
    const opener = page.locator('.score-stage .ss-open');
    await opener.click();
    const sheet = page.locator('.mc-sheet');
    await expect(sheet).toBeVisible();
    const close = sheet.locator('.mc-close');
    await expect(close).toBeFocused();
    // Drive the exact live-refresh path app.js uses: fresh provider truth
    // lands while the sheet is open. Focus must never fall to the page,
    // the dock, or the document body.
    const repaint = (min, gh) => page.evaluate(async ({ min, gh }) => {
      const [{ setOverlay }, { buildOverlay }] = await Promise.all([
        import('/src/core/app-state.js'),
        import('/src/core/provider-overlay.js'),
      ]);
      const [results, live] = await Promise.all([
        fetch('/api/results').then((r) => r.json()),
        fetch('/api/live').then((r) => r.json()),
      ]);
      live.response[0].min = min;
      live.response[0].gh = gh;
      setOverlay(buildOverlay({ results, live }));
    }, { min, gh });
    await repaint(71, 2);
    await expect(sheet.locator('.mc-status')).toContainText('71');
    await expect(sheet.locator('.mc-score')).toContainText('2');
    await expect(close).toBeFocused();
    // repeated live repaints keep focus glued to the same logical control
    await repaint(72, 2);
    await repaint(73, 2);
    await expect(sheet.locator('.mc-status')).toContainText('73');
    await expect(close).toBeFocused();
    // focus parked on a keyless dialog surface falls back safely inside
    await sheet.focus();
    await repaint(74, 2);
    await expect(close).toBeFocused();
    // Escape still works after every repaint, and the opener gets focus back
    await page.keyboard.press('Escape');
    await expect(page.locator('.mc-sheet')).toHaveCount(0);
    await expect(opener).toBeFocused();
    // an invalid or replaced match model closes cleanly: nothing stays inert,
    // focus is never stranded on a removed element
    await opener.click();
    await expect(sheet.locator('.mc-close')).toBeFocused();
    await page.evaluate(async () => {
      const { openMatchCenter } = await import('/src/core/app-state.js');
      openMatchCenter(999999);
    });
    await expect(page.locator('.mc-sheet')).toHaveCount(0);
    await expect(page.locator('#app')).not.toHaveAttribute('inert');
    await expect(opener).toBeFocused();
  });
});
