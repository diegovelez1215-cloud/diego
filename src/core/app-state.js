// United 2026 — application state.
// One store, two structurally isolated halves:
//   real  — validated overlay + navigation state (never persisted)
//   play  — private simulation space (persisted via persistence.js only)
// Tab navigation mutates ONLY `nav`; it never touches storage or the network.

import { EMPTY_OVERLAY } from './provider-overlay.js';

const state = {
  nav: {
    tab: 'home',            // home | tournament | play | you
    tournamentView: 'matches', // matches | groups | knockout | venues | stats
    matchesDate: 'today',   // today | tomorrow | all
    matchCenterId: null,    // open match-center fixture id or null
    bracketMode: 'full',    // full | follow
    followTeam: null,       // team code illuminated in follow mode
    playMode: 'lobby',      // lobby | shotlab | lab | shootout | finalminute | coach | cup | myworldcup | prediction
    youView: 'you',         // you | board
    boardTab: 'picks',      // picks | arcade
    boardScope: 'tournament', // tournament | round
  },
  real: {
    overlay: EMPTY_OVERLAY,
    stats: { providerState: 'unavailable', fetchedAt: null, goals: [], assists: [] },
  },
  // Global leaderboard cache — shared standings data only. It is NEVER a
  // source of fixtures, scores, or tournament truth, and is never persisted.
  board: {
    status: 'idle',          // idle | loading | ok | offline | error
    picks: [],               // top rows of the global Picks leaderboard
    me: null,                // my own row (global rank), even outside the top
    arcade: [],              // top rows of the global Arcade ladder
    fetchedAt: 0,
    error: null,
  },
  prefs: {},
  play: {},                 // owned by views/play.js
  sims: { saved: [] },
};

const listeners = new Set();

export function getState() { return state; }

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function emit(tags) { for (const fn of [...listeners]) fn(tags, state); }

/** Real-tournament truth update: only affects real views. */
export function setOverlay(overlay) {
  state.real.overlay = overlay;
  emit(['real']);
}

export function setStats(stats) {
  state.real.stats = stats;
  emit(['real', 'stats']);
}

export function setTab(tab) {
  if (state.nav.tab === tab) return;
  state.nav.tab = tab;
  emit(['nav']);
}

export function setTournamentView(view) {
  if (state.nav.tournamentView === view) return;
  state.nav.tournamentView = view;
  emit(['nav', 'tournament']);
}

export function setMatchesDate(mode) {
  if (state.nav.matchesDate === mode) return;
  state.nav.matchesDate = mode;
  emit(['nav', 'tournament']);
}

export function setBracketMode(mode, team) {
  state.nav.bracketMode = mode;
  if (team !== undefined) state.nav.followTeam = team;
  emit(['nav', 'tournament']);
}

export function setPlayMode(mode) {
  if (state.nav.playMode === mode) return;
  state.nav.playMode = mode;
  emit(['nav', 'play']);
}

export function setYouView(view) {
  if (state.nav.youView === view) return;
  state.nav.youView = view;
  emit(['nav', 'you']);
}

export function setBoardTab(tab) {
  if (state.nav.boardTab === tab) return;
  state.nav.boardTab = tab;
  emit(['nav', 'you']);
}

export function setBoardScope(scope) {
  if (state.nav.boardScope === scope) return;
  state.nav.boardScope = scope;
  emit(['nav', 'you']);
}

export function setBoard(board) {
  state.board = { ...state.board, ...board };
  emit(['you']);
}

export function openMatchCenter(id) { state.nav.matchCenterId = id; emit(['match-center']); }
export function closeMatchCenter() { state.nav.matchCenterId = null; emit(['match-center']); }

export function setPrefs(prefs) { state.prefs = { ...state.prefs, ...prefs }; emit(['prefs']); }
export function setPlay(play) { state.play = play; emit(['play']); }
export function setSims(sims) { state.sims = sims; emit(['sims', 'you']); }
