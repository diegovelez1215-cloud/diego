// Play arcade logic: prediction grading is derived (never stored truth),
// picked winners advance through the sealed sim world, and nothing leaks.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOverlay } from '../src/core/provider-overlay.js';
import { getState, setOverlay, setPlay } from '../src/core/app-state.js';
import {
  LAB_PACE_CONTRACT,
  activeFormation,
  estimateLabPlaybackMs,
  featuredShowdownForDate,
  gradePredictions,
  isLabMajorMoment,
  labVisualDuration,
  playNextRound,
  simulateLabForSeed,
  simulateMatch,
} from '../src/views/play.js';
import { fullResultsPayload, OK } from './mock-provider.mjs';

test('gradePredictions: confidence earns insight, misses reset the streak, ungraded picks wait', () => {
  const overlay = buildOverlay({
    results: {
      ...OK,
      finished: [
        { home: 'Mexico', away: 'South Africa', gh: 2, ga: 0, winner: 'HOME_TEAM', status: 'FINISHED', utcDate: '2026-06-11T19:00:00Z' },
        { home: 'Korea Republic', away: 'Czechia', gh: 0, ga: 2, winner: 'AWAY_TEAM', status: 'FINISHED', utcDate: '2026-06-11T22:00:00Z' },
      ],
    },
  });
  const picks = {
    1: { side: 'home', conf: 3 },   // correct Lock  → +30, streak 1
    2: { side: 'home', conf: 2 },   // wrong         → streak resets
    50: { side: 'away', conf: 1 },  // not played    → ungraded
  };
  const s = gradePredictions(picks, overlay);
  assert.equal(s.total, 2);
  assert.equal(s.right, 1);
  assert.equal(s.insight, 30);
  assert.equal(s.streak, 0, 'latest graded call missed');
  assert.equal(s.best, 1);
});

test('prediction grading never fabricates: no finals → nothing graded', () => {
  const overlay = buildOverlay({ results: { ...OK, finished: [] } });
  const s = gradePredictions({ 1: { side: 'home', conf: 3 } }, overlay);
  assert.equal(s.total, 0);
  assert.equal(s.insight, 0);
});

test('a hand-picked winner advances through the sim bracket without touching real truth', () => {
  const overlay = buildOverlay({ results: fullResultsPayload() });
  setOverlay(overlay);
  setPlay({});
  const realVersion = getState().real.overlay.version;
  const realSize = getState().real.overlay.byFixture.size;

  // pick through My World Cup: simulate everything round by round
  for (let i = 0; i < 10; i++) playNextRound();
  const sim = getState().play.myWorldCup;
  assert.ok(sim.champion, 'sim reaches a champion');
  assert.ok(Object.keys(sim.finals).length >= 32, 'knockout fully simulated');

  assert.equal(getState().real.overlay.version, realVersion, 'real overlay untouched');
  assert.equal(getState().real.overlay.byFixture.size, realSize, 'no real fixtures added');
});

test('simulateMatch stays a pure engine', () => {
  const rng = () => 0.31;
  const r = simulateMatch('BRA', 'HAI', rng, { knockout: true });
  assert.ok(Number.isInteger(r.gh) && Number.isInteger(r.ga) && r.winner);
});

function lab(seed, teams = ['USA', 'ARG']) {
  setPlay({});
  return simulateLabForSeed(teams[0], teams[1], { seed, approach: 'balanced' });
}

function findLab(predicate, limit = 700) {
  for (let seed = 1; seed <= limit; seed++) {
    const result = lab(seed);
    if (predicate(result)) return { seed, result };
  }
  assert.fail('no deterministic Match Lab seed satisfied the requested state');
}

test('Match Lab replay is deterministic from the seed', () => {
  const a = lab(260626);
  const b = lab(260626);
  assert.deepEqual(a.score, b.score);
  assert.deepEqual(a.pens, b.pens);
  assert.deepEqual(a.events.map((e) => [e.min, e.type, e.side]), b.events.map((e) => [e.min, e.type, e.side]));
});

test('Match Lab pace contract hits mobile arcade duration targets', () => {
  const r = lab(260626);
  const normal = estimateLabPlaybackMs(r.events, 'normal');
  const turbo = estimateLabPlaybackMs(r.events, 'fast');
  const key = estimateLabPlaybackMs(r.events, 'key');
  assert.ok(normal >= LAB_PACE_CONTRACT.normal.targetMs[0] && normal <= LAB_PACE_CONTRACT.normal.targetMs[1], `normal ${normal}ms is inside target`);
  assert.ok(turbo >= LAB_PACE_CONTRACT.fast.targetMs[0] && turbo <= LAB_PACE_CONTRACT.fast.targetMs[1], `turbo ${turbo}ms is inside target`);
  assert.ok(key <= LAB_PACE_CONTRACT.key.targetMs[1], `key moments ${key}ms stays aggressive`);
  assert.ok(key < turbo && turbo < normal, 'paced modes get progressively faster');
});

test('major Match Lab moments keep readable fixed minimum durations at every pace', () => {
  for (const type of ['goal', 'save', 'var', 'card', 'red', 'pens', 'final']) {
    assert.equal(isLabMajorMoment(type), true, `${type} is major`);
    assert.ok(labVisualDuration(type, 'normal') >= 560, `${type} normal duration is readable`);
    assert.ok(labVisualDuration(type, 'fast') >= 480, `${type} turbo duration is readable`);
    assert.ok(labVisualDuration(type, 'key') >= 460, `${type} key duration is readable`);
  }
  for (const type of ['possession', 'pass', 'carry', 'transition', 'pressure', 'sub', 'board']) {
    assert.ok(labVisualDuration(type, 'key') <= 120, `${type} is compressed in key moments`);
  }
});

test('Match Lab records meaningful possession vocabulary and starts with 22 players', () => {
  const r = lab(260626);
  assert.equal(r.players.home, 11);
  assert.equal(r.players.away, 11);
  const vocab = new Set(r.events.map((e) => e.type));
  assert.ok(['possession', 'pass', 'carry', 'transition', 'pressure'].some((type) => vocab.has(type)));
  assert.ok(['shot', 'chance', 'save', 'corner', 'free', 'goal'].some((type) => vocab.has(type)));
});

test('Match Lab event visuals move the ball through distinct player and goal points', () => {
  const r = lab(260626);
  const open = r.events.find((e) => ['possession', 'pass', 'carry', 'transition', 'pressure'].includes(e.type));
  assert.ok(open, 'open-play event exists');
  assert.ok(new Set(open.visual.map((p) => `${p[0]},${p[1]},${p[2]}`)).size >= 3, 'open play has at least three distinct visual points');
  const goal = findLab((x) => x.events.some((e) => e.type === 'goal')).result.events.find((e) => e.type === 'goal');
  assert.ok(goal.visual.some((p) => p[3] === 'goal'), 'goal path reaches the goal');
});

test('Match Lab visibly drops to ten after a red card', () => {
  const { result } = findLab((r) => r.events.some((e) => e.type === 'red'));
  assert.ok(result.players.home === 10 || result.players.away === 10);
  assert.equal(result.players.home + result.players.away, 21);
});

test('VAR appears only after a goal and resolves to a football decision', () => {
  const { result } = findLab((r) => r.events.some((e) => e.type === 'var'));
  const events = result.events;
  const idx = events.findIndex((e) => e.type === 'var');
  assert.ok(idx > 0, 'VAR is not the opening event');
  assert.equal(events[idx - 1].type, 'goal', 'VAR is tied to a close goal event');
  assert.ok(['confirmed', 'overturned'].includes(events[idx + 1]?.type), 'VAR resolves clearly');
});

test('VAR confirmed and overturned outcomes produce the matching final score', () => {
  const confirmed = findLab((r) => r.events.some((e) => e.type === 'confirmed'), 2000).result;
  const overturned = findLab((r) => r.events.some((e) => e.type === 'overturned'), 4000).result;
  for (const r of [confirmed, overturned]) {
    const confirmedGoals = r.events.filter((e) => e.type === 'confirmed' || (e.type === 'goal' && !e.underReview));
    const h = confirmedGoals.filter((e) => e.side === 'h').length;
    const a = confirmedGoals.filter((e) => e.side === 'a').length;
    assert.deepEqual(r.score, [h, a], 'final score only counts confirmed or non-reviewed goals');
  }
  assert.ok(overturned.events.some((e) => e.type === 'overturned'), 'overturned sample is present');
});

test('card visuals identify the dismissed marker before the count changes', () => {
  const { result } = findLab((r) => r.events.some((e) => e.type === 'red'));
  const red = result.events.find((e) => e.type === 'red');
  assert.ok(red.redRole, 'red card carries the dismissed role');
  assert.ok(red.visual.every((p) => p[2] === red.redRole || p[3] === 'foul'), 'red-card ball stops by the incident role');
  assert.equal(result.players.home + result.players.away, 21);
});

test('penalties are reserved for tied knockout simulations', () => {
  const { result } = findLab((r) => r.pens);
  assert.ok(result.pens);
  assert.equal(result.score[0], result.score[1], 'shootout only follows a tied match score');
  assert.ok(result.events.filter((e) => e.type === 'pens').length >= result.pens.kicks, 'shootout is represented kick by kick');
});

test('open play keeps the ball travelling through distinct waypoints and role markers', () => {
  const r = lab(260626);
  const trace = r.visualTrace;
  assert.ok(trace.length >= 8, 'the trace records continuous ball movement');
  const distinctPoints = new Set(trace.map((p) => `${p.x},${p.y}`));
  assert.ok(distinctPoints.size >= 4, 'ball travels through at least four distinct waypoints');
  const roles = new Set(trace.map((p) => p.from));
  assert.ok(roles.size >= 3, 'quiet possession chains touch distinct players');
  assert.ok(trace.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), 'compressed possession never records a missing waypoint');
});

test('players react to possession: momentum pushes the attacking shape forward', () => {
  const base = { minute: 30, gh: 0, ga: 0, home: 'USA', away: 'ARG', mods: { atk: 1, def: 1 } };
  const meanX = (players) => players.reduce((n, p) => n + p.x, 0) / players.length;
  const attacking = activeFormation('h', { ...base, mo: 0.9 });
  const defending = activeFormation('h', { ...base, mo: -0.9 });
  assert.equal(attacking.length, 11);
  assert.ok(meanX(attacking) > meanX(defending) + 3, 'home shape advances with momentum');
  const awayAttacking = activeFormation('a', { ...base, mo: -0.9 });
  const awayDefending = activeFormation('a', { ...base, mo: 0.9 });
  assert.ok(meanX(awayAttacking) < meanX(awayDefending) - 3, 'away shape advances toward the home goal');
});

test('the score changes only after a completed goal sequence that reaches the goal', () => {
  const r = findLab((x) => x.events.some((e) => e.type === 'goal' && !e.underReview)).result;
  const scoring = r.events.filter((e) => (e.type === 'goal' && !e.underReview) || e.type === 'confirmed');
  assert.ok(scoring.length >= 1);
  assert.ok(scoring.every((e) => e.committed), 'every scoring event committed through its full visual sequence');
  const h = scoring.filter((e) => e.side === 'h').length;
  const a = scoring.filter((e) => e.side === 'a').length;
  assert.deepEqual(r.score, [h, a], 'the scoreboard equals exactly the committed goals');
  const goal = r.events.find((e) => e.type === 'goal' && !e.underReview);
  assert.equal(goal.visual[goal.visual.length - 1][3], 'goal', 'the goal sequence ends at the goal mouth');
});

test('major moments are never cut off before their commit', () => {
  const samples = [
    findLab((x) => x.events.some((e) => e.type === 'goal' && !e.underReview), 2000).result,
    findLab((x) => x.events.some((e) => e.type === 'save'), 2000).result,
    findLab((x) => x.events.some((e) => e.type === 'var'), 2000).result,
    findLab((x) => x.events.some((e) => e.type === 'red'), 2000).result,
    findLab((x) => x.pens, 4000).result,
  ];
  for (const r of samples) {
    for (const e of r.events.filter((event) => isLabMajorMoment(event.type))) {
      assert.equal(e.committed, true, `${e.type} committed`);
      assert.ok(e.visual.length >= 2, `${e.type} kept a complete visual path`);
    }
  }
});

test('daily featured showdown is stable by date and changes with shuffle or date', () => {
  const day = featuredShowdownForDate('2026-07-04', 0);
  assert.deepEqual(day, featuredShowdownForDate('2026-07-04', 0));
  assert.notDeepEqual([day.home, day.away, day.seed], [featuredShowdownForDate('2026-07-04', 1).home, featuredShowdownForDate('2026-07-04', 1).away, featuredShowdownForDate('2026-07-04', 1).seed]);
  assert.notDeepEqual([day.home, day.away, day.seed], [featuredShowdownForDate('2026-07-05', 0).home, featuredShowdownForDate('2026-07-05', 0).away, featuredShowdownForDate('2026-07-05', 0).seed]);
});
