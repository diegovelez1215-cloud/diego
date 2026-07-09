// United 2026 — You. Two surfaces, one honest wall between them:
//   You         — the quiet museum: saved timelines, lab history, preferences.
//   Leaderboard — THE global World Cup competition. Two boards inside:
//     Picks  — official-pick points for every authenticated player worldwide,
//              settled ONLY server-side from validated official finals.
//     Arcade — the global Match Lab / My World Cup game ladder. Simulation
//              energy, fully separate — it can never touch official points.
// Official truth never comes from the leaderboard; the leaderboard never
// feeds truth. Every row is a real signed-in player. Nothing is invented.

import {
  getState, setPrefs, setSims, setBoard, setYouView, setBoardTab, setBoardScope, setPlayMode,
} from '../core/app-state.js';
import { savePrefs, saveSims } from '../core/persistence.js';
import { teamFlag, teamName, STAGE_NAMES } from '../core/canonical-truth.js';
import {
  gradePredictions, arcadeLedger, achievementState, pickLockedAtKickoff, replayLabEntry,
  currentSide, sideRecordFor, openSidePicker, LAB_TAG_LABELS, CUP_STOPS,
} from './play.js';
import { TEAM_COLORS } from '../data/fixtures.js';
import { activate } from '../navigation/router.js';
import {
  boardConfigured, currentUser, signOut,
  requestEmailCode, verifyEmailCode,
  validDisplayName, AVATARS, fetchMyProfile, upsertMyProfile,
  fetchPicksBoard, fetchMyBoardRow, fetchArcadeLadder,
  pushEligiblePicks, pushArcadeScore,
  rankMovement, ranksOf, updatedLabel, freshlySynced, boardActivity,
} from '../core/leaderboard.js';
import { segmentedControl } from '../components/segmented-control.js';
import { esc } from '../components/match-row.js';

export const seedHTML = `<div class="view you-view">
  <header class="view-head"><h1>You</h1><p class="view-sub">Museum · World Cup Leaderboard</p></header>
  <div class="view-shell-note"></div>
</div>`;

function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ================= leaderboard data flow ================= */

const FETCH_TTL = 60_000;
let fetching = false;
let lastArcadeKey = null;
let lastArcadeAt = 0;
let picksSynced = false;

// Sign-in / profile UI state (module-local; credentials live in one
// whitelisted storage key owned by core/leaderboard.js).
let authStep = 'email';   // email | code | busy
let authEmail = '';
let authError = null;
let profile = null;        // { display_name, avatar } once loaded
let profileLoaded = false;
let editingProfile = false;
let profileError = null;

function repaintYou() {
  const o = document.querySelector('#outlet-you');
  if (o) render(o);
}
if (typeof window !== 'undefined') window.addEventListener('u26:leaderboard-config', repaintYou);

function refreshBoard(force = false) {
  const { board } = getState();
  if (!boardConfigured() || fetching || !currentUser()) return;
  if (!force && Date.now() - (board.fetchedAt || 0) < FETCH_TTL) return;
  fetching = true;
  const hasRows = board.picks.length || board.arcade.length;
  setBoard({ status: hasRows ? board.status : 'loading' });
  const uid = currentUser().id;
  Promise.all([fetchPicksBoard(), fetchMyBoardRow(uid), fetchArcadeLadder()])
    .then(([picks, me, arcade]) => {
      fetching = false;
      // movement compares against the PREVIOUS genuinely observed ranks —
      // captured before this fetch overwrites them. Never fabricated.
      const prev = getState().prefs;
      setBoard({
        status: 'ok', picks, me, arcade, fetchedAt: Date.now(), error: null,
        prevRanks: prev.boardRanks || null,
        prevArcadeRanks: prev.arcadeRanks || null,
      });
      const observed = {
        boardRanks: ranksOf(me ? picks.concat([me]) : picks),
        arcadeRanks: ranksOf(arcade),
      };
      setPrefs(observed);
      savePrefs({ ...getState().prefs });
    })
    .catch(() => {
      fetching = false;
      // navigator.onLine only EXPLAINS a failure; it never skips the attempt.
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      setBoard({ status: offline ? 'offline' : 'error', error: 'sync' });
    });
}

async function loadProfileOnce() {
  if (profileLoaded || !currentUser()) return;
  profileLoaded = true;
  try {
    profile = await fetchMyProfile();
  } catch { profile = null; profileLoaded = false; }
  repaintYou();
}

/** After sign-in or a new confirmed call: push MY eligible pre-kickoff picks. */
function syncMyPicks() {
  if (!currentUser() || picksSynced) return;
  picksSynced = true;
  const picks = getState().play.predictions?.picks || {};
  pushEligiblePicks(picks, (id) => !pickLockedAtKickoff(id))
    .then((n) => { if (n) refreshBoard(true); })
    .catch(() => { picksSynced = false; });
}

/** Throttled arcade-score sync — same-facts posts are no-op upserts. */
function syncArcade() {
  const { play, real, sims } = getState();
  if (!currentUser() || !profile) return;
  const ledger = arcadeLedger(play, real.overlay, sims);
  const key = JSON.stringify([ledger.points, ledger.wins, ledger.played, ledger.streak]);
  if (key === lastArcadeKey && Date.now() - lastArcadeAt < 55_000) return;
  lastArcadeKey = key; lastArcadeAt = Date.now();
  pushArcadeScore(ledger).then((ok) => { if (ok) refreshBoard(true); });
}

function logActivity(text) {
  const entry = { t: new Date().toISOString(), text };
  const boardLog = [entry, ...(getState().prefs.boardLog || [])].slice(0, 12);
  setPrefs({ boardLog });
  savePrefs({ ...getState().prefs });
}

/* ================= sign-in + profile cards ================= */

function signInCardHTML() {
  if (!boardConfigured()) {
    return `<section class="you-card board-soon" aria-label="Global Leaderboard opening soon">
      <p class="bd-kicker">Global competition</p>
      <h2 class="display">Global Leaderboard is opening soon</h2>
      <p class="league-sub">Your Prediction Run, Match Lab history, saved timelines, and arcade progress are ready now. The worldwide table will open when live accounts are enabled.</p>
    </section>`;
  }
  const step = authStep;
  return `<section class="you-card board-signin" aria-label="Join the global leaderboard">
    <p class="bd-kicker">One global competition</p>
    <h2 class="display">World Cup Leaderboard</h2>
    <p class="league-sub">Call official matches, climb the worldwide table. Every row is a real
      signed-in player; points settle only when results are official. Local competition only.</p>
    ${step === 'email' || step === 'busy' ? `
    <div class="league-form">
      <label for="board-email">Email</label>
      <input id="board-email" type="email" inputmode="email" autocomplete="email"
        placeholder="you@example.com" value="${esc(authEmail)}">
      <button class="play-btn gold" id="board-sendcode"${step === 'busy' ? ' disabled' : ''}>
        ${step === 'busy' ? 'Sending…' : 'Email me a sign-in code'}</button>
    </div>` : `
    <div class="league-form">
      <label for="board-code">Enter the 6-digit code sent to <b>${esc(authEmail)}</b></label>
      <input id="board-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456">
      <div class="league-join-actions">
        <button class="play-btn gold" id="board-verify">Sign in</button>
        <button class="play-btn quiet" id="board-back">Different email</button>
      </div>
    </div>`}
    <p class="league-hint" id="board-hint">${esc(authError || '')}</p>
  </section>`;
}

function profileCardHTML(prefill) {
  const name = prefill?.display_name || '';
  const avatar = prefill?.avatar || AVATARS[0];
  return `<section class="you-card board-profile" aria-label="Your leaderboard profile">
    <p class="bd-kicker">${profile ? 'Edit profile' : 'Claim your place'}</p>
    <h2 class="display">Your profile</h2>
    <p class="league-sub">This is how the world sees you on the global table.</p>
    <div class="league-form">
      <label for="board-name">Display name</label>
      <input id="board-name" maxlength="24" autocomplete="nickname" placeholder="e.g. Diego" value="${esc(name)}">
      <span class="bd-avatar-label" id="bd-avatar-label">Crest</span>
      <div class="bd-avatars" role="group" aria-labelledby="bd-avatar-label">
        ${AVATARS.map((a) => `<button class="bd-avatar${a === avatar ? ' on' : ''}" data-avatar="${a}">${a}</button>`).join('')}
      </div>
      <div class="league-join-actions">
        <button class="play-btn gold" id="board-saveprofile">${profile ? 'Save changes' : 'Join the leaderboard'}</button>
        ${profile ? '<button class="play-btn quiet" id="board-cancelprofile">Cancel</button>' : ''}
      </div>
      <p class="league-hint">${esc(profileError || '')}</p>
    </div>
  </section>`;
}

/* ================= Picks board rendering ================= */

function moveTag(m) {
  if (m.move === 'new') return '<span class="lg-mv new">NEW</span>';
  if (m.move === 'up') return `<span class="lg-mv up">▲${m.delta}</span>`;
  if (m.move === 'down') return `<span class="lg-mv dn">▼${m.delta}</span>`;
  return '<span class="lg-mv hold">–</span>';
}

function avatarHTML(m) {
  return `<span class="lg-avatar" aria-hidden="true">${m.avatar ? esc(m.avatar) : esc((m.name[0] || '?').toUpperCase())}</span>`;
}

function boardHeadHTML(board, title, sub) {
  const stamp = updatedLabel(board.fetchedAt);
  const fresh = freshlySynced(board.fetchedAt);
  return `<header class="lg-head">
    <div>
      <h2>${title}</h2>
      <p class="league-sub">${sub}</p>
    </div>
    <div class="lg-head-side">
      ${stamp ? `<span class="lg-stamp${fresh ? ' fresh' : ''}">${fresh ? '<i class="lg-dot-fresh" aria-hidden="true"></i>' : ''}${esc(stamp)}</span>` : ''}
      <button class="lg-refresh" id="board-refresh" aria-label="Refresh standings">↻</button>
    </div>
  </header>`;
}

function podiumHTML(rows, scope) {
  if (rows.length < 2) return '';
  const medals = ['gold', 'silver', 'bronze'];
  const order = rows.slice(0, 3);
  return `<div class="lg-podium" aria-label="Podium">
    ${order.map((m, i) => `
      <div class="lg-podium-step ${medals[i]}">
        <span class="lg-podium-rank">${i + 1}</span>
        ${avatarHTML(m)}
        <span class="lg-podium-name">${esc(m.name)}</span>
        <b>${scope === 'round' ? m.roundPoints : m.points}</b>
      </div>`).join('')}
  </div>`;
}

function rowHTML(m, rankShown, meId, scope) {
  const me = m.userId === meId;
  const pts = scope === 'round' ? m.roundPoints : m.points;
  return `<div class="lg-row${me ? ' me' : ''}${rankShown <= 3 ? ' top' : ''}">
    <span class="lg-rank">${rankShown}</span>
    ${avatarHTML(m)}
    <span class="lg-name">${esc(m.name)}${scope === 'tournament' ? moveTag(m) : ''}
      ${m.streak >= 3 ? `<small class="lg-streak" title="Current streak">🔥${m.streak}</small>` : ''}</span>
    ${m.accuracy != null ? `<span class="lg-acc">${m.accuracy}%</span>` : '<span class="lg-acc dim">—</span>'}
    <b class="lg-points">${pts}</b>
  </div>`;
}

function myFormHTML(play, overlay) {
  const stats = gradePredictions(play.predictions?.picks || {}, overlay);
  const recent = stats.graded.slice(-8);
  return `<div class="lg-myform" aria-label="Your settled record">
    <div class="lg-myform-row">
      <span class="lg-chip"><b>${stats.right}/${stats.total}</b> settled</span>
      <span class="lg-chip"><b>${stats.streak}</b> streak</span>
      <span class="lg-chip"><b>${stats.best}</b> best run</span>
      <span class="lg-chip"><b>${stats.exact}</b> exact scores</span>
    </div>
    ${recent.length ? `<div class="lg-dots" aria-hidden="true">${recent.map((g) => `<i class="lg-dot ${g.correct ? 'w' : 'l'}"></i>`).join('')}</div>` : ''}
  </div>`;
}

function activityHTML(prefs, rows) {
  const mine = (prefs.boardLog || []).slice(0, 4);
  const all = boardActivity(rows, mine.map((a) => ({ at: a.t, text: a.text })), { limit: 6 });
  if (!all.length) return '';
  return `<div class="lg-activity" aria-label="Recent leaderboard activity">
    ${all.map((a) => `<div class="lg-act"><span>${esc(fmtDate(a.t) || '')}</span>${esc(a.text)}</div>`).join('')}
  </div>`;
}

function boardStateHTML(board, empty) {
  if (board.status === 'loading' && !board.picks.length) {
    return '<div class="lg-skeleton" aria-hidden="true"><i></i><i></i><i></i><i></i></div>';
  }
  if (board.status === 'offline') {
    return '<p class="lg-state">You\'re offline. Standings will sync when you\'re back — nothing here is ever made up.</p>';
  }
  if (board.status === 'error' && !board.picks.length) {
    return '<p class="lg-state">Standings couldn\'t sync. <button class="lg-retry" id="board-retry">Try again</button></p>';
  }
  return empty;
}

function picksBoardHTML(state) {
  const { prefs, play, real, board, nav } = state;
  const scope = nav.boardScope;
  const meId = currentUser()?.id || null;
  let rows = rankMovement(board.picks, board.prevRanks || null);
  if (scope === 'round') {
    rows = [...rows].sort((a, b) => b.roundPoints - a.roundPoints || (a.rank || 0) - (b.rank || 0));
  }
  const roundStage = rows.find((r) => r.roundStage)?.roundStage || board.me?.roundStage || null;
  const meVisible = meId && rows.some((r) => r.userId === meId);
  const me = board.me;

  let table;
  const stateHTML = boardStateHTML(board,
    '<p class="lg-state">Nobody on the global table yet. Confirm a call in Prediction Run — every row here is a real player.</p>');
  if (!board.picks.length) {
    table = stateHTML;
  } else {
    table = `
      ${podiumHTML(rows, scope)}
      <div class="lg-scope" role="group" aria-label="Leaderboard scope">
        <button class="lg-scope-btn${scope === 'tournament' ? ' on' : ''}" data-scope="tournament">Tournament</button>
        <button class="lg-scope-btn${scope === 'round' ? ' on' : ''}" data-scope="round">${roundStage ? esc(STAGE_NAMES[roundStage] || 'This round') : 'This round'}</button>
      </div>
      <div class="lg-rows">
        ${rows.map((m, i) => rowHTML(m, scope === 'round' ? i + 1 : (m.rank || i + 1), meId, scope)).join('')}
      </div>
      ${me && !meVisible && scope === 'tournament' ? `
      <div class="lg-pinned" aria-label="Your global rank">
        <span class="lg-rank">${me.rank ?? '—'}</span>
        ${avatarHTML(me)}
        <span class="lg-name">${esc(me.name)} <small class="lg-you-tag">you</small></span>
        ${me.accuracy != null ? `<span class="lg-acc">${me.accuracy}%</span>` : ''}
        <b class="lg-points">${me.points}</b>
      </div>` : ''}
      ${board.status === 'error' ? '<p class="lg-state stale">Showing the last synced table — refresh failed.</p>' : ''}
      ${scope === 'round' ? '<p class="lg-scope-note">Round view re-ranks the loaded top table by points earned in this round.</p>' : ''}`;
  }

  return `<section class="you-card league" aria-label="Global Picks leaderboard">
    ${boardHeadHTML(board, 'World Cup Leaderboard', 'Global · official picks only · settles on official results')}
    ${myFormHTML(play, real.overlay)}
    ${table}
    ${activityHTML(prefs, rows)}
    <div class="lg-foot">
      <span>You're in as <b>${esc(profile?.display_name || '')}</b></span>
      <span class="lg-foot-actions">
        <button class="lg-leave" id="board-editprofile">Edit profile</button>
        <button class="lg-leave" id="board-signout">Sign out</button>
      </span>
    </div>
  </section>`;
}

/* ================= Arcade board rendering ================= */

const TIERS = [
  ['Sunday League', 0], ['Casual', 120], ['Contender', 300],
  ['Manager Material', 600], ['Tactician', 1000], ['Arcade Legend', 1600],
];

function tierCardHTML(state) {
  const { play, real, sims } = state;
  const ledger = arcadeLedger(play, real.overlay, sims);
  let tier = 0;
  for (let i = 0; i < TIERS.length; i++) if (ledger.points >= TIERS[i][1]) tier = i;
  const next = TIERS[tier + 1] || null;
  const prevFloor = TIERS[tier][1];
  const pct = next ? Math.min(100, Math.round(((ledger.points - prevFloor) / (next[1] - prevFloor)) * 100)) : 100;
  const ARCADE_ACH = new Set(['extra-time-merchant', 'road-builder', 'lab-upsetter']);
  const ach = achievementState().filter((a) => a.on && ARCADE_ACH.has(a.id));
  return `<div class="ladder-tier">
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
      <span class="ladder-cell"><b>${(state.sims.saved || []).length}</b><small>timelines saved</small></span>
      <span class="ladder-cell"><b>${ledger.best ? `${ledger.best.gh}–${ledger.best.ga}` : '—'}</b><small>best win</small></span>
    </div>
    ${ach.length ? `<div class="you-ach-row" aria-label="Earned achievements">
      ${ach.map((a) => `<span class="you-ach" title="${esc(a.desc)}">${a.icon} ${esc(a.name)}</span>`).join('')}
    </div>` : ''}`;
}

function arcadeBoardHTML(state) {
  const { board } = state;
  const meId = currentUser()?.id || null;
  const rows = rankMovement(board.arcade, board.prevArcadeRanks || null);
  const stateHTML = boardStateHTML({ ...board, picks: board.arcade },
    '<p class="lg-state">No arcade scores on the global ladder yet — Match Lab is one tab away.</p>');
  const table = !board.arcade.length ? stateHTML : `
    <div class="lg-rows arcade">
      ${rows.map((m) => `
        <div class="lg-row${m.userId === meId ? ' me' : ''}${(m.rank || 99) <= 3 ? ' top' : ''}">
          <span class="lg-rank">${m.rank}</span>
          ${avatarHTML(m)}
          <span class="lg-name">${esc(m.name)}${moveTag(m)}
            <small class="lg-arcade-sub">${m.wins}W–${Math.max(0, m.played - m.wins)}L</small></span>
          ${m.streak >= 2 ? `<span class="lg-acc">🔥${m.streak}</span>` : '<span class="lg-acc dim">—</span>'}
          <b class="lg-points">${m.points}</b>
        </div>`).join('')}
    </div>
    ${board.status === 'error' ? '<p class="lg-state stale">Showing the last synced ladder — refresh failed.</p>' : ''}`;
  return `<section class="you-card ladder" aria-label="Global Arcade Ladder">
    ${boardHeadHTML(board, 'Arcade Ladder', 'Global game ladder · Match Lab & My World Cup only')}
    <span class="sim-badge">SIMULATION</span>
    ${tierCardHTML(state)}
    ${table}
    <p class="ladder-note">Arcade Points are only a local game score. This ladder never
      touches the official Picks standings.</p>
  </section>`;
}

/* ================= the leaderboard surface ================= */

function boardHTML(state) {
  if (!boardConfigured()) return signInCardHTML();
  const tab = state.nav.boardTab;
  const tabs = segmentedControl({
    id: 'board-tab', label: 'Leaderboard sections', value: tab,
    options: [
      { value: 'picks', label: 'Picks' },
      { value: 'arcade', label: 'Arcade' },
    ],
  });
  if (!currentUser()) return `${tabs}${signInCardHTML()}`;
  if (!profileLoaded && !profile) {
    return `${tabs}<section class="you-card" aria-label="Loading profile">
      <div class="lg-skeleton" aria-hidden="true"><i></i><i></i></div></section>`;
  }
  if (!profile || editingProfile) return `${tabs}${profileCardHTML(profile)}`;
  return `${tabs}${tab === 'arcade' ? arcadeBoardHTML(state) : picksBoardHTML(state)}`;
}

/* ================= the museum (unchanged spirit) ================= */

/* The museum lede: local identity built only from what actually happened on
   this phone — arcade tier, record, achievements. Nothing global, nothing
   invented, and it keeps its value after the tournament ends. */
function museumHeroHTML(state) {
  const { play, real, sims } = state;
  const ledger = arcadeLedger(play, real.overlay, sims);
  const stats = gradePredictions(play.predictions?.picks || {}, real.overlay);
  const savedCount = (sims.saved || []).length;
  let tier = 0;
  for (let i = 0; i < TIERS.length; i++) if (ledger.points >= TIERS[i][1]) tier = i;
  const earned = achievementState().filter((a) => a.on);
  const hasAnything = ledger.played || stats.total || savedCount || Object.keys(play.predictions?.picks || {}).length;
  return `<section class="you-card you-hero" aria-label="Your tournament in numbers">
    <p class="bd-kicker">Kept on this phone</p>
    <h2 class="display">${esc(TIERS[tier][0])}</h2>
    <p class="you-hero-sub">${hasAnything
    ? 'Your World Cup, in numbers. Everything here is yours and stays replayable after the final.'
    : 'Your World Cup scrapbook starts with one call or one showdown — everything you do is kept here.'}</p>
    <div class="ladder-grid" role="group" aria-label="Local record">
      <span class="ladder-cell"><b>${stats.right}/${stats.total}</b><small>calls right</small></span>
      <span class="ladder-cell"><b>${ledger.wins}W–${ledger.played - ledger.wins}L</b><small>Match Lab</small></span>
      <span class="ladder-cell"><b>${savedCount}</b><small>timelines saved</small></span>
      <span class="ladder-cell"><b>${ledger.points}</b><small>Arcade Points</small></span>
    </div>
    ${earned.length ? `<div class="you-ach-row" aria-label="Earned achievements">
      ${earned.map((a) => `<span class="you-ach" title="${esc(a.desc)}">${a.icon} ${esc(a.name)}</span>`).join('')}
    </div>` : '<p class="you-hero-hint">Achievements land here from real play — an upset call, a five-streak, a shootout escape.</p>'}
  </section>`;
}

/* Hall of Moments — the nights worth keeping: best upset, deepest comeback,
   the shootout that got away, the gauntlet record. Every chip is derived from
   runs that actually happened on this phone. */
function hallOfMomentsHTML(play) {
  const lab = play.labHistory || [];
  const chips = [];
  const upsets = lab.filter((e) => e.win && e.upset);
  if (upsets.length) {
    const u = upsets.reduce((a, b) => ((b.cp || 0) > (a.cp || 0) ? b : a));
    chips.push(`<span class="you-moment upset">🗡️ Best upset — ${teamFlag(u.home)} ${u.gh}–${u.ga} ${teamFlag(u.away)}</span>`);
  }
  const comebacks = lab.filter((e) => e.win && (e.comeback || 0) >= 1);
  if (comebacks.length) {
    const c = comebacks.reduce((a, b) => ((b.comeback || 0) > (a.comeback || 0) ? b : a));
    chips.push(`<span class="you-moment comeback">↩ Came back from ${c.comeback} down — ${teamFlag(c.home)} ${c.gh}–${c.ga} ${teamFlag(c.away)}</span>`);
  }
  const heartbreak = lab.find((e) => !e.win && e.pens);
  if (heartbreak) {
    chips.push(`<span class="you-moment heartbreak">💔 Penalty heartbreak — ${heartbreak.pens.ph}–${heartbreak.pens.pa} on kicks</span>`);
  }
  const rush = play.penaltyRush;
  if (rush && rush.played) {
    chips.push(`<span class="you-moment rush">◐ Gauntlet best ${rush.bestEver || 0}${rush.perfects ? ` · ${rush.perfects} perfect` : ''}</span>`);
  }
  const fm = play.fmHistory || [];
  const fmBest = fm.find((e) => e.result === 'W' && e.scenario === 'rescue') || fm.find((e) => e.result === 'W');
  if (fmBest) {
    chips.push(`<span class="you-moment fm">⏱ ${fmBest.scenario === 'rescue' ? 'Turned it around' : 'Held the line'} at 90+ — ${fmBest.gYou}–${fmBest.gThem} v ${teamFlag(fmBest.opp)}</span>`);
  }
  const cc = play.ccHistory || [];
  const ccBest = cc.find((e) => e.result === 'W' && e.situation === 'response') || cc.find((e) => e.result === 'W');
  if (ccBest) {
    chips.push(`<span class="you-moment cc">📋 ${ccBest.situation === 'response' ? 'Turned it from the dugout' : 'Out-coached them'} — ${ccBest.gYou}–${ccBest.gThem} v ${teamFlag(ccBest.opp)}</span>`);
  }
  const goldCup = (play.cupHistory || []).find((c) => c.trophy && c.trophy.tier === 'gold');
  if (goldCup) {
    chips.push(`<span class="you-moment cup">🏆 Perfect Arcade Cup — ${teamFlag(goldCup.side)} four stops, four wins</span>`);
  }
  if (!chips.length) return '';
  return `<div class="you-moments" aria-label="Hall of moments">${chips.join('')}</div>`;
}

/* The trophy shelf — every finished Arcade Cup run, kept like silverware.
   Local game prizes only: never money, never an official claim. */
function trophyRoomHTML(play) {
  const cups = play.cupHistory || [];
  const counts = { gold: 0, silver: 0, bronze: 0, finisher: 0 };
  for (const c of cups) counts[(c.trophy && c.trophy.tier) || 'finisher'] += 1;
  return `<section class="you-card you-trophies${cups.length ? '' : ' empty'}" aria-label="Trophy room">
    <p class="bd-kicker">Trophy room · on this phone</p>
    ${cups.length ? `
    <div class="trophy-counts" role="group" aria-label="Trophy counts">
      ${counts.gold ? `<span class="trophy-count t-gold">🏆 ${counts.gold}</span>` : ''}
      ${counts.silver ? `<span class="trophy-count t-silver">🥈 ${counts.silver}</span>` : ''}
      ${counts.bronze ? `<span class="trophy-count t-bronze">🥉 ${counts.bronze}</span>` : ''}
      ${counts.finisher ? `<span class="trophy-count t-finisher">🎖️ ${counts.finisher}</span>` : ''}
    </div>
    <div class="trophy-shelf">
      ${cups.slice(0, 8).map((c) => `
      <div class="you-trophy t-${(c.trophy && c.trophy.tier) || 'finisher'}">
        <span class="you-trophy-icon" aria-hidden="true">${c.trophy ? c.trophy.icon : '🎖️'}</span>
        <div class="you-trophy-id">
          <strong>${esc(c.trophy ? c.trophy.label : 'Run complete')}</strong>
          <small>${teamFlag(c.side)} ${esc(teamName(c.side))} · ${c.wins}/4 stops · ${esc(fmtDate(c.at))}</small>
        </div>
        <span class="you-trophy-stops" aria-hidden="true">${CUP_STOPS.map((s) => `<i class="cup-dot ${c.stops && c.stops[s.id] ? c.stops[s.id].toLowerCase() : 'wait'}"></i>`).join('')}</span>
      </div>`).join('')}
    </div>` : `
    <p class="you-side-empty">The shelf is waiting for its first cup. Run the Arcade Cup on the
      Play tab — four stops, one trophy, all kept here.</p>
    <button class="you-sideaction" id="you-goto-cup">Start the Arcade Cup</button>`}
  </section>`;
}

/* Your side on this phone — the museum's identity wall. Local record only:
   never a claim about the real tournament. */
function youSideHTML(play) {
  const side = currentSide(play);
  if (!side) {
    return `<section class="you-card you-side unclaimed" aria-label="Your side">
      <p class="bd-kicker">Your side</p>
      <p class="you-side-empty">No side claimed yet. Pick a team on the Play tab and every arcade
        win, defeat, and late rescue starts counting here.</p>
      <button class="you-sideaction" id="you-change-side">Pick your side</button>
    </section>`;
  }
  const rec = sideRecordFor(play, side.code);
  const fm = play.finalMinute || null;
  const since = fmtDate(side.since);
  return `<section class="you-card you-side" aria-label="Your side" style="--side:${TEAM_COLORS[side.code] || 'var(--gold)'}">
    <p class="bd-kicker">Your side · on this phone</p>
    <div class="you-side-row">
      <span class="you-side-flag" aria-hidden="true">${teamFlag(side.code)}</span>
      <div class="you-side-id">
        <strong class="display">${esc(teamName(side.code))}</strong>
        <span>${since ? `claimed ${esc(since)} · ` : ''}local record only</span>
      </div>
    </div>
    <div class="ladder-grid" role="group" aria-label="Side record">
      <span class="ladder-cell"><b>${rec.w}W–${rec.l}L${rec.d ? '–' + rec.d + 'D' : ''}</b><small>local record</small></span>
      <span class="ladder-cell"><b>${rec.streak >= 2 ? '🔥' + rec.streak : rec.streak}</b><small>streak</small></span>
      <span class="ladder-cell"><b>${rec.best}</b><small>best run</small></span>
      <span class="ladder-cell"><b>${fm && fm.played ? `${fm.w}–${fm.l}–${fm.d}` : '—'}</b><small>final minute</small></span>
    </div>
    <button class="you-sideaction" id="you-change-side">Change side</button>
  </section>`;
}

function museumHTML(state) {
  const { sims, prefs, play, real } = state;
  const saved = sims.saved || [];
  const lab = play.labHistory || [];
  const stats = gradePredictions(play.predictions?.picks || {}, real.overlay);
  const pickCount = Object.keys(play.predictions?.picks || {}).length;
  const labWins = lab.filter((e) => e.win).length;
  const bestCp = lab.length ? Math.max(...lab.map((m) => m.cp || 0)) : 0;
  return `
    ${museumHeroHTML(state)}
    ${youSideHTML(play)}
    ${trophyRoomHTML(play)}
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
      ${hallOfMomentsHTML(play)}
      ${lab.length ? lab.slice(0, 6).map((m, i) => {
    const bestNight = (m.cp || 0) > 0 && (m.cp || 0) === bestCp;
    return `
        <div class="you-lab${bestNight ? ' best' : ''}">
          <span class="you-lab-score">${m.result ? `<b class="you-res ${m.result === 'W' ? 'w' : 'l'}" title="${m.result === 'W' ? 'Your side won' : 'Your side lost'}">${m.result}</b> ` : ''}${teamFlag(m.home)} <strong>${m.gh}–${m.ga}</strong>${m.pens ? `<small> ${m.pens.ph}–${m.pens.pa}p</small>` : ''} ${teamFlag(m.away)}
            ${(m.tags || []).slice(0, 2).map((t) => `<em class="you-lab-tag ${t}">${esc((LAB_TAG_LABELS[t] || t).toLowerCase())}</em>`).join('')}${!(m.tags || []).length && m.upset ? '<em class="you-lab-tag upset">upset</em>' : ''}${!(m.tags || []).length && (m.comeback || 0) >= 2 ? '<em class="you-lab-tag comeback">comeback</em>' : ''}${bestNight ? '<em class="you-lab-tag best">best night</em>' : ''}</span>
          <span class="you-sim-meta">${esc(teamName(m.home))} v ${esc(teamName(m.away))} · ${esc(fmtDate(m.at))}${m.cp ? ' · +' + m.cp + ' CP' : ''}</span>
          ${m.story ? `<span class="you-lab-story">${esc(m.story)}</span>` : ''}
          ${m.seed ? `<button class="you-replay" data-replaylab="${i}" aria-label="Replay ${esc(teamName(m.home))} versus ${esc(teamName(m.away))} exactly as it happened">Replay this night</button>` : ''}
        </div>`;
  }).join('')
    : '<p class="empty-line">No lab matches yet — Tonight’s Showdown is one tap away on the Play tab.</p>'}
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

function wireAuth(outlet) {
  const send = outlet.querySelector('#board-sendcode');
  if (send) {
    send.addEventListener('click', async () => {
      const email = (outlet.querySelector('#board-email')?.value || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { authError = 'Enter a valid email address.'; repaintYou(); return; }
      authEmail = email; authError = null; authStep = 'busy'; repaintYou();
      try { await requestEmailCode(email); authStep = 'code'; }
      catch { authStep = 'email'; authError = 'Couldn\'t send the code. Try again.'; }
      repaintYou();
    });
  }
  const verify = outlet.querySelector('#board-verify');
  if (verify) {
    verify.addEventListener('click', async () => {
      const code = (outlet.querySelector('#board-code')?.value || '').trim();
      if (!/^\d{6}$/.test(code)) { authError = 'Codes are 6 digits.'; repaintYou(); return; }
      authError = null;
      try {
        await verifyEmailCode(authEmail, code);
        authStep = 'email';
        profileLoaded = false; profile = null;
        await loadProfileOnce();
        // no fetch while the claim-profile form is open: a background
        // repaint must never eat what the player is typing
        if (profile) { syncMyPicks(); refreshBoard(true); }
      } catch { authError = 'That code didn\'t work — check it and try again.'; }
      repaintYou();
    });
  }
  const back = outlet.querySelector('#board-back');
  if (back) back.addEventListener('click', () => { authStep = 'email'; authError = null; repaintYou(); });
}

function wireProfile(outlet) {
  let chosen = profile?.avatar || AVATARS[0];
  outlet.querySelectorAll('[data-avatar]').forEach((b) => {
    b.addEventListener('click', () => {
      chosen = b.dataset.avatar;
      outlet.querySelectorAll('[data-avatar]').forEach((x) => x.classList.toggle('on', x === b));
    });
  });
  const save = outlet.querySelector('#board-saveprofile');
  if (save) {
    save.addEventListener('click', async () => {
      const name = (outlet.querySelector('#board-name')?.value || '').trim();
      if (!validDisplayName(name)) { profileError = 'Names are 2–24 letters or numbers.'; repaintYou(); return; }
      profileError = null;
      try {
        await upsertMyProfile({ displayName: name, avatar: chosen });
        const isNew = !profile;
        profile = { display_name: name, avatar: chosen };
        editingProfile = false;
        if (isNew) logActivity('You joined the leaderboard');
        syncMyPicks();
        refreshBoard(true);
      } catch {
        profileError = 'Couldn\'t save — that name may already be taken.';
      }
      repaintYou();
    });
  }
  const cancel = outlet.querySelector('#board-cancelprofile');
  if (cancel) cancel.addEventListener('click', () => { editingProfile = false; repaintYou(); });
}

function wireBoard(outlet) {
  wireAuth(outlet);
  wireProfile(outlet);
  const refresh = outlet.querySelector('#board-refresh');
  if (refresh) refresh.addEventListener('click', () => refreshBoard(true));
  const retry = outlet.querySelector('#board-retry');
  if (retry) retry.addEventListener('click', () => refreshBoard(true));
  const edit = outlet.querySelector('#board-editprofile');
  if (edit) edit.addEventListener('click', () => { editingProfile = true; repaintYou(); });
  const out = outlet.querySelector('#board-signout');
  if (out) {
    out.addEventListener('click', () => {
      signOut();
      profile = null; profileLoaded = false; picksSynced = false;
      setBoard({ status: 'idle', picks: [], me: null, arcade: [], fetchedAt: 0, error: null });
      repaintYou();
    });
  }
  outlet.querySelectorAll('[data-scope]').forEach((b) => {
    b.addEventListener('click', () => setBoardScope(b.dataset.scope));
  });
  const tabCtl = outlet.querySelector('[data-segmented="board-tab"]');
  if (tabCtl) {
    tabCtl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-value]');
      if (btn) setBoardTab(btn.dataset.value);
    });
  }
}

export function render(outlet) {
  const state = getState();
  const view = state.nav.youView;
  const body = view === 'board' ? boardHTML(state) : museumHTML(state);
  outlet.innerHTML = `<div class="view you-view">
    <header class="view-head"><p class="view-kicker gold">${view === 'board' ? 'Global Competition' : 'Your Museum'}</p><h1>You</h1></header>
    ${segmentedControl({
    id: 'you-view', label: 'You sections', value: view,
    options: [
      { value: 'you', label: 'You' },
      { value: 'board', label: 'Leaderboard' },
    ],
  })}
    ${body}
  </div>`;
  outlet.querySelector('[data-segmented="you-view"]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-value]');
    if (btn) setYouView(btn.dataset.value);
  });
  if (view === 'board') {
    wireBoard(outlet);
    if (currentUser()) {
      loadProfileOnce();
      if (profile) {
        refreshBoard();
        syncMyPicks();
        if (state.nav.boardTab === 'arcade') syncArcade();
      }
    }
  }
  outlet.querySelectorAll('[data-del]').forEach((el) => {
    el.addEventListener('click', () => {
      const next = { saved: (getState().sims.saved || []).filter((s) => s.id !== el.dataset.del) };
      setSims(next); saveSims(next);
    });
  });
  // museum replay: same teams, same approach, same seed — the exact night
  outlet.querySelectorAll('[data-replaylab]').forEach((el) => {
    el.addEventListener('click', () => {
      const entry = (getState().play.labHistory || [])[Number(el.dataset.replaylab)];
      if (!entry) return;
      replayLabEntry(entry);
      activate('play');
    });
  });
  // your side: pick or change from the museum — lands on the Play picker
  const changeSide = outlet.querySelector('#you-change-side');
  if (changeSide) {
    changeSide.addEventListener('click', () => {
      openSidePicker();
      activate('play');
    });
  }
  // trophy room: the empty shelf points straight at the Arcade Cup
  const gotoCup = outlet.querySelector('#you-goto-cup');
  if (gotoCup) {
    gotoCup.addEventListener('click', () => {
      setPlayMode('cup');
      activate('play');
    });
  }
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
