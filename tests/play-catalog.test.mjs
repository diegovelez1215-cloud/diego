import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAY_CATALOG_VERSION, PLAY_MODES, RETIRED_MODES, playRailModes, playMode } from '../src/core/play-catalog.js';
import { migratePlayState } from '../src/core/persistence.js';

test('Play catalog has one canonical label per route and six primary destinations', () => {
  assert.equal(new Set(PLAY_MODES.map((mode) => mode.id)).size, PLAY_MODES.length);
  assert.equal(new Set(PLAY_MODES.map((mode) => mode.label)).size, PLAY_MODES.length);
  assert.equal(PLAY_MODES.filter((mode) => mode.primary).length, 6);
});

test('campaign and tactical modes are contextual, never equal top-level tabs', () => {
  const lobby = playRailModes('lobby');
  assert.ok(!lobby.some((mode) => mode.id === 'cup'));
  assert.ok(!lobby.some((mode) => mode.id === 'coach'));
  const cup = playRailModes('cup');
  assert.equal(cup[1].id, 'cup');
  assert.equal(cup.filter((mode) => mode.id === 'cup').length, 1);
});

test('Shot Lab is retired: not in the catalog, and its route falls back to the lobby', () => {
  assert.ok(RETIRED_MODES.includes('shotlab'));
  assert.ok(!PLAY_MODES.some((mode) => mode.id === 'shotlab'));
  assert.equal(playMode('shotlab').id, 'lobby', 'a stale deep link lands safely in the lobby');
  assert.ok(!playRailModes('shotlab').some((mode) => mode.id === 'shotlab'));
});

test('Rondo is the flagship skill destination in the rail', () => {
  const rail = playRailModes('lobby');
  assert.ok(rail.some((mode) => mode.id === 'rondo' && mode.label === 'Rondo'));
  assert.equal(playMode('rondo').group, 'skill');
});

test('v1 Play records migrate losslessly and migration is idempotent', () => {
  const old = {
    side: { code: 'USA' }, penaltyRush: { bestEver: 7 }, finalMinute: { w: 3 },
    coachCall: { played: 4 }, arcadeCup: { done: true }, cupHistory: [{ wins: 4 }],
    shotLab: { bestScore: 900 }, myWorldCup: { champion: 'USA' }, picks: { 1: { side: 'home' } },
  };
  const next = migratePlayState(old);
  assert.equal(next.catalogVersion, PLAY_CATALOG_VERSION);
  for (const key of Object.keys(old)) {
    if (key === 'shotLab') continue; // relocated, not lost — asserted below
    assert.deepEqual(next[key], old[key], key);
  }
  assert.equal(migratePlayState(next), next);
});

test('a retired Shot Lab record moves to the legacy shelf, labelled and intact', () => {
  const old = {
    catalogVersion: 2,
    shotLab: { played: 40, bestTimed: 6100, bestPractice: 5200, bestAccuracy: 91, bestCombo: 5, last: { seed: 9, score: 6100 } },
    legacy: { catalogV1: { migratedAt: 'x', modeAliases: {} } },
  };
  const next = migratePlayState(old);
  assert.equal(next.catalogVersion, PLAY_CATALOG_VERSION);
  assert.equal(next.shotLab, undefined, 'the live namespace is retired');
  assert.deepEqual(next.legacy.shotLab.record, old.shotLab, 'the record survives byte-for-byte');
  assert.equal(next.legacy.shotLab.retired, true);
  assert.equal(next.legacy.shotLab.game, 'Shot Lab');
  assert.ok(next.legacy.catalogV1, 'earlier migration history is preserved');
  assert.ok(next.legacy.catalogV2.retiredModes.includes('shotlab'));
});

test('old scores are never rebadged as Rondo scores', () => {
  const next = migratePlayState({ catalogVersion: 2, shotLab: { bestTimed: 9000 } });
  assert.equal(next.rondo, undefined, 'migration seeds no Rondo record from Shot Lab data');
});

test('empty, partial, and corrupted saves migrate without crashing', () => {
  assert.equal(migratePlayState({}).catalogVersion, PLAY_CATALOG_VERSION);
  assert.equal(migratePlayState(null).catalogVersion, PLAY_CATALOG_VERSION);
  assert.equal(migratePlayState('garbage').catalogVersion, PLAY_CATALOG_VERSION);
  assert.equal(migratePlayState([1, 2, 3]).catalogVersion, PLAY_CATALOG_VERSION);
  const weird = migratePlayState({ catalogVersion: 2, shotLab: 42 });
  assert.equal(weird.catalogVersion, PLAY_CATALOG_VERSION);
  assert.equal(weird.legacy.shotLab, undefined, 'a corrupt scalar record is dropped, not enshrined');
  assert.equal(weird.shotLab, undefined);
  const partial = migratePlayState({ penaltyRush: { bestEver: 3 } });
  assert.deepEqual(partial.penaltyRush, { bestEver: 3 });
  // double migration from v1 straight through v3 stays stable
  const twice = migratePlayState(migratePlayState({ shotLab: { played: 1 } }));
  assert.equal(twice.catalogVersion, PLAY_CATALOG_VERSION);
  assert.equal(twice.legacy.shotLab.record.played, 1);
});
