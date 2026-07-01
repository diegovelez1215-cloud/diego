// United 2026 — Play. The arcade: three connected modes, all sealed off from
// real tournament truth. Match Lab runs an interactive 90-minute simulation
// with momentum and decisions. My World Cup is a private, tappable bracket
// journey. Prediction Run is non-monetary tournament intelligence — picks,
// confidence, streaks. Gold light, tactile controls, rare weirdness. It can
// never modify real fixtures, standings, Home, the official bracket, or
// Match Center — everything here operates on deep copies in the Play
// namespace only.

import { getState, setPlay, setSims, setPlayMode } from '../core/app-state.js';
import { savePlay, saveSims } from '../core/persistence.js';
import {
  allFixtures, teamName, teamFlag, computeStandings, resolveSlots, STAGE_NAMES, STAGE_ORDER,
} from '../core/canonical-truth.js';
import { TEAMS, RATINGS, TEAM_COLORS } from '../data/fixtures.js';
import { bracketHTML, wireBracketScroller } from '../components/bracket.js';
import { segmentedControl } from '../components/segmented-control.js';
import { formatKickoffTime, formatDayKey, now } from '../core/time.js';
import { esc } from '../components/match-row.js';

export const seedHTML = `<div class="view play-view">
  <header class="view-head"><h1>Play</h1><p class="view-sub">Private simulation space</p></header>
  <div class="view-shell-note">warming up the spreadsheet…</div>
</div>`;

/* ================= deterministic engine (Play-only) ================= */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(rng, lambda) {
  const L = Math.exp(-lambda);
  let k = 0; let p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}

export function simulateMatch(home, away, rng, { knockout = false } = {}) {
  const rh = RATINGS[home] || 70; const ra = RATINGS[away] || 70;
  const edge = (rh - ra) / 24;
  let gh = poisson(rng, Math.max(0.25, 1.35 + edge * 0.9));
  let ga = poisson(rng, Math.max(0.25, 1.35 - edge * 0.9));
  let pens = null; let winner = gh > ga ? 'home' : gh < ga ? 'away' : 'draw';
  if (knockout && gh === ga) {
    const eh = poisson(rng, Math.max(0.1, 0.42 + edge * 0.3));
    const ea = poisson(rng, Math.max(0.1, 0.42 - edge * 0.3));
    gh += eh; ga += ea;
    if (gh === ga) {
      let ph = 0; let pa = 0;
      for (let i = 0; i < 5 || ph === pa; i++) { if (rng() < 0.76) ph++; if (rng() < 0.76) pa++; }
      pens = { ph, pa };
      winner = ph > pa ? 'home' : 'away';
    } else winner = gh > ga ? 'home' : 'away';
  }
  return { gh, ga, pens, winner };
}

const GRUG = [
  'football has chosen violence.',
  'this bracket is now legally haunted.',
  'the simulation ate the favorites.',
  'one tiny miracle, coming up.',
  'the spreadsheet has developed feelings.',
];
function grugLine(rng) { return GRUG[Math.floor(rng() * GRUG.length)]; }

/* ================= Match Lab ================= */

const APPROACHES = {
  balanced: { label: 'Balanced', atk: 1.0, def: 1.0, blurb: 'trust the plan' },
  press: { label: 'All-out press', atk: 1.3, def: 0.78, blurb: 'chaos, invited' },
  counter: { label: 'Counter', atk: 0.92, def: 1.15, blurb: 'spring the trap' },
  fortress: { label: 'Fortress', atk: 0.72, def: 1.35, blurb: 'nothing gets through' },
};

const DECISIONS = {
  45: {
    prompt: 'Halftime. The dressing room looks at you.',
    options: [
      { id: 'push', label: 'Push higher', atk: 1.25, def: 0.85 },
      { id: 'steady', label: 'Stay the course', atk: 1.0, def: 1.0 },
      { id: 'tighten', label: 'Tighten up', atk: 0.8, def: 1.25 },
    ],
  },
  68: {
    prompt: "68 minutes. Legs are heavy. What's the call?",
    options: [
      { id: 'gamble', label: 'Throw everything', atk: 1.45, def: 0.7 },
      { id: 'fresh', label: 'Fresh legs, same shape', atk: 1.1, def: 1.05 },
      { id: 'shell', label: 'Shell and survive', atk: 0.65, def: 1.4 },
    ],
  },
};

// Minute-by-minute segment simulation. Lab state lives in the Play namespace;
// the ticking run itself is module-local (never persisted mid-run).
let labRun = null; // { home, away, seed, rng, minute, gh, ga, events, momentum, approach, mods, paused, decisionAt, done, pens }
let labTimer = null;

function labChanceRates(run) {
  const rh = RATINGS[run.home] || 70; const ra = RATINGS[run.away] || 70;
  const edge = (rh - ra) / 24;
  const a = APPROACHES[run.approach] || APPROACHES.balanced;
  const m = run.mods; // cumulative decision multipliers
  const base = 0.030; // chance-per-minute baseline
  return {
    h: Math.max(0.006, base * (1 + edge * 0.55) * a.atk * m.atk),
    aRate: Math.max(0.006, base * (1 - edge * 0.55) * (2 - a.def) * (2 - m.def)),
    convert: 0.34,
  };
}

function labTick() {
  const run = labRun;
  if (!run || run.paused || run.done) return;
  run.minute++;
  const rng = run.rng;
  const rates = labChanceRates(run);
  const swing = (rng() - 0.5) * 0.5;
  run.mo = Math.max(-1, Math.min(1, (run.mo || 0) * 0.9 + swing + (rates.h - rates.aRate) * 6));
  for (const [side, rate] of [['h', rates.h], ['a', rates.aRate]]) {
    if (rng() < rate) {
      const team = side === 'h' ? run.home : run.away;
      if (rng() < rates.convert) {
        if (side === 'h') run.gh++; else run.ga++;
        run.events.push({ min: run.minute, type: 'goal', side, text: `GOAL — ${teamName(team)} (${run.gh}–${run.ga})` });
        run.mo += side === 'h' ? 0.6 : -0.6;
      } else if (rng() < 0.3) {
        run.events.push({ min: run.minute, type: 'chance', side, text: `${teamName(team)} go close` });
      }
    }
  }
  if (DECISIONS[run.minute] && !run.decided[run.minute]) {
    run.paused = true;
    run.decisionAt = run.minute;
  }
  if (run.minute >= 90) {
    if (run.gh === run.ga) {
      // finals rules in the Lab: straight to a seeded shootout after 90
      let ph = 0; let pa = 0;
      for (let i = 0; i < 5 || ph === pa; i++) { if (rng() < 0.76) ph++; if (rng() < 0.76) pa++; }
      run.pens = { ph, pa };
      run.events.push({ min: 90, type: 'pens', side: ph > pa ? 'h' : 'a', text: `Penalties: ${ph}–${pa}` });
    }
    run.done = true;
    run.line = grugLine(rng);
    finishLab();
  }
  paintLab();
  if (run.paused || run.done) stopLabTimer();
}

function stopLabTimer() { clearInterval(labTimer); labTimer = null; }

function startLabTimer() {
  stopLabTimer();
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { while (labRun && !labRun.done && !labRun.paused) labTick(); return; }
  labTimer = setInterval(labTick, 55);
}

function beginLab(home, away, approach) {
  const seed = (Date.now() % 2147483647) | 1;
  labRun = {
    home, away, approach, seed, rng: mulberry32(seed),
    minute: 0, gh: 0, ga: 0, mo: 0, events: [], decided: {}, mods: { atk: 1, def: 1 },
    paused: false, decisionAt: null, done: false, pens: null,
  };
  repaintPlay();
  startLabTimer();
}

function decideLab(optionId) {
  const run = labRun;
  if (!run || run.decisionAt == null) return;
  const d = DECISIONS[run.decisionAt];
  const opt = d.options.find((o) => o.id === optionId);
  if (!opt) return;
  run.mods = { atk: run.mods.atk * opt.atk, def: run.mods.def * opt.def };
  run.decided[run.decisionAt] = optionId;
  run.events.push({ min: run.decisionAt, type: 'decision', side: 'h', text: opt.label });
  run.paused = false; run.decisionAt = null;
  repaintPlay();
  startLabTimer();
}

function finishLab() {
  const run = labRun;
  const { play } = getState();
  const entry = {
    at: new Date().toISOString(),
    home: run.home, away: run.away, gh: run.gh, ga: run.ga,
    pens: run.pens, approach: run.approach, line: run.line,
  };
  const nextPlay = { ...play, labHistory: [entry, ...(play.labHistory || [])].slice(0, 30) };
  setPlay(nextPlay);
  savePlay(nextPlay);
}

function resetLab() { stopLabTimer(); labRun = null; repaintPlay(); }

/* ================= My World Cup (sealed world) ================= */

function realFinalsCopy(overlay) {
  // Deep copy of validated finals — the ONLY bridge from real to Play, one-way.
  const finals = new Map();
  for (const [id, ov] of overlay.byFixture) {
    if (ov.status === 'final' && ov.winner) {
      finals.set(id, { gh: ov.gh, ga: ov.ga, winner: ov.winner });
    }
  }
  return finals;
}

function simWorld(overlay, play) {
  const finals = realFinalsCopy(overlay);
  const sim = play.myWorldCup || {};
  for (const [id, r] of Object.entries(sim.finals || {})) {
    if (!finals.has(Number(id))) finals.set(Number(id), r);
  }
  const groupFinals = new Map(); const koFinals = new Map();
  for (const [id, r] of finals) {
    const fx = allFixtures().find((f) => f.id === id);
    if (fx && fx.stage === 'group') { if (r.gh != null) groupFinals.set(id, r); } else koFinals.set(id, r);
  }
  const standings = computeStandings(groupFinals);
  const slots = resolveSlots(standings, koFinals);
  return { finals, slots, standings };
}

function nextSimStage(world) {
  for (const stage of STAGE_ORDER) {
    const remaining = allFixtures().filter((f) => f.stage === stage && !world.finals.has(f.id));
    if (remaining.length) return { stage, remaining };
  }
  return null;
}

function ensureSim(play) {
  return play.myWorldCup || { seed: (Date.now() % 2147483647) | 1, finals: {}, log: [] };
}

function commitSim(sim) {
  const { real, play } = getState();
  const after = simWorld(real.overlay, { myWorldCup: sim });
  if (!nextSimStage(after)) {
    const finalFx = allFixtures().find((f) => f.stage === 'final');
    const fSlots = after.slots.get(finalFx.id); const fRes = after.finals.get(finalFx.id);
    sim.champion = fRes && fSlots && fRes.winner !== 'draw'
      ? (fRes.winner === 'home' ? fSlots.home : fSlots.away) : null;
  } else {
    sim.champion = null;
  }
  const nextPlay = { ...play, myWorldCup: sim };
  setPlay(nextPlay);
  savePlay(nextPlay);
}

export function playNextRound() {
  const { real, play } = getState();
  const sim = ensureSim(play);
  const rng = mulberry32(sim.seed + Object.keys(sim.finals).length * 977);
  const world = simWorld(real.overlay, { myWorldCup: sim });
  const next = nextSimStage(world);
  if (!next) return;
  const results = [];
  for (const fx of next.remaining) {
    const s = world.slots.get(fx.id) || {};
    if (!s.home || !s.away) continue; // unresolved after sim standings — skip honestly
    const r = simulateMatch(s.home, s.away, rng, { knockout: fx.stage !== 'group' });
    sim.finals[fx.id] = { gh: r.gh, ga: r.ga, winner: r.winner, pens: r.pens };
    results.push({ id: fx.id, stage: fx.stage, home: s.home, away: s.away, ...r });
  }
  sim.log = (sim.log || []).concat([{ stage: next.stage, results, line: grugLine(rng) }]);
  commitSim(sim);
}

let simPacer = null;
function simulateRemainingPaced() {
  clearInterval(simPacer);
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    for (let i = 0; i < 10; i++) playNextRound();
    return;
  }
  simPacer = setInterval(() => {
    const { real, play } = getState();
    const world = simWorld(real.overlay, play);
    if (!nextSimStage(world)) { clearInterval(simPacer); simPacer = null; return; }
    playNextRound();
  }, 700);
}

function pickWinner(fixtureId, side) {
  const { play } = getState();
  const sim = ensureSim(play);
  sim.finals[fixtureId] = { gh: null, ga: null, winner: side, picked: true };
  commitSim(sim);
}

function unpick(fixtureId) {
  const { play } = getState();
  const sim = ensureSim(play);
  const entry = sim.finals[fixtureId];
  if (!entry || !entry.picked) return;
  delete sim.finals[fixtureId];
  commitSim(sim);
}

export function resetMyWorldCup() {
  clearInterval(simPacer); simPacer = null;
  const { play } = getState();
  const nextPlay = { ...play, myWorldCup: null };
  setPlay(nextPlay);
  savePlay(nextPlay);
}

export function saveCurrentSim() {
  const { play, sims } = getState();
  const sim = play.myWorldCup;
  if (!sim || !sim.champion) return;
  const entry = {
    id: 'sim-' + Date.now(),
    at: new Date().toISOString(),
    champion: sim.champion,
    championName: teamName(sim.champion),
    seed: sim.seed,
    rounds: (sim.log || []).length,
    picks: Object.values(sim.finals).filter((f) => f.picked).length,
  };
  const next = { saved: [entry, ...(sims.saved || [])].slice(0, 50) };
  setSims(next);
  saveSims(next);
}

/* ================= Prediction Run ================= */

const CONF = { 1: 'Hunch', 2: 'Call', 3: 'Lock' };

function predictableFixtures(overlay) {
  const t = now();
  return allFixtures()
    .filter((f) => {
      const s = overlay.slots.get(f.id) || {};
      const ov = overlay.byFixture.get(f.id);
      return s.home && s.away && f.epoch > t && (!ov || ov.status === 'scheduled');
    })
    .slice(0, 8);
}

/** Grade picks against current validated finals — computed live, never stored. */
export function gradePredictions(picks, overlay) {
  const graded = [];
  for (const [idStr, pick] of Object.entries(picks || {})) {
    const id = Number(idStr);
    const ov = overlay.byFixture.get(id);
    const fx = allFixtures().find((f) => f.id === id);
    if (!fx || !ov || ov.status !== 'final' || !ov.winner) continue;
    graded.push({ id, epoch: fx.epoch, correct: ov.winner === pick.side, conf: pick.conf });
  }
  graded.sort((a, b) => a.epoch - b.epoch);
  let insight = 0; let streak = 0; let best = 0; let right = 0;
  for (const g of graded) {
    if (g.correct) { right++; insight += g.conf * 10; streak++; best = Math.max(best, streak); }
    else streak = 0;
  }
  return { graded, right, total: graded.length, insight, streak, best };
}

function setPick(fixtureId, side, conf) {
  const { play } = getState();
  const picks = { ...(play.predictions?.picks || {}) };
  picks[fixtureId] = { side, conf, at: new Date().toISOString() };
  const nextPlay = { ...play, predictions: { picks } };
  setPlay(nextPlay);
  savePlay(nextPlay);
}

/* ================= rendering ================= */

function teamOptions(selected) {
  return Object.keys(TEAMS).sort((a, b) => teamName(a).localeCompare(teamName(b)))
    .map((c) => `<option value="${c}"${c === selected ? ' selected' : ''}>${esc(teamName(c))}</option>`).join('');
}

function labSetupHTML(play) {
  const last = (play.labHistory || [])[0];
  return `<section class="play-card lab" aria-label="Match Lab">
    <h2>Match Lab</h2>
    <p class="play-sub">Two nations, one approach, ninety simulated minutes. You call the turning points.</p>
    <div class="wi-pickers">
      <select id="lab-home" aria-label="Home team">${teamOptions(last ? last.home : 'USA')}</select>
      <span class="wi-v">v</span>
      <select id="lab-away" aria-label="Away team">${teamOptions(last ? last.away : 'ARG')}</select>
    </div>
    <div class="lab-approaches" role="group" aria-label="Match approach">
      ${Object.entries(APPROACHES).map(([id, a], i) => `
        <button class="lab-approach${i === 0 ? ' active' : ''}" data-approach="${id}">
          <span class="la-name">${a.label}</span><span class="la-blurb">${a.blurb}</span>
        </button>`).join('')}
    </div>
    <button class="play-btn gold" id="lab-kickoff">Kick off</button>
    ${last ? `<p class="lab-last">Last time: ${teamFlag(last.home)} ${last.gh}–${last.ga}${last.pens ? ' (' + last.pens.ph + '–' + last.pens.pa + 'p)' : ''} ${teamFlag(last.away)} · <span class="grug-line">${esc(last.line || '')}</span></p>` : ''}
  </section>`;
}

function labEventIcon(type) {
  return type === 'goal' ? '●' : type === 'pens' ? '◐' : type === 'decision' ? '▸' : '○';
}

function labRunHTML(run) {
  const homeColor = TEAM_COLORS[run.home] || 'var(--gold)';
  const awayColor = TEAM_COLORS[run.away] || 'var(--gold)';
  const decision = run.decisionAt != null ? DECISIONS[run.decisionAt] : null;
  const moPct = ((run.mo + 1) / 2) * 100;
  return `<section class="play-card lab running${run.done ? ' done' : ''}" aria-label="Match Lab simulation">
    <div class="lab-stage" style="--hc:${homeColor};--ac:${awayColor}">
      <div class="lab-clock" aria-live="polite">${run.done ? 'FULL TIME' : run.minute + '&prime;'}</div>
      <div class="lab-score-row">
        <div class="lab-team">${teamFlag(run.home)}<span>${esc(teamName(run.home))}</span></div>
        <div class="lab-score" id="lab-score">${run.gh}<span class="lab-sep">–</span>${run.ga}</div>
        <div class="lab-team away"><span>${esc(teamName(run.away))}</span>${teamFlag(run.away)}</div>
      </div>
      ${run.pens ? `<div class="lab-pens">Penalties ${run.pens.ph}–${run.pens.pa}</div>` : ''}
      <div class="lab-momentum" aria-hidden="true"><div class="lab-mo-fill" id="lab-mo" style="width:${moPct}%"></div></div>
      <div class="lab-mo-labels" aria-hidden="true"><span>${esc(teamName(run.away))}</span><span>momentum</span><span>${esc(teamName(run.home))}</span></div>
    </div>
    ${decision ? `<div class="lab-decision" role="group" aria-label="${esc(decision.prompt)}">
      <p class="lab-decision-prompt">${esc(decision.prompt)}</p>
      <div class="lab-decision-opts">
        ${decision.options.map((o) => `<button class="lab-opt" data-decide="${o.id}">${o.label}</button>`).join('')}
      </div>
    </div>` : ''}
    <ol class="lab-feed" id="lab-feed" aria-label="Match events">
      ${run.events.slice(-7).map((e) => `<li class="lab-ev ${e.type}"><span class="lab-ev-min">${e.min}&prime;</span><span class="lab-ev-ic">${labEventIcon(e.type)}</span>${esc(e.text)}</li>`).join('')}
    </ol>
    ${run.done ? `<p class="grug-line">${esc(run.line || '')}</p>
    <div class="play-actions">
      <button class="play-btn gold" id="lab-again">Run it again</button>
      <button class="play-btn quiet" id="lab-new">New matchup</button>
    </div>
    <p class="lab-saved-note">Saved to You.</p>` : ''}
  </section>`;
}

// Targeted mid-run repaint: swap only the lab card, keep selects/timers alive.
function paintLab() {
  const card = document.querySelector('.play-view .lab.running');
  if (!card || !labRun) { repaintPlay(); return; }
  const wrap = document.createElement('div');
  wrap.innerHTML = labRunHTML(labRun);
  card.replaceWith(wrap.firstElementChild);
  wireLab(document.querySelector('.play-view'));
}

function myWorldCupHTML(overlay, play, pendingPick) {
  const sim = play.myWorldCup;
  const world = simWorld(overlay, play);
  const results = new Map();
  for (const [id, r] of world.finals) {
    results.set(id, { ...r, status: 'final', picked: !!(sim && sim.finals && sim.finals[id] && sim.finals[id].picked) });
  }
  const next = nextSimStage(world);
  const champion = sim && sim.champion;
  const pickFx = pendingPick != null ? world.slots.get(pendingPick) : null;
  return `<section class="play-card my-wc bracket-card" aria-label="My World Cup">
    <header class="mwc-head">
      <div><h2>My World Cup</h2>
      <p class="play-sub">Your private timeline. Tap an open tie to send someone through — the real bracket never notices.</p></div>
      <span class="sim-badge">SIMULATION</span>
    </header>
    ${champion ? `<div class="mwc-champion" role="status">
      <div class="mwc-crown" aria-hidden="true">★</div>
      <div class="mwc-champ-name">${teamFlag(champion)} ${esc(teamName(champion))}</div>
      <div class="mwc-champ-sub">champions of your universe</div>
    </div>` : ''}
    ${pickFx && pickFx.home && pickFx.away ? `<div class="mwc-pickbar" role="group" aria-label="Who advances?">
      <span>Who advances?</span>
      <button class="mwc-pick" data-pickside="home" style="--glow:${TEAM_COLORS[pickFx.home] || ''}">${teamFlag(pickFx.home)} ${esc(teamName(pickFx.home))}</button>
      <button class="mwc-pick" data-pickside="away" style="--glow:${TEAM_COLORS[pickFx.away] || ''}">${teamFlag(pickFx.away)} ${esc(teamName(pickFx.away))}</button>
      <button class="mwc-pick cancel" data-pickside="cancel">Cancel</button>
    </div>` : ''}
    <div class="bk-scroll sim" tabindex="0" aria-label="My World Cup bracket. Scroll horizontally.">
      ${bracketHTML({ slots: world.slots, results, mode: 'sim' }, {})}
    </div>
    <div class="play-actions row">
      ${next ? `<button class="play-btn gold" id="mwc-simulate">Simulate remaining</button>` : `<button class="play-btn gold" id="mwc-save">Save this timeline</button>`}
      <button class="play-btn quiet" id="mwc-reset">Reset</button>
    </div>
    ${next && next.stage === 'group' ? '<p class="mwc-note">Group results still forming — Simulate Remaining fills them, then hand-pick the knockouts.</p>' : ''}
  </section>`;
}

function predictionHTML(overlay, play) {
  const picks = play.predictions?.picks || {};
  const stats = gradePredictions(picks, overlay);
  const upcoming = predictableFixtures(overlay);
  return `<section class="play-card prediction" aria-label="Prediction Run">
    <h2>Prediction Run</h2>
    <p class="play-sub">Call official fixtures before they happen. Confidence earns insight; misses reset the streak. No stakes — only reputation with yourself.</p>
    <div class="pr-stats" role="group" aria-label="Prediction record">
      <div class="pr-stat"><strong>${stats.right}<span class="pr-of">/${stats.total}</span></strong><span>correct</span></div>
      <div class="pr-stat"><strong>${stats.insight}</strong><span>insight</span></div>
      <div class="pr-stat${stats.streak >= 3 ? ' hot' : ''}"><strong>${stats.streak}</strong><span>streak</span></div>
      <div class="pr-stat"><strong>${stats.best}</strong><span>best run</span></div>
    </div>
    ${upcoming.length ? upcoming.map((f) => {
    const s = overlay.slots.get(f.id);
    const pick = picks[f.id];
    return `<div class="pr-fixture${pick ? ' picked' : ''}" data-prfx="${f.id}">
        <div class="pr-meta">${esc(f.stage === 'group' ? 'Group ' + f.group : STAGE_NAMES[f.stage])} · ${esc(formatDayKey(f.day))} · ${esc(formatKickoffTime(f.epoch))}</div>
        <div class="pr-teams">
          <button class="pr-side${pick && pick.side === 'home' ? ' on' : ''}" data-prside="home">${teamFlag(s.home)} ${esc(teamName(s.home))}</button>
          ${f.stage === 'group' ? `<button class="pr-side draw${pick && pick.side === 'draw' ? ' on' : ''}" data-prside="draw">Draw</button>` : '<span class="pr-v">v</span>'}
          <button class="pr-side${pick && pick.side === 'away' ? ' on' : ''}" data-prside="away">${esc(teamName(s.away))} ${teamFlag(s.away)}</button>
        </div>
        <div class="pr-conf" role="group" aria-label="Confidence">
          ${[1, 2, 3].map((c) => `<button class="pr-conf-btn${pick && pick.conf === c ? ' on' : ''}" data-prconf="${c}">${CONF[c]}</button>`).join('')}
        </div>
      </div>`;
  }).join('') : '<p class="empty-line grug-line">no callable fixtures right now. the future is still assembling itself.</p>'}
  </section>`;
}

/* ---------------- view plumbing ---------------- */

let pendingPick = null;

function repaintPlay() {
  const outlet = document.querySelector('#outlet-play');
  if (outlet) render(outlet);
}

function wireLab(outlet) {
  outlet.querySelectorAll('[data-approach]').forEach((b) => {
    b.addEventListener('click', () => {
      outlet.querySelectorAll('[data-approach]').forEach((x) => x.classList.toggle('active', x === b));
    });
  });
  const kickoff = outlet.querySelector('#lab-kickoff');
  if (kickoff) {
    kickoff.addEventListener('click', () => {
      const approach = outlet.querySelector('[data-approach].active')?.dataset.approach || 'balanced';
      beginLab(outlet.querySelector('#lab-home').value, outlet.querySelector('#lab-away').value, approach);
    });
  }
  outlet.querySelectorAll('[data-decide]').forEach((b) => {
    b.addEventListener('click', () => decideLab(b.dataset.decide));
  });
  const again = outlet.querySelector('#lab-again');
  if (again) again.addEventListener('click', () => { const r = labRun; beginLab(r.home, r.away, r.approach); });
  const fresh = outlet.querySelector('#lab-new');
  if (fresh) fresh.addEventListener('click', resetLab);
}

function wireMwc(outlet) {
  outlet.querySelectorAll('.bk-card.pickable').forEach((card) => {
    card.addEventListener('click', () => { pendingPick = Number(card.dataset.bkid); repaintPlay(); });
  });
  outlet.querySelectorAll('[data-pickside]').forEach((b) => {
    b.addEventListener('click', () => {
      const side = b.dataset.pickside;
      const id = pendingPick;
      pendingPick = null;
      if (side !== 'cancel' && id != null) pickWinner(id, side);
      else repaintPlay();
    });
  });
  outlet.querySelectorAll('.bk-card.done .bk-state.picked').forEach((el) => {
    const card = el.closest('.bk-card');
    card.addEventListener('dblclick', () => unpick(Number(card.dataset.bkid)));
  });
  const sim = outlet.querySelector('#mwc-simulate');
  if (sim) sim.addEventListener('click', simulateRemainingPaced);
  const save = outlet.querySelector('#mwc-save');
  if (save) save.addEventListener('click', saveCurrentSim);
  const reset = outlet.querySelector('#mwc-reset');
  if (reset) reset.addEventListener('click', () => { pendingPick = null; resetMyWorldCup(); });
  wireBracketScroller(outlet);
}

function wirePrediction(outlet) {
  outlet.querySelectorAll('.pr-fixture').forEach((row) => {
    const id = Number(row.dataset.prfx);
    const current = () => getState().play.predictions?.picks?.[id];
    row.querySelectorAll('[data-prside]').forEach((b) => {
      b.addEventListener('click', () => setPick(id, b.dataset.prside, current()?.conf || 1));
    });
    row.querySelectorAll('[data-prconf]').forEach((b) => {
      b.addEventListener('click', () => {
        const cur = current();
        setPick(id, cur?.side || 'home', Number(b.dataset.prconf));
      });
    });
  });
}

export function render(outlet) {
  const { real, play, nav } = getState();
  const mode = nav.playMode;
  let body;
  if (mode === 'lab') body = labRun ? labRunHTML(labRun) : labSetupHTML(play);
  else if (mode === 'myworldcup') body = myWorldCupHTML(real.overlay, play, pendingPick);
  else body = predictionHTML(real.overlay, play);
  outlet.innerHTML = `<div class="view play-view">
    <header class="view-head"><h1>Play</h1>
      <p class="view-sub">Private simulations · nothing here touches the real tournament</p></header>
    ${segmentedControl({
    id: 'play-mode', label: 'Play modes', value: mode,
    options: [
      { value: 'lab', label: 'Match Lab' },
      { value: 'myworldcup', label: 'My World Cup' },
      { value: 'prediction', label: 'Prediction Run' },
    ],
  })}
    ${body}
  </div>`;
  outlet.querySelector('[data-segmented="play-mode"]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-value]');
    if (btn) { stopLabTimer(); if (labRun && !labRun.done) labRun = null; setPlayMode(btn.dataset.value); }
  });
  if (mode === 'lab') wireLab(outlet);
  else if (mode === 'myworldcup') wireMwc(outlet);
  else wirePrediction(outlet);
}
