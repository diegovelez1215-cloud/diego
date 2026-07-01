// Play arcade at mobile widths: Match Lab runs to full time with decisions,
// My World Cup picks advance through the sim bracket, Prediction Run records
// calls — and none of it ever touches real truth.
import { test, expect } from '@playwright/test';
import {
  gotoApp, tapTab, openPlayMode, expectNoHorizontalOverflow, screenshot,
} from './helpers.js';

test.describe('Match Lab', () => {
  test('kick off, decide at the breaks, reach full time, land in You', async ({ page }, testInfo) => {
    await gotoApp(page);
    const heroBefore = await page.locator('.score-stage').innerText();
    await openPlayMode(page, 'lab');
    await screenshot(page, testInfo, 'play-lab-setup');
    await page.locator('.lab-approach[data-approach="press"]').click();
    await page.locator('#lab-kickoff').click();
    // halftime decision
    await expect(page.locator('.lab-decision')).toBeVisible({ timeout: 10000 });
    await screenshot(page, testInfo, 'play-lab-decision');
    await page.locator('.lab-opt[data-decide="push"]').click();
    // 68' decision
    await expect(page.locator('.lab-decision')).toBeVisible({ timeout: 10000 });
    await page.locator('.lab-opt[data-decide="gamble"]').click();
    await expect(page.locator('.lab-clock')).toHaveText('FULL TIME', { timeout: 10000 });
    await expect(page.locator('.lab-feed .lab-ev').first()).toBeVisible();
    await screenshot(page, testInfo, 'play-lab-fulltime');
    await expectNoHorizontalOverflow(page, expect, 'lab');
    // saved to You
    await tapTab(page, 'you');
    await expect(page.locator('.you-lab')).toHaveCount(1);
    // real truth untouched
    await tapTab(page, 'home');
    expect(await page.locator('.score-stage').innerText()).toBe(heroBefore);
  });
});

test.describe('My World Cup', () => {
  test('tap a tie, send a team through, simulate the rest, save the timeline', async ({ page }, testInfo) => {
    await gotoApp(page);
    await openPlayMode(page, 'myworldcup');
    await expect(page.locator('.sim-badge')).toHaveText('SIMULATION');
    const pickable = page.locator('.bk-card.pickable').first();
    await expect(pickable).toBeVisible();
    await pickable.click();
    await expect(page.locator('.mwc-pickbar')).toBeVisible();
    await screenshot(page, testInfo, 'play-mwc-pick');
    await page.locator('.mwc-pick[data-pickside="home"]').click();
    await expect(page.locator('.bk-state.picked').first()).toBeVisible();
    // simulate the remaining rounds (paced)
    await page.locator('#mwc-simulate').click();
    await expect(page.locator('.mwc-champion')).toBeVisible({ timeout: 15000 });
    await screenshot(page, testInfo, 'play-mwc-champion');
    await page.locator('#mwc-save').click();
    await tapTab(page, 'you');
    await expect(page.locator('.you-sim')).toHaveCount(1);
    await expect(page.locator('.you-sim-meta').first()).toContainText('hand-picked');
    await expect(page.locator('.dock-tab[aria-selected="true"]')).toHaveCount(1);
    await screenshot(page, testInfo, 'you');
    // official bracket unaffected: no champion, live tie still live
    await openPlayMode(page, 'myworldcup'); // back to play, then check tournament
    await tapTab(page, 'tournament');
    await page.locator('[data-segmented="tournament-view"] [data-value="knockout"]').click();
    await expect(page.locator('.knockout-pane .bk-card.live')).toHaveCount(1);
    await expect(page.locator('.knockout-pane .bk-card.final .bk-goals')).toHaveCount(0);
  });
});

test.describe('Prediction Run', () => {
  test('confidence calls are recorded and surface in You — no stakes anywhere', async ({ page }, testInfo) => {
    await gotoApp(page);
    await openPlayMode(page, 'prediction');
    await expect(page.locator('.pr-stats')).toBeVisible();
    const first = page.locator('.pr-fixture').first();
    await first.locator('[data-prside="home"]').click();
    await expect(first).toHaveClass(/picked/);
    await first.locator('[data-prconf="3"]').click();
    await expect(first.locator('.pr-conf-btn[data-prconf="3"]')).toHaveClass(/on/);
    await screenshot(page, testInfo, 'play-prediction');
    await expectNoHorizontalOverflow(page, expect, 'prediction');
    const text = await page.locator('.play-view').innerText();
    for (const banned of ['odds', 'bet', 'wallet', 'cash', 'payout', 'stake ']) {
      expect(text.toLowerCase()).not.toContain(banned);
    }
    await tapTab(page, 'you');
    await expect(page.locator('.you-card').first()).toContainText('1 call');
  });
});
