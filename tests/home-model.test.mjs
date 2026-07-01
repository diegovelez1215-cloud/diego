// Home hero selection: live official matches outrank future and completed
// matches; the fixture shown is always the correct canonical fixture.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOverlay } from '../src/core/provider-overlay.js';
import { homeModel, clearModelCache } from '../src/data/tournament-model.js';
import { setClock } from '../src/core/time.js';

const OK = { configured: true, sourceStatus: 'fresh', isStale: false };

function at(iso, fn) {
  setClock(() => Date.parse(iso));
  try { clearModelCache(); return fn(); } finally { setClock(null); }
}

test('a live match outranks an upcoming future match on Home', () => {
  // 2026-07-01, ~13:00 AST: match 80 (12:00) is live; matches 81 (20:00) and 82 (16:00) upcoming.
  const overlay = buildOverlay({
    live: { ...OK, response: [{ home: 'England', away: 'DR Congo', gh: 1, ga: 0, min: 55, status: '2H', kind: 'live', date: '2026-07-01T16:00:00Z' }] },
  });
  const m = at('2026-07-01T13:05:00-04:00', () => homeModel(overlay));
  assert.equal(m.heroKind, 'live');
  assert.equal(m.hero.id, 80, 'live Match 80 wins the stage over the future 20:00 fixture');
  assert.equal(m.liveNow.length, 1);
});

test('with no live match, the next upcoming fixture today is the hero', () => {
  const overlay = buildOverlay({ results: { ...OK, finished: [] } });
  const m = at('2026-07-01T09:00:00-04:00', () => homeModel(overlay));
  assert.equal(m.heroKind, 'upcoming');
  assert.equal(m.hero.id, 80, 'first of today’s three fixtures');
  assert.equal(m.today.length, 3);
});

test('completed matches never outrank live or upcoming ones', () => {
  const overlay = buildOverlay({
    results: { ...OK, finished: [{ home: 'Mexico', away: 'South Africa', gh: 2, ga: 0, status: 'FINISHED', utcDate: '2026-06-11T19:00:00Z' }] },
    live: { ...OK, response: [{ home: 'South Korea', away: 'Czechia', gh: 0, ga: 0, min: 10, status: '1H', kind: 'live', date: '2026-06-11T22:00:00Z' }] },
  });
  const m = at('2026-06-11T18:15:00-04:00', () => homeModel(overlay));
  assert.equal(m.heroKind, 'live');
  assert.notEqual(m.hero.id, 1, 'the finished opener does not hold the stage');
});

test('provider outage keeps the correct fixture with an honest pending state', () => {
  const overlay = buildOverlay({}); // nothing accepted
  const m = at('2026-07-01T13:05:00-04:00', () => homeModel(overlay));
  assert.equal(m.providerState, 'unavailable');
  assert.ok(m.hero, 'hero still exists from canonical schedule');
  assert.equal(m.hero.scoreKnown, false, 'no invented score');
  assert.equal(m.today.length, 3, 'schedule stays official');
});
