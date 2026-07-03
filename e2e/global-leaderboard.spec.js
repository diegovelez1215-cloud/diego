// Global World Cup Leaderboard at mobile widths: authenticated global
// standings with podium, movement, streaks, accuracy and a pinned personal
// rank; honest states; and strict separation from the Arcade Ladder.
// No private rooms, invite codes, or fabricated competitors anywhere.
import { test, expect } from '@playwright/test';
import {
  gotoApp, tapTab, screenshot, expectNoHorizontalOverflow, boardRow, TEST_USER,
} from './helpers.js';

const BOARD = [
  boardRow({ user_id: 'u-ana', display_name: 'Ana', avatar: '🦅', points: 155, accuracy: 80, streak: 4, best_streak: 5, exact: 1, correct: 8, total: 10, round_points: 40, rank: 1, joined_at: '2026-06-30T12:00:00Z' }),
  boardRow({ user_id: 'u-luca', display_name: 'Luca', avatar: '🐺', points: 120, accuracy: 71, streak: 1, round_points: 20, rank: 2, joined_at: '2026-06-28T09:00:00Z' }),
  boardRow({ user_id: 'u-mei', display_name: 'Mei', avatar: '⚡', points: 95, accuracy: 64, streak: 3, round_points: 30, rank: 3, joined_at: '2026-06-27T18:00:00Z' }),
  boardRow({ user_id: 'u-long', display_name: 'Maximiliano Fernández', points: 60, accuracy: 50, rank: 4 }),
];
const ME_OUTSIDE_TOP = boardRow({
  user_id: TEST_USER.id, display_name: 'Diego', avatar: '🎯',
  points: 12, accuracy: 33, rank: 57, joined_at: '2026-07-01T09:00:00Z',
});
const ARCADE = [
  boardRow({ user_id: 'u-ana', display_name: 'Ana', avatar: '🦅', points: 900, wins: 12, played: 15, streak: 4, rank: 1 }),
  boardRow({ user_id: TEST_USER.id, display_name: 'Diego', avatar: '🎯', points: 300, wins: 4, played: 7, streak: 1, rank: 2 }),
];
const MY_PROFILE = { id: TEST_USER.id, display_name: 'Diego', avatar: '🎯' };

async function openBoard(page, tab) {
  await tapTab(page, 'you');
  await page.locator('[data-segmented="you-view"] [data-value="board"]').click();
  if (tab) await page.locator('[data-segmented="board-tab"] [data-value="' + tab + '"]').click();
}

test.describe('Global World Cup Leaderboard', () => {
  test('launch-safe when Supabase is not configured: opening soon, no fake board', async ({ page }, testInfo) => {
    await gotoApp(page, { leaderboardConfigured: false });
    await openBoard(page);
    await expect(page.locator('.board-soon')).toBeVisible();
    await expect(page.locator('.board-soon')).toContainText('Global Leaderboard is opening soon');
    await expect(page.locator('#board-email')).toHaveCount(0);
    await expect(page.locator('.lg-row')).toHaveCount(0);
    await expect(page.locator('.lg-stamp')).toHaveCount(0);
    const text = (await page.locator('.you-view').innerText()).toLowerCase();
    for (const banned of ['updated just now', 'couldn\'t sync', 'backend', 'error', 'rank #', 'ana', 'luca', 'mei']) {
      expect(text).not.toContain(banned);
    }
    await screenshot(page, testInfo, 'leaderboard-opening-soon');
  });

  test('signed out: a sign-in gate, never an invented table', async ({ page }) => {
    await gotoApp(page);
    await openBoard(page);
    await expect(page.locator('.board-signin')).toBeVisible();
    await expect(page.locator('.board-signin')).toContainText('World Cup Leaderboard');
    await expect(page.locator('#board-email')).toBeVisible();
    await expect(page.locator('.lg-row')).toHaveCount(0);
    const text = (await page.locator('.you-view').innerText()).toLowerCase();
    for (const banned of ['invite', 'room', 'league code', '$', 'bet', 'payout', 'deposit']) {
      expect(text).not.toContain(banned);
    }
  });

  test('email → code → profile: the full join flow reaches the global table', async ({ page }, testInfo) => {
    await gotoApp(page, { board: BOARD, me: ME_OUTSIDE_TOP, arcade: ARCADE });
    await openBoard(page);
    await page.locator('#board-email').fill('diego@example.com');
    await page.locator('#board-sendcode').click();
    await expect(page.locator('#board-code')).toBeVisible();
    await page.locator('#board-code').fill('123456');
    await page.locator('#board-verify').click();
    // no profile yet → claim it
    await expect(page.locator('.board-profile')).toBeVisible();
    await page.locator('#board-name').fill('Diego');
    await page.locator('.bd-avatar').nth(8).click();
    await page.locator('#board-saveprofile').click();
    await expect(page.locator('.lg-rows')).toBeVisible();
    await screenshot(page, testInfo, 'board-join-complete');
  });

  test('signed in: podium, movement, accuracy, streaks, pinned personal rank', async ({ page }, testInfo) => {
    await gotoApp(page, {
      signedIn: true, board: BOARD, me: ME_OUTSIDE_TOP, arcade: ARCADE, profile: MY_PROFILE,
    });
    await openBoard(page);
    await expect(page.locator('.lg-rows')).toBeVisible();
    await expect(page.locator('.lg-row')).toHaveCount(4);
    // podium holds the real top three
    await expect(page.locator('.lg-podium-step.gold')).toContainText('Ana');
    await expect(page.locator('.lg-podium-step.gold')).toContainText('155');
    await expect(page.locator('.lg-podium-step.silver')).toContainText('Luca');
    // table facts
    await expect(page.locator('.lg-row').first()).toContainText('Ana');
    await expect(page.locator('.lg-row').first()).toContainText('80%');
    await expect(page.locator('.lg-row').first()).toContainText('🔥4');
    // no observed history → honest NEW, never fabricated arrows
    await expect(page.locator('.lg-mv.new').first()).toBeVisible();
    // my rank pinned even though I'm outside the visible top
    await expect(page.locator('.lg-pinned')).toBeVisible();
    await expect(page.locator('.lg-pinned')).toContainText('57');
    await expect(page.locator('.lg-pinned')).toContainText('Diego');
    // honest freshness stamp — a timestamp, not a fake live feed
    await expect(page.locator('.lg-stamp')).toContainText('Updated just now');
    await screenshot(page, testInfo, 'global-picks-leaderboard');
    await expectNoHorizontalOverflow(page, expect, 'global leaderboard');
    // long display names stay inside their rows
    const overflow = await page.$$eval('.lg-name', (els) =>
      els.filter((el) => el.scrollWidth > el.clientWidth + 2).length);
    expect(overflow).toBe(0);
    // no money language anywhere on the global board
    const text = (await page.locator('.you-view').innerText()).toLowerCase();
    for (const banned of ['bankroll', '$', 'odds', 'bet', 'cash out', 'payout', 'deposit', 'withdraw']) {
      expect(text).not.toContain(banned);
    }
  });

  test('current-round scope re-ranks by round points, honestly labeled', async ({ page }) => {
    await gotoApp(page, {
      signedIn: true, board: BOARD, me: ME_OUTSIDE_TOP, arcade: ARCADE, profile: MY_PROFILE,
    });
    await openBoard(page);
    await page.locator('.lg-scope-btn[data-scope="round"]').click();
    await expect(page.locator('.lg-row').first()).toContainText('Ana');   // 40 round pts
    await expect(page.locator('.lg-row').nth(1)).toContainText('Mei');   // 30 > Luca's 20
    await expect(page.locator('.lg-scope-note')).toContainText('re-ranks');
  });

  test('empty board tells the truth — nobody is invented', async ({ page }) => {
    await gotoApp(page, { signedIn: true, board: [], me: null, arcade: [], profile: MY_PROFILE });
    await openBoard(page);
    await expect(page.locator('.lg-state')).toContainText('Nobody on the global table yet');
    await expect(page.locator('.lg-row')).toHaveCount(0);
  });

  test('sync failure shows an honest error/offline state, never fabricated standings', async ({ page }) => {
    await gotoApp(page, { signedIn: true, profile: MY_PROFILE });
    await page.unroute('**/rest/v1/leaderboard_v2*');
    await page.route('**/rest/v1/leaderboard_v2*', (r) => r.abort());
    await openBoard(page);
    await expect(page.locator('.lg-state')).toContainText(/couldn't sync|You're offline/);
    await expect(page.locator('.lg-row')).toHaveCount(0);
  });

  test('Arcade Ladder is global but separate: simulation-tagged, no official points', async ({ page }, testInfo) => {
    await gotoApp(page, {
      signedIn: true, board: BOARD, me: ME_OUTSIDE_TOP, arcade: ARCADE, profile: MY_PROFILE,
    });
    await openBoard(page, 'arcade');
    await expect(page.locator('.ladder .sim-badge')).toHaveText('SIMULATION');
    await expect(page.locator('.ladder')).toContainText('never');
    await expect(page.locator('.ladder .lg-row')).toHaveCount(2);
    await expect(page.locator('.ladder .lg-row').first()).toContainText('Ana');
    await expect(page.locator('.ladder .lg-row').first()).toContainText('900');
    const text = await page.locator('.ladder').innerText();
    expect(text).not.toContain('insight');      // official pick scoring never leaks in
    expect(text.toLowerCase()).not.toContain('accuracy');
    await screenshot(page, testInfo, 'global-arcade-ladder');
    await expectNoHorizontalOverflow(page, expect, 'arcade ladder');
  });
});
