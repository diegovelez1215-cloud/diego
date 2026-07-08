import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { buildOverlay } from '../src/core/provider-overlay.js';
import { allFixtures } from '../src/core/canonical-truth.js';
import { renderVenues } from '../src/views/venues.js';
import { renderStats } from '../src/views/stats.js';
import { fullGroupFinished } from './mock-provider.mjs';

const OK = { configured: true, sourceStatus: 'fresh', isStale: false };

test('Venue explorer renders stadium match lists in chronological order', () => {
  const overlay = buildOverlay({ results: { ...OK, finished: fullGroupFinished(), live: [], hold: [], scheduled: [] } });
  const dom = new JSDOM(renderVenues(overlay));
  const firstCard = dom.window.document.querySelector('.venue-card');
  assert.ok(firstCard);
  const ids = [...firstCard.querySelectorAll('[data-match]')].map((el) => Number(el.getAttribute('data-match')));
  const venueName = firstCard.querySelector('h3').textContent;
  assert.ok(venueName.length > 3);
  const epochs = ids.map((id) => allFixtures().find((f) => f.id === id).epoch);
  assert.deepEqual(epochs, [...epochs].sort((a, b) => a - b), 'venue fixtures are chronological');
});

test('Stats view uses verified player feed and never ranks unprovable assists', () => {
  const overlay = buildOverlay({ results: { ...OK, finished: fullGroupFinished(), live: [], hold: [], scheduled: [] } });
  const html = renderStats(overlay, {
    providerState: 'ok',
    fetchedAt: '2026-07-02T02:03:56.957Z',
    goals: [{ player: 'A Player', team: 'Mexico', n: 4 }],
    assists: [{ player: 'B Creator', team: 'Japan', n: 3 }],
  });
  assert.match(html, /A Player/);
  assert.match(html, /Team goals/);
  assert.match(html, /Clean sheets/);
  // Provider assists exist on scorer rows only — they must never surface as
  // a leaderboard, and the page explains why in calm copy.
  assert.doesNotMatch(html, /<h3>Assists<\/h3>/);
  assert.doesNotMatch(html, /Goals \+ assists/);
  assert.doesNotMatch(html, /B Creator/);
  assert.match(html, /Complete assist leaders are unavailable from the verified provider/);
});
