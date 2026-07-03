// United 2026 — e2e helpers. Deterministic clock and a complete mock world:
// all 72 group finals (built by the same derivation the app uses) so knockout
// identities resolve, plus a live Round-of-32 tie. Zero real network. AST
// equals EDT during the tournament; the frozen instant is 13:05 in Puerto
// Rico on Round-of-32 day three.
import { fullResultsPayload, livePayloadFor, OK } from '../tests/mock-provider.mjs';

export const FROZEN_ISO = '2026-07-01T17:05:00Z';
export const LIVE_FIXTURE = 80;

export async function freezeClock(page, iso = FROZEN_ISO) {
  const fixed = new Date(iso).getTime();
  await page.addInitScript((fixedNow) => {
    const RealDate = Date;
    class FrozenDate extends RealDate {
      constructor(...args) { super(...(args.length ? args : [fixedNow])); }
      static now() { return fixedNow; }
    }
    // eslint-disable-next-line no-global-assign
    Date = FrozenDate;
  }, fixed);
}

export const RESULTS_FULL = fullResultsPayload();
export const LIVE_80 = livePayloadFor(LIVE_FIXTURE, { gh: 1, ga: 0, min: 63 });
export const RESULTS_EMPTY = { ...OK, finished: [], live: [], hold: [], scheduled: [] };
export const OUTAGE = { configured: false, finished: [], live: [], hold: [], scheduled: [], response: [] };

/* Global leaderboard backend mocks — never reached for real in tests. */
export const TEST_USER = { id: 'u-diego-test', email: 'diego@example.com' };

/** Seed a signed-in Supabase session before boot (credentials only). */
export async function seedSession(page, user = TEST_USER) {
  await page.addInitScript((u) => {
    window.localStorage.setItem('u26v2.auth', JSON.stringify({
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: u,
    }));
  }, user);
}

export function boardRow(over = {}) {
  return {
    user_id: 'u-x', display_name: 'Player', avatar: null, points: 0,
    accuracy: null, streak: 0, best_streak: 0, exact: 0, correct: 0, total: 0,
    round_stage: 'r32', round_points: 0, round_correct: 0, round_total: 0,
    rank: 1, joined_at: '2026-06-29T12:00:00Z', ...over,
  };
}

export async function mockProviders(page, {
  results = RESULTS_FULL, live = LIVE_80,
  board = [], me = null, arcade = [], profile = null,
  leaderboardConfigured = true,
} = {}) {
  await page.route('**/_vercel/**', (r) => r.fulfill({ status: 204, body: '' }));
  await page.route('**/api/leaderboard-config*', (r) => r.fulfill({
    json: leaderboardConfigured ? {
      url: 'https://example.supabase.co',
      anonKey: 'test-public-anon-key-for-local-browser-runs',
    } : { url: '', anonKey: '' },
  }));
  // Supabase Auth: OTP send + verify + refresh acknowledge deterministically.
  const session = {
    access_token: 'test-access-token', refresh_token: 'test-refresh-token',
    expires_in: 3600, user: TEST_USER,
  };
  await page.route('**/auth/v1/otp*', (r) => r.fulfill({ json: {} }));
  await page.route('**/auth/v1/verify*', (r) => r.fulfill({ json: session }));
  await page.route('**/auth/v1/token*', (r) => r.fulfill({ json: session }));
  // PostgREST: reads return the provided rows; writes acknowledge, store nothing.
  await page.route('**/rest/v1/leaderboard_v2*', (r) => {
    const mine = r.request().url().includes('user_id=eq.');
    r.fulfill({ json: mine ? (me ? [me] : []) : board });
  });
  await page.route('**/rest/v1/arcade_ladder_v2*', (r) => r.fulfill({ json: arcade }));
  await page.route('**/rest/v1/profiles*', (r) => {
    if (r.request().method() === 'GET') r.fulfill({ json: profile ? [profile] : [] });
    else r.fulfill({ status: 201, body: '' });
  });
  await page.route('**/rest/v1/picks*', (r) => r.fulfill({ status: 201, body: '' }));
  await page.route('**/rest/v1/arcade_scores*', (r) => r.fulfill({ status: 201, body: '' }));
  await page.route('**/api/results*', (r) => r.fulfill({ json: results }));
  await page.route('**/api/live*', (r) => r.fulfill({ json: live }));
  await page.route('**/api/scorers*', (r) => r.fulfill({
    json: {
      configured: true,
      sourceStatus: 'fresh',
      isStale: false,
      fetchedAt: '2026-07-01T17:05:00Z',
      goals: [{ player: 'A Player', team: 'Mexico', n: 4 }, { player: 'B Player', team: 'France', n: 3 }],
      assists: [],
    },
  }));
}

export async function gotoApp(page, opts = {}) {
  await freezeClock(page, opts.iso);
  if (opts.signedIn) await seedSession(page);
  await mockProviders(page, opts);
  await page.goto('/');
  await page.waitForSelector('.dock');
  await page.waitForSelector('.score-stage');
}

export async function tapTab(page, tab) {
  await page.locator(`.dock-tab[data-tab="${tab}"]`).click();
}

export async function openTournamentSection(page, section) {
  await tapTab(page, 'tournament');
  await page.locator(`[data-segmented="tournament-view"] [data-value="${section}"]`).click();
}

export async function openPlayMode(page, mode) {
  await tapTab(page, 'play');
  await page.locator(`[data-segmented="play-mode"] [data-value="${mode}"]`).click();
}

export async function expectNoHorizontalOverflow(page, expect, label) {
  const overflow = await page.evaluate(() => {
    const d = document.documentElement;
    return d.scrollWidth - d.clientWidth;
  });
  expect(overflow, label + ': no horizontal overflow').toBeLessThanOrEqual(1);
}

export async function screenshot(page, testInfo, name) {
  await page.waitForTimeout(250); // let 140ms control transitions settle
  // PW_SHOT_DIR lets sandboxed runs write to a fresh directory when older
  // host-owned artifacts cannot be overwritten.
  const dir = process.env.PW_SHOT_DIR || 'test-results/playwright';
  await page.screenshot({
    path: `${dir}/${testInfo.project.name}-${name}.png`,
    fullPage: true,
  });
}
