import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SHOT_LAB_RULES,
  SHOT_LAB_VERSION,
  advanceShotLabClock,
  createShotLab,
  setShotLabInput,
  shotLabEventLog,
  shotLabFrame,
  shotLabRecordAfter,
  shotLabSummary,
  takeShot,
  toggleShotLabPause,
  validateShotLabLog,
} from '../src/games/shot-lab.js';

function play(seed, input, mode = 'practice') {
  const run = createShotLab(seed, mode);
  while (!run.over) takeShot(run, input);
  return run;
}

test('Shot Lab is deterministic from seed plus direct inputs', () => {
  const input = { aim: { x: 75, y: 20 }, contact: { x: 0, y: 0.5 }, power: 0.72, curve: -0.2, shotType: 'finesse' };
  const a = play(260710, input);
  const b = play(260710, input);
  assert.deepEqual(a.shots, b.shots);
  assert.deepEqual(shotLabSummary(a), shotLabSummary(b));
  assert.equal(a.version, SHOT_LAB_VERSION);
});

test('aim, contact, power, curve and shot type all change the ball flight', () => {
  const base = { aim: { x: 70, y: 28 }, contact: { x: 0, y: 0 }, power: 0.7, curve: 0, shotType: 'drive' };
  const variants = [
    { ...base, aim: { x: 30, y: 28 } },
    { ...base, contact: { x: 1, y: -1 } },
    { ...base, power: 0.96 },
    { ...base, curve: 1 },
    { ...base, shotType: 'chip' },
  ];
  const first = (input) => takeShot(createShotLab(41), input).landing;
  const origin = first(base);
  for (const v of variants) assert.notDeepEqual(first(v), origin);
});

test('moving target and keeper read are visible before every shot', () => {
  const run = createShotLab(99);
  const first = shotLabFrame(run);
  takeShot(run, { ...run.input, aim: { x: 15, y: 40 } });
  const second = shotLabFrame(run);
  takeShot(run, { ...run.input, aim: { x: 15, y: 40 } });
  const third = shotLabFrame(run);
  assert.notDeepEqual(first.target, second.target);
  assert.equal(first.keeper.read, 'no read yet');
  assert.match(third.keeper.read, /left/);
  assert.ok(third.pressure > first.pressure);
});

test('practice is exactly eight shots; no extra shot can alter the result', () => {
  const run = play(11, createShotLab(11).input);
  assert.equal(run.shots.length, SHOT_LAB_RULES.practiceShots);
  assert.equal(run.over, true);
  const score = run.score;
  assert.equal(takeShot(run, run.input), null);
  assert.equal(run.score, score);
});

test('timed mode pauses honestly and the clock can end the run', () => {
  const run = createShotLab(12, 'timed');
  advanceShotLabClock(run, 10_000);
  assert.equal(run.elapsedMs, 10_000);
  toggleShotLabPause(run);
  advanceShotLabClock(run, 20_000);
  assert.equal(run.elapsedMs, 10_000, 'paused time is not charged');
  assert.equal(takeShot(run, run.input), null, 'paused shots are refused');
  toggleShotLabPause(run);
  advanceShotLabClock(run, 35_000);
  assert.equal(run.over, true);
  assert.equal(run.finishedBy, 'clock');
});

test('results and local records contain only derived game facts', () => {
  const run = play(72, { aim: { x: 68, y: 22 }, contact: { x: 0, y: 0.5 }, power: 0.68, curve: -0.4, shotType: 'finesse' });
  const summary = shotLabSummary(run);
  assert.equal(summary.shots, 8);
  assert.ok(summary.accuracy >= 0 && summary.accuracy <= 100);
  assert.ok(summary.technique >= 0 && summary.technique <= 100);
  const record = shotLabRecordAfter(null, run);
  assert.equal(record.played, 1);
  assert.equal(record.bestPractice, summary.score);
  assert.equal(record.last.seed, 72);
  assert.doesNotMatch(JSON.stringify(record), /fixture|standings|official|provider|wallet|payout/i);
});

test('event-log replay accepts honest runs and rejects score, timing and version tampering', () => {
  const run = createShotLab(515, 'timed');
  for (let i = 0; i < 5; i++) {
    advanceShotLabClock(run, 900 + i * 20);
    setShotLabInput(run, { aim: { x: 18 + i * 15, y: 22 + i * 4 }, curve: (i - 2) / 3 });
    takeShot(run);
  }
  const log = shotLabEventLog(run);
  assert.equal(validateShotLabLog(log).ok, true);
  assert.deepEqual(validateShotLabLog({ ...log, score: log.score + 10 }), { ok: false, reason: 'score', expected: log.score });
  assert.equal(validateShotLabLog({ ...log, gameVersion: 'old' }).reason, 'version');
  const badTime = structuredClone(log);
  badTime.events[2].elapsedMs = 1;
  assert.equal(validateShotLabLog(badTime).reason, 'timing');
});

test('ranked submission stays disabled until a server owns the challenge', () => {
  assert.equal(SHOT_LAB_RULES.ranked, false);
});

test('no player, team, user or AI identity can change the scoring model', () => {
  const a = createShotLab(444);
  const b = createShotLab(444);
  const input = { ...a.input, user: 'FRA', favoriteTeam: 'FRA', ai: 'CUW' };
  assert.deepEqual(takeShot(a, input), takeShot(b, b.input));
});
