// The graphical bracket: complete structure, correct connections, honest
// unresolved chips, and the hard truth rule that a score can never render
// beside a placeholder.
import test from 'node:test';
import assert from 'node:assert/strict';

import { bracketHTML, teamRoute, CANVAS } from '../src/components/bracket.js';
import { buildOverlay } from '../src/core/provider-overlay.js';
import { winnerFeeds } from '../src/core/canonical-truth.js';
import { FIXTURES } from '../src/data/fixtures.js';
import { fullResultsPayload, mockSlots, OK } from './mock-provider.mjs';

function count(html, needle) { return html.split(needle).length - 1; }

test('bracket structure: 16 R32 + 8 R16 + 4 QF + 2 SF + final + third place, all drawn', () => {
  const overlay = buildOverlay({ results: { ...OK, finished: [] } });
  const world = { slots: overlay.slots, results: overlay.byFixture, mode: 'real' };
  const html = bracketHTML(world);
  assert.equal(count(html, 'bk-card r32'), 16);
  assert.equal(count(html, 'bk-card r16'), 8);
  assert.equal(count(html, 'bk-card qf'), 4);
  assert.equal(count(html, 'bk-card sf'), 2);
  assert.equal(count(html, 'bk-card final'), 1);
  assert.equal(count(html, 'bk-card bronze'), 1);
  for (let id = 73; id <= 104; id++) assert.ok(html.includes(`data-bkid="${id}"`), 'card ' + id);
});

test('every advancing edge is drawn as a connector; bracket order follows edges, not kickoff time', () => {
  const overlay = buildOverlay({ results: { ...OK, finished: [] } });
  const world = { slots: overlay.slots, results: overlay.byFixture, mode: 'real' };
  const html = bracketHTML(world);
  const winnerEdges = FIXTURES.filter((f) => f.stage !== 'group' && winnerFeeds(f.id)).length;
  assert.equal(winnerEdges, 30, '16+8+4+2 winner edges');
  assert.equal(count(html, 'class="bk-link"') + count(html, 'class="bk-link on"'), 30, 'one connector per edge');
  assert.equal(count(html, 'bk-link loser'), 2, 'both semifinal losers feed third place');
  assert.ok(CANVAS.width > 1000 && CANVAS.height > 1300, 'canvas holds the full tree');
});

test('unresolved slots are informative chips — never blank, never scored', () => {
  const overlay = buildOverlay({ results: { ...OK, finished: [] } });
  const world = { slots: overlay.slots, results: overlay.byFixture, mode: 'real' };
  const html = bracketHTML(world);
  assert.ok(html.includes('Group A winners'));
  assert.ok(/Best third \([A-L/]+\)/.test(html));
  assert.ok(html.includes('Winner, Match 89'));
  assert.equal(count(html, 'bk-goals'), 0, 'zero scores in a fully unresolved bracket');
  assert.equal(count(html, 'bk-name"></span>'), 0, 'no empty name boxes');
});

test('IMPOSSIBLE STATE GUARD: a result forced beside an unresolved slot still renders scoreless', () => {
  const overlay = buildOverlay({ results: { ...OK, finished: [] } });
  // adversarial world: a "final" result exists for match 80 although its slots are unresolved
  const results = new Map([[80, { gh: 2, ga: 1, winner: 'home', status: 'final' }]]);
  const world = { slots: overlay.slots, results, mode: 'real' };
  const html = bracketHTML(world);
  assert.equal(count(html, 'bk-goals'), 0, 'pending sides never show goals');
  assert.ok(html.includes('Group L winners'), 'chip label intact');
});

test('resolved world: scores render, winners advance, follow-a-team lights a real route', () => {
  const overlay = buildOverlay({ results: fullResultsPayload() });
  const slots = overlay.slots;
  // every R32 slot resolves in the mock world
  for (let id = 73; id <= 88; id++) {
    const s = slots.get(id);
    assert.ok(s.home && s.away, 'R32 tie ' + id + ' resolved');
  }
  const world = { slots, results: overlay.byFixture, mode: 'real' };
  // pick a team that made the knockouts and follow it
  const someTeam = slots.get(80).home;
  const route = teamRoute(world, someTeam);
  assert.ok(route.has(80), "the team's own tie is lit");
  const feed = winnerFeeds(80);
  assert.ok(route.has(feed.id), 'potential next round is lit');
  const html = bracketHTML(world, { follow: someTeam });
  assert.ok(count(html, ' dim') >= 20, 'unrelated ties fall into shadow');
  assert.ok(count(html, ' lit') >= 2, 'the route is illuminated');
});

test('sim mode marks only fully resolved undecided ties as pickable', () => {
  const overlay = buildOverlay({ results: fullResultsPayload() });
  const world = { slots: overlay.slots, results: new Map(), mode: 'sim' };
  const html = bracketHTML(world);
  assert.equal(count(html, 'pickable'), 16, 'all 16 resolved R32 ties are pickable');
  assert.ok(html.includes('tap to pick'));
  // R16 has unresolved participants — never pickable
  assert.ok(!/data-bkid="89"[^>]*pickable/.test(html));
});

test('mock world sanity: slots derive only from finals', () => {
  const slots = mockSlots();
  assert.ok(slots.get(73).home && slots.get(104).home === null);
});
