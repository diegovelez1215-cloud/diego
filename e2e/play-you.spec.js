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
      window.__audioStarts = 0;
      window.__audioStops = 0;
      window.__audioResumeCalls = 0;
      class MockAudioContext {
        constructor() { window.__audioContexts++; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; this.state = 'suspended'; this.onstatechange = null; }
        resume() { window.__audioResumeCalls++; this.state = 'running'; if (this.onstatechange) this.onstatechange(); return Promise.resolve(); }
        createOscillator() { return { type: 'sine', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this; }, start() { window.__audioStarts++; }, stop() { window.__audioStops++; } }; }
        createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect() { return this; } }; }
        createBufferSource() { return { connect() { return this; }, start() { window.__audioStarts++; }, stop() { window.__audioStops++; }, set buffer(_) {} }; }
        createBuffer(_channels, length) { return { getChannelData() { return new Float32Array(length); } }; }
        createBiquadFilter() { return { type: 'lowpass', frequency: { value: 0 }, connect() { return this; } }; }
      }
      window.AudioContext = MockAudioContext;
      window.webkitAudioContext = MockAudioContext;
    });
    await gotoApp(page);
    await openPlayMode(page, 'lab');
    await expect(page.locator('#lab-sound')).toHaveAttribute('data-sound', 'pending');
    await expect(page.locator('#lab-sound')).toHaveText('Tap to enable sound');
    expect(await page.evaluate(() => window.__audioContexts)).toBe(0);
    await page.locator('#lab-sound').click();
    await expect(page.locator('#lab-sound')).toHaveAttribute('data-sound', 'on');
    await page.locator('#lab-sound').click();
    await expect(page.locator('#lab-sound')).toHaveAttribute('data-sound', 'off');
    const mutedStarts = await page.evaluate(() => window.__audioStarts);
    await page.locator('#lab-kickoff').click();
    await expect(page.locator('[data-player-side="home"]')).toHaveCount(11);
    await expect(page.locator('[data-player-side="away"]')).toHaveCount(11);
    await expect(page.locator('[data-ball]')).toBeVisible();
    expect(await page.evaluate(() => window.__audioStarts), 'muted start does not create new audio').toBe(mutedStarts);
    const ballA = await page.locator('[data-ball]').getAttribute('style');
    await page.evaluate(() => window.__u26LabDebug.force('open'));
    await page.waitForTimeout(420);
    const ballB = await page.locator('[data-ball]').getAttribute('style');
    expect(ballB).not.toBe(ballA);
    await page.locator('[data-pace="fast"]').click();
    await expect(page.locator('[data-pace="fast"]')).toHaveClass(/active/);
    expect(await page.evaluate(() => window.__u26LabDebug.snapshot().pace)).toBe('fast');

    await page.evaluate(() => window.__u26LabDebug.force('goal'));
    await expect(page.locator('#lab-score')).toContainText('0–0');
    await page.locator('[data-pace="key"]').click();
    await expect(page.locator('[data-pace="key"]')).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => window.__u26LabDebug.snapshot().activeMajor)).toBe(true);
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

  test('sound unlocks only from user action and mute prevents new audio', async ({ page }) => {
    await page.addInitScript(() => {
      window.__audioContexts = 0;
      window.__audioStarts = 0;
      window.__audioResumeCalls = 0;
      class MockAudioContext {
        constructor() { window.__audioContexts++; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; this.state = 'suspended'; this.onstatechange = null; }
        resume() { window.__audioResumeCalls++; this.state = 'running'; if (this.onstatechange) this.onstatechange(); return Promise.resolve(); }
        createOscillator() { return { type: 'sine', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this; }, start() { window.__audioStarts++; }, stop() {} }; }
        createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect() { return this; } }; }
        createBufferSource() { return { connect() { return this; }, start() { window.__audioStarts++; }, stop() {}, set buffer(_) {} }; }
        createBuffer(_channels, length) { return { getChannelData() { return new Float32Array(length); } }; }
        createBiquadFilter() { return { type: 'lowpass', frequency: { value: 0 }, connect() { return this; } }; }
      }
      window.AudioContext = MockAudioContext;
      window.webkitAudioContext = MockAudioContext;
    });
    await gotoApp(page);
    await openPlayMode(page, 'lab');
    expect(await page.evaluate(() => window.__audioContexts)).toBe(0);
    await expect(page.locator('#lab-sound')).toHaveAttribute('data-sound', 'pending');
    await expect(page.locator('#lab-sound')).toHaveText('Tap to enable sound');
    await page.locator('#lab-sound').click();
    await expect(page.locator('#lab-sound')).toHaveAttribute('data-sound', 'on');
    expect(await page.evaluate(() => window.__audioContexts)).toBe(1);
    expect(await page.evaluate(() => window.__audioResumeCalls)).toBe(1);
    expect(await page.evaluate(() => window.__audioStarts)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__u26LabDebug.audio().unlocked)).toBe(true);
    await page.locator('#lab-kickoff').click();
    await page.locator('#lab-sound').click();
    await expect(page.locator('#lab-sound')).toHaveAttribute('data-sound', 'off');
    const before = await page.evaluate(() => window.__audioStarts);
    await page.evaluate(() => window.__u26LabDebug.force('goal'));
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => window.__audioStarts)).toBe(before);
  });

  test('kickoff directly unlocks Web Audio and starts an immediate confirmation cue', async ({ page }) => {
    await page.addInitScript(() => {
      window.__audioContexts = 0;
      window.__audioStarts = 0;
      window.__audioResumeCalls = 0;
      class MockAudioContext {
        constructor() { window.__audioContexts++; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; this.state = 'suspended'; this.onstatechange = null; }
        resume() { window.__audioResumeCalls++; this.state = 'running'; if (this.onstatechange) this.onstatechange(); return Promise.resolve(); }
        createOscillator() { return { type: 'sine', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this; }, start() { window.__audioStarts++; }, stop() {} }; }
        createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect() { return this; } }; }
        createBufferSource() { return { connect() { return this; }, start() { window.__audioStarts++; }, stop() {}, set buffer(_) {} }; }
        createBuffer(_channels, length) { return { getChannelData() { return new Float32Array(length); } }; }
        createBiquadFilter() { return { type: 'lowpass', frequency: { value: 0 }, connect() { return this; } }; }
      }
      window.AudioContext = MockAudioContext;
      window.webkitAudioContext = MockAudioContext;
    });
    await gotoApp(page);
    await openPlayMode(page, 'lab');
    await expect(page.locator('#lab-sound')).toHaveAttribute('data-sound', 'pending');
    await page.locator('#lab-kickoff').click();
    await expect(page.locator('#lab-sound')).toHaveAttribute('data-sound', 'on');
    expect(await page.evaluate(() => window.__audioContexts)).toBe(1);
    expect(await page.evaluate(() => window.__audioResumeCalls)).toBe(1);
    expect(await page.evaluate(() => window.__audioStarts)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__u26LabDebug.audio().unlocked)).toBe(true);
  });

  test('sound state never claims on while Web Audio is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      window.AudioContext = undefined;
      window.webkitAudioContext = undefined;
    });
    await gotoApp(page);
    await openPlayMode(page, 'lab');
    await expect(page.locator('#lab-sound')).toHaveAttribute('data-sound', 'unavailable');
    await expect(page.locator('#lab-sound')).toHaveText('Sound unavailable');
    expect(await page.evaluate(() => window.__u26LabDebug.audio().supported)).toBe(false);
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
    await page.locator('[data-pace="fast"]').click();
    const samples = [];
    for (let i = 0; i < 5; i++) {
      samples.push(await page.locator('[data-ball]').evaluate((el) => ({
        x: parseFloat(el.style.left),
        y: parseFloat(el.style.top),
      })));
      await page.waitForTimeout(100);
    }
    const jumps = samples.slice(1).map((p, i) => Math.hypot(p.x - samples[i].x, p.y - samples[i].y));
    expect(Math.max(...jumps), 'Turbo open play stays eased, not teleported').toBeLessThan(35);
    await expect(page.locator('.lab-pitch[data-persist="scene"]'), 'pitch DOM persisted — no full rerender').toHaveCount(1);
    const playerA = await page.locator('.pitch-player').first().evaluate((el) => `${el.style.left}|${el.style.top}`);
    await page.waitForTimeout(700);
    const playerB = await page.locator('.pitch-player').first().evaluate((el) => `${el.style.left}|${el.style.top}`);
    expect(playerB, 'role markers drift with the match').not.toBe(playerA);
  });

  test('extra time appears before a shootout and the extra-time decision stays compact', async ({ page }) => {
    await gotoApp(page);
    await openPlayMode(page, 'lab');
    await page.locator('#lab-kickoff').click();
    await page.evaluate(() => window.__u26LabDebug.force('extra'));
    await expect(page.locator('.lab-phase-badge')).toHaveText('Extra time');
    await expect(page.locator('.lab-clock')).toContainText('EXTRA TIME');
    await expect(page.locator('.lab-decision')).toContainText('Push for it');
    await expect(page.locator('.lab-decision')).toContainText('Fresh legs');
    await expect(page.locator('.lab-decision')).toContainText('Protect and counter');
    const optionBox = await page.locator('.lab-decision .lab-opt').last().boundingBox();
    const dockBox = await page.locator('.dock').boundingBox();
    expect(optionBox.y + optionBox.height, 'extra-time decision option clears fixed dock').toBeLessThan(dockBox.y - 4);
    await page.locator('[data-decide="fresh"]').click();
    await expect.poll(() => page.evaluate(() => window.__u26LabDebug.snapshot().phase)).toBe('et1');
    const score = page.locator('#lab-score');

    // force() stops the live timer and reports the pre-commit score, so the
    // expectation is derived from the exact moment the goal was queued — the
    // live sim can no longer race the assertion with its own late goal.
    const forced = await page.evaluate(() => window.__u26LabDebug.force('et-goal'));
    expect(forced.score).toHaveLength(2);
    const [home, away] = forced.score;
    await expect(page.locator('.lab-phase-badge')).toHaveText('Extra time');
    await expect(score).toHaveAttribute('data-v', `${home}-${away}`);
    await expect(score).toHaveAttribute('data-v', `${home + 1}-${away}`, { timeout: 4000 });
  });

  test('penalty shootout keeps the pitch full and respects red-card reductions', async ({ page }) => {
    await gotoApp(page);
    await openPlayMode(page, 'lab');
    await page.locator('#lab-kickoff').click();
    await page.evaluate(() => window.__u26LabDebug.force('pens'));
    await expect(page.locator('.lab-clock')).toContainText('PENALTIES');
    await expect(page.locator('.pitch-player')).toHaveCount(22);
    await expect(page.locator('[data-role="GK"]')).toHaveCount(2);
    await expect(page.locator('.lab-pens')).toContainText(/Penalties 0–0/);
    await expect(page.locator('[data-ball]')).toHaveAttribute('data-kind', /penalty|goal|save|miss/);
    await page.waitForTimeout(900);
    await expect(page.locator('.lab-pens')).toContainText(/Penalties 1–0|Penalties 1–1/);
    await page.evaluate(() => window.__u26LabDebug.force('pens-red'));
    await expect(page.locator('.pitch-player')).toHaveCount(21);
    await expect(page.locator('[data-player-side="away"]')).toHaveCount(10);
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
    const finalButtonBox = await page.locator('#lab-new').boundingBox();
    const finalDockBox = await page.locator('.dock').boundingBox();
    expect(finalButtonBox.y + finalButtonBox.height, 'full-time recap actions clear fixed dock').toBeLessThan(finalDockBox.y - 4);
    await screenshot(page, testInfo, 'play-lab-fulltime');
    await expectNoHorizontalOverflow(page, expect, 'lab');
    // saved to You — and the museum can replay the exact night
    await tapTab(page, 'you');
    await expect(page.locator('.you-lab')).toHaveCount(1);
    await expect(page.locator('.you-replay').first()).toBeVisible();
    await page.locator('.you-replay').first().click();
    await expect(page.locator('.dock-tab[data-tab="play"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.lab.running')).toBeVisible();
    // real truth untouched
    await tapTab(page, 'home');
    expect(await page.locator('.score-stage').innerText()).toBe(heroBefore);
  });
});

test.describe('Penalty Rush', () => {
  test('five kicks against the gauntlet keeper — local record only, official truth untouched', async ({ page }, testInfo) => {
    await gotoApp(page);
    const heroBefore = await page.locator('.score-stage').innerText();
    await openPlayMode(page, 'shootout');
    await expect(page.locator('.rush-stage')).toBeVisible();
    await expect(page.locator('.rush-aim')).toHaveCount(3);
    await expect(page.locator('.rush-callout')).toContainText('Pick your corner');
    const aims = ['left', 'centre', 'right', 'left', 'right'];
    for (const aim of aims) {
      await page.locator(`[data-rush-aim="${aim}"]`).click();
      await expect(page.locator('.rush-callout')).not.toContainText('Pick your corner');
    }
    // a perfect five earns sudden death — keep shooting until the keeper wins
    for (let guard = 0; guard < 24; guard++) {
      if (await page.locator('.rush-recap').isVisible().catch(() => false)) break;
      await page.locator('[data-rush-aim="centre"]').click();
    }
    await expect(page.locator('.rush-recap')).toBeVisible();
    await expect(page.locator('.rush-recap .rush-score strong')).toHaveText(/^\d+$/);
    await screenshot(page, testInfo, 'play-penalty-rush');
    await expectNoHorizontalOverflow(page, expect, 'penalty-rush');
    // no sportsbook language anywhere on the surface
    const text = (await page.locator('.play-view').innerText()).toLowerCase();
    for (const banned of [/\bodds\b/, /\bbets?\b/, /\bwallet\b/, /\bcash\b/, /cashout/, /\bpayout\b/, /\bdeposit\b/, /\bstakes?\b/]) {
      expect(text).not.toMatch(banned);
    }
    // the record lives only in the whitelisted Play namespace
    const keys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(keys.every((k) => ['u26v2.prefs', 'u26v2.play', 'u26v2.sims', 'u26v2.auth'].includes(k))).toBe(true);
    const rush = await page.evaluate(() => JSON.parse(window.localStorage.getItem('u26v2.play') || '{}').penaltyRush);
    expect(rush.played).toBe(1);
    expect(rush.bestEver).toBeGreaterThanOrEqual(0);
    // the museum keeps the gauntlet moment
    await tapTab(page, 'you');
    await expect(page.locator('.you-moment.rush')).toBeVisible();
    // official truth untouched
    await tapTab(page, 'home');
    expect(await page.locator('.score-stage').innerText()).toBe(heroBefore);
  });

  test('the lobby cabinet opens the gauntlet and Step up again starts a fresh seeded run', async ({ page }) => {
    await gotoApp(page);
    await tapTab(page, 'play');
    await page.locator('.lobby-rush').click();
    await expect(page.locator('.rush-stage')).toBeVisible();
    for (let guard = 0; guard < 24; guard++) {
      if (await page.locator('.rush-recap').isVisible().catch(() => false)) break;
      await page.locator('[data-rush-aim="left"]').click();
    }
    await page.locator('#rush-again').click();
    await expect(page.locator('.rush-callout')).toContainText('Pick your corner');
    await expect(page.locator('.rush-dot.pending')).toHaveCount(5);
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
    for (const banned of [/\bodds\b/, /\bbets?\b/, /\bwallet\b/, /\bcash\b/, /cashout/, /\bpayout\b/, /\bdeposit\b/, /\bstakes?\b/, /\bhunch\b/]) {
      expect(text.toLowerCase()).not.toMatch(banned);
    }
    expect(text).toContain('World Cup Leaderboard');
    await tapTab(page, 'you');
    await expect(page.locator('.you-card', { hasText: 'Prediction record' })).toContainText('1 call');
    // Museum hero: local identity only, present even for a fresh player.
    await expect(page.locator('.you-hero')).toContainText('Kept on this phone');
  });
});
