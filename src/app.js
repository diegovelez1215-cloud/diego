// United 2026 — boot.
// Order matters: purge legacy storage first (stale truth cannot survive a
// boot), seed state from the whitelisted namespaces, paint the canonical-first
// shell immediately (never blank, even offline), then start the provider
// refresh loop. Tab taps never reach the network or storage.

import { purgeLegacy, loadPrefs, loadPlay, loadSims } from './core/persistence.js';
import { getState, setOverlay, setPrefs, setPlay, setSims, subscribe } from './core/app-state.js';
import { buildOverlay } from './core/provider-overlay.js';
import * as router from './navigation/router.js';
import { schedule } from './navigation/render-scheduler.js';
import * as home from './views/home.js';
import * as tournament from './views/tournament.js';
import * as play from './views/play.js';
import * as you from './views/you.js';
import { renderMatchCenter } from './views/match-center.js';
import { todayKey } from './core/time.js';

/* ---------------- provider refresh (never during navigation) ---------------- */

const LIVE_POLL_MS = 60 * 1000;
const IDLE_POLL_MS = 5 * 60 * 1000;
let pollTimer = null;
let refreshing = false;

async function fetchJson(url) {
  try {
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function refreshProviderData() {
  if (refreshing || document.visibilityState === 'hidden') return;
  refreshing = true;
  try {
    const [results, live] = await Promise.all([
      fetchJson('/api/results'),
      fetchJson('/api/live'),
    ]);
    setOverlay(buildOverlay({ results, live }));
  } finally {
    refreshing = false;
    armPoll();
  }
}

function armPoll() {
  clearTimeout(pollTimer);
  const anyLive = [...getState().real.overlay.byFixture.values()].some((o) => o.status === 'live');
  pollTimer = setTimeout(refreshProviderData, anyLive ? LIVE_POLL_MS : IDLE_POLL_MS);
}

/* ---------------- boot ---------------- */

export function boot() {
  purgeLegacy();
  const prefs = loadPrefs();
  setPrefs(prefs);
  setPlay(loadPlay());
  setSims(loadSims());
  if (prefs.theme) document.documentElement.dataset.theme = prefs.theme;

  router.registerView('home', home);
  router.registerView('tournament', tournament);
  router.registerView('play', play);
  router.registerView('you', you);
  router.setVersionKey((id) => {
    const s = getState();
    const v = s.real.overlay.version;
    if (id === 'home') return v + ':' + todayKey();
    if (id === 'tournament') {
      return [v, s.nav.tournamentView, s.nav.matchesDate, s.nav.bracketMode, s.nav.followTeam, todayKey()].join(':');
    }
    if (id === 'play') return 'play:' + s.nav.playMode; // repainted via play/real tags
    return 'you';
  });
  router.init(document.getElementById('app'));

  subscribe((tags) => {
    if (tags.includes('match-center')) schedule('match-center', renderMatchCenter);
    // Live score updates flow into an open Match Center in place.
    if (tags.includes('real') && getState().nav.matchCenterId != null) {
      schedule('match-center', renderMatchCenter);
    }
  });

  refreshProviderData();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshProviderData();
  });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

boot();
