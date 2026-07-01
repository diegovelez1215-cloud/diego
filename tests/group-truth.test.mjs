// Group tables must never look final while the underlying data is incomplete,
// and qualification markers appear only when they are settled.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOverlay } from '../src/core/provider-overlay.js';
import { renderGroups } from '../src/views/groups.js';
import { thirdPlaceTable } from '../src/core/canonical-truth.js';
import { clearModelCache } from '../src/data/tournament-model.js';
import { fullResultsPayload, OK } from './mock-provider.mjs';

test('an untouched group says "Not started" — no Final label, no qualification marks', () => {
  clearModelCache();
  const overlay = buildOverlay({ results: { ...OK, finished: [] } });
  const html = renderGroups(overlay);
  assert.equal(html.split('Not started').length - 1, 12, 'all 12 groups honest');
  assert.ok(!html.includes('>Final<'), 'no group pretends to be final');
  assert.ok(!html.includes('q-mark in'), 'no advance marks without truth');
});

test('a partially played group reports exactly how much is played', () => {
  clearModelCache();
  const overlay = buildOverlay({
    results: { ...OK, finished: [{ home: 'Mexico', away: 'South Africa', gh: 2, ga: 0, status: 'FINISHED', utcDate: '2026-06-11T19:00:00Z' }] },
  });
  const html = renderGroups(overlay);
  assert.ok(html.includes('1 of 6 played'), 'progress is stated, not implied');
  assert.ok(!html.includes('>Final<'));
});

test('complete groups get Final labels, Q marks for the top two, and third-place truth', () => {
  clearModelCache();
  const overlay = buildOverlay({ results: fullResultsPayload() });
  const html = renderGroups(overlay);
  assert.equal(html.split('>Final<').length - 1, 12, 'all 12 groups final in the mock world');
  assert.equal(html.split('q-mark in').length - 1, 24, 'two advancing teams per group');
  const thirds = thirdPlaceTable(overlay.standings);
  assert.equal(thirds.decided, true);
  assert.equal(thirds.rows.filter((r) => r.qualified).length, 8, 'exactly eight best thirds');
  assert.equal(html.split('q-mark third').length - 1, 8, 'eight q3 marks');
});

test('third-place table stays provisional while any group is open', () => {
  const overlay = buildOverlay({
    results: { ...OK, finished: [{ home: 'Mexico', away: 'South Africa', gh: 2, ga: 0, status: 'FINISHED', utcDate: '2026-06-11T19:00:00Z' }] },
  });
  const thirds = thirdPlaceTable(overlay.standings);
  assert.equal(thirds.decided, false);
  assert.ok(thirds.rows.every((r) => !r.qualified), 'nobody is "qualified" early');
});
