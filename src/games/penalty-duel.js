// United 2026 — Penalty Duel pure engine (Penalty Rush rebuild).
// A psychological shootout: read a scouted keeper, time the run-up pulse,
// place the ball, and decide when to sell a feint. The keeper model reads
// tendencies and your habit history — never your current pick. Deterministic
// for a given seed and kick log; replayable by a future server validator.
// Ranked submission stays disabled until signed challenges exist.

import { createSeededRng, hashSeed } from '../core/soccer-engine.js';

export const PENALTY_DUEL_VERSION = 'penalty-duel-v1';

export const DUEL_RULES = Object.freeze({
  kicks: 5,              // regulation kicks; a perfect five opens sudden death
  pulseMs: 1400,         // one full sweep of the run-up pulse
  baseWindow: 0.34,      // sweet-spot half-width as a fraction of the sweep
  floorWindow: 0.16,     // the window NEVER shrinks below this — pressure has a floor
  feintWindowScale: 0.75,// selling a feint trims the window (shown before you arm it)
  maxKickMs: 30_000,     // a kick log claiming longer than this is rejected
  ranked: false,         // fail-closed until signed server challenges exist
});

export const DUEL_ZONES = Object.freeze(['tl', 'tc', 'tr', 'bl', 'bc', 'br']);
export const DUEL_ZONE_INFO = Object.freeze({
  tl: Object.freeze({ label: 'top left', col: 'l', row: 't', missFactor: 0.40, risk: 'high reward' }),
  tc: Object.freeze({ label: 'top centre', col: 'c', row: 't', missFactor: 0.34, risk: 'brave' }),
  tr: Object.freeze({ label: 'top right', col: 'r', row: 't', missFactor: 0.40, risk: 'high reward' }),
  bl: Object.freeze({ label: 'low left', col: 'l', row: 'b', missFactor: 0.20, risk: 'composed' }),
  bc: Object.freeze({ label: 'low centre', col: 'c', row: 'b', missFactor: 0.10, risk: 'cheeky' }),
  br: Object.freeze({ label: 'low right', col: 'r', row: 'b', missFactor: 0.20, risk: 'composed' }),
});

/* Six scouted keepers. Their tendencies are real: the same weights shown on
   the card drive the pick model. Nothing on the card is a lie. */
export const DUEL_KEEPERS = Object.freeze([
  { id: 'gambler', name: 'The Gambler', dives: 'early', read: 0.16, cols: { l: 0.42, c: 0.16, r: 0.42 }, rows: { t: 0.38, b: 0.62 }, tell: 'Dives early to a corner — a feint sends him the wrong way.' },
  { id: 'octopus', name: 'The Octopus', dives: 'late', read: 0.30, cols: { l: 0.34, c: 0.32, r: 0.34 }, rows: { t: 0.58, b: 0.42 }, tell: 'Waits and reads habits — strong up high, feints rarely fool him.' },
  { id: 'linejudge', name: 'The Line Judge', dives: 'late', read: 0.24, cols: { l: 0.26, c: 0.48, r: 0.26 }, rows: { t: 0.30, b: 0.70 }, tell: 'Holds his line — punishes anything soft down the middle.' },
  { id: 'southpaw', name: 'The Southpaw', dives: 'early', read: 0.20, cols: { l: 0.55, c: 0.15, r: 0.30 }, rows: { t: 0.40, b: 0.60 }, tell: 'Favours his left post — but he knows you know.' },
  { id: 'shadow', name: 'The Shadow', dives: 'balanced', read: 0.34, cols: { l: 0.34, c: 0.32, r: 0.34 }, rows: { t: 0.44, b: 0.56 }, tell: 'The best reader in the league — vary everything.' },
  { id: 'wall', name: 'The Wall', dives: 'balanced', read: 0.12, cols: { l: 0.30, c: 0.40, r: 0.30 }, rows: { t: 0.36, b: 0.64 }, tell: 'Huge frame, slow feet — precision beats him, power feeds him.' },
]);

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, Number(n) || 0)); }
function fixed(n) { return Math.round(n * 100) / 100; }

export function createPenaltyDuel(seed) {
  const s = (Number(seed) || hashSeed('penalty-duel')) >>> 0 || 1;
  const keeper = DUEL_KEEPERS[s % DUEL_KEEPERS.length];
  return {
    version: PENALTY_DUEL_VERSION,
    seed: s,
    rng: createSeededRng(hashSeed(`${s}:duel`) || 1),
    keeper: keeper.id,
    kicks: [],
    goals: 0,
    sudden: false,
    over: false,
    aims: Object.fromEntries(DUEL_ZONES.map((z) => [z, 0])),
    pressure: 0.15,
    feintArmed: false,
  };
}

export function duelKeeper(run) {
  return DUEL_KEEPERS.find((k) => k.id === run?.keeper) || DUEL_KEEPERS[0];
}

/** The run-up pulse: a pure triangle wave over time. The UI and any future
    server replay compute the exact same value from the same milliseconds. */
export function pulseOffsetAt(ms) {
  const t = ((Number(ms) || 0) % DUEL_RULES.pulseMs) / DUEL_RULES.pulseMs; // 0..1
  return fixed(t < 0.5 ? -1 + t * 4 : 3 - t * 4); // -1 → 1 → -1
}

/** The visible sweet-spot half-width for the NEXT kick. Pressure narrows it,
    the floor is absolute, and the value is shown before the run-up starts. */
export function sweetWindow(run, feint = run?.feintArmed) {
  const kicksTaken = run?.kicks?.length || 0;
  let w = DUEL_RULES.baseWindow - kicksTaken * 0.022 - (run?.sudden ? 0.045 : 0);
  if (feint) w *= DUEL_RULES.feintWindowScale;
  return fixed(Math.max(DUEL_RULES.floorWindow, w));
}

/** Honest habit read: what the keeper has actually seen. Never exposes the
    current pick and never consumes RNG. */
export function duelReadSignal(run) {
  const aims = run?.aims || {};
  const cols = { l: 0, c: 0, r: 0 };
  for (const z of DUEL_ZONES) cols[DUEL_ZONE_INFO[z].col] += aims[z] || 0;
  const total = cols.l + cols.c + cols.r;
  if (total < 2) return { side: null, level: 0, label: 'No pattern yet' };
  const side = ['l', 'c', 'r'].reduce((a, b) => (cols[a] >= cols[b] ? a : b));
  const level = cols[side] / total;
  if (level <= 0.5) return { side: null, level: fixed(level), label: 'Your pattern is balanced' };
  const name = side === 'l' ? 'left' : side === 'r' ? 'right' : 'the middle';
  return { side, level: fixed(level), label: `Keeper leaning ${name}` };
}

function favoriteCol(run) {
  const signal = duelReadSignal(run);
  return signal.side;
}

/* Keeper pick: archetype tendencies × habit history × dive style. Consumes
   a fixed number of RNG draws per kick so replays stay aligned. */
function keeperPick(run, feint) {
  const k = duelKeeper(run);
  const rHabit = run.rng();
  const rCol = run.rng();
  const rRow = run.rng();
  const fav = favoriteCol(run);
  const weights = { ...k.cols };
  // habit lean: with history, the keeper genuinely shades your favourite side
  if (fav && rHabit < k.read + (run.sudden ? 0.12 : 0) + (feint && k.dives === 'early' ? -0.1 : 0)) {
    weights[fav] += 0.5;
  }
  const totalW = weights.l + weights.c + weights.r;
  const roll = rCol * totalW;
  const col = roll < weights.l ? 'l' : roll < weights.l + weights.c ? 'c' : 'r';
  const row = rRow < k.rows.t ? 't' : 'b';
  // an early diver who bites on the feint is committed the moment you pause
  const committed = feint && k.dives === 'early';
  return { col, row, committed };
}

/** Resolve one kick from the player's inputs: zone, feint, and the run-up
    commit time in ms. Deterministic; mutates only the passed run. */
export function takeKick(run, { zone, feint = false, atMs = 0 } = {}) {
  if (!run || run.over || !DUEL_ZONES.includes(zone)) return null;
  const info = DUEL_ZONE_INFO[zone];
  const window = sweetWindow(run, feint);
  const offset = pulseOffsetAt(atMs);
  const quality = fixed(clamp(1 - Math.abs(offset) / window, 0, 1));
  const pick = keeperPick(run, feint);
  const missChance = clamp((1 - quality) * info.missFactor, 0, 0.9);
  const rMiss = run.rng();
  const rSave = run.rng();
  let outcome;
  const fullRead = pick.col === info.col && pick.row === info.row;
  const wingRead = pick.col === info.col && !fullRead;
  const feintBeat = pick.committed && info.col !== pick.col ? false : pick.committed; // committed keeper is beatable even on a read
  if (rMiss < missChance) {
    outcome = 'off';
  } else {
    const saveChance = fullRead
      ? clamp(0.82 - quality * 0.25 - (feintBeat ? 0.34 : 0), 0.05, 0.95)
      : wingRead
        ? clamp(0.38 - quality * 0.22 - (feintBeat ? 0.18 : 0), 0.02, 0.9)
        : 0.02;
    outcome = rSave < saveChance ? 'save' : 'goal';
  }
  run.aims[zone] += 1;
  const kick = {
    n: run.kicks.length + 1,
    zone,
    feint: !!feint,
    atMs: Math.max(0, Math.round(Number(atMs) || 0)),
    offset,
    window,
    quality,
    keeper: pick.col + pick.row,
    keeperCol: pick.col,
    keeperRow: pick.row,
    committed: pick.committed,
    read: fullRead ? 'full' : wingRead ? 'wing' : 'wrong',
    outcome,
    sudden: run.sudden,
    pressure: fixed(run.pressure),
  };
  run.kicks.push(kick);
  run.feintArmed = false;
  if (outcome === 'goal') run.goals += 1;
  if (run.sudden) {
    if (outcome !== 'goal') run.over = true;
  } else if (run.kicks.length >= DUEL_RULES.kicks) {
    if (run.goals === DUEL_RULES.kicks) run.sudden = true;
    else run.over = true;
  }
  run.pressure = clamp(run.pressure + (outcome === 'goal' ? 0.10 : 0.16) + (run.sudden ? 0.07 : 0), 0, 1);
  return kick;
}

export function duelRating(goals) {
  if (goals >= 8) return "the keeper's nightmare";
  if (goals >= 5) return 'ice in the veins';
  if (goals === 4) return 'clinical from twelve yards';
  if (goals === 3) return 'composed under the lights';
  if (goals === 2) return 'shaky legs tonight';
  return 'the keeper owns tonight';
}

/** Same record contract Penalty Rush has always kept: day bests + all-time
    bests, goals as the score. Old records stay honest under the new loop —
    both count goals in a five-kick shootout plus sudden death. */
export function duelRecordAfter(rec, { dateKey, score, perfect }) {
  const sameDay = !!rec && rec.dateKey === dateKey;
  return {
    dateKey,
    attemptsToday: (sameDay ? rec.attemptsToday || 0 : 0) + 1,
    bestToday: Math.max(sameDay ? rec.bestToday || 0 : 0, score),
    bestEver: Math.max((rec && rec.bestEver) || 0, score),
    perfects: ((rec && rec.perfects) || 0) + (perfect ? 1 : 0),
    played: ((rec && rec.played) || 0) + 1,
    lastScore: score,
  };
}

export function duelEventLog(run) {
  return {
    gameVersion: PENALTY_DUEL_VERSION,
    ruleVersion: PENALTY_DUEL_VERSION,
    seed: run.seed,
    events: run.kicks.map((k) => ({ zone: k.zone, feint: k.feint, atMs: k.atMs })),
    score: run.goals,
  };
}

/** Pure replay validator for a future server route. Rejects version, seed,
    event and score tampering. */
export function validateDuelLog(log) {
  if (!log || log.gameVersion !== PENALTY_DUEL_VERSION || log.ruleVersion !== PENALTY_DUEL_VERSION) return { ok: false, reason: 'version' };
  if (!Number.isInteger(log.seed) || log.seed <= 0 || !Array.isArray(log.events)) return { ok: false, reason: 'challenge' };
  const replay = createPenaltyDuel(log.seed);
  for (const e of log.events) {
    if (replay.over) return { ok: false, reason: 'event-count' };
    if (!Number.isInteger(e.atMs) || e.atMs < 0 || e.atMs > DUEL_RULES.maxKickMs) return { ok: false, reason: 'timing' };
    if (!takeKick(replay, { zone: e.zone, feint: !!e.feint, atMs: e.atMs })) return { ok: false, reason: 'event' };
  }
  if (replay.goals !== log.score) return { ok: false, reason: 'score', expected: replay.goals };
  return { ok: true, score: replay.goals };
}
