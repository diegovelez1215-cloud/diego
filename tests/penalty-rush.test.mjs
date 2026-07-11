// Penalty Rush (Play integration) — the mode is wired to the Penalty Duel
// engine: daily deterministic seeds, the old record contract, and the Arcade
// Cup verdict mapping. Engine mechanics live in tests/penalty-duel.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { cupResultFromRush, dailyGauntletSeed } from '../src/views/play.js';
import {
  DUEL_RULES, createPenaltyDuel, duelKeeper, duelRecordAfter, takeKick,
} from '../src/games/penalty-duel.js';

test('daily seeds are stable per day and distinct per attempt and date', () => {
  assert.equal(dailyGauntletSeed('2026-07-10', 0), dailyGauntletSeed('2026-07-10', 0));
  assert.notEqual(dailyGauntletSeed('2026-07-10', 0), dailyGauntletSeed('2026-07-10', 1));
  assert.notEqual(dailyGauntletSeed('2026-07-10', 0), dailyGauntletSeed('2026-07-11', 0));
});

test('the daily seed produces a playable duel with a scouted keeper', () => {
  const run = createPenaltyDuel(dailyGauntletSeed('2026-07-10', 0));
  assert.equal(run.over, false);
  assert.equal(run.kicks.length, 0);
  assert.ok(duelKeeper(run).name.length > 0, 'the keeper card is ready before the first kick');
  const kick = takeKick(run, { zone: 'bl', atMs: DUEL_RULES.pulseMs * 0.25 });
  assert.ok(kick, 'the duel accepts a first kick');
});

test('a finished duel folds into the record with the exact legacy contract', () => {
  const legacy = { dateKey: '2026-07-09', attemptsToday: 2, bestToday: 4, bestEver: 6, perfects: 1, played: 8, lastScore: 4 };
  const next = duelRecordAfter(legacy, { dateKey: '2026-07-10', score: 5, perfect: true });
  assert.equal(next.bestEver, 6, 'older, higher bests survive the rebuild');
  assert.equal(next.bestToday, 5);
  assert.equal(next.attemptsToday, 1);
  assert.equal(next.perfects, 2);
  assert.equal(next.played, 9);
});

test('the Arcade Cup rush verdict is unchanged by the rebuild', () => {
  assert.equal(cupResultFromRush(4), 'W');
  assert.equal(cupResultFromRush(3), 'D');
  assert.equal(cupResultFromRush(1), 'L');
});
