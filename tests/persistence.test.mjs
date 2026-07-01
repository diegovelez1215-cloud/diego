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
    myWorldCup: { seed: 7, finals: { 90: { gh: 1, ga: 0 } } },
    officialFixtures: { 61: 'smuggled' },
    standings: { A: [] },
    live: { 80: { gh: 9 } },
    results: {},
    overlay: {},
  });
  const loaded = loadPlay();
  assert.ok(loaded.myWorldCup, 'play namespace persists');
  for (const k of ['officialFixtures', 'standings', 'live', 'results', 'overlay']) {
    assert.ok(!(k in loaded), k + ' must never persist');
  }
  savePrefs({ theme: 'light', fixtures: 'smuggled' });
  assert.deepEqual(loadPrefs(), { theme: 'light' });
  delete globalThis.window;
});

test('nothing in the persistence module can feed the real overlay: no imports from provider/truth modules', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/core/persistence.js', import.meta.url), 'utf8');
  assert.ok(!src.includes('provider-overlay'), 'persistence never touches overlay code');
  assert.ok(!src.includes('canonical-truth'), 'persistence never touches truth code');
  assert.ok(!src.includes("import"), 'persistence has zero imports — it cannot reach real state');
});
