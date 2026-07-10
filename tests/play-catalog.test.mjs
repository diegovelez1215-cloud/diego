import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAY_CATALOG_VERSION, PLAY_MODES, playRailModes } from '../src/core/play-catalog.js';
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

test('v1 Play records migrate losslessly and migration is idempotent', () => {
  const old = {
    side: { code: 'USA' }, penaltyRush: { bestEver: 7 }, finalMinute: { w: 3 },
    coachCall: { played: 4 }, arcadeCup: { done: true }, cupHistory: [{ wins: 4 }],
    shotLab: { bestScore: 900 }, myWorldCup: { champion: 'USA' }, picks: { 1: { side: 'home' } },
  };
  const next = migratePlayState(old);
  assert.equal(next.catalogVersion, PLAY_CATALOG_VERSION);
  for (const key of Object.keys(old)) assert.deepEqual(next[key], old[key], key);
  assert.equal(migratePlayState(next), next);
});
