// Play arcade logic: prediction grading is derived (never stored truth),
// picked winners advance through the sealed sim world, and nothing leaks.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOverlay } from '../src/core/provider-overlay.js';
import { getState, setOverlay, setPlay } from '../src/core/app-state.js';
import { gradePredictions, playNextRound, simulateLabForSeed, simulateMatch } from '../src/views/play.js';
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

test('Match Lab records meaningful possession vocabulary and starts with 22 players', () => {
  const r = lab(260626);
  assert.equal(r.players.home, 11);
  assert.equal(r.players.away, 11);
  const vocab = new Set(r.events.map((e) => e.type));
  assert.ok(['possession', 'pass', 'carry', 'transition', 'pressure'].some((type) => vocab.has(type)));
  assert.ok(['shot', 'chance', 'save', 'corner', 'free', 'goal'].some((type) => vocab.has(type)));
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

test('penalties are reserved for tied knockout simulations', () => {
  const { result } = findLab((r) => r.pens);
  assert.ok(result.pens);
  assert.equal(result.score[0], result.score[1], 'shootout only follows a tied match score');
});
