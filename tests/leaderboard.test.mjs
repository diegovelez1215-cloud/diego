// Global leaderboard logic: honest row mapping, honest movement and
// freshness, idempotent derivation, strict Picks/Arcade separation, and a
// server-only settlement route. No network in any test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  validDisplayName, normalizeBoardRow, normalizeArcadeRow,
  rankMovement, ranksOf, updatedLabel, freshlySynced, boardActivity,
  pickRow, arcadeRow, AVATARS,
} from '../src/core/leaderboard.js';
import { buildOverlay } from '../src/core/provider-overlay.js';
import { gradePredictions, officialPickPoints, arcadeLedger } from '../src/views/play.js';
import settleHandler from '../api/settle.js';
import { OK } from './mock-provider.mjs';

const FINALS = {
  ...OK,
  finished: [
    { home: 'Mexico', away: 'South Africa', gh: 2, ga: 0, winner: 'HOME_TEAM', status: 'FINISHED', utcDate: '2026-06-11T19:00:00Z' },
    { home: 'Korea Republic', away: 'Czechia', gh: 0, ga: 2, winner: 'AWAY_TEAM', status: 'FINISHED', utcDate: '2026-06-11T22:00:00Z' },
  ],
};

test('display names validate without any room/invite scheme', () => {
  assert.ok(validDisplayName('Ana María'));
  assert.ok(validDisplayName('Diego'));
  assert.ok(!validDisplayName('x'));
  assert.ok(!validDisplayName(''));
  assert.ok(!validDisplayName('a'.repeat(25)));
  assert.ok(AVATARS.length >= 8, 'preset avatars exist');
});

test('board rows normalize server view columns to honest client fields', () => {
  const m = normalizeBoardRow({
    user_id: 'u1', display_name: 'Ana', avatar: '🦅', points: 155, accuracy: '80',
    streak: 4, best_streak: 5, exact: 1, correct: 8, total: 10,
    round_stage: 'r32', round_points: 30, round_correct: 2, round_total: 3,
    rank: 7, joined_at: '2026-06-30T12:00:00Z',
  });
  assert.equal(m.userId, 'u1');
  assert.equal(m.name, 'Ana');
  assert.equal(m.points, 155);
  assert.equal(m.accuracy, 80);
  assert.equal(m.streak, 4);
  assert.equal(m.rank, 7);
  assert.equal(m.roundStage, 'r32');
  assert.equal(m.roundPoints, 30);
  const empty = normalizeBoardRow({ user_id: 'u2', display_name: 'New', rank: 12 });
  assert.equal(empty.points, 0);
  assert.equal(empty.accuracy, null, 'no settled picks → no invented accuracy');
});

test('arcade rows normalize separately (game score only)', () => {
  const a = normalizeArcadeRow({ user_id: 'u1', display_name: 'Ana', points: 300, wins: 4, played: 6, streak: 2, rank: 1 });
  assert.equal(a.points, 300);
  assert.equal(a.wins, 4);
  assert.ok(!('accuracy' in a), 'arcade rows carry no official-pick fields');
});

test('rank movement is honest: only genuinely observed previous ranks move arrows', () => {
  const rows = [
    normalizeBoardRow({ user_id: 'a', display_name: 'Ana', points: 120, rank: 1 }),
    normalizeBoardRow({ user_id: 'd', display_name: 'Diego', points: 85, rank: 2 }),
  ];
  const fresh = rankMovement(rows, null);
  assert.ok(fresh.every((m) => m.move === 'new'), 'no memory → NEW, never fabricated arrows');
  const moved = rankMovement(rows, { a: 2, d: 1 });
  assert.equal(moved[0].move, 'up');
  assert.equal(moved[0].delta, 1);
  assert.equal(moved[1].move, 'down');
  assert.deepEqual(ranksOf(rows), { a: 1, d: 2 });
});

test('freshness stamp is an honest timestamp, never a fake live claim', () => {
  const now = Date.parse('2026-07-03T12:00:00Z');
  assert.equal(updatedLabel(null, now), null, 'no fetch → no stamp');
  assert.equal(updatedLabel(now - 5_000, now), 'Updated just now');
  assert.equal(updatedLabel(now - 5 * 60_000, now), 'Updated 5m ago');
  assert.equal(updatedLabel(now - 2 * 3_600_000, now), 'Updated 2h ago');
  assert.ok(freshlySynced(now - 10_000, now));
  assert.ok(!freshlySynced(now - 120_000, now), 'stale sync cannot badge as fresh');
  assert.ok(!freshlySynced(null, now));
});

test('activity is built only from real facts (joins + real events), sorted, capped', () => {
  const rows = [
    normalizeBoardRow({ user_id: 'a', display_name: 'Ana', rank: 1, joined_at: '2026-06-30T12:00:00Z' }),
    normalizeBoardRow({ user_id: 'b', display_name: 'Bo', rank: 2, joined_at: null }),
  ];
  const acts = boardActivity(rows, [{ at: '2026-07-01T10:00:00Z', text: 'You confirmed a call' }]);
  assert.equal(acts.length, 2, 'no joined_at → no invented join entry');
  assert.equal(acts[0].text, 'You confirmed a call', 'newest first');
  assert.ok(acts.every((a) => a.t), 'every entry carries its real timestamp');
});

test('pick and arcade rows map to own-user rows only', () => {
  const p = pickRow('u1', '7', { side: 'home', conf: 3, gh: 2, ga: 0 });
  assert.deepEqual(p, { user_id: 'u1', fixture_id: 7, side: 'home', gh: 2, ga: 0, conf: 3 });
  const a = arcadeRow('u1', { points: 112.4, wins: 3, played: 5, streak: 2 });
  assert.equal(a.points, 112);
  assert.equal(a.user_id, 'u1');
});

test('point derivation is idempotent: same official truth → same points, every time', () => {
  const overlay = buildOverlay({ results: FINALS });
  const play = { predictions: { picks: {
    1: { side: 'home', conf: 3, gh: 2, ga: 0 }, // right + exact
    2: { side: 'home', conf: 2 },               // wrong
  } } };
  const a = officialPickPoints(play, overlay);
  assert.equal(a, officialPickPoints(play, overlay));
  assert.equal(a, officialPickPoints(play, overlay));
  assert.equal(a, 30 + 20 + 15, 'insight 30 + best-streak 20 + exact 15');
});

test('exact scorelines only count when official goals are known and match', () => {
  const overlay = buildOverlay({ results: FINALS });
  const s = gradePredictions({
    1: { side: 'home', conf: 1, gh: 2, ga: 0 },
    2: { side: 'away', conf: 1, gh: 9, ga: 9 },
  }, overlay);
  assert.equal(s.exact, 1);
  assert.equal(s.right, 2);
});

test('STRICT SEPARATION: the Arcade Ladder never contains official pick points', () => {
  const overlay = buildOverlay({ results: FINALS });
  const play = {
    predictions: { picks: { 1: { side: 'home', conf: 3 } } }, // settled official call
    labHistory: [{ cp: 50, win: true, gh: 2, ga: 0 }],
  };
  const ledger = arcadeLedger(play, overlay, { saved: [{}] });
  assert.equal(ledger.points, 50 + 40, 'lab + saved runs only');
  assert.ok(officialPickPoints(play, overlay) > 0, 'official points exist…');
  assert.ok(!('predCp' in ledger), '…but never inside the arcade ledger');
  const arcade = arcadeRow('u1', ledger);
  assert.ok(!('accuracy' in arcade) && !('conf' in arcade) && !('side' in arcade),
    'arcade sync rows carry zero official-pick data');
});

test('leaderboard client is a pure scoreboard client: no truth imports, credentials-only storage', async () => {
  const src = await readFile(new URL('../src/core/leaderboard.js', import.meta.url), 'utf8');
  assert.ok(!/canonical-truth|provider-overlay|app-state|persistence\.js/.test(src),
    'no truth imports, no state imports');
  const writes = src.match(/setItem\(/g) || [];
  assert.equal(writes.length, 1, 'exactly one storage write: the auth session');
  assert.ok(/AUTH_KEY, JSON\.stringify\({\s*access_token/.test(src),
    'the only persisted object is session credentials');
  assert.ok(!/rooms?Code|invite/i.test(src), 'no private rooms or invite codes');
});

test('no schema field smuggles official truth into storage from the session write', async () => {
  const src = await readFile(new URL('../src/core/leaderboard.js', import.meta.url), 'utf8');
  const saveBlock = src.slice(src.indexOf('function saveSession'), src.indexOf('export function signOut'));
  for (const banned of ['fixtures', 'standings', 'results', 'overlay', 'points']) {
    assert.ok(!saveBlock.includes(banned), `session storage never contains ${banned}`);
  }
});

/* ---------------- server settlement route (no network reached) ------------ */

async function callSettle(headers = {}, envPatch = {}) {
  const previous = {};
  for (const [k, v] of Object.entries(envPatch)) {
    previous[k] = process.env[k];
    if (v == null) delete process.env[k];
    else process.env[k] = v;
  }
  let statusCode = 200; let body = null;
  const res = {
    setHeader() {},
    status(n) { statusCode = n; return this; },
    json(x) { body = x; return this; },
  };
  try {
    await settleHandler({ headers, socket: { remoteAddress: '127.0.0.1' } }, res);
    return { statusCode, body };
  } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v == null) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('settlement route refuses to run without a configured secret', async () => {
  const r = await callSettle({}, { CRON_SECRET: null, SETTLE_SECRET: null });
  assert.equal(r.statusCode, 503);
  assert.equal(r.body.configured, false);
});

test('settlement route rejects wrong or missing bearer tokens', async () => {
  const env = { CRON_SECRET: 'right-secret', SETTLE_SECRET: null };
  assert.equal((await callSettle({}, env)).statusCode, 401);
  assert.equal((await callSettle({ authorization: 'Bearer wrong' }, env)).statusCode, 401);
});

test('settlement route demands server-side Supabase credentials before fetching anything', async () => {
  const r = await callSettle({ authorization: 'Bearer s' }, {
    CRON_SECRET: 's',
    FOOTBALL_DATA_KEY: null,
    SUPABASE_URL: null,
    SUPABASE_SERVICE_ROLE_KEY: null,
  });
  assert.equal(r.statusCode, 503);
  assert.deepEqual(r.body.missing, ['FOOTBALL_DATA_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
});

test('settlement validates finals through the SAME canonical pipeline the app trusts', async () => {
  const src = await readFile(new URL('../api/settle.js', import.meta.url), 'utf8');
  assert.ok(src.includes("from '../src/core/provider-overlay.js'"), 'imports the shared validated pipeline');
  assert.ok(src.includes('on_conflict=fixture_id'), 'settlement upserts idempotently by fixture');
  assert.ok(/merge-duplicates/.test(src), 'duplicate settlement merges, never duplicates');
});
