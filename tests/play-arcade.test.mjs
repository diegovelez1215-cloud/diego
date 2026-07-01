// Play arcade logic: prediction grading is derived (never stored truth),
// picked winners advance through the sealed sim world, and nothing leaks.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOverlay } from '../src/core/provider-overlay.js';
import { getState, setOverlay, setPlay } from '../src/core/app-state.js';
import { gradePredictions, playNextRound, simulateMatch } from '../src/views/play.js';
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
