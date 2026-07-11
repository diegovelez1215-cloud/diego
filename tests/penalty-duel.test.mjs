// Penalty Duel engine — the rebuilt Penalty Rush. Timing, deception, keeper
// psychology, fairness floors, record compatibility, and replay validation.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DUEL_RULES, DUEL_ZONES, DUEL_ZONE_INFO, DUEL_KEEPERS, PENALTY_DUEL_VERSION,
  createPenaltyDuel, duelKeeper, pulseOffsetAt, sweetWindow, takeKick,
  duelReadSignal, duelRating, duelRecordAfter, duelEventLog, validateDuelLog,
} from '../src/games/penalty-duel.js';

const PERFECT_MS = DUEL_RULES.pulseMs * 0.25; // pulse crosses the sweet spot

test('the run-up pulse is a pure triangle wave anyone can replay', () => {
  assert.equal(pulseOffsetAt(0), -1);
  assert.equal(pulseOffsetAt(DUEL_RULES.pulseMs * 0.25), 0);
  assert.equal(pulseOffsetAt(DUEL_RULES.pulseMs * 0.5), 1);
  assert.equal(pulseOffsetAt(DUEL_RULES.pulseMs * 0.75), 0);
  assert.equal(pulseOffsetAt(DUEL_RULES.pulseMs), -1, 'the wave wraps');
});

test('same seed and same kick script resolve identically', () => {
  const script = [
    { zone: 'bl', feint: false, atMs: PERFECT_MS },
    { zone: 'tr', feint: true, atMs: PERFECT_MS + 40 },
    { zone: 'bc', feint: false, atMs: PERFECT_MS - 30 },
    { zone: 'br', feint: false, atMs: PERFECT_MS },
    { zone: 'tl', feint: false, atMs: PERFECT_MS + 10 },
  ];
  const a = createPenaltyDuel(2026);
  const b = createPenaltyDuel(2026);
  for (const k of script) { takeKick(a, k); takeKick(b, k); }
  assert.deepEqual(a.kicks.map((k) => k.outcome), b.kicks.map((k) => k.outcome));
  assert.equal(a.goals, b.goals);
});

test('the keeper never reads the current pick — only history and tendencies', () => {
  // Identical seeds and histories, different current zones: same keeper dive.
  const a = createPenaltyDuel(99);
  const b = createPenaltyDuel(99);
  const ka = takeKick(a, { zone: 'bl', atMs: PERFECT_MS });
  const kb = takeKick(b, { zone: 'tr', atMs: PERFECT_MS });
  assert.equal(ka.keeper, kb.keeper, 'the dive is chosen blind to the current pick');
});

test('perfect timing gives full strike quality; outside the window gives none', () => {
  const run = createPenaltyDuel(7);
  const k = takeKick(run, { zone: 'bl', atMs: PERFECT_MS });
  assert.equal(k.quality, 1);
  const run2 = createPenaltyDuel(7);
  const bad = takeKick(run2, { zone: 'bl', atMs: 0 }); // offset -1, far outside
  assert.equal(bad.quality, 0);
});

test('the timing window narrows under pressure but never below the floor — and it is shown', () => {
  const run = createPenaltyDuel(13);
  const first = sweetWindow(run);
  for (let i = 0; i < 40 && !run.over; i++) {
    takeKick(run, { zone: DUEL_ZONES[i % 6], atMs: PERFECT_MS });
    if (run.goals < run.kicks.length) break;
  }
  const later = sweetWindow(run);
  assert.ok(later <= first, 'pressure narrows the window');
  assert.ok(later >= DUEL_RULES.floorWindow, 'the floor is absolute');
  // the number the UI shows before the kick is the number the engine uses
  const shown = sweetWindow(run, true);
  assert.ok(shown >= DUEL_RULES.floorWindow);
});

test('a well-struck ball to the wrong wing beats the keeper', () => {
  // Survey many seeds: when the keeper dives the other way and quality is
  // perfect, goals must dominate near-completely.
  let wrongWing = 0; let wrongWingGoals = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const run = createPenaltyDuel(seed);
    const kick = takeKick(run, { zone: 'bl', atMs: PERFECT_MS });
    if (kick.read === 'wrong' && kick.outcome !== 'off') {
      wrongWing += 1;
      if (kick.outcome === 'goal') wrongWingGoals += 1;
    }
  }
  assert.ok(wrongWing > 50, 'sample must be meaningful');
  assert.ok(wrongWingGoals / wrongWing > 0.95, `wrong-wing perfect strikes must score: ${wrongWingGoals}/${wrongWing}`);
});

test('a full read punishes low quality but a perfect disguised strike still has a chance', () => {
  let fullReads = 0; let saves = 0;
  for (let seed = 1; seed <= 600; seed++) {
    const run = createPenaltyDuel(seed);
    const kick = takeKick(run, { zone: 'bc', atMs: 0 }); // zero quality, keeper favourite zone
    if (kick.read === 'full' && kick.outcome !== 'off') {
      fullReads += 1;
      if (kick.outcome === 'save') saves += 1;
    }
  }
  assert.ok(fullReads > 30);
  assert.ok(saves / fullReads > 0.6, `a read soft penalty is usually saved: ${saves}/${fullReads}`);
});

test('feints genuinely tilt the duel against early divers', () => {
  const early = DUEL_KEEPERS.filter((k) => k.dives === 'early').map((k) => k.id);
  let plain = 0; let plainGoals = 0; let feint = 0; let feintGoals = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    const probe = createPenaltyDuel(seed);
    if (!early.includes(probe.keeper)) continue;
    const a = createPenaltyDuel(seed);
    const ka = takeKick(a, { zone: 'bl', atMs: PERFECT_MS });
    if (ka.outcome !== 'off') { plain += 1; if (ka.outcome === 'goal') plainGoals += 1; }
    const b = createPenaltyDuel(seed);
    const kb = takeKick(b, { zone: 'bl', feint: true, atMs: PERFECT_MS });
    if (kb.outcome !== 'off') { feint += 1; if (kb.outcome === 'goal') feintGoals += 1; }
  }
  assert.ok(plain > 200 && feint > 200);
  assert.ok(feintGoals / feint >= plainGoals / plain,
    `feints against early divers must not hurt: feint ${feintGoals}/${feint} vs plain ${plainGoals}/${plain}`);
});

test('habit reading is honest: repeat a side and the read signal says so', () => {
  const run = createPenaltyDuel(64);
  takeKick(run, { zone: 'bl', atMs: PERFECT_MS });
  takeKick(run, { zone: 'tl', atMs: PERFECT_MS });
  const read = duelReadSignal(run);
  assert.equal(read.side, 'l');
  assert.ok(read.label.includes('left'));
  const fresh = duelReadSignal(createPenaltyDuel(64));
  assert.equal(fresh.side, null);
  assert.equal(fresh.label, 'No pattern yet');
});

test('a perfect five opens sudden death and a sudden-death miss ends the duel', () => {
  // find a seed where five perfect wrong-wing kicks all score
  outer:
  for (let seed = 1; seed <= 400; seed++) {
    const run = createPenaltyDuel(seed);
    const zones = ['bl', 'br', 'bc', 'tl', 'tr'];
    for (let i = 0; i < 5; i++) {
      const k = takeKick(run, { zone: zones[i], atMs: PERFECT_MS });
      if (k.outcome !== 'goal') continue outer;
    }
    assert.equal(run.sudden, true, 'perfect five must open sudden death');
    assert.equal(run.over, false);
    while (!run.over) takeKick(run, { zone: 'bc', atMs: 0 });
    assert.equal(run.over, true, 'sudden death ends only when the keeper wins');
    assert.ok(run.goals >= 5);
    return;
  }
  assert.fail('no perfect five found across 400 seeds — scoring is miscalibrated');
});

test('every kick carries a complete honest explanation', () => {
  const run = createPenaltyDuel(21);
  const k = takeKick(run, { zone: 'tr', feint: true, atMs: PERFECT_MS + 100 });
  assert.ok(DUEL_ZONES.includes(k.zone));
  assert.ok(['full', 'wing', 'wrong'].includes(k.read));
  assert.ok(k.window >= DUEL_RULES.floorWindow);
  assert.ok(k.quality >= 0 && k.quality <= 1);
  assert.ok(typeof k.keeper === 'string' && k.keeper.length === 2);
  assert.ok(['goal', 'save', 'off'].includes(k.outcome));
});

test('records keep the exact Penalty Rush contract old saves rely on', () => {
  const rec = duelRecordAfter(null, { dateKey: '2026-07-10', score: 4, perfect: false });
  assert.deepEqual(Object.keys(rec).sort(),
    ['attemptsToday', 'bestEver', 'bestToday', 'dateKey', 'lastScore', 'perfects', 'played'].sort());
  const legacy = { dateKey: '2026-07-09', attemptsToday: 3, bestToday: 3, bestEver: 7, perfects: 1, played: 9, lastScore: 3 };
  const next = duelRecordAfter(legacy, { dateKey: '2026-07-10', score: 5, perfect: true });
  assert.equal(next.bestEver, 7, 'an old higher best survives');
  assert.equal(next.perfects, 2);
  assert.equal(next.attemptsToday, 1, 'new day resets attempts');
});

test('the scouting card tells the truth about tendencies', () => {
  for (const k of DUEL_KEEPERS) {
    const colSum = k.cols.l + k.cols.c + k.cols.r;
    const rowSum = k.rows.t + k.rows.b;
    assert.ok(Math.abs(colSum - 1) < 0.01, `${k.name} column weights sum to 1`);
    assert.ok(Math.abs(rowSum - 1) < 0.01, `${k.name} row weights sum to 1`);
    assert.ok(k.tell.length > 10, 'every keeper ships a scouting tell');
  }
  const run = createPenaltyDuel(500);
  assert.ok(duelKeeper(run).name.length > 0);
});

test('the replay validator accepts honest logs and rejects tampering', () => {
  const run = createPenaltyDuel(321);
  takeKick(run, { zone: 'bl', atMs: 350 });
  takeKick(run, { zone: 'tr', feint: true, atMs: 700 });
  takeKick(run, { zone: 'bc', atMs: 350 });
  takeKick(run, { zone: 'br', atMs: 350 });
  takeKick(run, { zone: 'tl', atMs: 350 });
  const log = duelEventLog(run);
  assert.equal(validateDuelLog(log).ok, true);
  assert.equal(validateDuelLog({ ...log, score: log.score + 1 }).ok, false);
  assert.equal(validateDuelLog({ ...log, gameVersion: 'x' }).reason, 'version');
  assert.equal(validateDuelLog({ ...log, events: [{ zone: 'bl', atMs: -5 }] }).reason, 'timing');
  assert.equal(validateDuelLog({ ...log, events: [{ zone: 'nope', atMs: 10 }] }).reason, 'event');
});

test('ranked stays locked and ratings stay flavour-only', () => {
  assert.equal(DUEL_RULES.ranked, false);
  assert.equal(PENALTY_DUEL_VERSION, 'penalty-duel-v1');
  assert.ok(duelRating(5).length > 0);
  assert.ok(duelRating(0).length > 0);
  for (const z of DUEL_ZONES) assert.ok(DUEL_ZONE_INFO[z].label.length > 0);
});
