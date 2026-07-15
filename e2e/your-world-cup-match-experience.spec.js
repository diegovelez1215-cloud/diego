import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const evidenceRoot = process.env.YWC_EVIDENCE_DIR || '/Users/diegovelez/Documents/Codex/2026-07-15/read-all-three-attached-files-completely-2/outputs/match-experience-evidence';
const evidence = (path) => { const target = resolve(evidenceRoot, path); mkdirSync(dirname(target), { recursive: true }); return target; };
const route = '/v2/your-world-cup-prototype/';
const seed = 26062026;
const defaultTactics = { shape: '4-3-3-wide', press: 'balanced', finalThird: 'wings' };
const sentinels = Object.freeze({
  'u26v2.predictions.local': '{"sentinel":"prediction-bytes-v2"}',
  'u26v2.auth': '{"sentinel":"auth-bytes-v2"}',
  'u26v2.play': '{"sentinel":"v1-play-bytes-v2"}',
});

function campaign({ tick = 0, phase = 'first-half', moment = { tick: 0, events: [] }, momentOutcome = null, tactics = defaultTactics } = {}) {
  return {
    version: 2,
    campaignId: 'argentina-group-c-001',
    seed,
    nation: 'Argentina',
    group: ['Argentina', 'Nigeria', 'Poland', 'New Zealand'],
    stage: 'match',
    tactics,
    match: { tick, speed: 1, phase, moment, momentOutcome },
    completedMatches: [],
  };
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

async function skipToTick(page, target) {
  while (Number(await page.locator('[data-screen="match"]').getAttribute('data-tick')) < target) {
    await page.getByRole('button', { name: /skip quiet phase/i }).click();
    await page.waitForTimeout(90);
  }
}

const hash = (value) => [...value].reduce((total, character) => ((total * 33) + character.charCodeAt(0)) >>> 0, 5381);
function goalZone(tick = 2) {
  const zones = ['left', 'center', 'right'];
  const keeper = zones[hash(`${seed}:keeper`) % 3];
  return zones.filter((zone) => zone !== keeper).sort((a, b) => (hash(`${seed}:4-3-3-wide:wings:${tick}:${b}`) % 13) - (hash(`${seed}:4-3-3-wide:wings:${tick}:${a}`) % 13))[0];
}

async function playSuccess(page, pause = 120) {
  await page.getByRole('button', { name: /skip to the moment/i }).click();
  await expect(page.locator('[data-phase="pivotal"]')).toBeVisible();
  await page.getByRole('button', { name: /Luna, open for a pass/i }).click();
  await page.waitForTimeout(300 + pause);
  await page.getByRole('button', { name: /Ferreyra, open for a pass/i }).click();
  await page.waitForTimeout(300 + pause);
  await page.getByRole('button', { name: `Shoot ${goalZone()} goal zone` }).click();
  await expect(page.locator('.ywc-match-freeze.is-goal')).toBeVisible();
}

async function finishClosingPhase(page) {
  await expect(page.locator('[data-phase="closing"]')).toBeVisible({ timeout: 4_000 });
  await page.getByRole('button', { name: '4×', exact: true }).click();
  await expect(page.locator('[data-phase="full-time"]')).toBeVisible({ timeout: 8_000 });
}

async function expectViewportSafe(page, width) {
  const geometry = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, internallyScrolled: [...document.querySelectorAll('*')].filter((element) => element.scrollLeft !== 0).map((element) => ({ className: element.className, scrollLeft: element.scrollLeft })), targets: [...document.querySelectorAll('button:not([disabled])')].map((element) => { const box = element.getBoundingClientRect(); return { label: element.getAttribute('aria-label') || element.textContent?.trim(), width: box.width, height: box.height, left: box.left, right: box.right }; }) }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.client);
  expect(geometry.internallyScrolled).toEqual([]);
  for (const target of geometry.targets) {
    expect(target.height, `${target.label} target height`).toBeGreaterThanOrEqual(47.5);
    expect(target.left, `${target.label} left edge`).toBeGreaterThanOrEqual(-.5);
    expect(target.right, `${target.label} right edge`).toBeLessThanOrEqual(width + .5);
  }
}

test('390px captures the complete visible successful flow and required states', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterFreshCampaign(page);
  await page.screenshot({ path: evidence('screenshots/390/01-tactics-clipboard.png'), fullPage: true });
  await page.getByRole('button', { name: /^kick off/i }).click();
  await expect(page.locator('[data-screen="match"]')).toBeVisible();
  await page.screenshot({ path: evidence('screenshots/390/02-kickoff.png') });
  await page.getByRole('button', { name: /skip quiet phase/i }).click();
  await page.screenshot({ path: evidence('screenshots/390/03-open-play.png') });
  await page.getByRole('button', { name: /skip quiet phase/i }).click();
  await page.screenshot({ path: evidence('screenshots/390/04-defensive-turnover.png') });
  await skipToTick(page, 17);
  await page.screenshot({ path: evidence('screenshots/390/05-attacking-buildup.png') });
  await page.getByRole('button', { name: /skip quiet phase/i }).click();
  await page.screenshot({ path: evidence('screenshots/390/06-shot-save.png') });
  await skipToTick(page, 45);
  await expect(page.locator('[data-phase="halftime"]')).toBeVisible();
  await page.screenshot({ path: evidence('screenshots/390/07-halftime.png') });
  await page.getByRole('button', { name: /resume second half/i }).click();
  await page.getByRole('button', { name: /skip to the moment/i }).click();
  await expectViewportSafe(page, 390);
  await page.screenshot({ path: evidence('screenshots/390/08-pivotal-entry.png') });
  await page.getByRole('button', { name: /Luna, open for a pass/i }).click();
  await page.waitForTimeout(320);
  await page.screenshot({ path: evidence('screenshots/390/09-mid-moment-pass.png') });
  await page.getByRole('button', { name: /Ferreyra, open for a pass/i }).click();
  await page.waitForTimeout(320);
  await page.getByRole('button', { name: `Shoot ${goalZone()} goal zone` }).click();
  await expect(page.locator('.ywc-match-freeze.is-goal')).toBeVisible();
  await expectViewportSafe(page, 390);
  await page.screenshot({ path: evidence('screenshots/390/10-goal-feedback.png') });
  await expect(page.locator('[data-phase="closing"]')).toBeVisible({ timeout: 4_000 });
  await page.screenshot({ path: evidence('screenshots/390/11-resumed-match.png') });
  await page.getByRole('button', { name: '4×', exact: true }).click();
  await expect(page.locator('[data-phase="full-time"]')).toBeVisible({ timeout: 8_000 });
  await page.screenshot({ path: evidence('screenshots/390/12-full-time.png') });
  await expect(page.locator('[data-screen="result"]')).toBeVisible({ timeout: 4_000 });
  await page.screenshot({ path: evidence('screenshots/390/13-victory-newspaper.png'), fullPage: true });
  await page.getByRole('button', { name: /keep the paper/i }).click();
  await page.screenshot({ path: evidence('screenshots/390/14-updated-campaign-wall.png'), fullPage: true });
  await expectSentinels(page);
  await expectViewportSafe(page, 390);
});

test('390px failure is readable, persists, and produces the negative poster', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedStorage(page, campaign({ tick: 68, phase: 'pivotal', tactics: { ...defaultTactics, finalThird: 'direct-runners' } }));
  await page.getByRole('button', { name: /Ferreyra, lane closing/i }).click();
  await expect(page.locator('.ywc-match-freeze.is-interception')).toBeVisible();
  await page.screenshot({ path: evidence('screenshots/390/15-failure-feedback.png') });
  await finishClosingPhase(page);
  await expect(page.locator('[data-screen="result"]')).toBeVisible({ timeout: 4_000 });
  await page.screenshot({ path: evidence('screenshots/390/16-negative-poster.png'), fullPage: true });
  await expectSentinels(page);
});

for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 768, height: 900 }, { width: 1280, height: 900 }, { width: 1440, height: 1000 }]) {
  test(`${viewport.width}px match geometry, controls, and overflow`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seedStorage(page);
    await expect(page.locator('[data-screen="match"]')).toBeVisible();
    await expect(page.locator('.ywc-match-player')).toHaveCount(22);
    await expect(page.locator('.ywc-match-ball')).toBeVisible();
    await expectViewportSafe(page, viewport.width);
    if (viewport.width === 1280 || viewport.width === 1440) await page.screenshot({ path: evidence(`screenshots/${viewport.width}/active-match.png`) });
  });
}

test('reload restores first half, pivotal actions, and completed result without touching sentinels', async ({ page }) => {
  await seedStorage(page);
  await page.getByRole('button', { name: /skip quiet phase/i }).click();
  const firstTick = await page.locator('[data-screen="match"]').getAttribute('data-tick');
  await page.reload();
  await expect(page.locator('[data-screen="match"]')).toHaveAttribute('data-tick', firstTick);
  await page.getByRole('button', { name: /skip to the moment/i }).click();
  await page.getByRole('button', { name: /Luna, open for a pass/i }).click();
  await page.waitForTimeout(320);
  await page.reload();
  await expect(page.locator('[data-phase="pivotal"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /Luna, open for a pass/i })).toBeDisabled();
  await page.getByRole('button', { name: /Ferreyra, open for a pass/i }).click();
  await page.waitForTimeout(320);
  await page.getByRole('button', { name: `Shoot ${goalZone()} goal zone` }).click();
  await finishClosingPhase(page);
  await expect(page.locator('[data-screen="result"]')).toBeVisible({ timeout: 4_000 });
  await page.reload();
  await expect(page.locator('[data-screen="result"]')).toBeVisible();
  await expectSentinels(page);
});

test('keyboard flow, speed controls, reduced motion, and direct static route remain complete', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedStorage(page, campaign({ tick: 68, phase: 'pivotal' }));
  await expect(page.locator('[data-reduced-motion="true"]')).toBeVisible();
  await page.keyboard.press('1');
  await page.waitForTimeout(100);
  await page.keyboard.press('4');
  await page.waitForTimeout(100);
  await page.keyboard.press(goalZone() === 'left' ? 'q' : goalZone() === 'right' ? 'e' : 'w');
  await expect(page.locator('.ywc-match-freeze.is-goal')).toBeVisible();
  await page.screenshot({ path: evidence('screenshots/390/reduced-motion-pivotal.png') });
  const animations = await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length);
  expect(animations).toBe(0);
  await expectSentinels(page);
  expect(readFileSync(resolve('public/v2/your-world-cup-prototype/index.html'), 'utf8')).toContain('/v2/assets/index-');
  expect(readFileSync(resolve('index.html'), 'utf8')).toContain('src="/src/app.js"');
});

test('existing V2 navigation and V1 remain isolated', async ({ page }) => {
  await page.goto('/v2/');
  await expect(page.locator('.v2-primary-nav .v2-nav-link')).toHaveCount(4);
  await expect(page.locator('a[href*="your-world-cup-prototype"]')).toHaveCount(0);
  await page.goto('/');
  await expect(page.locator('.ywc-prototype')).toHaveCount(0);
});

test('the complete runtime stays local and emits no browser errors', async ({ page }) => {
  const browserErrors = [];
  const externalRequests = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.hostname !== '127.0.0.1') externalRequests.push(request.url());
  });
  await seedStorage(page, campaign({ tick: 68, phase: 'pivotal' }));
  await page.getByRole('button', { name: /Ferreyra, lane closing/i }).click();
  await finishClosingPhase(page);
  await expect(page.locator('[data-screen="result"]')).toBeVisible({ timeout: 4_000 });
  expect(browserErrors).toEqual([]);
  expect(externalRequests).toEqual([]);
});

for (const viewport of [{ width: 1280, height: 900 }, { width: 1440, height: 1000 }]) {
  test(`${viewport.width}px captures desktop match, halftime, moment, full time, and wall`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seedStorage(page);
    await page.screenshot({ path: evidence(`screenshots/${viewport.width}/kickoff.png`) });
    await page.getByRole('button', { name: /skip quiet phase/i }).click();
    await page.screenshot({ path: evidence(`screenshots/${viewport.width}/open-play.png`) });
    await skipToTick(page, 45);
    await page.screenshot({ path: evidence(`screenshots/${viewport.width}/halftime.png`) });
    await page.getByRole('button', { name: /resume second half/i }).click();
    await playSuccess(page);
    await page.screenshot({ path: evidence(`screenshots/${viewport.width}/pivotal-moment.png`) });
    await finishClosingPhase(page);
    await page.screenshot({ path: evidence(`screenshots/${viewport.width}/full-time.png`) });
    await expect(page.locator('[data-screen="result"]')).toBeVisible({ timeout: 4_000 });
    await page.getByRole('button', { name: /keep the paper/i }).click();
    await page.screenshot({ path: evidence(`screenshots/${viewport.width}/updated-campaign-wall.png`), fullPage: true });
  });
}

test('records the complete 390px successful and failure flows', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-390', 'Record one canonical mobile set.');
  for (const outcome of ['success', 'failure']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: evidence('videos/raw'), size: { width: 390, height: 844 } }, serviceWorkers: 'block', reducedMotion: 'no-preference' });
    const page = await context.newPage();
    await seedStorage(page);
    await page.waitForTimeout(500);
    await skipToTick(page, 9); await page.waitForTimeout(500);
    await skipToTick(page, 25); await page.waitForTimeout(500);
    await skipToTick(page, 45); await page.waitForTimeout(650);
    await page.getByRole('button', { name: /resume second half/i }).click();
    await page.waitForTimeout(500);
    if (outcome === 'success') await playSuccess(page, 260);
    else {
      await page.getByRole('button', { name: /skip to the moment/i }).click();
      await page.getByRole('button', { name: /Ferreyra, lane closing/i }).click();
    }
    await page.waitForTimeout(1250);
    await finishClosingPhase(page);
    await expect(page.locator('[data-screen="result"]')).toBeVisible({ timeout: 4_000 });
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: outcome === 'success' ? /keep the paper/i : /pin it up/i }).click();
    await page.waitForTimeout(700);
    const video = page.video();
    await context.close();
    await video?.saveAs(evidence(`videos/390-${outcome}-complete.webm`));
  }
});

test('records desktop kickoff to halftime and reduced-motion pivotal moment', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-390', 'Record one canonical evidence set.');
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: evidence('videos/raw'), size: { width: 1280, height: 900 } }, serviceWorkers: 'block' });
  const desktopPage = await desktop.newPage();
  await seedStorage(desktopPage);
  await desktopPage.getByRole('button', { name: '4×', exact: true }).click();
  await expect(desktopPage.locator('[data-phase="halftime"]')).toBeVisible({ timeout: 15_000 });
  await desktopPage.waitForTimeout(900);
  const desktopVideo = desktopPage.video(); await desktop.close(); await desktopVideo?.saveAs(evidence('videos/1280-kickoff-to-halftime.webm'));

  const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: evidence('videos/raw'), size: { width: 390, height: 844 } }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const reducedPage = await reduced.newPage();
  await seedStorage(reducedPage, campaign({ tick: 68, phase: 'pivotal' }));
  await reducedPage.waitForTimeout(400); await reducedPage.keyboard.press('1'); await reducedPage.waitForTimeout(180); await reducedPage.keyboard.press('4'); await reducedPage.waitForTimeout(180); await reducedPage.keyboard.press(goalZone() === 'right' ? 'e' : 'q'); await reducedPage.waitForTimeout(700);
  const reducedVideo = reducedPage.video(); await reduced.close(); await reducedVideo?.saveAs(evidence('videos/390-reduced-motion-pivotal.webm'));
});
