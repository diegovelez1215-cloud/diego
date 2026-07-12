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
    await expect(page.locator('.lab-dna-row')).toHaveCount(3);
    await expect(page.locator('.lab-approach')).toHaveCount(4);
    await expect(page.locator('.lab-dna')).toContainText('never an official rating');
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

/** One duel kick through the rebuilt loop: pick a spot, begin the run-up,
    strike on the pulse. Timing is real; outcomes come from the seeded model. */
async function takeDuelKick(page, zone = 'bc') {
  await page.locator(`[data-duel-zone="${zone}"]`).click();
  await page.locator('#duel-go').click();
  await page.locator('#duel-strike').click();
}

async function finishDuel(page, zone = 'bc') {
  for (let guard = 0; guard < 24; guard++) {
    if (await page.locator('.rush-recap').isVisible().catch(() => false)) break;
    await takeDuelKick(page, zone);
  }
  await expect(page.locator('.rush-recap')).toBeVisible();
}

test.describe('Penalty Rush', () => {
  test('the duel: scout the keeper, pick a spot, time the pulse — local record only', async ({ page }, testInfo) => {
    await gotoApp(page);
    const heroBefore = await page.locator('.score-stage').innerText();
    await openPlayMode(page, 'shootout');
    await expect(page.locator('.rush-stage')).toBeVisible();
    // the scouting layer is honest and present before the first kick
    await expect(page.locator('.duel-scout')).toBeVisible();
    await expect(page.locator('.duel-tell')).not.toBeEmpty();
    await expect(page.locator('[data-duel-zone]')).toHaveCount(6);
    await expect(page.locator('.rush-readout')).toContainText('No pattern yet');
    await expect(page.locator('.rush-callout')).toContainText('Scout the keeper');
    await screenshot(page, testInfo, 'play-penalty-duel-read');
    // the run-up gate: no strike without a spot
    await expect(page.locator('#duel-go')).toBeDisabled();
    await page.locator('[data-duel-zone="bl"]').click();
    await expect(page.locator('#duel-go')).toBeEnabled();
    // feint is a real, visible tradeoff
    await page.locator('#duel-feint').click();
    await expect(page.locator('#duel-feint')).toContainText('Feint armed');
    await page.locator('#duel-go').click();
    await expect(page.locator('.duel-band')).toBeVisible();
    await screenshot(page, testInfo, 'play-penalty-duel-pulse');
    await page.locator('#duel-strike').click();
    await expect(page.locator('.rush-callout')).toContainText(/Kick 1|duel over|Full duel/);
    await expect(page.locator('.rush-dots .rush-dot:not(.pending)')).toHaveCount(1);
    // play the duel out to its complete result screen
    await finishDuel(page);
    await expect(page.locator('.rush-recap .rush-score strong')).toHaveText(/^\d+$/);
    await screenshot(page, testInfo, 'play-penalty-duel-result');
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
    // the museum keeps the duel moment
    await tapTab(page, 'you');
    await expect(page.locator('.you-moment.rush')).toBeVisible();
    // official truth untouched
    await tapTab(page, 'home');
    expect(await page.locator('.score-stage').innerText()).toBe(heroBefore);
  });

  test('the lobby card opens the duel and Step up again starts a fresh seeded run', async ({ page }) => {
    await gotoApp(page);
    await tapTab(page, 'play');
    await page.locator('.lobby-rush').click();
    await expect(page.locator('.rush-stage')).toBeVisible();
    await finishDuel(page, 'bl');
    await page.locator('#rush-again').click();
    await expect(page.locator('.rush-callout')).toContainText('Scout the keeper');
    await expect(page.locator('.rush-dot.pending')).toHaveCount(5);
  });
});

test.describe('Your Side', () => {
  test('the Play rail stays one touch-scrollable row and the first action is explicit', async ({ page }) => {
    await gotoApp(page);
    await tapTab(page, 'play');
    await expect(page.locator('.side-hero.unclaimed')).toContainText('Claim your team');
    const rail = await page.locator('.mode-rail .segmented').evaluate((el) => {
      const buttons = [...el.querySelectorAll('.seg-btn')];
      return {
        rows: new Set(buttons.map((button) => button.offsetTop)).size,
        scrollable: el.scrollWidth > el.clientWidth,
        minButtonHeight: Math.min(...buttons.map((button) => button.getBoundingClientRect().height)),
      };
    });
    expect(rail.rows).toBe(1);
    expect(rail.scrollable).toBe(true);
    expect(rail.minButtonHeight).toBeGreaterThanOrEqual(44);

    await page.locator('[data-segmented="play-mode"] [data-value="prediction"]').click();
    await expect(page.locator('.prediction')).toBeVisible();
    await expectNoHorizontalOverflow(page, expect, 'play mode rail');
  });

  test('claim a side, win the night, build a local record, rematch and replay honestly', async ({ page }, testInfo) => {
    await gotoApp(page);
    const heroBefore = await page.locator('.score-stage').innerText();
    await tapTab(page, 'play');
    // claim: unclaimed hero opens the 48-team picker
    await page.locator('#side-open').click();
    await expect(page.locator('.side-grid')).toBeVisible();
    await expect(page.locator('[data-side-pick]')).toHaveCount(48);
    await page.locator('#side-search').fill('usa');
    await expect(page.locator('#side-search-status')).toHaveText('1 team found');
    await expect(page.locator('.side-team:visible')).toHaveCount(1);
    await screenshot(page, testInfo, 'play-side-picker');
    await page.locator('[data-side-pick="USA"]').click();
    await expect(page.locator('.side-hero.claimed')).toContainText('USA');
    await expect(page.locator('.side-hero.claimed')).toContainText('0W–0L');
    await screenshot(page, testInfo, 'play-lobby-claimed');
    // tonight's matchup wears your side
    await page.locator('#side-night').click();
    await expect(page.locator('.lab.running')).toBeVisible();
    await expect(page.locator('.lab-you-tag')).toBeVisible();
    const seed = await page.evaluate(() => window.__u26LabDebug.snapshot().seed);
    await page.evaluate(() => window.__u26LabDebug.force('final'));
    await expect(page.locator('.lab-clock')).toHaveText('FULL TIME', { timeout: 10000 });
    // the verdict moment: force('final') hands the home side (yours) the win
    await expect(page.locator('.lab-verdict strong')).toHaveText('YOU WIN');
    await expect(page.locator('.lab-verdict')).toContainText('1W–0L');
    await screenshot(page, testInfo, 'play-lab-verdict-win');
    // replay the exact night: the seed must not change
    await page.locator('#lab-replay-night').click();
    await expect(page.locator('.lab.running:not(.done)')).toBeVisible();
    expect(await page.evaluate(() => window.__u26LabDebug.snapshot().seed)).toBe(seed);
    await page.evaluate(() => window.__u26LabDebug.force('final'));
    await expect(page.locator('.lab-clock')).toHaveText('FULL TIME', { timeout: 10000 });
    // rematch: same teams, a fresh seed
    await page.locator('#lab-again').click();
    await expect(page.locator('.lab.running:not(.done)')).toBeVisible();
    const rematch = await page.evaluate(() => window.__u26LabDebug.snapshot());
    expect(rematch.seed).not.toBe(seed);
    // the museum wears your side and your record
    await tapTab(page, 'you');
    await expect(page.locator('.you-side')).toContainText('USA');
    await expect(page.locator('.you-side')).toContainText('2W–0L');
    await expect(page.locator('.you-res.w').first()).toBeVisible();
    await screenshot(page, testInfo, 'you-side-record');
    // local only: whitelisted namespaces, and the side lives in Play state
    const keys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(keys.every((k) => ['u26v2.prefs', 'u26v2.play', 'u26v2.sims', 'u26v2.auth'].includes(k))).toBe(true);
    const play = await page.evaluate(() => JSON.parse(window.localStorage.getItem('u26v2.play') || '{}'));
    expect(play.side.code).toBe('USA');
    expect(play.sideStats.USA.w).toBe(2);
    // official truth untouched
    await tapTab(page, 'home');
    expect(await page.locator('.score-stage').innerText()).toBe(heroBefore);
  });

  test('Final Minute needs a side, then three calls resolve a verdict into the local record', async ({ page }, testInfo) => {
    await gotoApp(page);
    await openPlayMode(page, 'finalminute');
    // gated until you claim a team
    await page.locator('#fm-pickside').click();
    await expect(page.locator('.side-grid')).toBeVisible();
    await page.locator('[data-side-pick="BRA"]').click();
    await expect(page.locator('.side-hero.claimed')).toContainText('Brazil');
    await openPlayMode(page, 'finalminute');
    await expect(page.locator('.fm-stage')).toBeVisible();
    await expect(page.locator('.fm-team.you')).toContainText('Brazil');
    await expect(page.locator('.fm-time-ribbon i')).toHaveCount(3);
    await expect(page.locator('.fm-state span')).toHaveCount(4);
    await expect(page.locator('.fm-opt')).toHaveCount(3);
    await expect(page.locator('.fm-nerve')).toContainText(/All square|In control|On the edge/);
    await screenshot(page, testInfo, 'play-final-minute');
    for (let i = 0; i < 3; i++) {
      await page.locator('[data-fm-choice]').first().click();
    }
    await expect(page.locator('.fm-verdict strong')).toBeVisible();
    await expect(page.locator('.fm-record')).toContainText('on this phone');
    await screenshot(page, testInfo, 'play-final-minute-verdict');
    await expectNoHorizontalOverflow(page, expect, 'final-minute');
    const play = await page.evaluate(() => JSON.parse(window.localStorage.getItem('u26v2.play') || '{}'));
    expect(play.finalMinute.played).toBe(1);
    expect(['W', 'L', 'D']).toContain(play.finalMinute.lastResult);
    expect(play.fmHistory.length).toBe(1);
    // run it again draws the next deterministic attempt
    await page.locator('#fm-again').click();
    await expect(page.locator('.fm-choice')).toBeVisible();
    // Penalty Rush wears the same side identity
    await openPlayMode(page, 'shootout');
    await expect(page.locator('.rush-side')).toContainText('Brazil');
    await expect(page.locator('.duel-scout')).toBeVisible();
    await screenshot(page, testInfo, 'play-rush-side');
  });
});

test.describe('Arcade Cup', () => {
  test('the full road: claim a side, run all four stops, collect the trophy in You', async ({ page }, testInfo) => {
    test.slow();
    await gotoApp(page);
    const heroBefore = await page.locator('.score-stage').innerText();
    await tapTab(page, 'play');
    // the lobby invites a side first; the Cup gates on it too
    await openPlayMode(page, 'cup');
    await page.locator('#cup-pickside').click();
    await expect(page.locator('.side-grid')).toBeVisible();
    await page.locator('[data-side-pick="USA"]').click();
    await expect(page.locator('.side-hero.claimed')).toContainText('USA');
    // the lobby now carries the run strip as the next best action
    await expect(page.locator('.cup-strip.start')).toContainText('Five stops. One trophy.');
    await page.locator('.cup-strip.start').click();
    await expect(page.locator('.play-card.cup')).toBeVisible();
    await page.locator('#cup-start').click();
    await expect(page.locator('.cup-progress .cup-dot.now')).toHaveCount(1);
    await expect(page.locator('.cup-route .cup-stop')).toHaveCount(5);
    await screenshot(page, testInfo, 'play-cup-route');

    // Stop 1 — the Carousel: a real Rondo run settles the opening stop.
    // The press waits for the player's first touch; after it, holding the
    // ball loses it honestly and any verdict advances the road.
    await page.locator('[data-cup-stop="carousel"]').first().click();
    await expect(page.locator('.rondo.live')).toBeVisible();
    await expect(page.locator('.rondo-life')).toHaveCount(3);
    await page.locator('.rondo-mate:not(.carrier)').first().dispatchEvent('pointerdown');
    await expect(page.locator('.rondo.result')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.rondo.result .cup-advance')).toBeVisible();
    await screenshot(page, testInfo, 'play-cup-carousel');
    await page.locator('.cup-advance [data-goto="cup"]').click();

    // Stop 2 — Coach's Call: two calls resolve the dugout night
    await expect(page.locator('[data-cup-stop="call"]').first()).toBeVisible();
    await page.locator('[data-cup-stop="call"]').first().click();
    await expect(page.locator('.play-card.cc')).toBeVisible();
    await expect(page.locator('.cc-matchup')).toBeVisible();
    await expect(page.locator('.cc-board')).toBeVisible();
    await expect(page.locator('.cc-opt')).toHaveCount(3);
    await expect(page.locator('.cc-opt.identity-fit')).not.toHaveCount(0);
    await screenshot(page, testInfo, 'play-coach-call-board');
    for (let i = 0; i < 2; i++) await page.locator('[data-cc-choice]').first().click();
    await expect(page.locator('.fm-verdict strong')).toBeVisible();
    await expect(page.locator('.cup-advance')).toBeVisible();
    await screenshot(page, testInfo, 'play-coach-call-verdict');
    await page.locator('.cup-advance [data-goto="cup"]').click();

    // Stop 3 — Penalty Rush: the duel result settles the stop
    await expect(page.locator('[data-cup-stop="rush"]').first()).toBeVisible();
    await page.locator('[data-cup-stop="rush"]').first().click();
    await expect(page.locator('.rush-stage')).toBeVisible();
    await finishDuel(page);
    await expect(page.locator('.rush-recap .cup-advance')).toBeVisible();
    await page.locator('.cup-advance [data-goto="cup"]').click();

    // Stop 4 — Final Minute: three calls, verdict feeds the road
    await expect(page.locator('[data-cup-stop="clutch"]').first()).toBeVisible();
    await page.locator('[data-cup-stop="clutch"]').first().click();
    await expect(page.locator('.fm-stage')).toBeVisible();
    for (let i = 0; i < 3; i++) await page.locator('[data-fm-choice]').first().click();
    await expect(page.locator('.fm-recap .cup-advance')).toBeVisible();
    await page.locator('.cup-advance [data-goto="cup"]').click();

    // Stop 5 — the Showdown: a real Match Lab night against the rival
    await expect(page.locator('[data-cup-stop="showdown"]').first()).toBeVisible();
    await page.locator('[data-cup-stop="showdown"]').first().click();
    await expect(page.locator('.lab.running')).toBeVisible();
    await expect(page.locator('.lab-you-tag')).toBeVisible();
    await page.evaluate(() => window.__u26LabDebug.force('final'));
    await expect(page.locator('.lab-clock')).toHaveText('FULL TIME', { timeout: 10000 });
    await expect(page.locator('.lab-payoff .cup-advance.done')).toBeVisible();
    await screenshot(page, testInfo, 'play-cup-showdown-final');
    await page.locator('.cup-advance [data-goto="cup"]').click();

    // the run is complete: a trophy derived only from real stop results
    await expect(page.locator('.cup-final')).toBeVisible();
    await expect(page.locator('.cup-final')).toContainText('of 5 stops won');
    await expect(page.locator('.cup-season')).toContainText(/\/5 best road/);
    await expect(page.locator('#cup-restart')).toBeVisible();
    await screenshot(page, testInfo, 'play-cup-trophy');
    await expectNoHorizontalOverflow(page, expect, 'arcade-cup');

    // the museum keeps the silverware
    await tapTab(page, 'you');
    await expect(page.locator('.you-trophies .you-trophy')).toHaveCount(1);
    await expect(page.locator('.trophy-shelf')).toContainText('/5');
    await expect(page.locator('.you-cup-season')).toContainText('perfect cups');
    await expect(page.locator('.you-trophy-story')).not.toBeEmpty();
    await screenshot(page, testInfo, 'you-trophy-room');

    // local-only: whitelisted namespaces, the run lives in the Play key
    const keys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(keys.every((k) => ['u26v2.prefs', 'u26v2.play', 'u26v2.sims', 'u26v2.auth'].includes(k))).toBe(true);
    const play = await page.evaluate(() => JSON.parse(window.localStorage.getItem('u26v2.play') || '{}'));
    expect(play.arcadeCup.done).toBe(true);
    expect(play.cupHistory.length).toBe(1);
    expect(play.cupHistory[0].wins).toBeGreaterThanOrEqual(0);
    expect(play.coachCall.played).toBe(1);
    // no sportsbook language anywhere on the surface
    const text = (await page.locator('.you-view').innerText()).toLowerCase();
    for (const banned of [/\bodds\b/, /\bbets?\b/, /\bwallet\b/, /\bcash\b/, /payout/, /deposit/, /\bstakes?\b/]) {
      expect(text).not.toMatch(banned);
    }
    // official truth untouched
    await tapTab(page, 'home');
    expect(await page.locator('.score-stage').innerText()).toBe(heroBefore);
  });

  test('a run can be restarted mid-road with a fresh deterministic seed', async ({ page }) => {
    await gotoApp(page);
    await tapTab(page, 'play');
    await page.locator('#side-open').click();
    await page.locator('[data-side-pick="BRA"]').click();
    await openPlayMode(page, 'cup');
    await page.locator('#cup-start').click();
    const seedA = await page.evaluate(() => JSON.parse(window.localStorage.getItem('u26v2.play') || '{}').arcadeCup.seed);
    await page.locator('#cup-restart').click();
    const seedB = await page.evaluate(() => JSON.parse(window.localStorage.getItem('u26v2.play') || '{}').arcadeCup.seed);
    expect(seedB).not.toBe(seedA);
    await expect(page.locator('.cup-progress .cup-dot.now')).toHaveCount(1);
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
