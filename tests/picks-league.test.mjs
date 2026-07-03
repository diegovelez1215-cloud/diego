// Picks League logic: pure mapping, honest movement, idempotent settlement,
// and strict separation from the Arcade Ladder. No network in any test.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  memberRow, fromRow, dedupeStandings, rankMovement, ranksOf,
  postedName, displayName, roomOf, validMemberName, validRoomCode, makeRoomCode,
} from '../src/core/picks-league.js';
import { buildOverlay } from '../src/core/provider-overlay.js';
import { gradePredictions, leaguePickPoints, arcadeLedger } from '../src/views/play.js';
import { OK } from './mock-provider.mjs';

const FINALS = {
  ...OK,
  finished: [
    { home: 'Mexico', away: 'South Africa', gh: 2, ga: 0, winner: 'HOME_TEAM', status: 'FINISHED', utcDate: '2026-06-11T19:00:00Z' },
    { home: 'Korea Republic', away: 'Czechia', gh: 0, ga: 2, winner: 'AWAY_TEAM', status: 'FINISHED', utcDate: '2026-06-11T22:00:00Z' },
  ],
};

test('room names: CODE|Name round-trips and validates', () => {
  assert.equal(postedName('Diego', 'QK7M2'), 'QK7M2|Diego');
  assert.equal(displayName('QK7M2|Diego'), 'Diego');
  assert.equal(roomOf('QK7M2|Diego'), 'QK7M2');
  assert.equal(roomOf('Diego'), null);
  assert.ok(validMemberName('Ana María'));
  assert.ok(!validMemberName('x'));
  assert.ok(!validMemberName('a|b'));
  assert.ok(validRoomCode(makeRoomCode(() => 0.5)));
  assert.ok(!validRoomCode('ab'));
});

test('rows map legacy columns to honest meanings, both directions', () => {
  const row = memberRow({ name: 'Diego', code: 'QK7M2', points: 85, accuracy: 67, champion: 'France' });
  assert.deepEqual(row, { name: 'QK7M2|Diego', bankroll: 85, roi: 67, champ: 'France' });
  const m = fromRow({ ...row, created_at: '2026-07-01T00:00:00Z' });
  assert.equal(m.name, 'Diego');
  assert.equal(m.room, 'QK7M2');
  assert.equal(m.points, 85);
  assert.equal(m.accuracy, 67);
  assert.equal(m.champion, 'France');
});

test('standings dedupe to one row per member, newest wins, sorted by points', () => {
  const rows = [
    { name: 'QK7M2|Diego', bankroll: 40, roi: 50, created_at: '2026-06-20T00:00:00Z' },
    { name: 'QK7M2|Diego', bankroll: 85, roi: 67, created_at: '2026-07-01T00:00:00Z' },
    { name: 'QK7M2|Ana', bankroll: 120, roi: 80, created_at: '2026-07-01T00:00:00Z' },
  ];
  const s = dedupeStandings(rows);
  assert.equal(s.length, 2);
  assert.equal(s[0].name, 'Ana');
  assert.equal(s[1].points, 85, 'newest Diego row wins');
});

test('rank movement is honest: only genuinely observed previous ranks move arrows', () => {
  const s = dedupeStandings([
    { name: 'Ana', bankroll: 120, created_at: '2026-07-01T00:00:00Z' },
    { name: 'Diego', bankroll: 85, created_at: '2026-07-01T00:00:00Z' },
  ]);
  const fresh = rankMovement(s, null);
  assert.ok(fresh.every((m) => m.move === 'new'), 'no memory → NEW, never fabricated arrows');
  const moved = rankMovement(s, { ana: 2, diego: 1 });
  assert.equal(moved[0].move, 'up');
  assert.equal(moved[1].move, 'down');
  assert.deepEqual(ranksOf(s), { ana: 1, diego: 2 });
});

test('league settlement is idempotent: same official truth → same points, every time', () => {
  const overlay = buildOverlay({ results: FINALS });
  const play = { predictions: { picks: {
    1: { side: 'home', conf: 3, gh: 2, ga: 0 }, // right + exact
    2: { side: 'home', conf: 2 },               // wrong
  } } };
  const a = leaguePickPoints(play, overlay);
  const b = leaguePickPoints(play, overlay);
  const c = leaguePickPoints(play, overlay);
  assert.equal(a, b);
  assert.equal(b, c);
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
  assert.ok(leaguePickPoints(play, overlay) > 0, 'league points exist…');
  assert.ok(!('predCp' in ledger), '…but never inside the arcade ledger');
});

test('league client never reaches for real-tournament truth modules', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/core/picks-league.js', import.meta.url), 'utf8');
  assert.ok(!/canonical-truth|provider-overlay|app-state|persistence/.test(src),
    'picks-league.js is a pure scoreboard client — no truth imports, no storage imports');
  assert.ok(!/localStorage/.test(src), 'league data is never persisted locally');
});
