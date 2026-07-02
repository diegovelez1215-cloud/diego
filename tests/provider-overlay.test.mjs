// Provider overlay validation: overlays require a canonical match; stale or
// mismatched provider data is rejected; missing scores preserve identity.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOverlay, payloadAccepted, EMPTY_OVERLAY } from '../src/core/provider-overlay.js';
import { allFixtures, fixture, teamName, winnerFeeds } from '../src/core/canonical-truth.js';
import { fixtureModel, clearModelCache } from '../src/data/tournament-model.js';
import { fullGroupFinished, mockSlots, livePayloadFor } from './mock-provider.mjs';

const OK = { configured: true, sourceStatus: 'fresh', isStale: false };

test('stale-fallback and unconfigured payloads are rejected wholesale', () => {
  assert.equal(payloadAccepted({ ...OK, isStale: true, sourceStatus: 'stale-fallback' }), false);
  assert.equal(payloadAccepted({ configured: false }), false);
  assert.equal(payloadAccepted({ ...OK, sourceStatus: 'error' }), false);
  assert.equal(payloadAccepted({ ...OK, sourceStatus: 'throttled' }), false);
  assert.equal(payloadAccepted({ ...OK }), true);
  assert.equal(payloadAccepted({ ...OK, sourceStatus: 'cache' }), true);
  assert.equal(payloadAccepted({ ...OK, sourceStatus: 'coalesced' }), true);

  const o = buildOverlay({
    results: {
      ...OK, isStale: true, sourceStatus: 'stale-fallback',
      finished: [{ home: 'Mexico', away: 'South Africa', gh: 2, ga: 0, status: 'FINISHED', utcDate: '2026-06-11T19:00:00Z' }],
    },
  });
  assert.equal(o.providerState, 'unavailable');
  assert.equal(o.byFixture.size, 0, 'stale truth never reaches the UI');
});

test('completed group stage resolves every Round-of-32 participant, including best thirds', () => {
  const o = buildOverlay({ results: { ...OK, sourceStatus: 'coalesced', finished: fullGroupFinished(), live: [], hold: [], scheduled: [] } });
  const r32 = allFixtures().filter((f) => f.stage === 'r32');
  assert.equal(r32.length, 16);
  for (const fx of r32) {
    const s = o.slots.get(fx.id);
    assert.ok(s.home, 'home resolved for match ' + fx.id);
    assert.ok(s.away, 'away resolved for match ' + fx.id);
    const m = fixtureModel(fx, o);
    assert.equal(m.home.pending, false, 'no placeholder home for match ' + fx.id);
    assert.equal(m.away.pending, false, 'no placeholder away for match ' + fx.id);
  }
});

test('provider Turkey name resolves canonical Türkiye group outcomes and R32 slots', () => {
  const finished = fullGroupFinished().map((entry) => ({
    ...entry,
    home: entry.home === 'Türkiye' ? 'Turkey' : entry.home,
    away: entry.away === 'Türkiye' ? 'Turkey' : entry.away,
  }));
  const o = buildOverlay({ results: { ...OK, finished, live: [], hold: [], scheduled: [] } });
  const r32 = allFixtures().filter((f) => f.stage === 'r32');
  for (const fx of r32) {
    const s = o.slots.get(fx.id);
    assert.ok(s.home, 'home resolved for match ' + fx.id);
    assert.ok(s.away, 'away resolved for match ' + fx.id);
  }
});

test('resolved live Round-of-32 fixture shows real teams and live score', () => {
  const results = { ...OK, finished: fullGroupFinished(), live: [], hold: [], scheduled: [] };
  const live = livePayloadFor(80, { gh: 2, ga: 1, min: 71 });
  const o = buildOverlay({ results, live });
  const m = fixtureModel(fixture(80), o);
  assert.equal(m.live, true);
  assert.equal(m.scoreKnown, true);
  assert.equal(m.gh, 2);
  assert.equal(m.ga, 1);
  assert.equal(m.home.pending, false);
  assert.equal(m.away.pending, false);
});

test('verified Round-of-32 finals propagate winners into the Round of 16', () => {
  const r32 = allFixtures().find((f) => f.stage === 'r32' && winnerFeeds(f.id));
  const slots = mockSlots();
  const s = slots.get(r32.id);
  const koFinal = {
    home: teamName(s.home),
    away: teamName(s.away),
    gh: 2,
    ga: 1,
    winner: 'HOME_TEAM',
    status: 'FINISHED',
    stage: 'LAST_32',
    utcDate: r32.kickoff,
  };
  const o = buildOverlay({ results: { ...OK, finished: [...fullGroupFinished(), koFinal], live: [], hold: [], scheduled: [] } });
  const feed = winnerFeeds(r32.id);
  const next = o.slots.get(feed.id);
  assert.equal(next[feed.side], s.home);
  const m = fixtureModel(r32, o);
  assert.equal(m.final, true);
  assert.equal(m.winner, 'home');
  assert.equal(m.scoreKnown, true);
});

test('live provider fallback with finished R32 results resolves the same live tie as /api/results', () => {
  const r32 = allFixtures().find((f) => f.stage === 'r32' && f.id === 80);
  const slots = mockSlots();
  const s = slots.get(r32.id);
  const live = {
    ...OK,
    response: [{
      id: 537426,
      home: teamName(s.home),
      away: teamName(s.away),
      gh: 2,
      ga: 1,
      min: null,
      status: 'IN_PLAY',
      kind: 'live',
      date: r32.kickoff,
    }],
    finished: [],
  };
  const o = buildOverlay({ results: { ...OK, finished: fullGroupFinished(), live: [], hold: [], scheduled: [] }, live });
  const m = fixtureModel(r32, o);
  assert.equal(m.live, true);
  assert.equal(m.scoreKnown, true);
  assert.equal(m.home.name, teamName(s.home));
  assert.equal(m.away.name, teamName(s.away));
});

test('a provider final must match a canonical fixture before it can affect anything', () => {
  const good = { home: 'Mexico', away: 'South Africa', gh: 2, ga: 0, status: 'FINISHED', stage: 'GROUP_STAGE', utcDate: '2026-06-11T19:00:00Z' };
  const unknown = { home: 'Atlantis', away: 'El Dorado', gh: 9, ga: 9, status: 'FINISHED', utcDate: '2026-06-11T19:00:00Z' };
  const o = buildOverlay({ results: { ...OK, finished: [good, unknown] } });
  assert.equal(o.byFixture.get(1).status, 'final');
  assert.equal(o.byFixture.get(1).gh, 2);
  assert.equal(o.byFixture.size, 1, 'unmatched provider fixtures are dropped');
  assert.ok(o.rejected >= 1);
});

test('flipped provider orientation is corrected to canonical home/away', () => {
  const flipped = { home: 'South Africa', away: 'Mexico', gh: 0, ga: 2, winner: 'AWAY_TEAM', status: 'FINISHED', utcDate: '2026-06-11T19:00:00Z' };
  const o = buildOverlay({ results: { ...OK, finished: [flipped] } });
  const ov = o.byFixture.get(1);
  assert.equal(ov.gh, 2); assert.equal(ov.ga, 0); assert.equal(ov.winner, 'home');
});

test('live knockout fixture with unresolved slots: status attaches, score is SUPPRESSED', () => {
  // Match 80: 2026-07-01 12:00 AST (16:00Z). Provider says England–DR Congo live,
  // but group results are unavailable so the slots are unresolved. TRUTH RULE:
  // an unresolved placeholder stays scoreless — live status and clock only.
  const live = {
    response: [{ home: 'England', away: 'DR Congo', gh: 1, ga: 0, min: 63, status: '2H', kind: 'live', date: '2026-07-01T16:00:00Z' }],
  };
  const o = buildOverlay({ live: { ...OK, ...live } });
  const ov = o.byFixture.get(80);
  assert.ok(ov, 'live overlay attached to canonical match 80');
  assert.equal(ov.status, 'live');
  assert.equal(ov.gh, null, 'no score beside an unresolved slot');
  assert.equal(ov.ga, null);
  assert.equal(ov.min, 63, 'clock may attach');
  clearModelCache();
  const m = fixtureModel(fixture(80), o);
  assert.equal(m.live, true);
  assert.equal(m.home.pending, true);
  assert.equal(m.scoreKnown, false);
  assert.match(m.home.name, /Group L winners/);
});

test('a provider FINAL that cannot match by identity is rejected — never shown beside a placeholder', () => {
  // Kickoff window matches fixture 80, but with no group results the slots are
  // unresolved, so a FINAL result has no identity to attach to. It must be
  // rejected wholesale, not displayed.
  const results = {
    ...OK,
    finished: [{ home: 'England', away: 'DR Congo', gh: 2, ga: 1, winner: 'HOME_TEAM', status: 'FINISHED', utcDate: '2026-07-01T16:00:00Z' }],
  };
  const o = buildOverlay({ results });
  assert.equal(o.byFixture.has(80), false, 'no final overlay on an unresolved tie');
  assert.ok(o.rejected >= 1);
  clearModelCache();
  const m = fixtureModel(fixture(80), o);
  assert.equal(m.final, false);
  assert.equal(m.scoreKnown, false);
  assert.equal(m.gh, null);
});

test('a provider fixture with a conflicting kickoff matches nothing and is rejected', () => {
  const live = {
    response: [{ home: 'Ruritania', away: 'Freedonia', gh: 3, ga: 3, min: 88, status: '2H', kind: 'live', date: '2026-07-01T03:33:00Z' }],
  };
  const o = buildOverlay({ live: { ...OK, ...live } });
  assert.equal(o.byFixture.size, 0);
  assert.equal(o.rejected, 1);
});

test('missing provider scores preserve fixture identity with an honest pending state', () => {
  const o = buildOverlay({ results: { ...OK, finished: [], live: [], hold: [], scheduled: [] } });
  clearModelCache();
  const m = fixtureModel(fixture(1), o);
  assert.equal(m.home.name, 'Mexico');
  assert.equal(m.away.name, 'South Africa');
  assert.equal(m.scoreKnown, false);
  assert.equal(m.status, 'scheduled');
  // and a live match with null goals keeps identity + live status, no fake score
  const o2 = buildOverlay({ live: { ...OK, response: [{ home: 'Mexico', away: 'South Africa', gh: null, ga: null, min: 12, status: '1H', kind: 'live', date: '2026-06-11T19:00:00Z' }] } });
  const m2 = fixtureModel(fixture(1), o2);
  assert.equal(m2.live, true);
  assert.equal(m2.scoreKnown, false);
  assert.equal(m2.home.name, 'Mexico', 'never replaced by another fixture');
});

test('finality wins over a lagging live feed for the same fixture', () => {
  const results = { ...OK, finished: [{ home: 'Mexico', away: 'South Africa', gh: 2, ga: 0, status: 'FINISHED', utcDate: '2026-06-11T19:00:00Z' }] };
  const live = { ...OK, response: [{ home: 'Mexico', away: 'South Africa', gh: 1, ga: 0, min: 90, status: '2H', kind: 'live', date: '2026-06-11T19:00:00Z' }] };
  const o = buildOverlay({ results, live });
  assert.equal(o.byFixture.get(1).status, 'final');
  assert.equal(o.byFixture.get(1).gh, 2);
});

test('EMPTY_OVERLAY is safe: no provider state, no scores, full canonical schedule', () => {
  assert.equal(EMPTY_OVERLAY.byFixture.size, 0);
  assert.equal(EMPTY_OVERLAY.providerState, 'unavailable');
});
