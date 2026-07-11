// United 2026 — persistence.
// localStorage stores ONLY: UI preferences, Play state, saved simulations.
// It must never store or restore real fixture identity, provider fixtures,
// standings, live state, or score truth. Boot purges everything else.

const PREFS_KEY = 'u26v2.prefs';
const PLAY_KEY = 'u26v2.play';
const SIMS_KEY = 'u26v2.sims';
// Auth session credentials for the global leaderboard (core/leaderboard.js).
// Credentials only — never fixtures, scores, standings, or official truth.
const AUTH_KEY = 'u26v2.auth';
const WHITELIST = new Set([PREFS_KEY, PLAY_KEY, SIMS_KEY, AUTH_KEY]);

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

// Keys that would smuggle real-tournament truth into storage are stripped,
// plus retired feature namespaces (the removed Club League profile store).
const FORBIDDEN_FIELDS = ['fixtures', 'officialFixtures', 'standings', 'results',
  'live', 'overlay', 'providerFixtures', 'koFixtures', 'scores', 'club'];
function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const clean = { ...obj };
  for (const f of FORBIDDEN_FIELDS) delete clean[f];
  return clean;
}

// Single source of truth for the catalog version — imported, never copied.
import { PLAY_CATALOG_VERSION } from './play-catalog.js';

/* Staged, versioned Play migrations. Each step is additive-or-relocating,
   never destructive: retired game records move to a readable legacy shelf,
   tagged with what they were, and no trophy, best, history or side is lost.
   Every step must stay idempotent (running twice changes nothing). */
export function migratePlayState(value) {
  let play = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const version = Number(play.catalogVersion) || 1;
  if (version >= PLAY_CATALOG_VERSION) return play;
  if (version < 2) {
    play = {
      ...play,
      catalogVersion: 2,
      legacy: {
        ...(play.legacy || {}),
        catalogV1: {
          migratedAt: new Date().toISOString(),
          modeAliases: { shots: 'shotlab', rush: 'shootout', lab: 'lab', coach: 'coach', mycup: 'myworldcup', predict: 'prediction' },
        },
      },
    };
  }
  if (Number(play.catalogVersion) < 3) {
    // v3: Shot Lab is retired. Its record moves — losslessly and labelled —
    // to the legacy shelf. It is never merged into Rondo: old scores belong
    // to the old game.
    const { shotLab, ...rest } = play;
    const hadShotLab = shotLab && typeof shotLab === 'object' && !Array.isArray(shotLab);
    play = {
      ...rest,
      catalogVersion: 3,
      legacy: {
        ...(rest.legacy || {}),
        catalogV2: {
          migratedAt: new Date().toISOString(),
          retiredModes: ['shotlab'],
        },
        ...(hadShotLab ? { shotLab: { game: 'Shot Lab', retired: true, record: shotLab } } : {}),
      },
    };
  }
  return play;
}

// Sanitize on save AND on load: even a hand-crafted storage blob cannot carry
// real-truth field names into memory.
export function loadPrefs() { return sanitize(read(PREFS_KEY, {})); }
export function savePrefs(prefs) { write(PREFS_KEY, sanitize(prefs)); }

export function loadPlay() {
  const migrated = migratePlayState(sanitize(read(PLAY_KEY, {})));
  write(PLAY_KEY, migrated);
  return migrated;
}
export function savePlay(play) { write(PLAY_KEY, sanitize(migratePlayState(play))); }

export function loadSims() { const v = read(SIMS_KEY, { saved: [] }); return Array.isArray(v.saved) ? v : { saved: [] }; }
export function saveSims(sims) { write(SIMS_KEY, { saved: Array.isArray(sims.saved) ? sims.saved.slice(0, 50) : [] }); }

export const KEYS = Object.freeze({ PREFS_KEY, PLAY_KEY, SIMS_KEY, AUTH_KEY });
