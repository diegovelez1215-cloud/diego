// United 2026 — Play. The arcade: a lobby plus three connected modes, all
// sealed off from real tournament truth. Match Lab runs an interactive
// 90-minute simulation with momentum, cards, stoppage time, and decisions.
// My World Cup is a private, tappable bracket journey. Prediction Run is
// non-monetary tournament intelligence — picks, confidence, streaks.
// Gold light, tactile controls, rare weirdness. It can never modify real
// fixtures, standings, Home, the official bracket, or Match Center —
// everything here operates on deep copies in the Play namespace only.
// Arcade Points are a private game score with no cash value — game
// progression only, never money.

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
// Broadcast pace: how fast simulated minutes pass. 'key' sprints between the
// moments that matter and breathes on them. Never persisted; UI-only.
let labPace = 'normal'; // normal | fast | key
let labMute = false;    // true while a beat batches ticks — paint once per beat
const PACE_TICKS = { normal: 1, fast: 3 };

function labChanceRates(run) {
  const rh = RATINGS[run.home] || 70; const ra = RATINGS[run.away] || 70;
  const edge = (rh - ra) / 24;
  const a = APPROACHES[run.approach] || APPROACHES.balanced;
  const m = run.mods; // cumulative decision multipliers
  const base = 0.030; // chance-per-minute baseline
  let h = Math.max(0.006, base * (1 + edge * 0.55) * a.atk * m.atk);
  let aRate = Math.max(0.006, base * (1 - edge * 0.55) * (2 - a.def) * (2 - m.def));
  aRate *= run.oppMod || 1;            // away red card / fatigue penalty
  h *= run.homeMod || 1;               // home red card penalty
  // fatigue is the price of aggression: pressing postures burn legs, and
  // after ~72' tired legs genuinely open you up at the back. This is what
  // makes "Throw everything" a real gamble instead of a free attack boost.
  const pressCost = Math.max(0, a.atk * m.atk - 1.1);
  if (run.minute > 72 && pressCost > 0) {
    aRate *= 1 + Math.min(0.55, pressCost * 0.5);
  }
  // late drama: a tight game past 80' loosens up — the chasing side pushes
  if (run.minute > 80 && Math.abs(run.gh - run.ga) <= 1) {
    const chasingHome = run.gh <= run.ga;
    h *= chasingHome ? 1.4 : 0.95;
    aRate *= chasingHome ? 0.95 : 1.4;
  }
  return { h, aRate, convert: 0.34 };
}

const CHANCE_LINES = [
  (t) => `${t} rattle the post`,
  (t) => `${t} go close`,
  (t) => `the keeper says no to ${t}`,
  (t) => `${t} slice one over from twelve yards`,
  (t) => `a scramble — ${t} can't force it in`,
];

function labTick() {
  const run = labRun;
  if (!run || run.paused || run.done) return;
  if (run.minute === 0) run.events.push({ min: 0, type: 'whistle', side: 'h', text: 'Kick off.' });
  run.minute++;
  const rng = run.rng;
  const rates = labChanceRates(run);
  const swing = (rng() - 0.5) * 0.5;
  run.mo = Math.max(-1, Math.min(1, (run.mo || 0) * 0.9 + swing + (rates.h - rates.aRate) * 6));
  for (const [side, rate] of [['h', rates.h], ['a', rates.aRate]]) {
    if (rng() < rate) {
      const team = side === 'h' ? run.home : run.away;
      if (side === 'h') run.sh++; else run.sa++; // every chance is an attempt
      if (rng() < rates.convert) {
        if (side === 'h') run.gh++; else run.ga++;
        run.events.push({ min: run.minute, type: 'goal', side, text: `GOAL — ${teamName(team)} (${run.gh}–${run.ga})` });
        run.goalAt = run.minute;
        const swingTo = side === 'h' ? 0.6 : -0.6;
        // turning point: the moment that swung the night hardest
        if (Math.abs(swingTo) + Math.abs(run.mo) >= (run.turnMag || 0)) {
          run.turnMag = Math.abs(swingTo) + Math.abs(run.mo);
          run.turn = { min: run.minute, text: `${teamName(team)}'s goal for ${run.gh}–${run.ga}` };
        }
        run.mo += swingTo;
      } else if (rng() < 0.42) {
        // an unconverted chance often dies as a corner — texture plus a count
        if (side === 'h') run.ckh = (run.ckh || 0) + 1; else run.cka = (run.cka || 0) + 1;
        run.events.push({ min: run.minute, type: 'corner', side, text: `Corner — ${teamName(team)} keep the pressure on` });
      } else if (rng() < 0.3) {
        run.events.push({ min: run.minute, type: 'chance', side, text: CHANCE_LINES[Math.floor(rng() * CHANCE_LINES.length)](teamName(team)) });
      }
    }
  }
  // bookings — rare, real consequences on a red
  if (rng() < 0.016) {
    const side = rng() < 0.5 ? 'h' : 'a';
    const team = teamName(side === 'h' ? run.home : run.away);
    if (rng() < 0.1 && !run[side === 'h' ? 'redH' : 'redA']) {
      run[side === 'h' ? 'redH' : 'redA'] = true;
      if (side === 'h') run.homeMod = 0.78; else run.oppMod = 0.78;
      run.events.push({ min: run.minute, type: 'red', side, text: `RED CARD — ${team} down to ten` });
      if (1.1 >= (run.turnMag || 0)) { run.turnMag = 1.1; run.turn = { min: run.minute, text: `the red card that left ${team} with ten` }; }
      run.mo += side === 'h' ? -0.4 : 0.4;
    } else {
      run.events.push({ min: run.minute, type: 'card', side, text: `Booking for ${team}` });
    }
  }
  // substitutions as match texture (the 68' decision is the real lever)
  if ((run.minute === 61 || run.minute === 74) && rng() < 0.7) {
    const side = rng() < 0.5 ? 'h' : 'a';
    run.events.push({ min: run.minute, type: 'sub', side, text: `Substitution — fresh legs for ${teamName(side === 'h' ? run.home : run.away)}` });
  }
  // running possession from the momentum trace
  run.possAcc = (run.possAcc || 0) + 0.5 + (run.mo || 0) * 0.13;
  if (DECISIONS[run.minute] && !run.decided[run.minute]) {
    run.paused = true;
    run.decisionAt = run.minute;
  }
  // the fourth official's board goes up at 90
  if (run.minute === 90 && run.added == null) {
    const lateEvents = run.events.filter((e) => e.min > 75 && (e.type === 'goal' || e.type === 'card' || e.type === 'red' || e.type === 'sub')).length;
    run.added = Math.max(1, Math.min(6, 2 + lateEvents));
    run.events.push({ min: 90, type: 'board', side: 'h', text: `+${run.added} minutes of stoppage time` });
  }
  if (run.minute >= 90 + (run.added || 0)) {
    if (run.gh === run.ga) {
      // finals rules in the Lab: straight to a seeded shootout after stoppage
      let ph = 0; let pa = 0;
      for (let i = 0; i < 5 || ph === pa; i++) { if (rng() < 0.76) ph++; if (rng() < 0.76) pa++; }
      run.pens = { ph, pa };
      run.events.push({ min: run.minute, type: 'pens', side: ph > pa ? 'h' : 'a', text: `Penalties: ${ph}–${pa}` });
    }
    run.done = true;
    run.line = grugLine(rng);
    finishLab();
  }
  if (!labMute) paintLab();
  if (run.paused || run.done) stopLabTimer();
}

function stopLabTimer() { clearInterval(labTimer); labTimer = null; }

function startLabTimer() {
  stopLabTimer();
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { while (labRun && !labRun.done && !labRun.paused) labTick(); return; }
  labTimer = setInterval(labBeat, 55);
}

/* One broadcast beat. Normal = a minute per beat; Fast = three; Key Moments
   sprints quietly between events and lets each moment land on screen. */
function labBeat() {
  const run = labRun;
  if (!run || run.paused || run.done) return;
  labMute = true;
  try {
    if (labPace === 'key') {
      const before = run.events.length;
      let guard = 0;
      do { labTick(); guard++; } while (
        labRun && !labRun.done && !labRun.paused
        && labRun.events.length === before && guard < 15);
    } else {
      for (let i = 0; i < (PACE_TICKS[labPace] || 1); i++) {
        if (!labRun || labRun.done || labRun.paused) break;
        labTick();
      }
    }
  } finally {
    labMute = false;
  }
  paintLab(); // one paint per beat, whatever the pace — kind to iPhone Safari
}

function setLabPace(p) {
  labPace = p === 'fast' || p === 'key' ? p : 'normal';
  const card = document.querySelector('.play-view .lab.running');
  if (card) {
    card.querySelectorAll('[data-pace]').forEach((b) => b.classList.toggle('active', b.dataset.pace === labPace));
  }
}

function beginLab(home, away, approach) {
  const seed = (Date.now() % 2147483647) | 1;
  labRun = {
    home, away, approach, seed, rng: mulberry32(seed),
    minute: 0, gh: 0, ga: 0, sh: 0, sa: 0, mo: 0, events: [], decided: {}, mods: { atk: 1, def: 1 },
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

/* The payoff: every finished simulation resolves into points, a story, and a
   turning point — computed from the events that actually happened in the run. */
function labResultFacts(run) {
  const win = run.pens ? run.pens.ph > run.pens.pa : run.gh > run.ga;
  const gap = (RATINGS[run.away] || 70) - (RATINGS[run.home] || 70);
  const upset = win && gap >= 6;
  return { win, gap, upset, margin: Math.abs(run.gh - run.ga) };
}

function labArcadePoints(run, facts) {
  let cp = 20; // finishing a full 90 always counts
  if (facts.win) cp += 20 + Math.min(18, facts.margin * 6);
  if (facts.upset) cp += Math.min(30, facts.gap * 2);
  if (facts.win && run.ga === 0) cp += 8;   // clean sheet
  if (facts.win && run.pens) cp += 10;      // survived the shootout
  return cp;
}

/* Player of the Match — a positional honour derived from what actually
   happened in the run (units, not invented named people). */
function labPotm(run, facts) {
  const winSide = run.pens ? (run.pens.ph > run.pens.pa ? 'h' : 'a') : (run.gh > run.ga ? 'h' : run.gh < run.ga ? 'a' : null);
  if (!winSide) return 'both back lines — a night the defences won';
  const team = teamName(winSide === 'h' ? run.home : run.away);
  const goalsFor = winSide === 'h' ? run.gh : run.ga;
  const concede = winSide === 'h' ? run.ga : run.gh;
  if (run.pens) return `${team}'s keeper — the wall the shootout broke against`;
  if (goalsFor >= 3) return `${team}'s front line — ${goalsFor} goals of pure momentum`;
  if (concede === 0) return `${team}'s back line — a clean sheet under the lights`;
  return `${team}'s midfield — they owned the minutes that mattered`;
}

function labStory(run, facts) {
  const goals = run.events.filter((e) => e.type === 'goal');
  const yourGoals = goals.filter((g) => g.side === 'h');
  const decisionMins = Object.keys(run.decided || {}).map(Number).sort((a, b) => a - b);
  // decision verdict: did your goals arrive in the 15' after a call?
  let coached = null;
  for (const d of decisionMins) {
    if (yourGoals.some((g) => g.min > d && g.min <= d + 15)) { coached = d; break; }
  }
  const decider = goals.length ? goals[goals.length - 1] : null;
  const bits = [];
  if (run.pens) bits.push(`Level after 90 — settled ${run.pens.ph}–${run.pens.pa} on penalties.`);
  else if (decider) bits.push(`The decisive goal came at ${minLabel(decider.min)}'.`);
  else bits.push('A goalless siege from first whistle to last.');
  if (coached != null) bits.push(`Your ${coached}' call produced a goal inside fifteen minutes.`);
  else if (decisionMins.length && !facts.win) bits.push('The bench calls never quite landed tonight.');
  if (facts.upset) bits.push(`${teamName(run.home)} were rated ${facts.gap} points below — an upset on the record.`);
  return bits.join(' ');
}

function finishLab() {
  const run = labRun;
  const { play } = getState();
  const facts = labResultFacts(run);
  const cp = labArcadePoints(run, facts);
  run.cp = cp; run.win = facts.win; run.story = labStory(run, facts);
  run.potm = labPotm(run, facts);
  const entry = {
    at: new Date().toISOString(),
    home: run.home, away: run.away, gh: run.gh, ga: run.ga,
    pens: run.pens, approach: run.approach, line: run.line,
    cp, win: facts.win, upset: facts.upset, story: run.story,
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

/* ================= Prediction Run =================
   A simple premium ritual: 1) Make your call 2) winner + optional scoreline +
   confidence 3) confirm once 4) Locked at kickoff 5) settled only from
   validated official truth. No lock jargon, no form maze. */

const CONF = { 1: 'Cool', 2: 'Confident', 3: 'All-in' };

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

/** Grade picks against current validated finals — computed live, never stored.
    Settlement is idempotent by construction: the record is re-derived from the
    same official truth every time, so re-settling can never double-count. */
export function gradePredictions(picks, overlay) {
  const graded = [];
  for (const [idStr, pick] of Object.entries(picks || {})) {
    const id = Number(idStr);
    const ov = overlay.byFixture.get(id);
    const fx = allFixtures().find((f) => f.id === id);
    if (!fx || !ov || ov.status !== 'final' || !ov.winner) continue;
    // exact scoreline: only when the caller committed one AND official goals
    // are known for a canonically resolved tie (score guards upstream).
    const exact = pick.gh != null && pick.ga != null && ov.gh != null && ov.ga != null
      && Number(pick.gh) === ov.gh && Number(pick.ga) === ov.ga;
    graded.push({ id, epoch: fx.epoch, correct: ov.winner === pick.side, conf: pick.conf, exact });
  }
  graded.sort((a, b) => a.epoch - b.epoch);
  let insight = 0; let streak = 0; let best = 0; let right = 0; let exact = 0;
  for (const g of graded) {
    if (g.correct) { right++; insight += g.conf * 10; streak++; best = Math.max(best, streak); }
    else streak = 0;
    if (g.exact) exact++;
  }
  return { graded, right, total: graded.length, insight, streak, best, exact };
}

/** Locked at kickoff, editable before it: the only lock that exists is the
    real one — the official kickoff whistle. */
export function pickLockedAtKickoff(fixtureId) {
  const fx = allFixtures().find((f) => f.id === fixtureId);
  return !!fx && fx.epoch <= now();
}

function setPick(fixtureId, { side, conf, gh = null, ga = null }) {
  if (pickLockedAtKickoff(fixtureId)) return; // locked at kickoff — no edits
  const { play } = getState();
  const picks = { ...(play.predictions?.picks || {}) };
  picks[fixtureId] = { side, conf, gh, ga, at: new Date().toISOString() };
  const nextPlay = { ...play, predictions: { picks } };
  setPlay(nextPlay);
  savePlay(nextPlay);
}

/* ================= personal arcade ledger ================= */
// One player: you. Every number is derived from things that actually happened
// in this Play space — finished Lab runs, graded predictions, saved runs.
// Arcade Points are a private game score with no cash value — game
// progression only, never money.

/** Picks League points — settled ONLY from validated official results.
    Derived live, never stored, idempotent: the same official truth always
    yields the same total, so duplicate settlement cannot duplicate points. */
export function leaguePickPoints(play, overlay) {
  const picks = play.predictions?.picks || {};
  const s = gradePredictions(picks, overlay);
  return s.insight + s.best * 20 + s.exact * 15;
}

/** Your arcade record — Match Lab and My World Cup ONLY. The Picks League
    (official predictions) is a separate scoreboard and never mixes in here. */
export function arcadeLedger(play, overlay, sims) {
  const labs = play.labHistory || [];
  const labCp = labs.reduce((n, e) => n + (e.cp || 0), 0);
  const runCp = ((sims && sims.saved) || []).length * 40;
  let streak = 0;
  for (const e of labs) { if (e.win) streak++; else break; }
  const wins = labs.filter((e) => e.win);
  const best = [...wins].sort((a, b) => (b.gh - b.ga) - (a.gh - a.ga))[0] || null;
  return {
    points: labCp + runCp,
    labCp, runCp,
    streak,
    wins: wins.length,
    played: labs.length,
    form: labs.slice(0, 5).map((e) => (e.win ? 'W' : 'L')),
    best,
  };
}

/* Football-specific achievements — every check is a derived fact. */
export const ACHIEVEMENTS = [
  {
    id: 'giant-killer', icon: '🗡️', name: 'Giant Killer',
    desc: 'Correctly called an official upset',
    earned: ({ play, overlay }) => {
      const picks = play.predictions?.picks || {};
      for (const [idStr, pick] of Object.entries(picks)) {
        const id = Number(idStr);
        const ov = overlay.byFixture.get(id);
        const s = overlay.slots.get(id) || {};
        if (!ov || ov.status !== 'final' || !ov.winner || ov.winner !== pick.side) continue;
        if (!s.home || !s.away) continue;
        const pickedCode = pick.side === 'home' ? s.home : s.away;
        const otherCode = pick.side === 'home' ? s.away : s.home;
        if ((RATINGS[pickedCode] || 70) <= (RATINGS[otherCode] || 70) - 4) return true;
      }
      return false;
    },
  },
  {
    id: 'ice-cold', icon: '🧊', name: 'Ice Cold',
    desc: 'Five correct calls in a row',
    earned: ({ predStats }) => predStats.best >= 5,
  },
  {
    id: 'extra-time-merchant', icon: '⏱️', name: 'Extra Time Merchant',
    desc: 'Won three Match Lab games after the 90',
    earned: ({ play }) => (play.labHistory || [])
      .filter((e) => e.pens && e.pens.ph > e.pens.pa).length >= 3,
  },
  {
    id: 'road-builder', icon: '🛣️', name: 'Road Builder',
    desc: 'Completed a My World Cup run',
    earned: ({ play, sims }) => !!(play.myWorldCup && play.myWorldCup.champion) || ((sims && sims.saved) || []).length > 0,
  },
  {
    id: 'clutch-caller', icon: '🎯', name: 'Clutch Caller',
    desc: 'Three correct Lock-confidence calls',
    earned: ({ play, overlay }) => {
      const picks = play.predictions?.picks || {};
      let n = 0;
      for (const [idStr, pick] of Object.entries(picks)) {
        if (pick.conf !== 3) continue;
        const ov = overlay.byFixture.get(Number(idStr));
        if (ov && ov.status === 'final' && ov.winner === pick.side) n++;
      }
      return n >= 3;
    },
  },
  {
    id: 'lab-upsetter', icon: '⚡', name: 'Lab Upsetter',
    desc: 'Won a Match Lab game as a heavy underdog',
    earned: ({ play }) => (play.labHistory || []).some((e) => e.win && e.upset),
  },
];

export function achievementState() {
  const { play, real, sims } = getState();
  const predStats = gradePredictions(play.predictions?.picks || {}, real.overlay);
  const ctx = { play, overlay: real.overlay, sims, predStats };
  return ACHIEVEMENTS.map((a) => ({ ...a, on: a.earned(ctx) }));
}

/* ================= rendering ================= */

function teamOptions(selected) {
  return Object.keys(TEAMS).sort((a, b) => teamName(a).localeCompare(teamName(b)))
    .map((c) => `<option value="${c}"${c === selected ? ' selected' : ''}>${esc(teamName(c))}</option>`).join('');
}

/* Tale of the tape — two rating bars facing off. Arcade, not a form. */
function tapeHTML(home, away) {
  const rh = RATINGS[home] || 70; const ra = RATINGS[away] || 70;
  const lo = 60; const hi = 95;
  const pct = (r) => Math.round(((r - lo) / (hi - lo)) * 100);
  return `<div class="lab-tape" id="lab-tape" aria-hidden="true">
    <div class="lab-tape-row">
      <span class="lab-tape-flag">${teamFlag(home)}</span>
      <div class="lab-tape-bar"><i style="width:${pct(rh)}%;background:${TEAM_COLORS[home] || 'var(--gold)'}"></i></div>
      <span class="lab-tape-num">${rh}</span>
    </div>
    <div class="lab-tape-row">
      <span class="lab-tape-flag">${teamFlag(away)}</span>
      <div class="lab-tape-bar"><i style="width:${pct(ra)}%;background:${TEAM_COLORS[away] || 'var(--gold)'}"></i></div>
      <span class="lab-tape-num">${ra}</span>
    </div>
  </div>`;
}

function labSetupHTML(play) {
  const last = (play.labHistory || [])[0];
  const home = last ? last.home : 'USA';
  const away = last ? last.away : 'ARG';
  return `<section class="play-card lab lab-lobby" aria-label="Match Lab">
    <div class="lab-attract" style="--hc:${TEAM_COLORS[home] || 'var(--gold)'};--ac:${TEAM_COLORS[away] || 'var(--gold)'}">
      <div class="lab-attract-top"><span>Match Lab</span><strong>90'</strong></div>
      <div class="lab-attract-score">
        <span>${teamFlag(home)} ${esc(teamName(home))}</span>
        <b>0<span>–</span>0</b>
        <span>${esc(teamName(away))} ${teamFlag(away)}</span>
      </div>
      <div class="lab-beats" aria-hidden="true"><span>Kickoff</span><i></i><span>45' choice</span><i></i><span>68' choice</span><i></i><span>Reveal</span></div>
    </div>
    <h2 class="display">Match Lab</h2>
    <p class="play-sub">Pick the matchup, choose the posture, then react when the match turns. Every finished run saves to You.</p>
    <div class="wi-pickers">
      <select id="lab-home" aria-label="Home team">${teamOptions(home)}</select>
      <span class="wi-v">v</span>
      <select id="lab-away" aria-label="Away team">${teamOptions(away)}</select>
    </div>
    ${tapeHTML(home, away)}
    <div class="lab-approaches" role="group" aria-label="Match approach">
      ${Object.entries(APPROACHES).map(([id, a], i) => `
        <button class="lab-approach${i === 0 ? ' active' : ''}" data-approach="${id}">
          <span class="la-name">${a.label}</span><span class="la-blurb">${a.blurb}</span>
        </button>`).join('')}
    </div>
    <button class="play-btn gold lab-kick" id="lab-kickoff">Start the match</button>
    ${last ? `<p class="lab-last">Last time: ${teamFlag(last.home)} ${last.gh}–${last.ga}${last.pens ? ' (' + last.pens.ph + '–' + last.pens.pa + 'p)' : ''} ${teamFlag(last.away)} · <span class="grug-line">${esc(last.line || '')}</span></p>` : ''}
  </section>`;
}

function labEventIcon(type) {
  return type === 'goal' ? '●'
    : type === 'pens' ? '◐'
      : type === 'decision' ? '▸'
        : type === 'whistle' ? '♪'
          : type === 'card' ? '▮'
            : type === 'red' ? '▮'
              : type === 'sub' ? '⇄'
                : type === 'board' ? '➍'
                  : '○';
}

/** 90+2 style stoppage-time minutes. */
function minLabel(min) { return min > 90 ? '90+' + (min - 90) : String(min); }

function labPitchHTML(run) {
  const x = Math.round(50 + (run.mo || 0) * 34);
  const y = Math.round(48 + Math.sin((run.minute || 0) / 7) * 18);
  const homePress = Math.max(18, Math.min(78, 48 + (run.mo || 0) * 24));
  const awayPress = Math.max(22, Math.min(82, 52 - (run.mo || 0) * 24));
  const possH = run.minute ? Math.round(Math.max(28, Math.min(72, ((run.possAcc || run.minute / 2) / run.minute) * 100))) : 50;
  return `<div class="lab-pitch" aria-label="Animated pitch simulation" style="--mo:${(run.mo || 0).toFixed(2)}">
    <i class="pitch-zone home" style="opacity:${Math.max(0, run.mo || 0).toFixed(2)}"></i>
    <i class="pitch-zone away" style="opacity:${Math.max(0, -(run.mo || 0)).toFixed(2)}"></i>
    <span class="pitch-line halfway"></span><span class="pitch-box left"></span><span class="pitch-box right"></span>
    <i class="pitch-team home" style="left:${homePress}%;top:34%"></i>
    <i class="pitch-team home" style="left:${Math.max(12, homePress - 18)}%;top:62%"></i>
    <i class="pitch-team away" style="left:${awayPress}%;top:66%"></i>
    <i class="pitch-team away" style="left:${Math.min(88, awayPress + 18)}%;top:38%"></i>
    <b class="pitch-ball" style="left:${x}%;top:${y}%"></b>
    <div class="pitch-counts"><span>${possH}% poss · ${run.sh} shots</span><span>${100 - possH}% · ${run.sa} shots</span></div>
  </div>`;
}

function labRunHTML(run) {
  const homeColor = TEAM_COLORS[run.home] || 'var(--gold)';
  const awayColor = TEAM_COLORS[run.away] || 'var(--gold)';
  const decision = run.decisionAt != null ? DECISIONS[run.decisionAt] : null;
  const moPct = ((run.mo + 1) / 2) * 100;
  const goalLive = !run.done && run.goalAt != null && run.minute - run.goalAt < 3;
  // stadium energy: tight late games and fresh goals raise the lights
  const closeness = 1 - Math.min(1, Math.abs(run.gh - run.ga) / 3);
  const energy = Math.min(1, 0.25 + (run.minute / 120) * 0.4 + closeness * 0.25 + (goalLive ? 0.35 : 0));
  return `<section class="play-card lab running${run.done ? ' done' : ''}${goalLive ? ' goal-live' : ''}" aria-label="Match Lab simulation">
    <div class="lab-stage" style="--hc:${homeColor};--ac:${awayColor};--energy:${energy.toFixed(2)}">
      ${goalLive ? '<div class="lab-goal-banner" aria-hidden="true">GOAL</div>' : ''}
      <div class="lab-clock" aria-live="polite">${run.done ? '<span class="lab-ft-stamp">FULL TIME</span>' : minLabel(run.minute) + '&prime;'}</div>
      <div class="lab-score-row">
        <div class="lab-team">${teamFlag(run.home)}<span>${esc(teamName(run.home))}</span></div>
        <div class="lab-score${goalLive ? ' flash' : ''}${run.done ? ' reveal' : ''}" id="lab-score">${run.gh}<span class="lab-sep">–</span>${run.ga}</div>
        <div class="lab-team away"><span>${esc(teamName(run.away))}</span>${teamFlag(run.away)}</div>
      </div>
      ${run.pens ? `<div class="lab-pens">Penalties ${run.pens.ph}–${run.pens.pa}</div>` : ''}
      <div class="lab-momentum" aria-hidden="true"><div class="lab-mo-fill" id="lab-mo" style="width:${moPct}%"></div></div>
      <div class="lab-mo-labels" aria-hidden="true"><span>${esc(teamName(run.away))}</span><span>momentum</span><span>${esc(teamName(run.home))}</span></div>
      ${labPitchHTML(run)}
    </div>
    ${!run.done ? `<div class="lab-pace" role="group" aria-label="Broadcast pace">
      ${[['normal', 'Normal'], ['fast', 'Fast'], ['key', 'Key moments']].map(([p, label]) => `
        <button class="lab-pace-btn${labPace === p ? ' active' : ''}" data-pace="${p}">${label}</button>`).join('')}
    </div>` : ''}
    ${decision ? `<div class="lab-decision" role="group" aria-label="${esc(decision.prompt)}">
      <p class="lab-decision-prompt">${esc(decision.prompt)}</p>
      <div class="lab-decision-opts">
        ${decision.options.map((o) => `<button class="lab-opt" data-decide="${o.id}">${o.label}</button>`).join('')}
      </div>
    </div>` : ''}
    <ol class="lab-feed" id="lab-feed" aria-label="Match events">
      ${run.events.slice(-7).map((e) => `<li class="lab-ev ${e.type}"><span class="lab-ev-min">${minLabel(e.min)}&prime;</span><span class="lab-ev-ic">${labEventIcon(e.type)}</span>${esc(e.text)}</li>`).join('')}
    </ol>
    ${run.done ? labPayoffHTML(run) : ''}
  </section>`;
}

/* Full-time payoff: story, points, streak, and a one-tap rematch. */
function labPayoffHTML(run) {
  const { play, real, sims } = getState();
  const ledger = arcadeLedger(play, real.overlay, sims);
  const streakLine = ledger.streak >= 2
    ? `${ledger.streak} lab wins in a row`
    : run.win ? 'Win streak: 1 — keep it alive' : 'Streak reset — one tap to respond';
  const possH = run.minute ? Math.round(Math.max(28, Math.min(72, ((run.possAcc || run.minute / 2) / run.minute) * 100))) : 50;
  return `<div class="lab-payoff${run.win ? ' won' : ''}">
    <div class="lab-payoff-head">
      <span class="lab-payoff-cp">+${run.cp || 0} <em>Arcade Points</em></span>
      <span class="lab-payoff-streak">${esc(streakLine)}</span>
    </div>
    <div class="lab-boxscore" aria-label="Match numbers">
      <span>${run.sh}–${run.sa} shots</span><span>${possH}–${100 - possH} possession</span><span>${(run.ckh || 0)}–${(run.cka || 0)} corners</span><span>${run.events.filter((e) => e.type === 'card' || e.type === 'red').length} cards</span>
    </div>
    ${run.turn ? `<p class="lab-turning"><span>Turning point</span>${minLabel(run.turn.min)}&prime; — ${esc(run.turn.text)}</p>` : ''}
    ${run.potm ? `<p class="lab-potm"><span>Player of the Match</span>${esc(run.potm)}</p>` : ''}
    ${run.story ? `<p class="lab-story">${esc(run.story)}</p>` : ''}
    <p class="grug-line">${esc(run.line || '')}</p>
    <div class="play-actions">
      <button class="play-btn gold" id="lab-again">Run it back</button>
      <button class="play-btn quiet" id="lab-new">New matchup</button>
    </div>
    <p class="lab-saved-note">Saved to You · Arcade Points are a private game score with no cash value.</p>
  </div>`;
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
  const filled = world.finals.size;
  return `<section class="play-card my-wc bracket-card" aria-label="My World Cup">
    <header class="mwc-head">
      <div><h2 class="display">My World Cup</h2>
      <p class="play-sub">A gold-tinted alternate Road. Hand-pick key ties or let the simulator sprint to the next dramatic stop.</p></div>
      <span class="sim-badge">SIMULATION</span>
    </header>
    <div class="mwc-runway" aria-label="Simulation progress">
      <span><strong>${filled}</strong> results</span>
      <i style="width:${Math.min(100, Math.round((filled / 104) * 100))}%"></i>
      <span>${next ? esc(STAGE_NAMES[next.stage]) + ' next' : 'Champion ready'}</span>
    </div>
    ${champion ? `<div class="mwc-champion" role="status" style="--cc:${TEAM_COLORS[champion] || 'var(--gold)'}">
      <div class="mwc-rays" aria-hidden="true"></div>
      <div class="mwc-crown" aria-hidden="true">★</div>
      <div class="mwc-champ-name display">${teamFlag(champion)} ${esc(teamName(champion))}</div>
      <div class="mwc-champ-sub">champions of your universe</div>
    </div>` : ''}
    ${pickFx && pickFx.home && pickFx.away ? `<div class="mwc-pickbar" role="group" aria-label="Who advances?">
      <span>Who advances?</span>
      <button class="mwc-pick" data-pickside="home" style="--glow:${TEAM_COLORS[pickFx.home] || ''}">${teamFlag(pickFx.home)} ${esc(teamName(pickFx.home))}</button>
      <button class="mwc-pick" data-pickside="away" style="--glow:${TEAM_COLORS[pickFx.away] || ''}">${teamFlag(pickFx.away)} ${esc(teamName(pickFx.away))}</button>
      <button class="mwc-pick cancel" data-pickside="cancel">Cancel</button>
    </div>` : ''}
    <div class="play-actions row">
      ${next ? `<button class="play-btn gold" id="mwc-simulate">Simulate remaining</button>` : `<button class="play-btn gold" id="mwc-save">Save this timeline</button>`}
      <button class="play-btn quiet" id="mwc-reset">Reset</button>
    </div>
    <div class="bk-scroll sim" tabindex="0" aria-label="My World Cup bracket. Scroll horizontally.">
      ${bracketHTML({ slots: world.slots, results, mode: 'sim' }, {})}
    </div>
    ${next && next.stage === 'group' ? '<p class="mwc-note">Group results still forming — Simulate Remaining fills them, then hand-pick the knockouts.</p>' : ''}
  </section>`;
}

/* Draft calls in progress — module-local, discarded unless confirmed. */
let prDrafts = {};

function pickSummaryLine(overlay, id, pick) {
  const s = overlay.slots.get(id) || {};
  const who = pick.side === 'draw' ? 'Draw'
    : pick.side === 'home' ? (s.home ? teamName(s.home) : 'Home') : (s.away ? teamName(s.away) : 'Away');
  const score = pick.gh != null && pick.ga != null ? ` · ${pick.gh}–${pick.ga}` : '';
  return `${who}${score} · ${CONF[pick.conf] || 'Cool'}`;
}

/** Confirmed picks now inside the real match window: locked at kickoff. */
function lockedLivePicks(overlay, picks) {
  const t = now();
  return Object.entries(picks || {})
    .map(([idStr, pick]) => ({ id: Number(idStr), pick }))
    .filter(({ id }) => {
      const fx = allFixtures().find((f) => f.id === id);
      const ov = overlay.byFixture.get(id);
      return fx && fx.epoch <= t && (!ov || ov.status !== 'final' || !ov.winner);
    })
    .sort((a, b) => b.id - a.id)
    .slice(0, 4);
}

function prFixtureHTML(overlay, f, pick, draft) {
  const s = overlay.slots.get(f.id);
  const meta = `${esc(f.stage === 'group' ? 'Group ' + f.group : STAGE_NAMES[f.stage])} · ${esc(formatDayKey(f.day))} · ${esc(formatKickoffTime(f.epoch))}`;
  // Sealed call: confirmed, still editable until the real whistle.
  if (pick && !draft) {
    return `<div class="pr-fixture sealed" data-prfx="${f.id}">
      <div class="pr-meta">${meta}</div>
      <div class="pr-sealed-call">
        <span class="pr-sealed-tie">${teamFlag(s.home)} ${esc(teamName(s.home))} <em>v</em> ${esc(teamName(s.away))} ${teamFlag(s.away)}</span>
        <span class="pr-sealed-line">Your call — ${esc(pickSummaryLine(overlay, f.id, pick))}</span>
        <span class="pr-sealed-lock">Locks at kickoff · ${esc(formatKickoffTime(f.epoch))}</span>
      </div>
      <button class="pr-edit" data-predit="${f.id}">Change call</button>
    </div>`;
  }
  const d = draft || {};
  const step = !d.side ? 1 : 2;
  return `<div class="pr-fixture${d.side ? ' drafting' : ''}" data-prfx="${f.id}">
    <div class="pr-meta">${meta}</div>
    <div class="pr-teams">
      <button class="pr-side${d.side === 'home' ? ' on' : ''}" data-prside="home">${teamFlag(s.home)} ${esc(teamName(s.home))}</button>
      ${f.stage === 'group' ? `<button class="pr-side draw${d.side === 'draw' ? ' on' : ''}" data-prside="draw">Draw</button>` : '<span class="pr-v">v</span>'}
      <button class="pr-side${d.side === 'away' ? ' on' : ''}" data-prside="away">${esc(teamName(s.away))} ${teamFlag(s.away)}</button>
    </div>
    ${step === 1 ? '<p class="pr-hint">Make your call — pick a winner.</p>' : `
    <div class="pr-refine">
      <div class="pr-scoreline" role="group" aria-label="Optional scoreline">
        <span class="pr-score-label">Scoreline <em>optional</em></span>
        <div class="pr-score-steppers">
          <button class="pr-step" data-prstep="gh">${d.gh != null ? d.gh : '–'}</button>
          <span>:</span>
          <button class="pr-step" data-prstep="ga">${d.ga != null ? d.ga : '–'}</button>
          ${d.gh != null ? '<button class="pr-step clear" data-prstep="clear">×</button>' : ''}
        </div>
      </div>
      <div class="pr-conf" role="group" aria-label="Confidence">
        ${[1, 2, 3].map((c) => `<button class="pr-conf-btn${(d.conf || 1) === c ? ' on' : ''}" data-prconf="${c}">${CONF[c]}</button>`).join('')}
      </div>
      <button class="pr-confirm" data-prconfirm="${f.id}">Confirm call</button>
    </div>`}
  </div>`;
}

function predictionHTML(overlay, play) {
  const picks = play.predictions?.picks || {};
  const stats = gradePredictions(picks, overlay);
  const upcoming = predictableFixtures(overlay);
  const locked = lockedLivePicks(overlay, picks);
  const recent = stats.graded.slice(-3).reverse();
  const iq = stats.total >= 3 ? Math.round((stats.right / stats.total) * 100) : null;
  return `<section class="play-card prediction" aria-label="Prediction Run">
    <div class="prediction-hero">
      <div><h2 class="display">Prediction Run</h2>
      <p class="play-sub">Make your call, confirm once. It locks at the real kickoff and settles only on the official result.</p></div>
      <span class="prediction-chip">No stakes</span>
    </div>
    <div class="pr-stats" role="group" aria-label="Prediction record">
      <div class="pr-stat"><strong>${stats.right}<span class="pr-of">/${stats.total}</span></strong><span>correct</span></div>
      <div class="pr-stat"><strong>${stats.insight}</strong><span>insight</span></div>
      <div class="pr-stat${stats.streak >= 3 ? ' hot' : ''}"><strong>${stats.streak >= 3 ? '🔥' + stats.streak : stats.streak}</strong><span>streak</span></div>
      <div class="pr-stat"><strong>${iq != null ? iq : '—'}</strong><span>Tournament IQ</span></div>
    </div>
    ${recent.length ? `<div class="pr-recent" aria-label="Recent settled calls">
      ${recent.map((g) => {
    const s = overlay.slots.get(g.id) || {};
    return `<span class="pr-call ${g.correct ? 'hit' : 'miss'}">${g.correct ? '✓' : '✗'} ${s.home ? teamFlag(s.home) : ''}v${s.away ? teamFlag(s.away) : ''} ${CONF[g.conf] || ''}${g.exact ? ' · exact' : ''}</span>`;
  }).join('')}
    </div>` : ''}
    ${locked.length ? `<div class="pr-locked" aria-label="Locked calls">
      ${locked.map(({ id, pick }) => {
    const s = overlay.slots.get(id) || {};
    return `<div class="pr-locked-row">
        <span class="pr-locked-badge">Locked at kickoff</span>
        <span>${s.home ? teamFlag(s.home) + ' ' + esc(teamName(s.home)) : ''} v ${s.away ? esc(teamName(s.away)) + ' ' + teamFlag(s.away) : ''} — ${esc(pickSummaryLine(overlay, id, pick))}</span>
      </div>`;
  }).join('')}
    </div>` : ''}
    ${upcoming.length ? upcoming.map((f) => prFixtureHTML(overlay, f, picks[f.id], prDrafts[f.id])).join('')
    : '<p class="empty-line grug-line">no callable fixtures right now. the future is still assembling itself.</p>'}
    <p class="pr-league-note">Confirmed calls score in your <b>Picks League</b> on the You tab — settled only from official results.</p>
  </section>`;
}

/* ================= Arcade Lobby ================= */

function formDots(form) {
  if (!form || !form.length) return '<span class="form-empty">no games yet</span>';
  return form.map((f) => `<i class="form-dot ${f === 'W' ? 'w' : 'l'}" aria-label="${f === 'W' ? 'Win' : 'Loss'}"></i>`).join('');
}

function lobbyHTML(overlay, play, sims) {
  const ledger = arcadeLedger(play, overlay, sims);
  const predStats = gradePredictions(play.predictions?.picks || {}, overlay);
  const lab = play.labHistory || [];
  const last = lab[0];
  const home = last ? last.home : 'USA';
  const away = last ? last.away : 'ARG';
  // Tonight's Challenge: the next real fixture you haven't called yet.
  const picks = play.predictions?.picks || {};
  const challenge = predictableFixtures(overlay).find((f) => !picks[f.id]) || null;
  const chSlots = challenge ? overlay.slots.get(challenge.id) : null;
  // Current run: an unfinished My World Cup or a champion waiting to be saved.
  const world = simWorld(overlay, play);
  const simNext = play.myWorldCup ? nextSimStage(world) : null;
  const champion = play.myWorldCup && play.myWorldCup.champion;
  const bestWin = ledger.best;
  const earned = achievementState().filter((a) => a.on);
  return `<section class="play-card lobby" aria-label="Arcade lobby">
    <div class="lobby-marquee" role="group" aria-label="Your arcade record">
      <div class="lm-stat cp"><strong class="display">${ledger.points}</strong><span>Arcade Points</span></div>
      <div class="lm-stat"><span class="lm-form">${formDots(ledger.form)}</span><span>Lab form</span></div>
      <div class="lm-stat"><strong>${ledger.streak >= 2 ? '🔥' + ledger.streak : ledger.streak}</strong><span>Win streak</span></div>
    </div>

    <button class="lobby-kick" id="lobby-kick" style="--hc:${TEAM_COLORS[home] || 'var(--gold)'};--ac:${TEAM_COLORS[away] || 'var(--gold)'}">
      <span class="lk-label">${last ? 'Tonight’s Showdown — run it back' : 'Tonight’s Showdown'}</span>
      <span class="lk-tie">${teamFlag(home)} ${esc(teamName(home))} <em>v</em> ${esc(teamName(away))} ${teamFlag(away)}</span>
      <span class="lk-go">▶ Kick off now</span>
    </button>

    <div class="lobby-grid">
      ${challenge && chSlots ? `<button class="lobby-tile" data-goto="prediction">
        <span class="lt-kicker">Tonight's challenge</span>
        <strong>${teamFlag(chSlots.home)} ${esc(teamName(chSlots.home))} v ${esc(teamName(chSlots.away))} ${teamFlag(chSlots.away)}</strong>
        <small>Call it before ${esc(formatKickoffTime(challenge.epoch))} · earn insight</small>
      </button>` : `<button class="lobby-tile" data-goto="prediction">
        <span class="lt-kicker">Prediction Run</span>
        <strong>${predStats.right}/${predStats.total} correct</strong>
        <small>${Object.keys(picks).length ? 'Review your calls' : 'Make your first call'}</small>
      </button>`}
      <button class="lobby-tile" data-goto="myworldcup">
        <span class="lt-kicker">My World Cup</span>
        <strong>${champion ? teamFlag(champion) + ' ' + esc(teamName(champion)) + ' reign' : simNext ? esc(STAGE_NAMES[simNext.stage]) + ' next' : 'Start a run'}</strong>
        <small>${champion ? 'Champion crowned — save or run it again' : simNext ? 'Your parallel tournament is mid-flight' : 'Pick winners, break brackets'}</small>
      </button>
    </div>

    <div class="lobby-season" aria-label="Season record">
      <span class="lt-kicker">Your season</span>
      <div class="season-grid">
        <span class="season-cell"><b>${bestWin ? `${teamFlag(bestWin.home)} ${bestWin.gh}–${bestWin.ga} ${teamFlag(bestWin.away)}` : '—'}</b><small>${bestWin ? 'record to beat' : 'no record yet — set one tonight'}</small></span>
        <span class="season-cell"><b>${ledger.wins}W–${ledger.played - ledger.wins}L</b><small>lab record</small></span>
        <span class="season-cell"><b>${predStats.right}/${predStats.total}</b><small>calls right</small></span>
      </div>
      ${earned.length ? `<div class="season-ach">${earned.map((a) => `<span class="you-ach" title="${esc(a.desc)}">${a.icon} ${esc(a.name)}</span>`).join('')}</div>`
    : '<p class="season-hint">Achievements unlock from real play — an upset call, a five-streak, a shootout escape.</p>'}
    </div>
  </section>`;
}

/* ---------------- view plumbing ---------------- */

let pendingPick = null;

function repaintPlay() {
  const outlet = document.querySelector('#outlet-play');
  if (outlet) render(outlet);
}

function wireLobby(outlet) {
  const kick = outlet.querySelector('#lobby-kick');
  if (kick) {
    kick.addEventListener('click', () => {
      const { play } = getState();
      const last = (play.labHistory || [])[0];
      setPlayMode('lab');
      beginLab(last ? last.home : 'USA', last ? last.away : 'ARG', last ? last.approach : 'balanced');
    });
  }
}

function wireLab(outlet) {
  outlet.querySelectorAll('[data-approach]').forEach((b) => {
    b.addEventListener('click', () => {
      outlet.querySelectorAll('[data-approach]').forEach((x) => x.classList.toggle('active', x === b));
    });
  });
  // tale of the tape follows the pickers
  for (const sel of ['#lab-home', '#lab-away']) {
    const el = outlet.querySelector(sel);
    if (el) {
      el.addEventListener('change', () => {
        const tape = outlet.querySelector('#lab-tape');
        if (!tape) return;
        const wrap = document.createElement('div');
        wrap.innerHTML = tapeHTML(outlet.querySelector('#lab-home').value, outlet.querySelector('#lab-away').value);
        tape.replaceWith(wrap.firstElementChild);
      });
    }
  }
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
  outlet.querySelectorAll('[data-pace]').forEach((b) => {
    b.addEventListener('click', () => setLabPace(b.dataset.pace));
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
    // step 1 — make your call
    row.querySelectorAll('[data-prside]').forEach((b) => {
      b.addEventListener('click', () => {
        const d = prDrafts[id] || { conf: 1, gh: null, ga: null };
        prDrafts[id] = { ...d, side: b.dataset.prside };
        repaintPlay();
      });
    });
    // step 2 — optional scoreline (tap cycles 0→5) and confidence
    row.querySelectorAll('[data-prstep]').forEach((b) => {
      b.addEventListener('click', () => {
        const d = prDrafts[id];
        if (!d) return;
        const k = b.dataset.prstep;
        if (k === 'clear') { d.gh = null; d.ga = null; }
        else if (d.gh == null || d.ga == null) { d.gh = 0; d.ga = 0; } // first tap arms 0–0
        else d[k] = (d[k] + 1) % 6;                                    // then taps count goals
        repaintPlay();
      });
    });
    row.querySelectorAll('[data-prconf]').forEach((b) => {
      b.addEventListener('click', () => {
        const d = prDrafts[id];
        if (!d) return;
        d.conf = Number(b.dataset.prconf);
        repaintPlay();
      });
    });
    // step 3 — confirm once
    const confirm = row.querySelector('[data-prconfirm]');
    if (confirm) {
      confirm.addEventListener('click', () => {
        const d = prDrafts[id];
        if (!d || !d.side) return;
        setPick(id, d);
        delete prDrafts[id];
        repaintPlay();
      });
    }
    // sealed call — reopen for edits until the real kickoff
    const edit = row.querySelector('[data-predit]');
    if (edit) {
      edit.addEventListener('click', () => {
        if (pickLockedAtKickoff(id)) { repaintPlay(); return; }
        const cur = getState().play.predictions?.picks?.[id];
        if (cur) prDrafts[id] = { side: cur.side, conf: cur.conf, gh: cur.gh ?? null, ga: cur.ga ?? null };
        repaintPlay();
      });
    }
  });
}

export function render(outlet) {
  const { real, play, nav, sims } = getState();
  const mode = nav.playMode;
  let body;
  if (mode === 'lab') body = labRun ? labRunHTML(labRun) : labSetupHTML(play);
  else if (mode === 'myworldcup') body = myWorldCupHTML(real.overlay, play, pendingPick);
  else if (mode === 'prediction') body = predictionHTML(real.overlay, play);
  else body = lobbyHTML(real.overlay, play, sims);
  outlet.innerHTML = `<div class="view play-view">
    <header class="view-head"><p class="view-kicker gold">The Arcade</p><h1>Play</h1>
      <p class="view-sub">Private simulations · nothing here touches the real tournament</p></header>
    <div class="mode-rail">
    ${segmentedControl({
    id: 'play-mode', label: 'Play modes', value: mode,
    options: [
      { value: 'lobby', label: 'Lobby' },
      { value: 'lab', label: 'Match Lab' },
      { value: 'myworldcup', label: 'My World Cup' },
      { value: 'prediction', label: 'Prediction Run' },
    ],
  })}
    </div>
    ${body}
  </div>`;
  outlet.querySelector('[data-segmented="play-mode"]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-value]');
    if (btn) { stopLabTimer(); if (labRun && !labRun.done) labRun = null; setPlayMode(btn.dataset.value); }
  });
  // Any surface can hand off to another mode (lobby tiles, prediction CTA).
  outlet.querySelectorAll('[data-goto]').forEach((b) => {
    b.addEventListener('click', () => setPlayMode(b.dataset.goto));
  });
  // keep the active mode chip in view on the rail
  const railEl = outlet.querySelector('.mode-rail .segmented');
  const activeChip = railEl && railEl.querySelector('.seg-btn.active');
  if (railEl && activeChip) {
    railEl.scrollLeft = Math.max(0, activeChip.offsetLeft - railEl.clientWidth / 2 + activeChip.offsetWidth / 2);
  }
  if (mode === 'lab') wireLab(outlet);
  else if (mode === 'myworldcup') wireMwc(outlet);
  else if (mode === 'prediction') wirePrediction(outlet);
  else wireLobby(outlet);
}
