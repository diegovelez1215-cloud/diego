// United 2026 — You. Three surfaces, two scoreboards, zero mixing:
//   You          — the quiet museum: saved timelines, lab history, preferences.
//   Picks League — the invite-only SHARED scoreboard, backed by the restored
//                  hosted backend (see core/picks-league.js). Official-match
//                  predictions only, settled from validated official results.
//   Arcade Ladder — Match Lab + My World Cup performance only. Private,
//                  local, simulation-flavoured. Never touches the league.
// Official truth never comes from the league; the league never feeds truth.

import { getState, setPrefs, setSims, setLeague, setYouView } from '../core/app-state.js';
import { savePrefs, saveSims } from '../core/persistence.js';
import { teamFlag, teamName, allFixtures } from '../core/canonical-truth.js';
import { gradePredictions, arcadeLedger, achievementState, leaguePickPoints } from './play.js';
import {
  leagueConfigured, validMemberName, validRoomCode, makeRoomCode,
  memberRow, fetchStandings, postMemberRow, rankMovement, ranksOf,
} from '../core/picks-league.js';
import { segmentedControl } from '../components/segmented-control.js';
import { esc } from '../components/match-row.js';

export const seedHTML = `<div class="view you-view">
  <header class="view-head"><h1>You</h1><p class="view-sub">Museum · Picks League · Arcade Ladder</p></header>
  <div class="view-shell-note"></div>
</div>`;

function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ================= Picks League data flow ================= */

const FETCH_TTL = 60_000;
let fetching = false;
let lastPostKey = null;
let lastPostAt = 0;
let editingProfile = false; // module-local UI state; identity itself lives in prefs

/** My champion call: the official Final pick, if I made one. Official picks only. */
function myChampionCall(play, overlay) {
  const finalFx = allFixtures().find((f) => f.stage === 'final');
  const pick = finalFx ? play.predictions?.picks?.[finalFx.id] : null;
  if (!pick || pick.side === 'draw') return null;
  const s = overlay.slots.get(finalFx.id) || {};
  const code = pick.side === 'home' ? s.home : s.away;
  return code ? teamName(code) : null;
}

/** My row, derived live from official settlement. Idempotent by construction. */
function myDerivedRow(prefs, play, overlay) {
  if (!prefs.leagueName) return null;
  const stats = gradePredictions(play.predictions?.picks || {}, overlay);
  const accuracy = stats.total ? Math.round((stats.right / stats.total) * 100) : null;
  return memberRow({
    name: prefs.leagueName,
    code: prefs.leagueCode || null,
    points: leaguePickPoints(play, overlay),
    accuracy,
    champion: myChampionCall(play, overlay),
  });
}

function refreshLeague(force = false) {
  const { prefs, league } = getState();
  if (!leagueConfigured() || fetching) return;
  if (!force && Date.now() - (league.fetchedAt || 0) < FETCH_TTL) return;
  fetching = true;
  setLeague({ status: league.standings.length ? league.status : 'loading' });
  fetchStandings(prefs.leagueCode || null).then((standings) => {
    fetching = false;
    setLeague({ status: 'ok', standings, fetchedAt: Date.now(), error: null });
    // remember genuinely observed ranks so movement stays honest
    const nextPrefs = { ...getState().prefs, leagueRanks: ranksOf(standings) };
    setPrefs({ leagueRanks: nextPrefs.leagueRanks });
    savePrefs(nextPrefs);
  }).catch(() => {
    fetching = false;
    // navigator.onLine is only trusted to EXPLAIN a failure, never to skip
    // the attempt (headless/misreporting devices say offline while fine).
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    setLeague({ status: offline ? 'offline' : 'error', error: 'sync' });
  });
}

/** Auto-sync my own row when my officially-settled facts changed. Throttled;
    posting the same facts twice is a no-op upsert of identical numbers. */
function syncMyRow() {
  const { prefs, play, real } = getState();
  const row = myDerivedRow(prefs, play, real.overlay);
  if (!row || !leagueConfigured()) return;
  const key = JSON.stringify(row);
  if (key === lastPostKey && Date.now() - lastPostAt < 55_000) return;
  lastPostKey = key; lastPostAt = Date.now();
  postMemberRow(row).then((ok) => { if (ok) refreshLeague(true); });
}

/* ================= Picks League rendering ================= */

function joinCardHTML(prefs) {
  return `<section class="you-card league-join" aria-label="Join the Picks League">
    <h2>Picks League</h2>
    <p class="league-sub">Invite-only. Call official matches in Prediction Run; points settle only when results are official. No stakes, no money — bragging rights.</p>
    <div class="league-form">
      <label for="league-name">Your name</label>
      <input id="league-name" maxlength="24" autocomplete="nickname" placeholder="e.g. Diego" value="${esc(prefs.leagueName || '')}">
      <label for="league-code">League code <em>(blank = open board)</em></label>
      <input id="league-code" maxlength="8" autocapitalize="characters" autocomplete="off" placeholder="e.g. QK7M2" value="${esc(prefs.leagueCode || '')}">
      <div class="league-join-actions">
        <button class="play-btn gold" id="league-join">Join league</button>
        <button class="play-btn quiet" id="league-newroom">Start a new league</button>
      </div>
      <p class="league-hint" id="league-hint"></p>
    </div>
  </section>`;
}

function moveTag(m) {
  if (m.move === 'new') return '<span class="lg-mv new">NEW</span>';
  if (m.move === 'up') return `<span class="lg-mv up">▲${m.delta}</span>`;
  if (m.move === 'down') return `<span class="lg-mv dn">▼${m.delta}</span>`;
  return '<span class="lg-mv hold">–</span>';
}

function podiumHTML(rows) {
  if (rows.length < 2) return '';
  const medals = ['gold', 'silver', 'bronze'];
  return `<div class="lg-podium" aria-label="Podium">
    ${rows.slice(0, 3).map((m, i) => `
      <div class="lg-podium-step ${medals[i]}">
        <span class="lg-podium-rank">${i + 1}</span>
        <span class="lg-podium-name">${esc(m.name)}</span>
        <b>${m.points}</b>
      </div>`).join('')}
  </div>`;
}

function rivalHTML(rows, meKey) {
  const i = rows.findIndex((m) => m.key === meKey);
  if (i < 0) return '';
  const me = rows[i];
  const rival = i > 0 ? rows[i - 1] : rows[1];
  if (!rival) return '';
  const gap = i > 0 ? rival.points - me.points : me.points - rival.points;
  const line = i > 0
    ? `${gap} point${gap === 1 ? '' : 's'} behind ${esc(rival.name)}`
    : `${gap} point${gap === 1 ? '' : 's'} clear of ${esc(rival.name)}`;
  return `<div class="lg-rival" role="status">
    <span class="lg-rival-kicker">Your race</span>
    <span>#${i + 1} of ${rows.length} · ${line}</span>
  </div>`;
}

function myFormHTML(play, overlay) {
  const stats = gradePredictions(play.predictions?.picks || {}, overlay);
  const recent = stats.graded.slice(-8);
  const conf3 = stats.graded.filter((g) => g.conf === 3);
  const conf3Right = conf3.filter((g) => g.correct).length;
  return `<div class="lg-myform" aria-label="Your settled record">
    <div class="lg-myform-row">
      <span class="lg-chip"><b>${stats.right}/${stats.total}</b> settled</span>
      <span class="lg-chip"><b>${stats.best}</b> best streak</span>
      <span class="lg-chip"><b>${stats.exact}</b> exact scores</span>
      <span class="lg-chip"><b>${conf3.length ? conf3Right + '/' + conf3.length : '—'}</b> all-in calls</span>
    </div>
    ${recent.length ? `<div class="lg-dots" aria-hidden="true">${recent.map((g) => `<i class="lg-dot ${g.correct ? 'w' : 'l'}"></i>`).join('')}</div>` : ''}
  </div>`;
}

function activityHTML(prefs, rows) {
  const local = (prefs.leagueActivity || []).slice(0, 6).map((a) => ({
    t: a.t, text: a.text,
  }));
  // remote joins are real facts from stored rows — nothing invented
  const joins = rows
    .filter((m) => m.at)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 4)
    .map((m) => ({ t: m.at, text: `${m.name} is on the board` }));
  const all = [...local, ...joins]
    .sort((a, b) => Date.parse(b.t || 0) - Date.parse(a.t || 0))
    .slice(0, 6);
  if (!all.length) return '';
  return `<div class="lg-activity" aria-label="Recent league activity">
    ${all.map((a) => `<div class="lg-act"><span>${esc(fmtDate(a.t) || '')}</span>${esc(a.text)}</div>`).join('')}
  </div>`;
}

function leagueHTML(state) {
  const { prefs, play, real, league } = state;
  if (!leagueConfigured()) {
    return `<section class="you-card" aria-label="Picks League unavailable">
      <h2>Picks League</h2>
      <p class="empty-line">The shared league backend isn't configured in this build.</p>
    </section>`;
  }
  if (!prefs.leagueName || editingProfile) return joinCardHTML(prefs);

  const meKey = prefs.leagueName.trim().toLowerCase();
  const moved = rankMovement(league.standings, prefs.leagueRanks || null);
  const room = prefs.leagueCode || null;

  let board;
  if (league.status === 'loading' && !league.standings.length) {
    board = '<div class="lg-skeleton" aria-hidden="true"><i></i><i></i><i></i><i></i></div>';
  } else if (league.status === 'offline') {
    board = '<p class="lg-state">You\'re offline. Standings will sync when you\'re back — nothing here is ever made up.</p>';
  } else if (league.status === 'error' && !league.standings.length) {
    board = '<p class="lg-state">Standings couldn\'t sync. <button class="lg-retry" id="league-retry">Try again</button></p>';
  } else if (!league.standings.length) {
    board = `<p class="lg-state">No members on the board yet${room ? ` in <b>${esc(room)}</b>` : ''}. Share the code — every row here is a real person.</p>`;
  } else {
    board = `
      ${podiumHTML(moved)}
      ${rivalHTML(moved, meKey)}
      <div class="lg-rows">
        ${moved.map((m, i) => `
          <div class="lg-row${m.key === meKey ? ' me' : ''}${i < 3 ? ' top' : ''}">
            <span class="lg-rank">${i + 1}</span>
            <span class="lg-avatar" aria-hidden="true">${esc((m.name[0] || '?').toUpperCase())}</span>
            <span class="lg-name">${esc(m.name)}${moveTag(m)}
              ${m.champion ? `<small class="lg-champ">🏆 ${esc(m.champion)}</small>` : ''}</span>
            ${m.accuracy != null ? `<span class="lg-acc">${m.accuracy}%</span>` : ''}
            <b class="lg-points">${m.points}</b>
          </div>`).join('')}
      </div>
      ${league.status === 'error' ? '<p class="lg-state stale">Showing the last synced table — refresh failed.</p>' : ''}`;
  }

  return `<section class="you-card league" aria-label="Picks League">
    <header class="lg-head">
      <div>
        <h2>Picks League</h2>
        <p class="league-sub">${room ? `League <b class="lg-code">${esc(room)}</b> · invite-only` : 'Open board'} · settles on official results only</p>
      </div>
      <button class="lg-refresh" id="league-refresh" aria-label="Refresh standings">↻</button>
    </header>
    ${myFormHTML(play, real.overlay)}
    ${board}
    ${activityHTML(prefs, league.standings)}
    <div class="lg-foot">
      <span>You're in as <b>${esc(prefs.leagueName)}</b></span>
      <button class="lg-leave" id="league-edit">Edit profile</button>
    </div>
  </section>`;
}

/* ================= Arcade Ladder (local, simulation-only) ================= */

const TIERS = [
  ['Sunday League', 0], ['Casual', 120], ['Contender', 300],
  ['Manager Material', 600], ['Tactician', 1000], ['Arcade Legend', 1600],
];

function ladderHTML(state) {
  const { play, real, sims } = state;
  const ledger = arcadeLedger(play, real.overlay, sims);
  let tier = 0;
  for (let i = 0; i < TIERS.length; i++) if (ledger.points >= TIERS[i][1]) tier = i;
  const next = TIERS[tier + 1] || null;
  const prevFloor = TIERS[tier][1];
  const pct = next ? Math.min(100, Math.round(((ledger.points - prevFloor) / (next[1] - prevFloor)) * 100)) : 100;
  const lab = play.labHistory || [];
  // Ladder purity: only achievements earned in the arcade itself. Badges that
  // derive from official predictions live with the Picks League story instead.
  const ARCADE_ACH = new Set(['extra-time-merchant', 'road-builder', 'lab-upsetter']);
  const ach = achievementState().filter((a) => a.on && ARCADE_ACH.has(a.id));
  return `<section class="you-card ladder" aria-label="Arcade Ladder">
    <h2>Arcade Ladder <span class="sim-badge">SIMULATION</span></h2>
    <p class="league-sub">Match Lab and My World Cup only. A private game ladder — completely separate from the Picks League, never mixed with official results.</p>
    <div class="ladder-tier">
      <div class="ladder-now">
        <strong class="display">${esc(TIERS[tier][0])}</strong>
        <span>${ledger.points} Arcade Points</span>
      </div>
      <div class="ladder-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
      <span class="ladder-next">${next ? `${next[1] - ledger.points} points to ${esc(next[0])}` : 'Top of the ladder'}</span>
    </div>
    <div class="ladder-grid" role="group" aria-label="Arcade record">
      <span class="ladder-cell"><b>${ledger.wins}W–${ledger.played - ledger.wins}L</b><small>Match Lab</small></span>
      <span class="ladder-cell"><b>${ledger.streak}</b><small>win streak</small></span>
      <span class="ladder-cell"><b>${(sims.saved || []).length}</b><small>timelines saved</small></span>
      <span class="ladder-cell"><b>${ledger.best ? `${ledger.best.gh}–${ledger.best.ga}` : '—'}</b><small>best win</small></span>
    </div>
    ${lab.length ? `<div class="ladder-recent" aria-label="Recent lab results">
      ${lab.slice(0, 4).map((m) => `<div class="ladder-run">
        <span>${teamFlag(m.home)} <b>${m.gh}–${m.ga}</b>${m.pens ? `<small>${m.pens.ph}–${m.pens.pa}p</small>` : ''} ${teamFlag(m.away)}</span>
        <small>${m.win ? '+' : ''}${m.cp || 0} pts · ${esc(fmtDate(m.at))}</small>
      </div>`).join('')}
    </div>` : '<p class="empty-line">No ladder games yet — Match Lab is one tab away.</p>'}
    ${ach.length ? `<div class="you-ach-row" aria-label="Earned achievements">
      ${ach.map((a) => `<span class="you-ach" title="${esc(a.desc)}">${a.icon} ${esc(a.name)}</span>`).join('')}
    </div>` : ''}
    <p class="ladder-note">Arcade Points are a private game score. No cash value.</p>
  </section>`;
}

/* ================= the museum (unchanged spirit) ================= */

function museumHTML(state) {
  const { sims, prefs, play, real } = state;
  const saved = sims.saved || [];
  const lab = play.labHistory || [];
  const stats = gradePredictions(play.predictions?.picks || {}, real.overlay);
  const pickCount = Object.keys(play.predictions?.picks || {}).length;
  const labWins = lab.filter((e) => e.win).length;
  return `
    <section class="you-card" aria-label="Prediction record">
      <h2>Prediction record</h2>
      ${pickCount ? `<div class="pr-stats quiet" role="group" aria-label="Record">
        <div class="pr-stat"><strong>${stats.right}<span class="pr-of">/${stats.total}</span></strong><span>correct</span></div>
        <div class="pr-stat"><strong>${stats.insight}</strong><span>insight</span></div>
        <div class="pr-stat"><strong>${stats.streak}</strong><span>streak</span></div>
        <div class="pr-stat"><strong>${stats.best}</strong><span>best run</span></div>
      </div>
      <p class="you-history">${pickCount} ${pickCount === 1 ? 'call' : 'calls'} on the record${stats.total < pickCount ? ' · ' + (pickCount - stats.total) + ' awaiting kickoff' : ''}.</p>`
    : '<p class="empty-line">No calls yet. Prediction Run is waiting on the Play tab.</p>'}
    </section>

    <section class="you-card" aria-label="Saved simulations">
      <h2>Saved timelines</h2>
      ${saved.length ? saved.map((s) => `
        <div class="you-sim">
          <span class="you-sim-flag" aria-hidden="true">${teamFlag(s.champion)}</span>
          <span class="you-sim-name">${esc(s.championName)}</span>
          <span class="you-sim-meta">${esc(fmtDate(s.at))}${s.picks ? ' · ' + s.picks + ' hand-picked' : ''}</span>
          <button class="you-del" data-del="${esc(s.id)}" aria-label="Delete simulation ${esc(s.championName)}">Remove</button>
        </div>`).join('')
    : '<p class="empty-line grug-line">no timelines archived yet. the multiverse is patient.</p>'}
    </section>

    <section class="you-card" aria-label="Match Lab history">
      <h2>Match Lab${lab.length ? ` <span class="you-lab-record">${labWins}W–${lab.length - labWins}L</span>` : ''}</h2>
      ${lab.length ? lab.slice(0, 6).map((m) => `
        <div class="you-lab">
          <span class="you-lab-score">${teamFlag(m.home)} <strong>${m.gh}–${m.ga}</strong>${m.pens ? `<small> ${m.pens.ph}–${m.pens.pa}p</small>` : ''} ${teamFlag(m.away)}</span>
          <span class="you-sim-meta">${esc(teamName(m.home))} v ${esc(teamName(m.away))} · ${esc(fmtDate(m.at))}${m.cp ? ' · +' + m.cp + ' CP' : ''}</span>
        </div>`).join('')
    : '<p class="empty-line">No lab matches yet.</p>'}
    </section>

    <section class="you-card" aria-label="Preferences">
      <h2>Preferences</h2>
      <div class="you-pref">
        <span id="pref-theme-label">Appearance</span>
        <div class="segmented small" role="tablist" aria-labelledby="pref-theme-label" data-segmented="theme">
          ${['dark', 'light'].map((v) => `
            <button class="seg-btn${(prefs.theme || 'dark') === v ? ' active' : ''}" role="tab"
              aria-selected="${(prefs.theme || 'dark') === v}" data-value="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}
        </div>
      </div>
    </section>`;
}

/* ================= wiring ================= */

function logActivity(text) {
  const prefs = getState().prefs;
  const entry = { t: new Date().toISOString(), text };
  const leagueActivity = [entry, ...(prefs.leagueActivity || [])].slice(0, 20);
  setPrefs({ leagueActivity });
  savePrefs({ ...getState().prefs, leagueActivity });
}

function wireLeague(outlet) {
  const join = outlet.querySelector('#league-join');
  const newroom = outlet.querySelector('#league-newroom');
  const hint = outlet.querySelector('#league-hint');
  const commit = (code) => {
    const name = (outlet.querySelector('#league-name')?.value || '').trim();
    if (!validMemberName(name)) { if (hint) hint.textContent = 'Names are 2–24 letters or numbers.'; return; }
    if (code && !validRoomCode(code)) { if (hint) hint.textContent = 'League codes are 4–8 letters/numbers.'; return; }
    editingProfile = false;
    const prefs = { ...getState().prefs, leagueName: name, leagueCode: code || null };
    setPrefs({ leagueName: name, leagueCode: code || null });
    savePrefs(prefs);
    logActivity(code ? `${name} joined league ${code}` : `${name} joined the board`);
    syncMyRow();
    refreshLeague(true);
  };
  if (join) {
    join.addEventListener('click', () => {
      commit((outlet.querySelector('#league-code')?.value || '').trim().toUpperCase() || null);
    });
  }
  if (newroom) {
    newroom.addEventListener('click', () => {
      const code = makeRoomCode();
      const input = outlet.querySelector('#league-code');
      if (input) input.value = code;
      commit(code);
    });
  }
  const refresh = outlet.querySelector('#league-refresh');
  if (refresh) refresh.addEventListener('click', () => refreshLeague(true));
  const retry = outlet.querySelector('#league-retry');
  if (retry) retry.addEventListener('click', () => refreshLeague(true));
  const edit = outlet.querySelector('#league-edit');
  if (edit) {
    edit.addEventListener('click', () => {
      // reopen the join card prefilled; saved identity survives until re-saved
      editingProfile = true;
      const o = document.querySelector('#outlet-you');
      if (o) render(o);
    });
  }
}

export function render(outlet) {
  const state = getState();
  const view = state.nav.youView;
  const body = view === 'league' ? leagueHTML(state)
    : view === 'ladder' ? ladderHTML(state)
      : museumHTML(state);
  outlet.innerHTML = `<div class="view you-view">
    <header class="view-head"><p class="view-kicker gold">${view === 'league' ? 'Shared Scoreboard' : view === 'ladder' ? 'The Arcade' : 'Your Museum'}</p><h1>You</h1></header>
    ${segmentedControl({
    id: 'you-view', label: 'You sections', value: view,
    options: [
      { value: 'you', label: 'You' },
      { value: 'league', label: 'Picks League' },
      { value: 'ladder', label: 'Arcade Ladder' },
    ],
  })}
    ${body}
  </div>`;
  outlet.querySelector('[data-segmented="you-view"]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-value]');
    if (btn) setYouView(btn.dataset.value);
  });
  if (view === 'league') {
    wireLeague(outlet);
    if (state.prefs.leagueName) {
      refreshLeague();
      syncMyRow();
    }
  }
  outlet.querySelectorAll('[data-del]').forEach((el) => {
    el.addEventListener('click', () => {
      const next = { saved: (getState().sims.saved || []).filter((s) => s.id !== el.dataset.del) };
      setSims(next); saveSims(next);
    });
  });
  const theme = outlet.querySelector('[data-segmented="theme"]');
  if (theme) {
    theme.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-value]');
      if (!btn) return;
      setPrefs({ theme: btn.dataset.value });
      savePrefs(getState().prefs);
      document.documentElement.dataset.theme = btn.dataset.value;
    });
  }
}
