// Provider refresh policy: fast only while live, slow when idle, scorer data
// on a longer clock, and visibility returns refresh only when due.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LIVE_POLL_MS, IDLE_POLL_MS, SCORER_TTL_MS,
  pollDelay, snapshotDue, scorersDue,
} from '../src/core/refresh-policy.js';

test('poll cadence: live matches poll fast, quiet tournament polls slow', () => {
  assert.equal(pollDelay(true), LIVE_POLL_MS);
  assert.equal(pollDelay(false), IDLE_POLL_MS);
  assert.ok(LIVE_POLL_MS < IDLE_POLL_MS, 'live cadence is strictly faster');
});

test('snapshotDue: first load always due; fresh snapshot is not re-fetched on tab return', () => {
  const t = 1_000_000_000;
  assert.equal(snapshotDue(t, 0, false), true, 'no snapshot yet → due');
  assert.equal(snapshotDue(t + 10_000, t, true), false, '10s-old snapshot during live play → not due');
  assert.equal(snapshotDue(t + LIVE_POLL_MS, t, true), true, 'live cadence elapsed → due');
  assert.equal(snapshotDue(t + LIVE_POLL_MS, t, false), false, 'idle: one live-interval is not enough');
  assert.equal(snapshotDue(t + IDLE_POLL_MS, t, false), true, 'idle cadence elapsed → due');
});

test('free-tier safety floors: cadences never drop below the safe minimums', () => {
  assert.ok(LIVE_POLL_MS >= 60 * 1000, 'live polling at most once a minute');
  assert.ok(IDLE_POLL_MS >= 5 * 60 * 1000, 'idle polling at most every five minutes');
  assert.ok(SCORER_TTL_MS >= 15 * 60 * 1000, 'scorer fetches at most every fifteen minutes');
});

test('scorersDue: player stats use a longer TTL than live scores', () => {
  const t = 5_000_000;
  assert.ok(SCORER_TTL_MS > IDLE_POLL_MS, 'scorer TTL exceeds even the idle poll');
  assert.equal(scorersDue(t, 0), true, 'never fetched → due');
  assert.equal(scorersDue(t + IDLE_POLL_MS, t), false, 'not due at the idle cadence');
  assert.equal(scorersDue(t + SCORER_TTL_MS, t), true, 'due once the TTL elapses');
});
