// Cached view models: valid caches avoid repeated expensive preparation, and
// canonical updates invalidate only affected real views.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOverlay } from '../src/core/provider-overlay.js';
import {
  homeModel, matchesModel, groupsModel, knockoutModel, stats, clearModelCache,
} from '../src/data/tournament-model.js';
import { setClock } from '../src/core/time.js';

const OK = { configured: true, sourceStatus: 'fresh', isStale: false };

test('same overlay version: repeated reads never recompute', () => {
  setClock(() => Date.parse('2026-07-01T13:00:00-04:00'));
  try {
    clearModelCache();
    const overlay = buildOverlay({ results: { ...OK, finished: [] } });
    homeModel(overlay); matchesModel(overlay); groupsModel(overlay); knockoutModel(overlay);
    const after = stats.computes;
    assert.equal(after, 4);
    for (let i = 0; i < 20; i++) {
      homeModel(overlay); matchesModel(overlay); groupsModel(overlay); knockoutModel(overlay);
    }
    assert.equal(stats.computes, after, 'no recomputation for a valid cache');
  } finally { setClock(null); }
});

test('a canonical/overlay update invalidates real views — model output actually changes', () => {
  setClock(() => Date.parse('2026-06-12T10:00:00-04:00'));
  try {
    clearModelCache();
    const o1 = buildOverlay({ results: { ...OK, finished: [] } });
    const g1 = groupsModel(o1);
    assert.equal(g1.find((g) => g.group === 'A').rows.every((r) => r.p === 0), true);
    const o2 = buildOverlay({
      results: { ...OK, finished: [{ home: 'Mexico', away: 'South Africa', gh: 2, ga: 0, status: 'FINISHED', utcDate: '2026-06-11T19:00:00Z' }] },
    });
    assert.notEqual(o2.version, o1.version, 'update bumps the version');
    const g2 = groupsModel(o2);
    const mex = g2.find((g) => g.group === 'A').rows.find((r) => r.code === 'MEX');
    assert.equal(mex.pts, 3, 'invalidated view reflects the new final');
  } finally { setClock(null); }
});
