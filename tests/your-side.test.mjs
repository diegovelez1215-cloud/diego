// Your Side — local team ownership for Play. These tests pin its truth model:
// a chosen side lives only in the Play namespace, records are derived from
// runs that actually happened, verdicts are perspective-honest, and none of
// it can read from or write to official tournament truth.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOverlay } from '../src/core/provider-overlay.js';
import { getState, setOverlay, setPlay } from '../src/core/app-state.js';
import {
  FM_SCENARIOS,
  FM_STEPS,
  chooseSide,
  createFinalMinute,
  currentSide,
  dailyFinalMinuteSeed,
  finalMinuteDecide,
  fmNerveModel,
  fmRecordAfter,
  labPerspective,
  labPerspectiveResult,
  recordSideResult,
  sideRecordFor,
  simulateLabForSeed,
} from '../src/views/play.js';
import { fullResultsPayload } from './mock-provider.mjs';

/* ---------------- side selection ---------------- */

test('chooseSide stores a valid side in the Play namespace and clears cleanly', () => {
  setPlay({});
  chooseSide('USA');
  const side = currentSide(getState().play);
  assert.equal(side.code, 'USA');
  assert.ok(side.since, 'claim date recorded');
  chooseSide('NOT-A-TEAM');
  assert.equal(currentSide(getState().play), null, 'unknown codes clear the side instead of inventing a team');
  chooseSide('BRA');
  assert.equal(currentSide(getState().play).code, 'BRA');
  chooseSide(null);
  assert.equal(currentSide(getState().play), null);
});

test('choosing a side never touches official truth', () => {
  const overlay = buildOverlay({ results: fullResultsPayload() });
  setOverlay(overlay);
  const version = getState().real.overlay.version;
  const size = getState().real.overlay.byFixture.size;
  setPlay({});
  chooseSide('MEX');
  assert.equal(getState().real.overlay.version, version, 'overlay version untouched');
  assert.equal(getState().real.overlay.byFixture.size, size, 'no fixtures added');
});

/* ---------------- side record ---------------- */

test('recordSideResult aggregates W/L/D with honest streaks, per team code', () => {
  let stats = {};
  stats = recordSideResult(stats, 'USA', 'W');
  stats = recordSideResult(stats, 'USA', 'W');
  stats = recordSideResult(stats, 'USA', 'L');
  stats = recordSideResult(stats, 'USA', 'W');
  stats = recordSideResult(stats, 'USA', 'D');
  assert.deepEqual(stats.USA, { w: 3, l: 1, d: 1, played: 5, streak: 0, best: 2 });
  // a second side keeps its own book
  stats = recordSideResult(stats, 'BRA', 'W');
  assert.equal(stats.BRA.w, 1);
  assert.equal(stats.USA.w, 3, 'switching sides never erases another record');
  // invalid input changes nothing
  assert.deepEqual(recordSideResult(stats, 'USA', 'X'), stats);
  assert.deepEqual(recordSideResult(stats, null, 'W'), stats);
  assert.deepEqual(sideRecordFor({ sideStats: stats }, 'USA').best, 2);
  assert.deepEqual(sideRecordFor({}, 'ZZZ'), { w: 0, l: 0, d: 0, played: 0, streak: 0, best: 0 });
});

test('perspective helpers: your seat decides the verdict, penalties included', () => {
  assert.equal(labPerspective({ home: 'USA', away: 'ARG' }, 'USA'), 'h');
  assert.equal(labPerspective({ home: 'USA', away: 'ARG' }, 'ARG'), 'a');
  assert.equal(labPerspective({ home: 'USA', away: 'ARG' }, 'BRA'), null);
  assert.equal(labPerspective({ home: 'USA', away: 'ARG' }, null), null);
  assert.equal(labPerspectiveResult({ gh: 2, ga: 1, pens: null }, 'h'), 'W');
  assert.equal(labPerspectiveResult({ gh: 2, ga: 1, pens: null }, 'a'), 'L');
  assert.equal(labPerspectiveResult({ gh: 1, ga: 1, pens: { ph: 4, pa: 3 } }, 'a'), 'L', 'shootout defeat is a defeat');
  assert.equal(labPerspectiveResult({ gh: 1, ga: 1, pens: { ph: 2, pa: 4 } }, 'a'), 'W', 'shootout win is a win');
  assert.equal(labPerspectiveResult({ gh: 2, ga: 1 }, null), null);
});

/* ---------------- Match Lab integration ---------------- */

function labWithSide(sideCode, seed) {
  setPlay({ side: { code: sideCode, since: '2026-07-08T00:00:00Z' } });
  return simulateLabForSeed('USA', 'ARG', { seed, approach: 'balanced' });
}

test('a finished Lab run with your side playing lands a perspective verdict and updates the record', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const r = labWithSide('USA', seed);
    const { play } = getState();
    const entry = play.labHistory[0];
    const homeWin = r.pens ? r.pens.ph > r.pens.pa : r.score[0] > r.score[1];
    assert.equal(entry.you, 'h', `seed ${seed}: your seat is recorded`);
    assert.equal(entry.result, homeWin ? 'W' : 'L', `seed ${seed}: verdict matches the score`);
    const rec = sideRecordFor(play, 'USA');
    assert.equal(rec.played, 1, `seed ${seed}: exactly one game on the record`);
    assert.equal(rec.w + rec.l, 1);
    assert.equal(rec.w === 1, homeWin);
  }
});

test('a Lab run without your side involved records history but no side result', () => {
  setPlay({ side: { code: 'MEX', since: '2026-07-08T00:00:00Z' } });
  simulateLabForSeed('USA', 'ARG', { seed: 9, approach: 'balanced' });
  const { play } = getState();
  assert.equal(play.labHistory[0].you, null);
  assert.equal(play.labHistory[0].result, null);
  assert.equal(play.sideStats, undefined, 'no record invented for a match you did not play');
});

test('Lab runs still never mutate official truth with a side chosen', () => {
  const overlay = buildOverlay({ results: fullResultsPayload() });
  setOverlay(overlay);
  const version = getState().real.overlay.version;
  labWithSide('USA', 3);
  assert.equal(getState().real.overlay.version, version);
});

/* ---------------- Final Minute ---------------- */

const CALM = ['shut', 'restarts', 'wall'];
const CHAOS = ['hunt', 'overload', 'forward'];

function playFm(seed, choices) {
  const run = createFinalMinute(seed, 'USA', 'BRA');
  for (const c of choices) finalMinuteDecide(run, c);
  return run;
}

test('Final Minute is deterministic: same seed and calls replay identically', () => {
  const a = playFm(11, CALM);
  const b = playFm(11, CALM);
  assert.deepEqual(a.events, b.events);
  assert.equal(a.result, b.result);
  assert.equal(a.gYou, b.gYou);
});

test('Final Minute resolves in exactly three calls with an honest verdict', () => {
  for (let seed = 1; seed <= 80; seed++) {
    const run = playFm(seed, CHAOS);
    assert.equal(run.over, true, `seed ${seed}: three calls end the night`);
    assert.equal(run.step, FM_STEPS.length);
    assert.ok(['W', 'L', 'D'].includes(run.result));
    const expected = run.gYou > run.gThem ? 'W' : run.gYou < run.gThem ? 'L' : 'D';
    assert.equal(run.result, expected, `seed ${seed}: verdict matches the scoreline`);
    const scenario = FM_SCENARIOS[run.seed % FM_SCENARIOS.length];
    const goalsYou = run.events.filter((e) => e.type === 'goal' && e.side === 'you').length;
    const goalsThem = run.events.filter((e) => e.type === 'goal' && e.side === 'them').length;
    assert.equal(run.gYou, scenario.you + goalsYou, 'your goals equal scenario start plus scored events');
    assert.equal(run.gThem, scenario.them + goalsThem, 'their goals equal scenario start plus scored events');
    assert.equal(finalMinuteDecide(run, 'wall'), null, 'no calls after full time');
  }
});

test('Final Minute calls genuinely matter: calm and chaos diverge across seeds', () => {
  let diverged = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const calm = playFm(seed, CALM);
    const chaos = playFm(seed, CHAOS);
    if (calm.result !== chaos.result || calm.gYou + calm.gThem !== chaos.gYou + chaos.gThem) diverged++;
  }
  assert.ok(diverged >= 30, `tactics changed the night in ${diverged}/120 seeds`);
});

test('Final Minute composure is bounded, deterministic, and reacts to the calls and events', () => {
  const calm = createFinalMinute(19, 'USA', 'BRA');
  finalMinuteDecide(calm, 'shut');
  const a = fmNerveModel(calm);
  assert.ok(a.nerve >= -1 && a.nerve <= 1);
  assert.ok(a.pct >= 0 && a.pct <= 100);
  assert.equal(typeof a.label, 'string');
  const replay = createFinalMinute(19, 'USA', 'BRA');
  finalMinuteDecide(replay, 'shut');
  assert.deepEqual(fmNerveModel(replay), a);
  assert.equal(calm.lastChoice.id, 'shut');
  assert.equal(calm.lastChoice.risk, 'calm');
});

test('Final Minute carries territory, fatigue, substitutes and cards across decisions', () => {
  const run = createFinalMinute(19, 'USA', 'BRA');
  const before = structuredClone(run.state);
  finalMinuteDecide(run, 'hunt');
  assert.ok(run.state.field > before.field);
  assert.ok(run.state.fatigue > before.fatigue);
  const subsBefore = run.state.subs;
  finalMinuteDecide(run, 'fresh');
  assert.equal(run.state.subs, Math.max(0, subsBefore - 1));
  assert.ok(run.state.fatigue < 0.9);
  assert.deepEqual(run.lastChoice.state, run.state);
});

test('invalid Final Minute calls are refused without burning the step', () => {
  const run = createFinalMinute(5, 'USA', 'BRA');
  assert.equal(finalMinuteDecide(run, 'nonsense'), null);
  assert.equal(run.step, 0);
  assert.ok(finalMinuteDecide(run, 'hold'));
  assert.equal(run.step, 1);
});

test('Final Minute daily seeds are stable per date and distinct per attempt and date', () => {
  assert.equal(dailyFinalMinuteSeed('2026-07-09', 0), dailyFinalMinuteSeed('2026-07-09', 0));
  assert.notEqual(dailyFinalMinuteSeed('2026-07-09', 0), dailyFinalMinuteSeed('2026-07-09', 1));
  assert.notEqual(dailyFinalMinuteSeed('2026-07-09', 0), dailyFinalMinuteSeed('2026-07-10', 0));
});

test('the Final Minute record keeps only derived play facts and resets day attempts honestly', () => {
  const d1 = fmRecordAfter(null, { dateKey: '2026-07-09', result: 'W' });
  assert.deepEqual(d1, { dateKey: '2026-07-09', attemptsToday: 1, w: 1, l: 0, d: 0, played: 1, lastResult: 'W' });
  const d2 = fmRecordAfter(d1, { dateKey: '2026-07-09', result: 'L' });
  assert.equal(d2.attemptsToday, 2);
  const d3 = fmRecordAfter(d2, { dateKey: '2026-07-10', result: 'D' });
  assert.equal(d3.attemptsToday, 1, 'a new day restarts attempts');
  assert.deepEqual([d3.w, d3.l, d3.d, d3.played], [1, 1, 1, 3], 'all-time totals survive the day change');
  for (const k of Object.keys(d3)) {
    assert.ok(!['fixtures', 'standings', 'results', 'live', 'overlay', 'scores'].includes(k));
  }
});

/* ---------------- persistence safety ---------------- */

test('side, records, and histories persist in the Play namespace and survive sanitize', async () => {
  const map = new Map();
  globalThis.window = {
    localStorage: {
      get length() { return map.size; },
      key: (i) => [...map.keys()][i] ?? null,
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
    },
  };
  const { savePlay, loadPlay } = await import('../src/core/persistence.js');
  savePlay({
    side: { code: 'USA', since: '2026-07-08T00:00:00Z' },
    sideStats: { USA: { w: 2, l: 1, d: 0, played: 3, streak: 1, best: 2 } },
    finalMinute: { dateKey: '2026-07-09', attemptsToday: 1, w: 1, l: 0, d: 0, played: 1, lastResult: 'W' },
    fmHistory: [{ result: 'W', scenario: 'protect', you: 'USA', opp: 'BRA', gYou: 1, gThem: 0 }],
    overlay: { smuggled: true },
    standings: { smuggled: true },
  });
  const loaded = loadPlay();
  assert.equal(loaded.side.code, 'USA');
  assert.equal(loaded.sideStats.USA.w, 2);
  assert.equal(loaded.finalMinute.w, 1);
  assert.equal(loaded.fmHistory.length, 1);
  assert.ok(!('overlay' in loaded), 'official overlay can never ride along');
  assert.ok(!('standings' in loaded), 'standings can never ride along');
  delete globalThis.window;
});
