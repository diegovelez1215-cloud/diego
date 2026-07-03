// United 2026 — boot.
// Order matters: purge legacy storage first (stale truth cannot survive a
// boot), seed state from the whitelisted namespaces, paint the canonical-first
// shell immediately (never blank, even offline), then start the provider
// refresh loop. Tab taps never reach the network or storage.

import { purgeLegacy, loadPrefs, loadPlay, loadSims } from './core/persistence.js';
import { pollDelay, snapshotDue, scorersDue } from './core/refresh-policy.js';
import { getState, setOverlay, setPrefs, setPlay, setSims, setStats, subscribe } from './core/app-state.js';
import { buildOverlay } from './core/provider-overlay.js';
import * as router from './navigation/router.js';
import { schedule } from './navigation/render-scheduler.js';
import * as home from './views/home.js';
import * as tournament from './views/tournament.js';
import * as play from './views/play.js';
import * as you from './views/you.js';
import { renderMatchCenter } from './views/match-center.js';
import { todayKey } from './core/time.js';

/* ---------------- provider refresh (never during navigation) ----------------
   Usage protection: one shared in-memory snapshot, duplicate refreshes
   coalesced behind a single in-flight flag, fast polling only while a
   validated match is live and the app is visible, no polling at all in a
   hidden tab, scorer stats on a much longer clock, and a visibility return
   that refreshes only when the snapshot is genuinely due. */

let pollTimer = null;
let refreshing = false;
let lastSnapshotAt = 0;  // in-memory only — official data never touches storage
let lastScorersAt = 0;

async function fetchJson(url) {
  try {
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function anyLiveNow() {
  return [...getState().real.overlay.byFixture.values()].some((o) => o.status === 'live');
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
    lastSnapshotAt = Date.now();
    // Player stats move slowly — refresh them on their own, longer clock.
    if (scorersDue(Date.now(), lastScorersAt)) {
      const scorerStats = await fetchJson('/api/scorers');
      if (scorerStats) lastScorersAt = Date.now();
      if (scorerStats && scorerStats.configured !== false && scorerStats.isStale !== true) {
        setStats({
          providerState: scorerStats.sourceStatus || 'ok',
          fetchedAt: scorerStats.fetchedAt || null,
          goals: Array.isArray(scorerStats.goals) ? scorerStats.goals : [],
          assists: Array.isArray(scorerStats.assists) ? scorerStats.assists : [],
        });
      } else {
        setStats({ providerState: 'unavailable', fetchedAt: scorerStats && scorerStats.fetchedAt || null, goals: [], assists: [] });
      }
    }
  } finally {
    refreshing = false;
    armPoll();
  }
}

function armPoll() {
  clearTimeout(pollTimer);
  if (document.visibilityState === 'hidden') return; // hidden tabs do not poll
  pollTimer = setTimeout(refreshProviderData, pollDelay(anyLiveNow()));
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
      return [v, s.real.stats.fetchedAt || '', s.nav.tournamentView, s.nav.matchesDate, s.nav.bracketMode, s.nav.followTeam, todayKey()].join(':');
    }
    if (id === 'play') return 'play:' + s.nav.playMode; // repainted via play/real tags
    return ['you', s.nav.youView, s.nav.boardTab, s.nav.boardScope,
      s.board.status, s.board.fetchedAt, v].join(':');
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
    if (document.visibilityState === 'hidden') { clearTimeout(pollTimer); return; }
    // Back to visible: refresh only when the snapshot is actually due;
    // otherwise just re-arm the poll from the existing fresh snapshot.
    if (snapshotDue(Date.now(), lastSnapshotAt, anyLiveNow())) refreshProviderData();
    else armPoll();
  });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

boot();
