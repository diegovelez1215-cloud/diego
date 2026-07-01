// Play is a sealed simulation space: My World Cup and What-If can never
// modify real fixtures, standings, Home, the official bracket, or Match Center.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOverlay } from '../src/core/provider-overlay.js';
import { getState, setOverlay } from '../src/core/app-state.js';
import { playNextRound, simulateMatch } from '../src/views/play.js';
import {
  homeModel, knockoutModel, groupsModel, matchCenterModel, clearModelCache,
} from '../src/data/tournament-model.js';
import { setClock } from '../src/core/time.js';

const OK = { configured: true, sourceStatus: 'fresh', isStale: false };

function snapshotReal() {
  const { real } = getState();
  const o = real.overlay;
  return JSON.stringify({
    version: o.version,
    providerState: o.providerState,
    byFixture: [...o.byFixture.entries()],
    standings: o.standings,
    slots: [...o.slots.entries()],
  });
}

test('running My World Cup to a champion never mutates real truth or real view models', () => {
  setClock(() => Date.parse('2026-07-01T13:00:00-04:00'));
  try {
    const overlay = buildOverlay({
      results: { ...OK, finished: [{ home: 'Mexico', away: 'South Africa', gh: 2, ga: 0, status: 'FINISHED', utcDate: '2026-06-11T19:00:00Z' }] },
      live: { ...OK, response: [{ home: 'England', away: 'DR Congo', gh: 1, ga: 0, min: 60, status: '2H', kind: 'live', date: '2026-07-01T16:00:00Z' }] },
    });
    setOverlay(overlay);
    clearModelCache();
    const before = snapshotReal();
    const homeBefore = JSON.stringify(homeModel(overlay).hero);
    const koBefore = JSON.stringify(knockoutModel(overlay).rounds.map((r) => r.list.map((m) => [m.id, m.home.name, m.gh, m.ga])));
    const groupsBefore = JSON.stringify(groupsModel(overlay));
    const mcBefore = JSON.stringify(matchCenterModel(80, overlay));

    for (let i = 0; i < 10; i++) playNextRound(); // sim the whole tournament

    const sim = getState().play.myWorldCup;
    assert.ok(sim, 'simulation ran');
    assert.ok(Object.keys(sim.finals).length > 0, 'simulated finals exist in the Play namespace');
    assert.equal(snapshotReal(), before, 'real overlay is byte-identical');
    clearModelCache();
    const after = getState().real.overlay;
    assert.equal(JSON.stringify(homeModel(after).hero), homeBefore, 'Home unchanged');
    assert.equal(JSON.stringify(knockoutModel(after).rounds.map((r) => r.list.map((m) => [m.id, m.home.name, m.gh, m.ga]))), koBefore, 'official bracket unchanged');
    assert.equal(JSON.stringify(groupsModel(after)), groupsBefore, 'groups unchanged');
    assert.equal(JSON.stringify(matchCenterModel(80, after)), mcBefore, 'Match Center unchanged');
    // Structural isolation: sim results live under play.*, not real.*
    assert.ok(!('finals' in getState().real), 'no sim data leaks into real');
  } finally { setClock(null); }
});

test('simulateMatch is pure — it reads ratings and an RNG, nothing else', () => {
  let calls = 0;
  const rng = () => { calls++; return 0.42; };
  const r = simulateMatch('FRA', 'HAI', rng, { knockout: true });
  assert.ok(Number.isInteger(r.gh) && Number.isInteger(r.ga));
  assert.ok(calls > 0);
});
