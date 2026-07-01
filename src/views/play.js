// United 2026 — Play. Private simulation space: What-If Match and My World Cup.
// Warm, dramatic, gold-lit, and structurally isolated from real tournament
// truth: everything here operates on deep copies and writes only to the Play
// namespace. It can never modify real fixtures, standings, Home, the official
// bracket, or Match Center. Dry humor lives here and only here.

import { getState, setPlay, setSims } from '../core/app-state.js';
import { savePlay, saveSims } from '../core/persistence.js';
import {
  allFixtures, teamName, teamFlag, computeStandings, resolveSlots, STAGE_NAMES, STAGE_ORDER,
} from '../core/canonical-truth.js';
import { TEAMS, RATINGS } from '../data/fixtures.js';
import { esc } from '../components/match-row.js';

export const seedHTML = `<div class="view play-view">
  <header class="view-head"><h1>Play</h1><p class="view-sub">Private simulation space</p></header>
  <div class="view-shell-note">warming up the spreadsheet…</div>
</div>`;

/* ---------------- deterministic sim engine (Play-only) ---------------- */

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

/* ---------------- My World Cup (round-by-round, sealed world) ---------------- */

function realFinalsCopy(overlay) {
  // Deep copy of validated finals — the ONLY bridge from real to Play, one-way.
  const finals = new Map();
  for (const [id, ov] of overlay.byFixture) {
    if (ov.status === 'final' && ov.gh != null && ov.ga != null) {
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
    if (fx && fx.stage === 'group') groupFinals.set(id, r); else koFinals.set(id, r);
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

export function playNextRound() {
  const { real, play } = getState();
  const sim = play.myWorldCup || { seed: (Date.now() % 2147483647) | 1, finals: {}, log: [] };
  const rng = mulberry32(sim.seed + Object.keys(sim.finals).length * 977);
  const world = simWorld(real.overlay, { myWorldCup: sim });
  const next = nextSimStage(world);
  if (!next) return;
  const results = [];
  for (const fx of next.remaining) {
    const s = world.slots.get(fx.id) || {};
    const home = s.home; const away = s.away;
    if (!home || !away) continue; // unresolved after sim standings — skip honestly
    const r = simulateMatch(home, away, rng, { knockout: fx.stage !== 'group' });
    sim.finals[fx.id] = { gh: r.gh, ga: r.ga, winner: r.winner === 'draw' ? 'draw' : r.winner, pens: r.pens };
    results.push({ id: fx.id, stage: fx.stage, home, away, ...r });
  }
  sim.log = (sim.log || []).concat([{ stage: next.stage, results, line: grugLine(rng) }]);
  const after = simWorld(real.overlay, { myWorldCup: sim });
  const done = !nextSimStage(after);
  if (done) {
    const finalFx = allFixtures().find((f) => f.stage === 'final');
    const fSlots = after.slots.get(finalFx.id); const fRes = after.finals.get(finalFx.id);
    sim.champion = fRes && fSlots ? (fRes.winner === 'home' ? fSlots.home : fSlots.away) : null;
  }
  const nextPlay = { ...play, myWorldCup: sim };
  setPlay(nextPlay);
  savePlay(nextPlay);
}

export function resetMyWorldCup() {
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
  };
  const next = { saved: [entry, ...(sims.saved || [])].slice(0, 50) };
  setSims(next);
  saveSims(next);
}

/* ---------------- What-If Match ---------------- */

function runWhatIf(home, away) {
  const { play } = getState();
  const rng = mulberry32(((Date.now() % 2147483647) | 1) ^ 0x5f3759);
  const r = simulateMatch(home, away, rng, { knockout: true });
  const nextPlay = { ...play, whatIf: { home, away, ...r, line: grugLine(rng) } };
  setPlay(nextPlay);
  savePlay(nextPlay);
}

/* ---------------- render ---------------- */

function teamOptions(selected) {
  return Object.keys(TEAMS).sort((a, b) => teamName(a).localeCompare(teamName(b)))
    .map((c) => `<option value="${c}"${c === selected ? ' selected' : ''}>${esc(teamName(c))}</option>`).join('');
}

function whatIfHTML(play) {
  const w = play.whatIf || {};
  const result = w.gh != null ? `
    <div class="wi-result" role="status">
      <div class="wi-score"><span>${teamFlag(w.home)} ${esc(teamName(w.home))}</span>
        <strong>${w.gh}–${w.ga}${w.pens ? ' <small>(' + w.pens.ph + '–' + w.pens.pa + ' pens)</small>' : ''}</strong>
        <span>${esc(teamName(w.away))} ${teamFlag(w.away)}</span></div>
      <p class="grug-line">${esc(w.line || '')}</p>
    </div>` : '<p class="empty-line grug-line">pick two nations. consequences are simulated, not real.</p>';
  return `<section class="play-card what-if" aria-label="What-If Match">
    <h2>What-If Match</h2>
    <div class="wi-pickers">
      <select id="wi-home" aria-label="Home team">${teamOptions(w.home || 'USA')}</select>
      <span class="wi-v">v</span>
      <select id="wi-away" aria-label="Away team">${teamOptions(w.away || 'ARG')}</select>
    </div>
    <button class="play-btn" id="wi-run">Simulate</button>
    ${result}
  </section>`;
}

function myWorldCupHTML(overlay, play) {
  const sim = play.myWorldCup;
  if (!sim) {
    return `<section class="play-card my-wc" aria-label="My World Cup">
      <h2>My World Cup</h2>
      <p class="play-sub">Simulate the rest of the tournament from tonight's real state. The real bracket never notices.</p>
      <button class="play-btn gold" id="mwc-start">Begin simulation</button>
    </section>`;
  }
  const world = simWorld(overlay, { myWorldCup: sim });
  const next = nextSimStage(world);
  const lastRound = (sim.log || [])[(sim.log || []).length - 1];
  return `<section class="play-card my-wc" aria-label="My World Cup">
    <h2>My World Cup</h2>
    ${sim.champion ? `
      <div class="mwc-champion" role="status">
        <div class="mwc-crown" aria-hidden="true">★</div>
        <div class="mwc-champ-name">${teamFlag(sim.champion)} ${esc(teamName(sim.champion))}</div>
        <div class="mwc-champ-sub">champions of your universe</div>
        <p class="grug-line">${esc(lastRound ? lastRound.line : '')}</p>
      </div>
      <div class="play-actions">
        <button class="play-btn gold" id="mwc-save">Save this timeline</button>
        <button class="play-btn quiet" id="mwc-reset">Run it back</button>
      </div>` : `
      ${lastRound ? `<div class="mwc-round" role="status">
        <h3>${esc(STAGE_NAMES[lastRound.stage])} — simulated</h3>
        ${lastRound.results.map((r) => `<div class="mwc-line">
          <span>${teamFlag(r.home)} ${esc(teamName(r.home))}</span>
          <strong>${r.gh}–${r.ga}${r.pens ? ' <small>p</small>' : ''}</strong>
          <span>${esc(teamName(r.away))} ${teamFlag(r.away)}</span></div>`).join('')}
        <p class="grug-line">${esc(lastRound.line)}</p>
      </div>` : ''}
      <div class="play-actions">
        ${next ? `<button class="play-btn gold" id="mwc-next">Simulate ${esc(STAGE_NAMES[next.stage])}</button>` : ''}
        <button class="play-btn quiet" id="mwc-reset">Reset</button>
      </div>`}
  </section>`;
}

export function render(outlet) {
  const { real, play } = getState();
  outlet.innerHTML = `<div class="view play-view">
    <header class="view-head"><h1>Play</h1>
      <p class="view-sub">Private simulations · nothing here touches the real tournament</p></header>
    ${whatIfHTML(play)}
    ${myWorldCupHTML(real.overlay, play)}
  </div>`;
  const runBtn = outlet.querySelector('#wi-run');
  if (runBtn) {
    runBtn.addEventListener('click', () => {
      runWhatIf(outlet.querySelector('#wi-home').value, outlet.querySelector('#wi-away').value);
    });
  }
  const start = outlet.querySelector('#mwc-start');
  if (start) start.addEventListener('click', playNextRound);
  const nextBtn = outlet.querySelector('#mwc-next');
  if (nextBtn) nextBtn.addEventListener('click', playNextRound);
  const resetBtn = outlet.querySelector('#mwc-reset');
  if (resetBtn) resetBtn.addEventListener('click', resetMyWorldCup);
  const saveBtn = outlet.querySelector('#mwc-save');
  if (saveBtn) saveBtn.addEventListener('click', saveCurrentSim);
}
