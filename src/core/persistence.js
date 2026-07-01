// United 2026 — persistence.
// localStorage stores ONLY: UI preferences, Play state, saved simulations.
// It must never store or restore real fixture identity, provider fixtures,
// standings, live state, or score truth. Boot purges everything else.

const PREFS_KEY = 'u26v2.prefs';
const PLAY_KEY = 'u26v2.play';
const SIMS_KEY = 'u26v2.sims';
const WHITELIST = new Set([PREFS_KEY, PLAY_KEY, SIMS_KEY]);

function storage() {
  try { return window.localStorage; } catch { return null; }
}

/** Remove every key that is not on the whitelist. Stale truth cannot survive. */
export function purgeLegacy() {
  const ls = storage();
  if (!ls) return 0;
  const doomed = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k && !WHITELIST.has(k)) doomed.push(k);
  }
  doomed.forEach((k) => { try { ls.removeItem(k); } catch { /* ignore */ } });
  return doomed.length;
}

function read(key, fallback) {
  const ls = storage();
  if (!ls) return fallback;
  try {
    const raw = ls.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : fallback;
  } catch { return fallback; }
}

function write(key, value) {
  const ls = storage();
  if (!ls) return;
  try { ls.setItem(key, JSON.stringify(value)); } catch { /* quota — non-fatal */ }
}

// Keys that would smuggle real-tournament truth into storage are stripped.
const FORBIDDEN_FIELDS = ['fixtures', 'officialFixtures', 'standings', 'results',
  'live', 'overlay', 'providerFixtures', 'koFixtures', 'scores'];
function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const clean = { ...obj };
  for (const f of FORBIDDEN_FIELDS) delete clean[f];
  return clean;
}

// Sanitize on save AND on load: even a hand-crafted storage blob cannot carry
// real-truth field names into memory.
export function loadPrefs() { return sanitize(read(PREFS_KEY, {})); }
export function savePrefs(prefs) { write(PREFS_KEY, sanitize(prefs)); }

export function loadPlay() { return sanitize(read(PLAY_KEY, {})); }
export function savePlay(play) { write(PLAY_KEY, sanitize(play)); }

export function loadSims() { const v = read(SIMS_KEY, { saved: [] }); return Array.isArray(v.saved) ? v : { saved: [] }; }
export function saveSims(sims) { write(SIMS_KEY, { saved: Array.isArray(sims.saved) ? sims.saved.slice(0, 50) : [] }); }

export const KEYS = Object.freeze({ PREFS_KEY, PLAY_KEY, SIMS_KEY });
