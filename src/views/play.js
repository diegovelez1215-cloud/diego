// United 2026 — Play. The arcade: an arcade lobby plus four connected modes,
// all sealed off from real tournament truth. Match Lab runs an interactive
// 90-minute simulation with momentum and decisions. My World Cup is a private,
// tappable bracket journey. Prediction Run is non-monetary tournament
// intelligence — picks, confidence, streaks. Club League is a private,
// on-device club room: local profiles, Club Points, truthful achievements.
// Gold light, tactile controls, rare weirdness. It can never modify real
// fixtures, standings, Home, the official bracket, or Match Center —
// everything here operates on deep copies in the Play namespace only.
// Club Points are a private game score: no cash value, non-purchasable,
// non-transferable, non-withdrawable.

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
        run.mo += side === 'h' ? 0.6 : -0.6;
      } else if (rng() < 0.3) {
        run.events.push({ min: run.minute, type: 'chance', side, text: CHANCE_LINES[Math.floor(rng() * CHANCE_LINES.length)](teamName(team)) });
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

function labClubPoints(run, facts) {
  let cp = 20; // finishing a full 90 always counts
  if (facts.win) cp += 20 + Math.min(18, facts.margin * 6);
  if (facts.upset) cp += Math.min(30, facts.gap * 2);
  if (facts.win && run.ga === 0) cp += 8;   // clean sheet
  if (facts.win && run.pens) cp += 10;      // survived the shootout
  return cp;
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
  else if (decider) bits.push(`The decisive goal came at ${decider.min}'.`);
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
  const cp = labClubPoints(run, facts);
  run.cp = cp; run.win = facts.win; run.story = labStory(run, facts);
  const entry = {
    at: new Date().toISOString(),
    home: run.home, away: run.away, gh: run.gh, ga: run.ga,
    pens: run.pens, approach: run.approach, line: run.line,
    cp, win: facts.win, upset: facts.upset, story: run.story,
  };
  const club = ensureClub(play);
  const nextPlay = { ...play, labHistory: [entry, ...(play.labHistory || [])].slice(0, 30) };
  setPlay(nextPlay);
  savePlay(nextPlay);
  creditClubEvent({
    pid: club.activeId, at: entry.at, cp, kind: 'lab', win: facts.win,
    note: `${teamName(run.home)} ${run.gh}–${run.ga}${run.pens ? ` (${run.pens.ph}–${run.pens.pa}p)` : ''} ${teamName(run.away)}`,
  });
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

/* ================= Club League (private, on this device) ================= */
// Truthful by construction: every number below is derived from things that
// actually happened in this Play space. Local profiles are people who play on
// this phone; no invented friends, no fabricated activity, no global ranks.

const PROFILE_EMOJI = ['⚽', '🦁', '🐆', '🦅', '🐐', '🌵', '🌋', '🛡️'];

export function ensureClub(play) {
  const raw = play.club && typeof play.club === 'object' ? play.club : {};
  const players = (Array.isArray(raw.players) ? raw.players : [])
    .filter((p) => p && p.id && p.name).slice(0, 8);
  if (!players.some((p) => p.id === 'you')) players.unshift({ id: 'you', name: 'You', emoji: '⭐' });
  return {
    players,
    events: (Array.isArray(raw.events) ? raw.events : []).slice(0, 200),
    activeId: players.some((p) => p.id === raw.activeId) ? raw.activeId : 'you',
    rivalId: players.some((p) => p.id === raw.rivalId) ? raw.rivalId : null,
  };
}

function saveClub(club) {
  const { play } = getState();
  const nextPlay = { ...play, club };
  setPlay(nextPlay);
  savePlay(nextPlay);
}

/** Prediction Club Points — derived live from graded calls, never stored. */
export function predictionClubPoints(play, overlay) {
  const picks = play.predictions?.picks || {};
  const s = gradePredictions(picks, overlay);
  return s.insight + s.best * 20 + Object.keys(picks).length * 5;
}

/** Per-player totals from the real event log (+ live prediction CP for You). */
export function clubTable(play, overlay, sims) {
  const club = ensureClub(play);
  const t = now();
  const weekAgo = t - 7 * 24 * 3600 * 1000;
  const rows = club.players.map((p) => {
    const evs = club.events.filter((e) => e.pid === p.id);
    const labCp = evs.reduce((n, e) => n + (e.cp || 0), 0);
    const predCp = p.id === 'you' ? predictionClubPoints(play, overlay) : 0;
    const runCp = p.id === 'you' ? ((sims && sims.saved) || []).length * 40 : 0;
    const weekCp = evs.filter((e) => Date.parse(e.at) >= weekAgo).reduce((n, e) => n + (e.cp || 0), 0);
    const priorCp = labCp - weekCp; // total before this week's lab play
    const labs = evs.filter((e) => e.kind === 'lab');
    let streak = 0;
    for (const e of labs) { if (e.win) streak++; else break; }
    return {
      ...p,
      cp: labCp + predCp + runCp,
      priorCp: priorCp + predCp + runCp,
      weekCp,
      streak,
      form: labs.slice(0, 5).map((e) => (e.win ? 'W' : 'L')),
      played: labs.length,
      lastAt: evs[0] ? evs[0].at : null,
    };
  });
  const byNow = [...rows].sort((a, b) => b.cp - a.cp || a.name.localeCompare(b.name));
  const byPrior = [...rows].sort((a, b) => b.priorCp - a.priorCp || a.name.localeCompare(b.name));
  byNow.forEach((r, i) => {
    r.rank = i + 1;
    const prev = byPrior.findIndex((x) => x.id === r.id) + 1;
    r.move = prev - r.rank; // + = climbed this week
  });
  return { club, rows: byNow };
}

function creditClubEvent(event) {
  const { play } = getState();
  const club = ensureClub(play);
  club.events = [event, ...club.events].slice(0, 200);
  saveClub(club);
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
  return type === 'goal' ? '●' : type === 'pens' ? '◐' : type === 'decision' ? '▸' : type === 'whistle' ? '♪' : '○';
}

function labPitchHTML(run) {
  const x = Math.round(50 + (run.mo || 0) * 34);
  const y = Math.round(48 + Math.sin((run.minute || 0) / 7) * 18);
  const homePress = Math.max(18, Math.min(78, 48 + (run.mo || 0) * 24));
  const awayPress = Math.max(22, Math.min(82, 52 - (run.mo || 0) * 24));
  return `<div class="lab-pitch" aria-label="Animated pitch simulation">
    <span class="pitch-line halfway"></span><span class="pitch-box left"></span><span class="pitch-box right"></span>
    <i class="pitch-team home" style="left:${homePress}%;top:34%"></i>
    <i class="pitch-team home" style="left:${Math.max(12, homePress - 18)}%;top:62%"></i>
    <i class="pitch-team away" style="left:${awayPress}%;top:66%"></i>
    <i class="pitch-team away" style="left:${Math.min(88, awayPress + 18)}%;top:38%"></i>
    <b class="pitch-ball" style="left:${x}%;top:${y}%"></b>
    <div class="pitch-counts"><span>${run.sh} shots</span><span>${run.sa} shots</span></div>
  </div>`;
}

function labRunHTML(run) {
  const homeColor = TEAM_COLORS[run.home] || 'var(--gold)';
  const awayColor = TEAM_COLORS[run.away] || 'var(--gold)';
  const decision = run.decisionAt != null ? DECISIONS[run.decisionAt] : null;
  const moPct = ((run.mo + 1) / 2) * 100;
  const scoreFlash = !run.done && run.goalAt != null && run.minute - run.goalAt < 3;
  return `<section class="play-card lab running${run.done ? ' done' : ''}" aria-label="Match Lab simulation">
    <div class="lab-stage" style="--hc:${homeColor};--ac:${awayColor}">
      <div class="lab-clock" aria-live="polite">${run.done ? '<span class="lab-ft-stamp">FULL TIME</span>' : run.minute + '&prime;'}</div>
      <div class="lab-score-row">
        <div class="lab-team">${teamFlag(run.home)}<span>${esc(teamName(run.home))}</span></div>
        <div class="lab-score${scoreFlash ? ' flash' : ''}${run.done ? ' reveal' : ''}" id="lab-score">${run.gh}<span class="lab-sep">–</span>${run.ga}</div>
        <div class="lab-team away"><span>${esc(teamName(run.away))}</span>${teamFlag(run.away)}</div>
      </div>
      ${run.pens ? `<div class="lab-pens">Penalties ${run.pens.ph}–${run.pens.pa}</div>` : ''}
      <div class="lab-momentum" aria-hidden="true"><div class="lab-mo-fill" id="lab-mo" style="width:${moPct}%"></div></div>
      <div class="lab-mo-labels" aria-hidden="true"><span>${esc(teamName(run.away))}</span><span>momentum</span><span>${esc(teamName(run.home))}</span></div>
      ${labPitchHTML(run)}
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
    ${run.done ? labPayoffHTML(run) : ''}
  </section>`;
}

/* Full-time payoff: story, points, streak, and a one-tap rematch. */
function labPayoffHTML(run) {
  const { play, real, sims } = getState();
  const { rows, club } = clubTable(play, real.overlay, sims);
  const active = rows.find((r) => r.id === club.activeId) || rows[0];
  const streakLine = active && active.streak >= 2
    ? `${active.streak} lab wins in a row`
    : run.win ? 'Win streak: 1 — keep it alive' : 'Streak reset — one tap to respond';
  return `<div class="lab-payoff${run.win ? ' won' : ''}">
    <div class="lab-payoff-head">
      <span class="lab-payoff-cp">+${run.cp || 0} <em>Club Points</em></span>
      <span class="lab-payoff-streak">${esc(streakLine)}</span>
    </div>
    ${run.story ? `<p class="lab-story">${esc(run.story)}</p>` : ''}
    <p class="grug-line">${esc(run.line || '')}</p>
    <div class="play-actions">
      <button class="play-btn gold" id="lab-again">Run it back</button>
      <button class="play-btn quiet" id="lab-new">New matchup</button>
    </div>
    <p class="lab-saved-note">Saved to You${active && active.id !== 'you' ? ` · credited to ${esc(active.name)}` : ''} · Club Points have no cash value.</p>
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

function predictionHTML(overlay, play) {
  const picks = play.predictions?.picks || {};
  const stats = gradePredictions(picks, overlay);
  const upcoming = predictableFixtures(overlay);
  const recent = stats.graded.slice(-3).reverse();
  const clubPoints = predictionClubPoints(play, overlay);
  const iq = stats.total >= 3 ? Math.round((stats.right / stats.total) * 100) : null;
  return `<section class="play-card prediction" aria-label="Prediction Run">
    <div class="prediction-hero">
      <div><h2 class="display">Prediction Run</h2>
      <p class="play-sub">Call official fixtures before they happen. Confidence earns insight; misses reset the streak.</p></div>
      <span class="prediction-chip">No stakes</span>
    </div>
    <div class="pr-stats" role="group" aria-label="Prediction record">
      <div class="pr-stat"><strong>${stats.right}<span class="pr-of">/${stats.total}</span></strong><span>correct</span></div>
      <div class="pr-stat"><strong>${stats.insight}</strong><span>insight</span></div>
      <div class="pr-stat${stats.streak >= 3 ? ' hot' : ''}"><strong>${stats.streak >= 3 ? '🔥' + stats.streak : stats.streak}</strong><span>streak</span></div>
      <div class="pr-stat"><strong>${iq != null ? iq : '—'}</strong><span>Tournament IQ</span></div>
    </div>
    ${recent.length ? `<div class="pr-recent" aria-label="Recent graded calls">
      ${recent.map((g) => {
    const s = overlay.slots.get(g.id) || {};
    return `<span class="pr-call ${g.correct ? 'hit' : 'miss'}">${g.correct ? '✓' : '✗'} ${s.home ? teamFlag(s.home) : ''}v${s.away ? teamFlag(s.away) : ''} ${CONF[g.conf] || ''}</span>`;
  }).join('')}
    </div>` : ''}
    <div class="private-league" aria-label="Club Points from predictions">
      <div class="private-head"><span>Your prediction haul</span><strong>${clubPoints} Club Points</strong></div>
      <div class="private-copy">A private game score. Non-purchasable, non-transferable, non-withdrawable. No cash value.</div>
      <button class="private-cta" data-goto="club">See the Club League table →</button>
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

/* ================= Arcade Lobby ================= */

function formDots(form) {
  if (!form || !form.length) return '<span class="form-empty">no games yet</span>';
  return form.map((f) => `<i class="form-dot ${f === 'W' ? 'w' : 'l'}" aria-label="${f === 'W' ? 'Win' : 'Loss'}"></i>`).join('');
}

function lobbyHTML(overlay, play, sims) {
  const { rows } = clubTable(play, overlay, sims);
  const you = rows.find((r) => r.id === 'you');
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
  const bestWin = lab.filter((e) => e.win).sort((a, b) => (b.gh - b.ga) - (a.gh - a.ga))[0];
  const earned = achievementState().filter((a) => a.on);
  return `<section class="play-card lobby" aria-label="Arcade lobby">
    <div class="lobby-marquee" role="group" aria-label="Your club standing">
      <div class="lm-stat cp"><strong class="display">${you ? you.cp : 0}</strong><span>Club Points</span></div>
      <div class="lm-stat"><span class="lm-form">${formDots(you && you.form)}</span><span>Lab form</span></div>
      <div class="lm-stat"><strong>#${you ? you.rank : 1}</strong><span>${you && you.move > 0 ? '▲ climbing' : you && you.move < 0 ? '▼ slipping' : 'Club rank'}</span></div>
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

    <button class="lobby-club" data-goto="club" aria-label="Open Club League">
      <span class="lt-kicker">Club League · on this device</span>
      ${rows.slice(0, 3).map((r, i) => `<span class="lc-row${r.id === 'you' ? ' you' : ''}">
        <em>${i + 1}</em> ${esc(r.emoji || '⚽')} ${esc(r.name)} <b>${r.cp} CP</b>${r.move > 0 ? ' <i class="up">▲</i>' : r.move < 0 ? ' <i class="down">▼</i>' : ''}
      </span>`).join('')}
      <span class="lc-more">Open the club room →</span>
    </button>

    <div class="lobby-record">
      <span>${bestWin ? `Record to beat: ${teamFlag(bestWin.home)} ${bestWin.gh}–${bestWin.ga} ${teamFlag(bestWin.away)}` : 'No record yet — set one tonight'}</span>
      <span>${earned.length ? earned.slice(0, 3).map((a) => a.icon).join(' ') + ` ${earned.length} unlocked` : 'Achievements await'}</span>
    </div>
  </section>`;
}

/* ================= Club League view ================= */

function clubHTML(overlay, play, sims) {
  const { rows, club } = clubTable(play, overlay, sims);
  const you = rows.find((r) => r.id === 'you');
  const rival = club.rivalId ? rows.find((r) => r.id === club.rivalId) : null;
  const ach = achievementState();
  const recent = club.events.slice(0, 6);
  const podium = rows.slice(0, 3);
  const canAdd = rows.length < 8;
  return `<section class="play-card club" aria-label="Club League">
    <header class="club-head">
      <div><h2 class="display">Club League</h2>
      <p class="play-sub">Your private club room. Everyone here plays on this phone — pass it around, settle it in the Lab.</p></div>
      <span class="club-chip">On this device</span>
    </header>

    ${rows.length > 1 ? `<div class="club-podium" aria-label="Top three">
      ${podium.map((r, i) => `<div class="podium-slot p${i + 1}${r.id === 'you' ? ' you' : ''}">
        <span class="podium-emoji">${esc(r.emoji || '⚽')}</span>
        <strong>${esc(r.name)}</strong>
        <b>${r.cp} CP</b>
        <span class="podium-move">${r.move > 0 ? '▲ up this week' : r.move < 0 ? '▼ down' : '—'}</span>
      </div>`).join('')}
    </div>` : `<p class="club-solo">It's just you so far. Add the household below — every profile is a real person on this phone, nothing is simulated for them.</p>`}

    <div class="club-table" role="table" aria-label="Club standings">
      ${rows.map((r) => `<div class="club-row${r.id === club.activeId ? ' active' : ''}${r.id === 'you' ? ' you' : ''}" role="row">
        <span class="cr-rank">${r.rank}</span>
        <span class="cr-who">${esc(r.emoji || '⚽')} ${esc(r.name)}${r.id === club.activeId ? ' <em class="cr-playing">playing</em>' : ''}</span>
        <span class="cr-form">${formDots(r.form)}</span>
        <span class="cr-cp">${r.cp} CP${r.move > 0 ? ' <i class="up">▲</i>' : r.move < 0 ? ' <i class="down">▼</i>' : ''}</span>
        <span class="cr-actions">
          ${r.id !== club.activeId ? `<button class="cr-btn" data-club-active="${esc(r.id)}">Play as</button>` : ''}
          ${r.id !== 'you' ? `<button class="cr-btn" data-club-rival="${esc(r.id)}">${club.rivalId === r.id ? 'Rival ✓' : 'Set rival'}</button>` : ''}
        </span>
      </div>`).join('')}
    </div>

    ${rival && you ? `<div class="club-rivalry" aria-label="Rivalry">
      <span class="rival-title">Rivalry</span>
      <div class="rival-bars">
        <div class="rival-line"><span>${esc(you.name)}</span><i style="width:${Math.round((you.cp / Math.max(1, Math.max(you.cp, rival.cp))) * 100)}%"></i><b>${you.cp}</b></div>
        <div class="rival-line"><span>${esc(rival.name)}</span><i style="width:${Math.round((rival.cp / Math.max(1, Math.max(you.cp, rival.cp))) * 100)}%"></i><b>${rival.cp}</b></div>
      </div>
      <span class="rival-gap">${you.cp === rival.cp ? 'Dead level.' : you.cp > rival.cp ? `You lead by ${you.cp - rival.cp}.` : `${esc(rival.name)} leads by ${rival.cp - you.cp}.`}</span>
    </div>` : ''}

    <div class="club-week" aria-label="This week">
      <span class="cw-title">This week in the Lab</span>
      ${rows.some((r) => r.weekCp) ? rows.filter((r) => r.weekCp).map((r) => `<span class="cw-row">${esc(r.emoji || '⚽')} ${esc(r.name)} <b>+${r.weekCp}</b></span>`).join('') : '<span class="cw-none">No lab points yet this week — the pitch is free.</span>'}
    </div>

    <div class="club-achievements" aria-label="Achievements">
      <span class="cw-title">Achievements</span>
      <div class="ach-grid">
        ${ach.map((a) => `<div class="ach${a.on ? ' on' : ''}" title="${esc(a.desc)}">
          <span class="ach-icon">${a.icon}</span><strong>${esc(a.name)}</strong><small>${esc(a.desc)}</small>
        </div>`).join('')}
      </div>
    </div>

    ${recent.length ? `<div class="club-activity" aria-label="Recent activity">
      <span class="cw-title">Recent activity</span>
      ${recent.map((e) => {
    const p = rows.find((r) => r.id === e.pid);
    return `<span class="ca-row">${p ? esc(p.emoji || '⚽') + ' ' + esc(p.name) : 'Player'} · ${esc(e.note || 'played')} · <b>+${e.cp} CP</b></span>`;
  }).join('')}
    </div>` : ''}

    <div class="club-manage">
      ${canAdd ? `<div class="club-add">
        <input id="club-name" maxlength="12" placeholder="Add a player (this phone)" aria-label="New player name">
        <button class="play-btn quiet" id="club-add-btn">Add</button>
      </div>` : ''}
      <button class="play-btn quiet" id="club-share">Copy a challenge card</button>
      <p class="private-copy">Club Points are a private game score. No cash value, non-purchasable, non-transferable, non-withdrawable. Nothing here is a global leaderboard.</p>
    </div>
  </section>`;
}

function wireClub(outlet) {
  outlet.querySelectorAll('[data-club-active]').forEach((b) => {
    b.addEventListener('click', () => {
      const club = ensureClub(getState().play);
      club.activeId = b.dataset.clubActive;
      saveClub(club);
    });
  });
  outlet.querySelectorAll('[data-club-rival]').forEach((b) => {
    b.addEventListener('click', () => {
      const club = ensureClub(getState().play);
      club.rivalId = club.rivalId === b.dataset.clubRival ? null : b.dataset.clubRival;
      saveClub(club);
    });
  });
  const add = outlet.querySelector('#club-add-btn');
  if (add) {
    add.addEventListener('click', () => {
      const input = outlet.querySelector('#club-name');
      const name = (input && input.value || '').trim().slice(0, 12);
      if (!name) return;
      const club = ensureClub(getState().play);
      if (club.players.length >= 8 || club.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) return;
      club.players = [...club.players, {
        id: 'p' + Date.now().toString(36),
        name,
        emoji: PROFILE_EMOJI[club.players.length % PROFILE_EMOJI.length],
      }];
      saveClub(club);
    });
  }
  const share = outlet.querySelector('#club-share');
  if (share) {
    share.addEventListener('click', async () => {
      const { play, real, sims } = getState();
      const { rows } = clubTable(play, real.overlay, sims);
      const you = rows.find((r) => r.id === 'you');
      const best = (play.labHistory || []).find((e) => e.win);
      const text = `United 2026 Club League — I'm on ${you ? you.cp : 0} Club Points`
        + (best ? ` and just ran ${teamName(best.home)} ${best.gh}–${best.ga} ${teamName(best.away)} in Match Lab.` : '.')
        + ' Beat that. (Private game score, no cash value.)';
      try {
        if (navigator.share) await navigator.share({ text });
        else { await navigator.clipboard.writeText(text); share.textContent = 'Copied — go brag'; }
      } catch { /* user dismissed */ }
    });
  }
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
  const { real, play, nav, sims } = getState();
  const mode = nav.playMode;
  let body;
  if (mode === 'lab') body = labRun ? labRunHTML(labRun) : labSetupHTML(play);
  else if (mode === 'myworldcup') body = myWorldCupHTML(real.overlay, play, pendingPick);
  else if (mode === 'prediction') body = predictionHTML(real.overlay, play);
  else if (mode === 'club') body = clubHTML(real.overlay, play, sims);
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
      { value: 'club', label: 'Club League' },
    ],
  })}
    </div>
    ${body}
  </div>`;
  outlet.querySelector('[data-segmented="play-mode"]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-value]');
    if (btn) { stopLabTimer(); if (labRun && !labRun.done) labRun = null; setPlayMode(btn.dataset.value); }
  });
  // Any surface can hand off to another mode (lobby tiles, club CTA, etc.).
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
  else if (mode === 'club') wireClub(outlet);
  else wireLobby(outlet);
}
