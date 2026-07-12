// Persistence whitelist: stale persisted fixtures can never restore fixture
// identity, provider fixtures, standings, live state, or score truth.
import test from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

const LEGACY = {
  'wc26.state': JSON.stringify({ officialFixtures: { 61: { home: 'Switzerland', away: 'Canada', status: 'TIMED' } }, bankroll: 5000 }),
  'wc26.officialKOFixtures': JSON.stringify({ 81: { home: 'USA', away: 'Bosnia' } }),
  'united2026.bets': JSON.stringify([{ stake: 50 }]),
  'wc26.leaderboard': '[]',
  'random-old-key': 'x',
};

test('purgeLegacy removes every non-whitelisted key so stale truth cannot survive boot', async () => {
  globalThis.window = { localStorage: fakeStorage({ ...LEGACY, 'u26v2.prefs': '{"theme":"dark"}' }) };
  const { purgeLegacy, loadPrefs, KEYS } = await import('../src/core/persistence.js');
  const removed = purgeLegacy();
  assert.equal(removed, Object.keys(LEGACY).length);
  const remaining = [...globalThis.window.localStorage._map.keys()];
  assert.deepEqual(remaining, [KEYS.PREFS_KEY]);
  assert.deepEqual(loadPrefs(), { theme: 'dark' });
  delete globalThis.window;
});

test('saved Play/prefs data is sanitized: real-truth field names are stripped', async () => {
  globalThis.window = { localStorage: fakeStorage() };
  const { savePlay, loadPlay, savePrefs, loadPrefs } = await import('../src/core/persistence.js');
  savePlay({
    myWorldCup: { seed: 7, finals: { 90: { gh: 1, ga: 0 } }, nested: { officialFixtures: { 99: 'smuggled' } } },
    officialFixtures: { 61: 'smuggled' },
    standings: { A: [] },
    live: { 80: { gh: 9 } },
    results: {},
    overlay: {},
  });
  const loaded = loadPlay();
  assert.ok(loaded.myWorldCup, 'play namespace persists');
  assert.deepEqual(loaded.myWorldCup.nested, {}, 'forbidden truth is stripped at every depth');
  for (const k of ['officialFixtures', 'standings', 'live', 'results', 'overlay']) {
    assert.ok(!(k in loaded), k + ' must never persist');
  }
  savePrefs({ theme: 'light', fixtures: 'smuggled' });
  assert.deepEqual(loadPrefs(), { theme: 'light' });
  delete globalThis.window;
});

test('saved simulations obey the same truth contract: cleaned at every depth, never deleted for one bad field', async () => {
  globalThis.window = { localStorage: fakeStorage() };
  const { saveSims, loadSims, KEYS } = await import('../src/core/persistence.js');
  const legit = {
    id: 'sim-1', at: '2026-07-01T00:00:00Z', champion: 'MEX', championName: 'Mexico',
    seed: 7, rounds: 5, picks: 12, keepsake: 'unknown fields are preserved',
  };
  const dirty = {
    id: 'sim-2', champion: 'FRA',
    standings: { A: ['smuggled'] },                       // top-level forbidden
    meta: { nested: { live: { 80: { gh: 9 } } } },        // nested forbidden
    history: [{ officialFixtures: { 61: 'x' } }, 'note', 3], // forbidden inside an array
  };
  saveSims({ saved: [legit, dirty, null, 'garbage', 42, undefined] });
  const loaded = loadSims();
  assert.equal(loaded.saved.length, 2, 'legitimate records survive; non-record garbage does not');
  assert.deepEqual(loaded.saved[0], legit, 'a clean record round-trips unchanged, unknown fields included');
  const cleaned = loaded.saved[1];
  assert.equal(cleaned.id, 'sim-2', 'a partially corrupted record is kept, not deleted');
  assert.equal(cleaned.champion, 'FRA');
  assert.ok(!('standings' in cleaned), 'top-level forbidden truth is stripped');
  assert.deepEqual(cleaned.meta, { nested: {} }, 'nested forbidden truth is stripped at depth');
  assert.deepEqual(cleaned.history, [{}, 'note', 3], 'arrays keep legitimate items; forbidden objects are emptied');
  // Round-trip stability: saving exactly what loaded changes nothing.
  saveSims(loaded);
  assert.deepEqual(loadSims(), loaded);
  // A hand-crafted storage blob is sanitized on load too, and the loaded
  // output carries no forbidden field name anywhere at any depth.
  window.localStorage.setItem(KEYS.SIMS_KEY, JSON.stringify({
    saved: [{ id: 'sim-3', overlay: { live: {} }, layers: [[{ scores: [1] }]] }],
    officialFixtures: { 61: 'smuggled beside the array' },
  }));
  const reloaded = loadSims();
  assert.deepEqual(Object.keys(reloaded), ['saved'], 'only the saved namespace exists');
  const scan = JSON.stringify(reloaded);
  for (const k of ['officialFixtures', 'standings', 'live', 'overlay', 'scores', 'results', 'fixtures']) {
    assert.ok(!scan.includes(`"${k}"`), k + ' appears nowhere in loaded sims');
  }
  assert.equal(reloaded.saved[0].id, 'sim-3', 'the record itself still loads');
  delete globalThis.window;
});

test('nothing in the persistence module can feed the real overlay: no imports from provider/truth modules', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/core/persistence.js', import.meta.url), 'utf8');
  assert.ok(!src.includes('provider-overlay'), 'persistence never touches overlay code');
  assert.ok(!src.includes('canonical-truth'), 'persistence never touches truth code');
  // The single allowed import is the static Play catalog (the shared version
  // constant). It must itself import nothing, so persistence transitively
  // still cannot reach provider, network, or real-truth state.
  const imports = [...src.matchAll(/^import .*$/gm)].map((m) => m[0]);
  assert.deepEqual(imports, ["import { PLAY_CATALOG_VERSION } from './play-catalog.js';"],
    'persistence imports exactly the catalog version constant and nothing else');
  const catalog = await readFile(new URL('../src/core/play-catalog.js', import.meta.url), 'utf8');
  assert.ok(!/^import /m.test(catalog), 'the catalog module is a leaf: zero imports');
});
