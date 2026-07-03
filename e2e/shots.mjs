// Ad-hoc screenshot harness for design review (not a test). Reuses the e2e
// mock world plus a richer knockout snapshot so completed/live/upcoming Road
// states are all inspectable. Usage: ONLY=390 node e2e/shots.mjs [outDir]
import { webkit, chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fullGroupFinished, mockSlots, livePayloadFor, OK } from '../tests/mock-provider.mjs';
import { FIXTURES, RATINGS } from '../src/data/fixtures.js';
import { teamName, computeStandings, resolveSlots } from '../src/core/canonical-truth.js';

const PORT = 4199;
const out = process.argv[2] || 'test-results/shots';
mkdirSync(out, { recursive: true });

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

const FROZEN = new Date('2026-07-01T17:05:00Z').getTime();

// Finished R32 ties (played days + one settled today) resolved iteratively so
// venue/road/home screens show real completed knockout states.
function koFinished(ids) {
  const finals = new Map();
  for (const f of FIXTURES.filter((x) => x.stage === 'group')) {
    const rh = RATINGS[f.home] || 70; const ra = RATINGS[f.away] || 70;
    finals.set(f.id, rh === ra ? { gh: 1, ga: 1 } : rh > ra ? { gh: 2, ga: 0 } : { gh: 0, ga: 2 });
  }
  const out = [];
  const ko = new Map();
  for (const id of ids) {
    const slots = resolveSlots(computeStandings(finals), ko);
    const s = slots.get(id);
    const fx = FIXTURES.find((f) => f.id === id);
    if (!s || !s.home || !s.away) continue;
    const rh = RATINGS[s.home] || 70; const ra = RATINGS[s.away] || 70;
    const homeWins = rh >= ra;
    const r = { gh: homeWins ? 2 : 1, ga: homeWins ? 1 : 3, winner: homeWins ? 'home' : 'away' };
    ko.set(id, r);
    out.push({
      providerId: 95000 + id,
      home: teamName(s.home), away: teamName(s.away),
      gh: r.gh, ga: r.ga, winner: homeWins ? 'HOME_TEAM' : 'AWAY_TEAM',
      status: 'FINISHED', stage: 'LAST_32', utcDate: fx.kickoff,
    });
  }
  return out;
}

const RESULTS = {
  ...OK,
  finished: [...fullGroupFinished(), ...koFinished([73, 74, 75, 76, 77, 78, 79, 82])],
  live: [], hold: [], scheduled: [],
};
const LIVE = livePayloadFor(80, { gh: 1, ga: 0, min: 63 });

// WebKit is the iPhone-fidelity default; PW_BROWSER=chromium exists only for
// sandboxes where WebKit host libraries are unavailable (same policy as e2e).
const browser = process.env.PW_BROWSER === 'chromium'
  ? await chromium.launch({ args: process.env.PW_NO_SANDBOX ? ['--no-sandbox'] : [] })
  : await webkit.launch();

async function shootAll(width, height, tag) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  await page.addInitScript((fixedNow) => {
    const RealDate = Date;
    class FrozenDate extends RealDate {
      constructor(...args) { super(...(args.length ? args : [fixedNow])); }
      static now() { return fixedNow; }
    }
    // eslint-disable-next-line no-global-assign
    Date = FrozenDate;
  }, FROZEN);
  await page.route('**/_vercel/**', (r) => r.fulfill({ status: 204, body: '' }));
  // Global leaderboard backend mock (design-review world, same shape as e2e).
  // Signed-in session is seeded so the boards render; rows are the mock data
  // a real Supabase view would return.
  const ME = { id: 'u-diego-test', email: 'diego@example.com' };
  await page.addInitScript((u) => {
    window.localStorage.setItem('u26v2.auth', JSON.stringify({
      access_token: 'test-access-token', refresh_token: 'test-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600, user: u,
    }));
  }, ME);
  const row = (o) => ({
    user_id: 'u-x', display_name: 'Player', avatar: null, points: 0, accuracy: null,
    streak: 0, best_streak: 0, exact: 0, correct: 0, total: 0,
    round_stage: 'r32', round_points: 0, round_correct: 0, round_total: 0,
    rank: 1, joined_at: '2026-06-29T12:00:00Z', ...o,
  });
  const BOARD = [
    row({ user_id: 'u-ana', display_name: 'Ana', avatar: '🦅', points: 155, accuracy: 80, streak: 4, best_streak: 5, exact: 1, correct: 8, total: 10, round_points: 40, rank: 1, joined_at: '2026-06-30T12:00:00Z' }),
    row({ user_id: 'u-luca', display_name: 'Luca', avatar: '🐺', points: 120, accuracy: 71, streak: 1, correct: 7, total: 10, round_points: 20, rank: 2 }),
    row({ user_id: 'u-mei', display_name: 'Mei', avatar: '⚡', points: 95, accuracy: 64, streak: 3, correct: 6, total: 9, round_points: 30, rank: 3 }),
    row({ user_id: 'u-max', display_name: 'Maximiliano Fernández', points: 60, accuracy: 50, correct: 4, total: 8, rank: 4 }),
    row({ user_id: 'u-omar', display_name: 'Omar', avatar: '🔥', points: 45, accuracy: 44, correct: 3, total: 7, rank: 5 }),
  ];
  const MY_ROW = row({ user_id: ME.id, display_name: 'Diego', avatar: '🎯', points: 12, accuracy: 33, correct: 1, total: 3, rank: 57, joined_at: '2026-07-01T09:00:00Z' });
  const ARCADE = [
    row({ user_id: 'u-ana', display_name: 'Ana', avatar: '🦅', points: 900, wins: 12, played: 15, streak: 4, rank: 1 }),
    row({ user_id: ME.id, display_name: 'Diego', avatar: '🎯', points: 300, wins: 4, played: 7, streak: 1, rank: 2 }),
    row({ user_id: 'u-mei', display_name: 'Mei', avatar: '⚡', points: 180, wins: 3, played: 6, streak: 0, rank: 3 }),
  ];
  await page.route('**/auth/v1/**', (r) => r.fulfill({
    json: { access_token: 'test-access-token', refresh_token: 'test-refresh-token', expires_in: 3600, user: ME },
  }));
  await page.route('**/rest/v1/leaderboard_v2*', (r) => {
    const mine = r.request().url().includes('user_id=eq.');
    r.fulfill({ json: mine ? [MY_ROW] : BOARD });
  });
  await page.route('**/rest/v1/arcade_ladder_v2*', (r) => r.fulfill({ json: ARCADE }));
  await page.route('**/rest/v1/profiles*', (r) => {
    if (r.request().method() === 'GET') r.fulfill({ json: [{ id: ME.id, display_name: 'Diego', avatar: '🎯' }] });
    else r.fulfill({ status: 201, body: '' });
  });
  await page.route('**/rest/v1/picks*', (r) => r.fulfill({ status: 201, body: '' }));
  await page.route('**/rest/v1/arcade_scores*', (r) => r.fulfill({ status: 201, body: '' }));
  await page.route('**/api/results*', (r) => r.fulfill({ json: RESULTS }));
  await page.route('**/api/live*', (r) => r.fulfill({ json: LIVE }));
  await page.route('**/api/scorers*', (r) => r.fulfill({
    json: {
      configured: true, sourceStatus: 'fresh', isStale: false, fetchedAt: '2026-07-01T17:05:00Z',
      goals: [
        { player: 'Santiago Giménez', team: 'Mexico', n: 5 }, { player: 'Kylian Mbappé', team: 'France', n: 4 },
        { player: 'Harry Kane', team: 'England', n: 4 }, { player: 'Lautaro Martínez', team: 'Argentina', n: 3 },
      ],
      assists: [{ player: 'Jude Bellingham', team: 'England', n: 3 }, { player: 'Lionel Messi', team: 'Argentina', n: 3 }],
    },
  }));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForSelector('.dock');
  await page.waitForTimeout(700);

  const snap = async (name, full = true) => {
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${out}/${tag}-${name}.png`, fullPage: full });
  };
  const tab = (id) => page.locator(`.dock-tab[data-tab="${id}"]`).click();
  const seg = (id, v) => page.locator(`[data-segmented="${id}"] [data-value="${v}"]`).click();

  await snap('worldcup');
  await page.screenshot({ path: `${out}/${tag}-worldcup-fold.png` });

  await tab('tournament');
  await snap('matches');
  await seg('tournament-view', 'groups'); await snap('groups');
  await seg('tournament-view', 'knockout'); await snap('road');
  await seg('bracket-mode', 'follow'); await snap('follow');
  await seg('tournament-view', 'venues'); await snap('venues');
  await seg('tournament-view', 'stats'); await snap('stats');

  await tab('play');
  await snap('play-lobby');
  // quick kick from the lobby → running sim → decisions → reveal
  await page.locator('#lobby-kick').click();
  await page.waitForTimeout(1500);
  await snap('lab-running', false);
  for (let i = 0; i < 40; i++) {
    const opt = page.locator('[data-decide]').first();
    if (await opt.count()) await opt.click();
    if (await page.locator('.lab-payoff').count()) break;
    await page.waitForTimeout(400);
  }
  await snap('lab-reveal');
  await seg('play-mode', 'myworldcup'); await snap('myworldcup');
  await seg('play-mode', 'prediction');
  // open the ritual on the first fixture so the draft step is inspectable
  const firstSide = await page.waitForSelector('.pr-fixture [data-prside="home"]', { timeout: 4000 }).catch(() => null);
  if (firstSide) { await firstSide.click(); await page.waitForTimeout(300); }
  await snap('prediction');
  await seg('play-mode', 'lobby'); await snap('lobby-after-play');

  await tab('you');
  await snap('you');
  await seg('you-view', 'board');
  await page.waitForSelector('.lg-rows', { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(400);
  await snap('picks-leaderboard');
  await seg('board-tab', 'arcade');
  await page.waitForTimeout(400);
  await snap('arcade-ladder');
  await ctx.close();
}

try {
  if (!process.env.ONLY || process.env.ONLY === '390') await shootAll(390, 844, '390');
  if (!process.env.ONLY || process.env.ONLY === '430') await shootAll(430, 932, '430');
} finally {
  await browser.close();
  server.kill();
}
console.log('done ->', out);
