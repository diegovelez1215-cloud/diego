// United 2026 — boot.
// Order matters: purge legacy storage first (stale truth cannot survive a
// boot), seed state from the whitelisted namespaces, paint the canonical-first
// shell immediately (never blank, even offline), then start the provider
// refresh loop. Tab taps never reach the network or storage.

import { purgeLegacy, loadPrefs, loadPlay, loadSims, savePrefs } from './core/persistence.js';
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
let deferredInstallPrompt = null;
let pendingUpdateWorker = null;
let updateRefreshRequested = false;
let pwaToastKind = null;

function inStandaloneMode() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isAppleTouchSafari() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream && !inStandaloneMode();
}

function highAttentionPlay() {
  return Boolean(document.querySelector('.lab.running:not(.done) .lab-stage, .rondo.live'));
}

function pwaDismissed() {
  return getState().prefs.installTipDismissed === true;
}

function setInstallDismissed() {
  const prefs = { ...getState().prefs, installTipDismissed: true };
  setPrefs(prefs);
  savePrefs(prefs);
}

function pwaCopy(kind) {
  if (kind === 'offline') {
    return {
      title: 'Offline',
      body: 'Current World Cup data cannot refresh. Play simulations and saved views still work.',
      action: '',
    };
  }
  if (kind === 'update') {
    return {
      title: 'Update ready',
      body: 'A fresh United 2026 version is ready when the match is quiet.',
      action: 'Refresh',
    };
  }
  if (kind === 'install') {
    return {
      title: 'Install United 2026',
      body: 'Open it as a standalone app with the same live-truth safeguards.',
      action: 'Install',
    };
  }
  return {
    title: 'Add to Home Screen',
    body: 'On iPhone or iPad, use Share then Add to Home Screen.',
    action: '',
  };
}

function ensurePwaToast() {
  let el = document.getElementById('pwa-toast');
  if (el) return el;
  el = document.createElement('aside');
  el.id = 'pwa-toast';
  el.className = 'pwa-toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  document.body.appendChild(el);
  return el;
}

function hidePwaToast(kind) {
  if (kind && pwaToastKind !== kind) return;
  pwaToastKind = null;
  const el = document.getElementById('pwa-toast');
  if (el) el.hidden = true;
}

function showPwaToast(kind) {
  if ((kind === 'install' || kind === 'ios') && (pwaDismissed() || highAttentionPlay())) return;
  if (kind === 'update' && highAttentionPlay()) return;
  const el = ensurePwaToast();
  const copy = pwaCopy(kind);
  pwaToastKind = kind;
  el.hidden = false;
  el.dataset.kind = kind;
  el.innerHTML = `<div><strong>${copy.title}</strong><p>${copy.body}</p></div>
    <div class="pwa-actions">
      ${copy.action ? `<button type="button" class="pwa-action">${copy.action}</button>` : ''}
      ${kind === 'offline' ? '' : '<button type="button" class="pwa-dismiss" aria-label="Dismiss install notice">×</button>'}
    </div>`;
  const dismiss = el.querySelector('.pwa-dismiss');
  if (dismiss) dismiss.addEventListener('click', () => { setInstallDismissed(); hidePwaToast(); });
  const action = el.querySelector('.pwa-action');
  if (action && kind === 'install') {
    action.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      const prompt = deferredInstallPrompt;
      deferredInstallPrompt = null;
      await prompt.prompt();
      await prompt.userChoice.catch(() => null);
      setInstallDismissed();
      hidePwaToast();
    });
  }
  if (action && kind === 'update') {
    action.addEventListener('click', () => {
      updateRefreshRequested = true;
      pendingUpdateWorker?.postMessage({ type: 'SKIP_WAITING' });
    });
  }
}

function maybeShowInstallTip() {
  if (pwaDismissed() || inStandaloneMode() || highAttentionPlay()) return;
  if (pwaToastKind === 'offline' || pwaToastKind === 'update') return;
  if (pendingUpdateWorker) { showPwaToast('update'); return; }
  if (deferredInstallPrompt) showPwaToast('install');
  else if (isAppleTouchSafari()) showPwaToast('ios');
}

function registerPwa() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    setTimeout(maybeShowInstallTip, 900);
  });
  window.addEventListener('u26:high-attention-start', () => {
    if (pwaToastKind === 'install' || pwaToastKind === 'ios' || pwaToastKind === 'update') hidePwaToast();
  });
  window.addEventListener('online', () => hidePwaToast('offline'));
  window.addEventListener('offline', () => showPwaToast('offline'));
  window.addEventListener('u26:pwa-update-ready', () => {
    pendingUpdateWorker = pendingUpdateWorker || { postMessage() {} };
    showPwaToast('update');
  });

  const canRegister = 'serviceWorker' in navigator
    && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  if (canRegister) {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            pendingUpdateWorker = worker;
            showPwaToast('update');
          }
        });
      });
      if (registration.waiting) {
        pendingUpdateWorker = registration.waiting;
        showPwaToast('update');
      }
    }).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (updateRefreshRequested) window.location.reload();
    });
  }
  setTimeout(maybeShowInstallTip, 1400);
}

async function fetchJson(url) {
  try {
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    // A non-OK status means the server answered — that is not "offline", so
    // no offline claim is made; callers keep the last verified state and the
    // honest freshness stamps say the rest. Only a failed network round-trip
    // earns the offline notice.
    if (!r.ok) return null;
    return await r.json();
  } catch { showPwaToast('offline'); return null; }
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
      // Only a verified payload may repaint the leader lists: configured,
      // not an error fallback, not a stale fallback, with real arrays.
      const verified = scorerStats
        && scorerStats.configured !== false
        && scorerStats.error !== true
        && scorerStats.isStale !== true
        && Array.isArray(scorerStats.goals)
        && Array.isArray(scorerStats.assists);
      if (verified) {
        setStats({
          providerState: scorerStats.sourceStatus || 'ok',
          fetchedAt: scorerStats.fetchedAt || null,
          goals: scorerStats.goals,
          assists: scorerStats.assists,
          // Honest scope passthrough: assists exist only on the provider's
          // goal-ranked scorer rows, and `truncated` marks a capped row set.
          assistScope: scorerStats.assistScope || null,
          truncated: scorerStats.truncated === true,
        });
      } else {
        // Degraded refresh (error, stale fallback, unconfigured, malformed):
        // a transient failure must never erase verified leaders already in
        // memory, and a wiped screen must never be stamped as freshly
        // updated. Keep the last verified snapshot with its honest
        // fetchedAt; only an app with nothing verified shows unavailable.
        const prev = getState().real.stats;
        const hasVerified = (Array.isArray(prev.goals) && prev.goals.length > 0)
          || (Array.isArray(prev.assists) && prev.assists.length > 0);
        if (hasVerified) setStats({ ...prev, providerState: 'stale' });
        else setStats({ providerState: 'unavailable', fetchedAt: null, goals: [], assists: [] });
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
    if (!highAttentionPlay()) {
      if (pendingUpdateWorker && !pwaToastKind) showPwaToast('update');
      else maybeShowInstallTip();
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

  registerPwa();
}

boot();
