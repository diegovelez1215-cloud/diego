// Penalty Rush — the arcade's hands-on minigame. These tests pin its truth
// model: seeded determinism, honest keeper behaviour (habits only, never the
// current pick), a strict five-kick regulation with sudden death after a
// perfect five, and a local record that stores only derived play facts.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RUSH_ZONES,
  createPenaltyRush,
  dailyGauntletSeed,
  rushRating,
  rushRecordAfter,
  rushShoot,
} from '../src/views/play.js';

function playThrough(seed, aims) {
  const run = createPenaltyRush(seed);
  const kicks = [];
  for (const aim of aims) {
    const kick = rushShoot(run, aim);
    if (!kick) break;
    kicks.push(kick);
    if (run.over) break;
  }
  return { run, kicks };
}

const SPREAD = ['left', 'right', 'centre', 'left', 'right'];

test('a gauntlet is deterministic: same seed and aims replay identically', () => {
  const a = playThrough(77, SPREAD);
  const b = playThrough(77, SPREAD);
  assert.deepEqual(a.kicks, b.kicks);
  assert.equal(a.run.goals, b.run.goals);
  assert.equal(a.run.over, b.run.over);
});

test('regulation is exactly five kicks unless all five score', () => {
  for (let seed = 1; seed <= 120; seed++) {
    const { run } = playThrough(seed, [...SPREAD, ...SPREAD, ...SPREAD]);
    if (run.goals >= 5 && run.kicks.length >= 5) {
      assert.ok(run.kicks.slice(0, 5).every((k) => k.outcome === 'goal'), 'sudden death only follows a perfect five');
      assert.ok(run.kicks.length >= 5);
      if (run.over) {
        assert.notEqual(run.kicks[run.kicks.length - 1].outcome, 'goal', 'sudden death ends on the first non-goal');
      }
    } else {
      assert.equal(run.kicks.length, 5, `seed ${seed}: an imperfect gauntlet is exactly five kicks`);
      assert.equal(run.over, true);
    }
  }
});

test('a miss inside the first five never ends the run early', () => {
  for (let seed = 1; seed <= 80; seed++) {
    const run = createPenaltyRush(seed);
    for (let i = 0; i < 5; i++) {
      const kick = rushShoot(run, SPREAD[i]);
      assert.ok(kick, `seed ${seed} kick ${i + 1} was accepted`);
      if (i < 4) assert.equal(run.over, false, 'all five regulation kicks are always taken');
    }
  }
});

test('shooting after the gauntlet is over is refused', () => {
  const { run } = playThrough(3, [...SPREAD, ...SPREAD, ...SPREAD, ...SPREAD]);
  assert.equal(run.over, true);
  assert.equal(rushShoot(run, 'left'), null);
  assert.equal(rushShoot(run, 'nonsense'), null);
});

test('the keeper reads habits: an always-left shooter gets caught more than a spread shooter', () => {
  let habitual = 0;
  let spread = 0;
  const n = 400;
  for (let seed = 1; seed <= n; seed++) {
    const a = playThrough(seed, ['left', 'left', 'left', 'left', 'left']);
    habitual += a.kicks.filter((k) => k.keeper === 'left').length;
    const b = playThrough(seed, SPREAD);
    spread += b.kicks.filter((k) => k.keeper === k.aim).length;
  }
  // both play 5 regulation kicks per seed (sudden-death extras only add kicks
  // for perfect runs, which are rarer for the habitual shooter by design).
  // Deterministic across these fixed seeds: habitual ≈ 40% caught, spread ≈ 35%.
  assert.ok(habitual > spread * 1.1, `keeper punishes habits (habitual ${habitual} vs spread ${spread})`);
});

test('outcomes stay football-plausible across many seeds', () => {
  let goals = 0;
  let kicks = 0;
  const outcomes = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    const { run } = playThrough(seed, [...SPREAD, ...SPREAD]);
    goals += run.goals;
    kicks += run.kicks.length;
    run.kicks.forEach((k) => outcomes.add(k.outcome));
    run.kicks.forEach((k) => {
      assert.ok(RUSH_ZONES.includes(k.aim));
      assert.ok(RUSH_ZONES.includes(k.keeper));
    });
  }
  const rate = goals / kicks;
  assert.ok(rate > 0.5 && rate < 0.92, `goal rate ${rate.toFixed(2)} feels like real penalties`);
  assert.ok(outcomes.has('goal') && outcomes.has('save'), 'both headline outcomes occur');
});

test('daily gauntlet seeds are stable per date and distinct per attempt and date', () => {
  assert.equal(dailyGauntletSeed('2026-07-08', 0), dailyGauntletSeed('2026-07-08', 0));
  assert.notEqual(dailyGauntletSeed('2026-07-08', 0), dailyGauntletSeed('2026-07-08', 1));
  assert.notEqual(dailyGauntletSeed('2026-07-08', 0), dailyGauntletSeed('2026-07-09', 0));
  assert.ok(dailyGauntletSeed('2026-07-08', 0) >= 1);
});

test('the local record keeps only derived play facts and resets day-scoped bests honestly', () => {
  const day1 = rushRecordAfter(null, { dateKey: '2026-07-08', score: 3, perfect: false });
  assert.deepEqual(day1, {
    dateKey: '2026-07-08', attemptsToday: 1, bestToday: 3, bestEver: 3, perfects: 0, played: 1, lastScore: 3,
  });
  const day1b = rushRecordAfter(day1, { dateKey: '2026-07-08', score: 6, perfect: true });
  assert.equal(day1b.attemptsToday, 2);
  assert.equal(day1b.bestToday, 6);
  assert.equal(day1b.bestEver, 6);
  assert.equal(day1b.perfects, 1);
  const day2 = rushRecordAfter(day1b, { dateKey: '2026-07-09', score: 2, perfect: false });
  assert.equal(day2.attemptsToday, 1, 'a new day restarts attempts');
  assert.equal(day2.bestToday, 2, 'a new day restarts the daily best');
  assert.equal(day2.bestEver, 6, 'the all-time best survives the day change');
  assert.equal(day2.played, 3);
  // no official-truth field names can ride along into storage
  for (const k of Object.keys(day2)) {
    assert.ok(!['fixtures', 'standings', 'results', 'live', 'overlay', 'scores'].includes(k));
  }
});

test('ratings copy exists for every score band and never talks money', () => {
  for (const goals of [0, 1, 2, 3, 4, 5, 6, 8, 11]) {
    const line = rushRating(goals);
    assert.equal(typeof line, 'string');
    assert.ok(line.length > 4);
    assert.ok(!/cash|bet|stake|wager|payout|deposit/i.test(line));
  }
});
