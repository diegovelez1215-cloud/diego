// Picks League at mobile widths: invite-only join, real shared standings,
// honest states, and strict separation from the Arcade Ladder.
import { test, expect } from '@playwright/test';
import { gotoApp, tapTab, screenshot, expectNoHorizontalOverflow } from './helpers.js';

const ROOM_ROWS = [
  { name: 'QK7M2|Ana', bankroll: 120, roi: 80, champ: 'France', created_at: '2026-06-30T12:00:00Z' },
  { name: 'QK7M2|Dingus', bankroll: 60, roi: 40, champ: null, created_at: '2026-06-29T12:00:00Z' },
];

async function openYouSection(page, section) {
  await tapTab(page, 'you');
  await page.locator(`[data-segmented="you-view"] [data-value="${section}"]`).click();
}

test.describe('Picks League', () => {
  test('join an invite league, see live standings with rank, accuracy, podium, and yourself', async ({ page }, testInfo) => {
    await gotoApp(page, { league: ROOM_ROWS });
    await openYouSection(page, 'league');
    // invite-only join card first — no profile yet
    await expect(page.locator('.league-join')).toBeVisible();
    await page.locator('#league-name').fill('Diego');
    await page.locator('#league-code').fill('QK7M2');
    await page.locator('#league-join').click();
    // standings arrive from the (mocked) shared backend
    await expect(page.locator('.lg-rows')).toBeVisible();
    await expect(page.locator('.lg-row')).toHaveCount(2);
    await expect(page.locator('.lg-row').first()).toContainText('Ana');
    await expect(page.locator('.lg-row').first()).toContainText('120');
    await expect(page.locator('.lg-row').first()).toContainText('80%');
    await expect(page.locator('.lg-podium')).toBeVisible();
    await expect(page.locator('.league-sub')).toContainText('QK7M2');
    await expect(page.locator('.lg-foot')).toContainText('Diego');
    await screenshot(page, testInfo, 'picks-league');
    await expectNoHorizontalOverflow(page, expect, 'picks league');
    // no money language anywhere on the shared board
    const text = (await page.locator('.you-view').innerText()).toLowerCase();
    for (const banned of ['bankroll', '$', 'odds', 'bet', 'cash out', 'payout', 'deposit', 'withdraw']) {
      expect(text).not.toContain(banned);
    }
  });

  test('empty league tells the truth — nobody is invented', async ({ page }) => {
    await gotoApp(page, { league: [] });
    await openYouSection(page, 'league');
    await page.locator('#league-name').fill('Diego');
    await page.locator('#league-newroom').click();
    await expect(page.locator('.lg-state')).toContainText('No members on the board yet');
    await expect(page.locator('.lg-row')).toHaveCount(0);
  });

  test('sync failure shows an honest error/offline state, never fabricated standings', async ({ page }) => {
    await gotoApp(page);
    await page.unroute('**/rest/v1/scores*');
    await page.route('**/rest/v1/scores*', (r) => r.abort());
    await openYouSection(page, 'league');
    await page.locator('#league-name').fill('Diego');
    await page.locator('#league-join').click();
    // headless envs report navigator.onLine=false; both failure copies are honest
    await expect(page.locator('.lg-state')).toContainText(/couldn't sync|You're offline/);
    await expect(page.locator('.lg-row')).toHaveCount(0);
  });

  test('Arcade Ladder is separate: simulation-tagged, no league members, no official points', async ({ page }, testInfo) => {
    await gotoApp(page, { league: ROOM_ROWS });
    await openYouSection(page, 'ladder');
    await expect(page.locator('.ladder .sim-badge')).toHaveText('SIMULATION');
    await expect(page.locator('.ladder')).toContainText('Match Lab and My World Cup only');
    const text = await page.locator('.ladder').innerText();
    expect(text).not.toContain('Ana');       // league members never leak in
    expect(text).not.toContain('insight');   // official pick scoring never leaks in
    await screenshot(page, testInfo, 'arcade-ladder');
    await expectNoHorizontalOverflow(page, expect, 'arcade ladder');
  });
});
