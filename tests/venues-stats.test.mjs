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

test('Stats view ranks verified goals and G+A but never a standalone assist board', () => {
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
  // G+A is back: verified fields only, with component copy and honest sourcing.
  assert.match(html, /Goals \+ assists/);
  assert.match(html, /4g · 0a/);
  assert.match(html, /0g · 3a/);
  assert.match(html, /Combined from verified provider goal and assist fields/);
  assert.match(html, /Standalone assist leaders require a complete assist source/);
  // The standalone Assists leaderboard stays off the page.
  assert.doesNotMatch(html, /<h3>Assists<\/h3>/);
});
