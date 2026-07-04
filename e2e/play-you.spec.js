// Play arcade at mobile widths: Match Lab runs to full time with decisions,
// My World Cup picks advance through the sim bracket, Prediction Run records
// calls — and none of it ever touches real truth.
import { test, expect } from '@playwright/test';
import {
  gotoApp, tapTab, openPlayMode, expectNoHorizontalOverflow, screenshot,
} from './helpers.js';

test.describe('Match Lab', () => {
  test('renders synchronized ball movement, scoring, VAR, red cards, penalties, and muted sound', async ({ page }) => {
    await page.addInitScript(() => {
      window.__audioContexts = 0;
      class MockAudioContext {
        constructor() { window.__audioContexts++; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; this.state = 'running'; }
        resume() { return Promise.resolve(); }
        createOscillator() { return { type: 'sine', frequency: { setValueAtTime() {} }, connect() { return this; }, start() {}, stop() {} }; }
        createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect() { return this; } }; }
        createBufferSource() { return { connect() { return this; }, start() {}, stop() {}, set buffer(_) {} }; }
        createBuffer(_channels, length) { return { getChannelData() { return new Float32Array(length); } }; }
        createBiquadFilter() { return { type: 'lowpass', frequency: { value: 0 }, connect() { return this; } }; }
      }
      window.AudioContext = MockAudioContext;
      window.webkitAudioContext = MockAudioContext;
    });
    await gotoApp(page);
    await openPlayMode(page, 'lab');
    await expect(page.locator('#lab-sound')).toHaveAttribute('data-sound', 'on');
    expect(await page.evaluate(() => window.__audioContexts)).toBe(0);
    await page.locator('#lab-sound').click();
    await expect(page.locator('#lab-sound')).toHaveAttribute('data-sound', 'off');
    await page.locator('#lab-kickoff').click();
    await expect(page.locator('[data-player-side="home"]')).toHaveCount(11);
    await expect(page.locator('[data-player-side="away"]')).toHaveCount(11);
    await expect(page.locator('[data-ball]')).toBeVisible();
    expect(await page.evaluate(() => window.__audioContexts), 'muted start does not arm audio').toBe(0);
    const ballA = await page.locator('[data-ball]').getAttribute('style');
    await page.evaluate(() => window.__u26LabDebug.force('open'));
    await page.waitForTimeout(420);
    const ballB = await page.locator('[data-ball]').getAttribute('style');
    expect(ballB).not.toBe(ballA);

    await page.evaluate(() => window.__u26LabDebug.force('goal'));
    await expect(page.locator('#lab-score')).toContainText('0–0');
    await page.waitForTimeout(1500);
    await expect(page.locator('#lab-score')).toContainText('1–0');

    await page.evaluate(() => window.__u26LabDebug.force('var'));
    await expect(page.locator('.lab-var-banner')).toBeVisible({ timeout: 2200 });
    await page.waitForTimeout(3200);
    await expect(page.locator('#lab-score')).toContainText('2–0');

    await page.evaluate(() => window.__u26LabDebug.force('var-overturned'));
    await expect(page.locator('.lab-var-banner')).toBeVisible({ timeout: 2200 });
    await page.waitForTimeout(3200);
    await expect(page.locator('#lab-score')).toContainText('2–0');

    const awayBeforeRed = await page.locator('[data-player-side="away"]').count();
    await page.evaluate(() => window.__u26LabDebug.force('red'));
    await expect(page.locator('.lab-card-banner')).toBeVisible();
    expect(await page.locator('[data-player-side="away"]').count()).toBe(awayBeforeRed);
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-player-side="away"]')).toHaveCount(10);

    await page.evaluate(() => window.__u26LabDebug.force('pens'));
    await expect(page.locator('.lab-pens')).toContainText('0–0');
    await page.waitForTimeout(1500);
    await expect(page.locator('.lab-pens')).toContainText(/1–0|1–1/);
  });

  test('the pitch scene persists across beats and the ball keeps moving in open play', async ({ page }) => {
    await gotoApp(page);
    await openPlayMode(page, 'lab');
    await page.locator('#lab-kickoff').click();
    await expect(page.locator('.pitch-player')).toHaveCount(22);
    // mark the live scene: it must never be rebuilt during ordinary open play
    await page.evaluate(() => { document.querySelector('.lab-pitch').dataset.persist = 'scene'; });
    const positions = [];
    for (let i = 0; i < 3; i++) {
      positions.push(await page.locator('[data-ball]').evaluate((el) => `${el.style.left}|${el.style.top}`));
      await page.waitForTimeout(650);
    }
    expect(new Set(positions).size, 'ball position changes between samples').toBeGreaterThan(1);
    await expect(page.locator('.lab-pitch[data-persist="scene"]'), 'pitch DOM persisted — no full rerender').toHaveCount(1);
    const playerA = await page.locator('.pitch-player').first().evaluate((el) => `${el.style.left}|${el.style.top}`);
    await page.waitForTimeout(700);
    const playerB = await page.locator('.pitch-player').first().evaluate((el) => `${el.style.left}|${el.style.top}`);
    expect(playerB, 'role markers drift with the match').not.toBe(playerA);
  });

  test('reduced motion keeps the simulation usable', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoApp(page);
    await openPlayMode(page, 'lab');
    await page.locator('#lab-kickoff').click();
    await expect(page.locator('[data-ball]')).toBeVisible();
    await expect(page.locator('.lab-clock')).toContainText(/45|FULL TIME/, { timeout: 5000 });
  });

  test('kick off, decide at the breaks, reach full time, land in You', async ({ page }, testInfo) => {
    await gotoApp(page);
    const heroBefore = await page.locator('.score-stage').innerText();
    await openPlayMode(page, 'lab');
    await screenshot(page, testInfo, 'play-lab-setup');
    await page.locator('.lab-approach[data-approach="press"]').click();
    await page.locator('#lab-kickoff').click();
    await page.evaluate(() => window.__u26LabDebug.force('final'));
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
  test('the call ritual: pick → confidence → confirm once → sealed until the real kickoff', async ({ page }, testInfo) => {
    await gotoApp(page);
    await openPlayMode(page, 'prediction');
    await expect(page.locator('.pr-stats')).toBeVisible();
    const first = page.locator('.pr-fixture').first();
    // step 1 — make your call
    await first.locator('[data-prside="home"]').click();
    await expect(page.locator('.pr-fixture').first()).toHaveClass(/drafting/);
    // step 2 — confidence (scoreline stays optional)
    await page.locator('.pr-fixture').first().locator('[data-prconf="3"]').click();
    await expect(page.locator('.pr-fixture').first().locator('.pr-conf-btn[data-prconf="3"]')).toHaveClass(/on/);
    // step 3 — confirm once → sealed, edit stays open until the real whistle
    await page.locator('.pr-fixture').first().locator('[data-prconfirm]').click();
    const sealed = page.locator('.pr-fixture.sealed').first();
    await expect(sealed).toBeVisible();
    await expect(sealed).toContainText('Locks at kickoff');
    await expect(sealed.locator('[data-predit]')).toBeVisible();
    await screenshot(page, testInfo, 'play-prediction');
    await expectNoHorizontalOverflow(page, expect, 'prediction');
    const text = await page.locator('.play-view').innerText();
    for (const banned of ['odds', 'bet', 'wallet', 'cashout', 'payout', 'deposit', 'stake ', 'hunch']) {
      expect(text.toLowerCase()).not.toContain(banned);
    }
    expect(text).toContain('World Cup Leaderboard');
    await tapTab(page, 'you');
    await expect(page.locator('.you-card').first()).toContainText('1 call');
  });
});
