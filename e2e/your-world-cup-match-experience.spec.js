import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const evidenceRoot = process.env.YWC_EVIDENCE_DIR || resolve('output/final-match-shipping-evidence');
const evidence = (path) => { const target = resolve(evidenceRoot, path); mkdirSync(dirname(target), { recursive: true }); return target; };
const route = '/v2/your-world-cup-prototype/';
const seed = 26062026;
const defaultTactics = { shape: '4-3-3-wide', press: 'balanced', finalThird: 'wings' };
const sentinels = Object.freeze({
  'u26v2.predictions.local': '{"sentinel":"prediction-bytes-v2"}',
  'u26v2.auth': '{"sentinel":"auth-bytes-v2"}',
  'u26v2.play': '{"sentinel":"v1-play-bytes-v2"}',
});

function campaign({ campaignSeed = seed, tactics = defaultTactics } = {}) {
  return {
    version: 3,
    campaignId: 'argentina-group-c-001',
    seed: campaignSeed,
    nation: 'Argentina',
    group: ['Argentina', 'Nigeria', 'Poland', 'New Zealand'],
    stage: 'match',
    tactics,
    match: { planVersion: 1, fixtureId: 'arg-nga', tick: 0, speed: 1, phase: 'first-half', moment: { tick: 0, events: [] }, momentOutcome: null },
    completedMatches: [],
  };
}

const match = (page) => page.locator('[data-screen="match"]');
const hash = (value) => [...value].reduce((total, character) => ((total * 33) + character.charCodeAt(0)) >>> 0, 5381);

function goalZone(tick) {
  const zones = ['left', 'center', 'right'];
  const keeper = zones[hash(`${seed}:keeper`) % 3];
  return zones.filter((zone) => zone !== keeper).sort((a, b) => (hash(`${seed}:4-3-3-wide:wings:${tick}:${b}`) % 13) - (hash(`${seed}:4-3-3-wide:wings:${tick}:${a}`) % 13))[0];
}

async function seedStorage(page, state = campaign()) {
  await page.goto(route);
  await page.evaluate(({ state, sentinels }) => {
    localStorage.clear();
    for (const [key, value] of Object.entries(sentinels)) localStorage.setItem(key, value);
    localStorage.setItem('u26v2.prototype.your-world-cup', JSON.stringify({ version: 1, screen: 'campaign', nation: 'Argentina' }));
    localStorage.setItem('u26v2.your-world-cup.campaign', JSON.stringify(state));
  }, { state, sentinels });
  await page.reload();
  await expect(match(page)).toBeVisible();
}

async function expectSentinels(page) {
  await expect(page.evaluate((expected) => Object.fromEntries(Object.keys(expected).map((key) => [key, localStorage.getItem(key)])), sentinels)).resolves.toEqual(sentinels);
}

async function enterFreshCampaign(page) {
  await page.goto(route);
  await page.evaluate((values) => { localStorage.clear(); for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value); }, sentinels);
  await page.reload();
  await page.getByRole('button', { name: /start your world cup/i }).click();
  await page.getByRole('button', { name: /Argentina, Quick combinations/i }).click();
  await page.getByRole('button', { name: /choose argentina/i }).click();
  const skip = page.getByRole('button', { name: /skip draw/i });
  if (await skip.isVisible()) await skip.click();
  await page.getByRole('button', { name: /enter campaign/i }).click();
  await page.getByRole('button', { name: /play argentina v nigeria/i }).click();
}

async function pauseMatch(page) {
  const play = page.getByRole('button', { name: /play match/i });
  if (await play.isVisible()) return;
  const pause = page.getByRole('button', { name: /pause match/i });
  await expect(pause).toBeVisible();
  await pause.click();
  await expect(play).toBeVisible();
}

async function nextEvent(page) {
  const before = await match(page).getAttribute('data-event-index');
  await page.getByRole('button', { name: /next event/i }).click();
  await expect.poll(() => match(page).getAttribute('data-event-index')).not.toBe(before);
}

async function advanceToAction(page, actions, maximum = 32) {
  const wanted = Array.isArray(actions) ? actions : [actions];
  await pauseMatch(page);
  for (let index = 0; index < maximum; index++) {
    const action = await match(page).getAttribute('data-action');
    if (wanted.includes(action)) return action;
    if (await match(page).getAttribute('data-phase') === 'halftime') {
      await page.getByRole('button', { name: /resume second half/i }).click();
      await pauseMatch(page);
      continue;
    }
    await nextEvent(page);
  }
  throw new Error(`Did not reach ${wanted.join('/')} within ${maximum} visible events.`);
}

async function advanceToHalftime(page) {
  await pauseMatch(page);
  for (let index = 0; index < 40; index++) {
    if (await match(page).getAttribute('data-phase') === 'halftime') return;
    await nextEvent(page);
  }
  throw new Error('Half-time did not appear in the event ledger.');
}

async function enterPivotal(page) {
  if (await match(page).getAttribute('data-phase') !== 'pivotal') {
    await page.getByRole('button', { name: /skip to the moment/i }).click();
  }
  await expect(match(page)).toHaveAttribute('data-phase', 'pivotal');
  await expect(page.locator('button.ywc-match-player.is-open:not(:disabled)').first()).toBeVisible();
}

async function playSuccess(page) {
  await enterPivotal(page);
  for (let move = 0; move < 8 && await page.locator('.ywc-match-goal-zones button').count() === 0; move++) {
    const striker = page.locator('button.ywc-match-player.is-open:not(:disabled)[data-player-id="arg-st"]');
    const target = await striker.count() ? striker : page.locator('button.ywc-match-player.is-open:not(:disabled)').first();
    await expect(target).toBeVisible();
    await target.click();
    await expect.poll(async () => (await page.locator('.ywc-match-goal-zones button').count()) + (await page.locator('button.ywc-match-player.is-open:not(:disabled)').count())).toBeGreaterThan(0);
  }
  await expect(page.locator('.ywc-match-goal-zones button')).toHaveCount(3);
  const momentTick = Number(await match(page).getAttribute('data-moment-tick'));
  const scoreBefore = await match(page).getAttribute('data-score');
  await page.getByRole('button', { name: `Shoot ${goalZone(momentTick)} goal zone` }).click();
  await expect(match(page)).toHaveAttribute('data-moment-outcome', 'goal');
  expect(await match(page).getAttribute('data-score')).toBe(scoreBefore);
  await expect(match(page)).toHaveAttribute('data-moment-resolved', 'true');
  await expect(page.locator('.ywc-match-freeze.is-goal')).toBeVisible();
  expect(await match(page).getAttribute('data-score')).not.toBe(scoreBefore);
}

async function playFailure(page) {
  await enterPivotal(page);
  const closed = page.locator('button.ywc-match-player.is-closed:not(:disabled)').first();
  await expect(closed).toBeVisible();
  await closed.click();
  await expect(match(page)).toHaveAttribute('data-moment-outcome', 'interception');
  await expect(match(page)).toHaveAttribute('data-moment-resolved', 'true');
  await expect(page.locator('.ywc-match-freeze.is-interception')).toBeVisible();
}

async function finishMatch(page) {
  await expect(match(page)).toHaveAttribute('data-phase', 'closing', { timeout: 5_000 });
  await page.getByRole('button', { name: '4×', exact: true }).click();
  await expect(match(page)).toHaveAttribute('data-phase', 'full-time', { timeout: 12_000 });
  const score = await match(page).getAttribute('data-score');
  await expect(page.locator('[data-screen="result"]')).toBeVisible({ timeout: 4_000 });
  return score;
}

async function expectResultAndWall(page, score) {
  const [home, away] = score.split('-');
  await expect(page.locator('[data-screen="result"]')).toContainText(`ARG ${home}–${away} NGA`);
  await page.getByRole('button', { name: /keep the paper|pin it up/i }).click();
  await expect(page.locator('[data-screen="campaign"]')).toContainText(`Argentina ${home}–${away} Nigeria`);
}

async function expectViewportSafe(page, width) {
  const geometry = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    targets: [...document.querySelectorAll('button:not([disabled])')].map((element) => { const box = element.getBoundingClientRect(); return { label: element.getAttribute('aria-label') || element.textContent?.trim(), width: box.width, height: box.height, left: box.left, right: box.right, top: box.top, bottom: box.bottom }; }),
  }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.client);
  for (const target of geometry.targets) {
    expect(target.height, `${target.label} target height`).toBeGreaterThanOrEqual(47.5);
    expect(target.left, `${target.label} left edge`).toBeGreaterThanOrEqual(-.5);
    expect(target.right, `${target.label} right edge`).toBeLessThanOrEqual(width + .5);
  }
}

async function startRecorder(page) {
  await page.evaluate(() => {
    window.__ywcObservedFrames = [];
    const root = document.querySelector('[data-screen="match"]');
    const capture = () => {
      const pitch = document.querySelector('.ywc-match-pitch');
      if (!root || !pitch) return;
      window.__ywcObservedFrames.push({
        tick: Number(root.dataset.tick), eventIndex: Number(root.dataset.eventIndex), progress: Number(root.dataset.eventProgress),
        action: root.dataset.action, possession: root.dataset.possession, score: root.dataset.score,
        ball: [Number(pitch.dataset.ballX), Number(pitch.dataset.ballY)],
      });
    };
    capture();
    window.__ywcObserver = new MutationObserver(capture);
    window.__ywcObserver.observe(root, { attributes: true, subtree: true, attributeFilter: ['data-tick', 'data-event-progress', 'data-ball-x', 'data-ball-y'] });
  });
}

async function stopRecorder(page) {
  return page.evaluate(() => { window.__ywcObserver?.disconnect(); return window.__ywcObservedFrames || []; });
}

async function playThroughCurrentEvent(page) {
  const current = await match(page).getAttribute('data-event-index');
  await page.getByRole('button', { name: /play match/i }).click();
  await expect.poll(() => match(page).getAttribute('data-event-index'), { timeout: 5_000 }).not.toBe(current);
  await pauseMatch(page);
}

test('390 success flow: campaign wall through coherent result and updated wall', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-390', 'One canonical mobile success watch is sufficient.');
  await page.setViewportSize({ width: 390, height: 844 });
  await enterFreshCampaign(page);
  await page.screenshot({ path: evidence('390-success/01-tactics.png'), fullPage: true });
  await page.getByRole('button', { name: /^kick off/i }).click();
  await expect(match(page)).toHaveAttribute('data-score', '0-0');
  await expect(match(page)).toHaveAttribute('data-minute', '0');
  await pauseMatch(page);
  await advanceToHalftime(page);
  await expect(page.locator('.ywc-match-freeze.is-halftime')).toBeVisible();
  await page.screenshot({ path: evidence('390-success/02-halftime.png') });
  await page.getByRole('button', { name: /resume second half/i }).click();
  await playSuccess(page);
  await page.screenshot({ path: evidence('390-success/03-pivotal-goal.png') });
  const score = await finishMatch(page);
  await page.screenshot({ path: evidence('390-success/04-result.png'), fullPage: true });
  await expectResultAndWall(page, score);
  await page.screenshot({ path: evidence('390-success/05-updated-wall.png'), fullPage: true });
  await expectSentinels(page);
  await expectViewportSafe(page, 390);
});

test('390 failure flow is explicit, coherent, and persists its result', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-390', 'One canonical mobile failure watch is sufficient.');
  await page.setViewportSize({ width: 390, height: 844 });
  await seedStorage(page);
  await pauseMatch(page);
  await playFailure(page);
  await expect(page.locator('.ywc-match-freeze.is-interception')).toContainText(/lane was closed|cut it out/i);
  await page.screenshot({ path: evidence('390-failure/01-interception.png') });
  const score = await finishMatch(page);
  await page.screenshot({ path: evidence('390-failure/02-result.png'), fullPage: true });
  await expectResultAndWall(page, score);
  await page.screenshot({ path: evidence('390-failure/03-updated-wall.png'), fullPage: true });
  await expectSentinels(page);
});

test('event frames show pass travel, resolved turnover possession, and shot-before-resolution order', async ({ page }) => {
  await seedStorage(page);
  await advanceToAction(page, 'pass');
  await startRecorder(page);
  await playThroughCurrentEvent(page);
  let observed = await stopRecorder(page);
  const passIndex = observed.find((frame) => frame.action === 'pass')?.eventIndex;
  const passFrames = observed.filter((frame) => frame.eventIndex === passIndex);
  expect(new Set(passFrames.map((frame) => frame.ball.join(','))).size).toBeGreaterThan(3);

  await advanceToAction(page, ['turnover', 'tackle']);
  const turnoverAction = await match(page).getAttribute('data-action');
  await startRecorder(page);
  await playThroughCurrentEvent(page);
  observed = await stopRecorder(page);
  const turnoverFrames = observed.filter((frame) => frame.action === turnoverAction);
  expect(turnoverFrames[0].possession).not.toBe(turnoverFrames.at(-1).possession);
  expect(turnoverFrames.find((frame) => frame.possession === turnoverFrames.at(-1).possession)?.progress).toBe(1);

  await advanceToAction(page, 'shot');
  const scoreBefore = await match(page).getAttribute('data-score');
  await page.evaluate(() => {
    const root = document.querySelector('[data-screen="match"]');
    window.__ywcScoreChanges = [];
    window.__ywcScoreObserver = new MutationObserver(() => window.__ywcScoreChanges.push({ action: root.dataset.action, progress: Number(root.dataset.eventProgress), score: root.dataset.score }));
    window.__ywcScoreObserver.observe(root, { attributes: true, attributeFilter: ['data-score'] });
  });
  await startRecorder(page);
  await playThroughCurrentEvent(page);
  observed = await stopRecorder(page);
  const scoreChanges = await page.evaluate(() => { window.__ywcScoreObserver.disconnect(); return window.__ywcScoreChanges; });
  const shotFrames = observed.filter((frame) => frame.action === 'shot');
  const resolution = observed.find((frame) => frame.eventIndex > shotFrames[0].eventIndex);
  expect(shotFrames.at(-1).progress).toBe(1);
  expect(shotFrames.every((frame) => frame.score === scoreBefore)).toBe(true);
  expect(['goal', 'save']).toContain(resolution.action);
  expect(Math.hypot(shotFrames.at(-1).ball[0] - resolution.ball[0], shotFrames.at(-1).ball[1] - resolution.ball[1])).toBeLessThan(.01);
  if (resolution.action === 'goal') {
    const changed = scoreChanges[0];
    expect(changed).toMatchObject({ action: 'goal', progress: 1 });
    expect(changed.score).not.toBe(scoreBefore);
  } else expect(await match(page).getAttribute('data-score')).toBe(scoreBefore);
});

test('play, pause, all speeds, next event, and take-control work from visible state', async ({ page }) => {
  await seedStorage(page);
  await pauseMatch(page);
  const tick = await match(page).getAttribute('data-tick');
  await expect.poll(() => match(page).getAttribute('data-tick')).toBe(tick);
  for (const speed of [2, 4, 1]) {
    await page.getByRole('button', { name: `${speed}×`, exact: true }).click();
    await expect(match(page)).toHaveAttribute('data-speed', String(speed));
    await expect.poll(() => match(page).getAttribute('data-tick')).not.toBe(tick);
    await pauseMatch(page);
  }
  const event = await match(page).getAttribute('data-event-index');
  await nextEvent(page);
  expect(await match(page).getAttribute('data-event-index')).not.toBe(event);
  await enterPivotal(page);
  await expect(page.locator('button.ywc-match-player.is-open:not(:disabled)').first()).toBeVisible();
});

test('reload restores the exact normal frame, pivotal state, full time, and result', async ({ page }) => {
  await seedStorage(page);
  await advanceToAction(page, 'pass');
  await page.getByRole('button', { name: /play match/i }).click();
  await expect(match(page)).toHaveAttribute('data-event-progress', '0.500');
  await pauseMatch(page);
  const normal = await match(page).evaluate((element) => ({ tick: element.dataset.tick, event: element.dataset.eventIndex, progress: element.dataset.eventProgress, score: element.dataset.score, ball: document.querySelector('.ywc-match-pitch')?.getAttribute('data-ball-x') + ',' + document.querySelector('.ywc-match-pitch')?.getAttribute('data-ball-y') }));
  await page.reload();
  await expect(match(page)).toHaveAttribute('data-tick', normal.tick);
  await expect(match(page)).toHaveAttribute('data-event-index', normal.event);
  await expect(match(page)).toHaveAttribute('data-event-progress', normal.progress);
  await expect(match(page)).toHaveAttribute('data-score', normal.score);
  expect(await page.locator('.ywc-match-pitch').evaluate((element) => element.getAttribute('data-ball-x') + ',' + element.getAttribute('data-ball-y'))).toBe(normal.ball);

  await enterPivotal(page);
  const target = page.locator('button.ywc-match-player.is-open:not(:disabled)').first();
  const targetId = await target.getAttribute('data-player-id');
  await target.click();
  await expect(page.locator(`[data-player-id="${targetId}"]`)).toHaveClass(/is-carrier/);
  const pivotalTick = await match(page).getAttribute('data-moment-tick');
  await page.reload();
  await expect(match(page)).toHaveAttribute('data-phase', 'pivotal');
  await expect(match(page)).toHaveAttribute('data-moment-tick', pivotalTick);
  await expect(page.locator(`[data-player-id="${targetId}"]`)).toHaveClass(/is-carrier/);

  await playFailure(page);
  await expect(match(page)).toHaveAttribute('data-phase', 'closing', { timeout: 5_000 });
  await page.getByRole('button', { name: '4×', exact: true }).click();
  await expect(match(page)).toHaveAttribute('data-phase', 'full-time', { timeout: 12_000 });
  const fullTimeScore = await match(page).getAttribute('data-score');
  await page.reload();
  await expect(match(page)).toHaveAttribute('data-phase', 'full-time');
  await expect(match(page)).toHaveAttribute('data-score', fullTimeScore);
  await expect(page.locator('[data-screen="result"]')).toBeVisible({ timeout: 4_000 });
  await page.reload();
  await expect(page.locator('[data-screen="result"]')).toBeVisible();
  await expectSentinels(page);
});

test('reduced motion and keyboard-only pivotal play remain understandable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedStorage(page);
  await pauseMatch(page);
  await enterPivotal(page);
  await expect(match(page)).toHaveAttribute('data-reduced-motion', 'true');
  await page.keyboard.press('1');
  await expect(page.locator('[data-player-id="arg-lw"]')).toHaveClass(/is-carrier/);
  await expect(page.locator('button[data-player-id="arg-st"]')).toBeEnabled();
  await page.keyboard.press('4');
  await expect(page.locator('[data-player-id="arg-st"]')).toHaveClass(/is-carrier/);
  await expect(page.locator('.ywc-match-goal-zones button')).toHaveCount(3);
  const momentTick = Number(await match(page).getAttribute('data-moment-tick'));
  await page.keyboard.press({ left: 'q', center: 'w', right: 'e' }[goalZone(momentTick)]);
  await expect(page.locator('.ywc-match-freeze.is-goal')).toBeVisible();
  const animations = await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length);
  expect(animations).toBe(0);
  await expectSentinels(page);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1280, height: 900 }, { width: 1440, height: 1000 }]) {
  test(`${viewport.width}×${viewport.height} match geometry has no clipping or overflow`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seedStorage(page);
    await pauseMatch(page);
    await expect(page.locator('.ywc-match-player')).toHaveCount(22);
    await expect(page.locator('.ywc-match-ball')).toBeVisible();
    await expectViewportSafe(page, viewport.width);
    if (viewport.width >= 1280) await page.screenshot({ path: evidence(`${viewport.width}/active-match.png`) });
  });
}

test('1280 desktop flow reaches halftime, pivotal play, full time, and the updated wall', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-390', 'One canonical desktop watch is sufficient.');
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedStorage(page);
  await pauseMatch(page);
  await page.screenshot({ path: evidence('1280/01-kickoff.png') });
  await advanceToHalftime(page);
  await page.screenshot({ path: evidence('1280/02-halftime.png') });
  await page.getByRole('button', { name: /resume second half/i }).click();
  await playSuccess(page);
  await page.screenshot({ path: evidence('1280/03-pivotal.png') });
  const score = await finishMatch(page);
  await page.screenshot({ path: evidence('1280/04-result.png'), fullPage: true });
  await expectResultAndWall(page, score);
  await page.screenshot({ path: evidence('1280/05-updated-wall.png'), fullPage: true });
});

test('runtime stays local, has no browser errors, and preserves storage bytes', async ({ page }) => {
  const browserErrors = [];
  const externalRequests = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('request', (request) => { const url = new URL(request.url()); if (url.protocol.startsWith('http') && url.hostname !== '127.0.0.1') externalRequests.push(request.url()); });
  await seedStorage(page);
  await pauseMatch(page);
  await playFailure(page);
  const score = await finishMatch(page);
  await expectResultAndWall(page, score);
  expect(browserErrors).toEqual([]);
  expect(externalRequests).toEqual([]);
  await expectSentinels(page);
});

test('regular V2 navigation excludes the prototype while root and direct routes remain safe', async ({ page }) => {
  await page.goto('/v2');
  await expect(page.locator('.v2-primary-nav')).toBeVisible();
  await expect(page.locator('.v2-primary-nav .v2-nav-link')).toHaveCount(4);
  await expect(page.locator('a[href*="your-world-cup-prototype"]')).toHaveCount(0);
  await page.goto('/v2/your-world-cup-prototype');
  await expect(page.locator('.ywc-prototype')).toBeVisible();
  await page.goto(route);
  await expect(page.locator('[data-screen="opening"]')).toBeVisible();
  await page.goto('/');
  await expect(page.locator('.ywc-prototype')).toHaveCount(0);
  expect(readFileSync(resolve('public/v2/your-world-cup-prototype/index.html'), 'utf8')).toContain('/v2/assets/index-');
  expect(readFileSync(resolve('index.html'), 'utf8')).toContain('src="/src/app.js"');
});
