// Matches, Groups, Knockout, and Match Center render correct validated truth.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOverlay } from '../src/core/provider-overlay.js';
import { renderMatches } from '../src/views/matches.js';
import { renderGroups } from '../src/views/groups.js';
import { renderKnockout } from '../src/views/knockout.js';
import { matchCenterModel, clearModelCache } from '../src/data/tournament-model.js';
import { setClock } from '../src/core/time.js';

const OK = { configured: true, sourceStatus: 'fresh', isStale: false };

function at(iso, fn) {
  setClock(() => Date.parse(iso));
  try { clearModelCache(); return fn(); } finally { setClock(null); }
}

test('Matches (Today) lists each of today’s canonical fixtures exactly once', () => {
  const overlay = buildOverlay({ results: { ...OK, finished: [] } });
  const html = at('2026-07-01T10:00:00-04:00', () => renderMatches(overlay));
  for (const id of [80, 81, 82]) {
    const hits = html.split(`data-match="${id}"`).length - 1;
    assert.equal(hits, 1, `match ${id} appears exactly once`);
  }
  assert.ok(!html.includes('data-match="79"'), 'yesterday’s fixture is not in Today');
});

test('Groups renders validated standings and honest empties', () => {
  const overlay = buildOverlay({
    results: { ...OK, finished: [{ home: 'Mexico', away: 'South Africa', gh: 2, ga: 0, status: 'FINISHED', utcDate: '2026-06-11T19:00:00Z' }] },
  });
  const html = at('2026-06-12T10:00:00-04:00', () => renderGroups(overlay));
  assert.ok(html.includes('Group A'));
  assert.ok(html.includes('Mexico'));
  assert.ok(html.includes('Best thirds'), 'third-place race lives with Groups');
  const noData = buildOverlay({});
  const html2 = at('2026-06-12T10:00:00-04:00', () => renderGroups(noData));
  assert.ok(html2.includes('temporarily unavailable'), 'outage is stated honestly');
});

test('Knockout renders the complete graphical bracket: every KO match, all rounds, honest chips', () => {
  const overlay = buildOverlay({ results: { ...OK, finished: [] } });
  const html = at('2026-07-01T10:00:00-04:00', () => renderKnockout(overlay));
  for (let id = 73; id <= 104; id++) assert.ok(html.includes(`data-bkid="${id}"`), 'bracket card for match ' + id);
  for (const name of ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Final', 'Third-place Match']) {
    assert.ok(html.includes(name), name + ' column present');
  }
  assert.ok(html.includes('bk-links'), 'connector layer present');
  assert.ok(html.includes('Group L winners'), 'pending slots are honest chips, never blank');
  assert.ok(html.includes('ko-follow-rail'), 'Follow a Team is the default delight mode');
  assert.ok(!/bk-goals/.test(html), 'no scores anywhere while every slot is unresolved');
});

test('Match Center honors truth on a live unresolved tie: status yes, score no', () => {
  const overlay = buildOverlay({
    live: { ...OK, response: [{ home: 'England', away: 'DR Congo', gh: 1, ga: 0, min: 70, status: '2H', kind: 'live', date: '2026-07-01T16:00:00Z' }] },
  });
  const m = at('2026-07-01T13:00:00-04:00', () => matchCenterModel(80, overlay));
  assert.equal(m.live, true);
  assert.equal(m.gh, null, 'unresolved identity → scoreless');
  assert.equal(m.scoreKnown, false);
  assert.equal(m.stageName, 'Round of 32');
  assert.equal(m.venueCity, 'Atlanta');
  assert.ok(m.feeds, 'consequence edge exists');
});
