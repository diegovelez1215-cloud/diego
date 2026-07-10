// United 2026 — shared fictional soccer engine.
//
// This module is the only home for full-match probability math. It is used by
// Play simulations and can be imported by a server validator without a DOM.
// Official fixtures/results never enter or leave this module.
//
// Model notes (v1):
//   • ratings are 0–100 and default to the Play-only RATINGS registry;
//   • expected goals compare attack/control with defence/goalkeeping;
//   • context adjustments are explicit, bounded and returned in the result;
//   • seeded variation changes a match, never the underlying strength order;
//   • there is no user/AI flag and therefore no hidden protection or boost.

import { RATINGS } from '../data/fixtures.js';

export const SOCCER_MODEL_VERSION = 'u26-soccer-v1';

export const TACTICS = Object.freeze({
  balanced: Object.freeze({ attack: 1, exposure: 1, control: 0, fatigue: 1, volatility: 0 }),
  press: Object.freeze({ attack: 1.12, exposure: 1.1, control: 0.02, fatigue: 1.16, volatility: 0.08 }),
  counter: Object.freeze({ attack: 1.02, exposure: 0.94, control: -0.04, fatigue: 0.96, volatility: 0.05 }),
  control: Object.freeze({ attack: 0.98, exposure: 0.91, control: 0.08, fatigue: 1.02, volatility: -0.03 }),
  'low-block': Object.freeze({ attack: 0.78, exposure: 0.76, control: -0.08, fatigue: 0.9, volatility: -0.08 }),
});

const FORMATIONS = Object.freeze({
  '4-3-3': Object.freeze({ attack: 1.04, defence: 0.99, midfield: 1.01 }),
  '4-2-3-1': Object.freeze({ attack: 1, defence: 1.03, midfield: 1.03 }),
  '4-4-2': Object.freeze({ attack: 1.01, defence: 1, midfield: 0.98 }),
  '3-4-3': Object.freeze({ attack: 1.1, defence: 0.91, midfield: 1 }),
  '5-4-1': Object.freeze({ attack: 0.82, defence: 1.12, midfield: 0.97 }),
});

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, Number(n))); }
function round(n, places = 3) { const p = 10 ** places; return Math.round(n * p) / p; }

export function hashSeed(value) {
  let h = 2166136261;
  for (const ch of String(value)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createSeededRng(seed) {
  let a = (Number(seed) || 1) >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(rng, lambda) {
  const limit = Math.exp(-lambda);
  let k = 0; let p = 1;
  do { k += 1; p *= rng(); } while (p > limit && k < 24);
  return k - 1;
}

function stablePulse(code, dimension) {
  return (hashSeed(`${code}:${dimension}`) % 11) - 5;
}

/** Build a stable team profile. Sub-ratings are labelled fallback when the
 * caller provides only an overall rating; no verified-data claim is made. */
export function resolveTeamProfile(team, overrides = {}) {
  const code = typeof team === 'string' ? team : team?.code;
  const provided = typeof team === 'object' && team ? team : {};
  const base = clamp(overrides.baseStrength ?? provided.baseStrength ?? RATINGS[code] ?? 70, 40, 100);
  const dimension = (name) => clamp(overrides[name] ?? provided[name] ?? base + stablePulse(code || 'FALLBACK', name), 40, 100);
  return Object.freeze({
    code: code || provided.code || 'CUSTOM',
    baseStrength: base,
    attack: dimension('attack'),
    midfield: dimension('midfield'),
    defence: dimension('defence'),
    goalkeeper: dimension('goalkeeper'),
    squadQuality: dimension('squadQuality'),
    style: overrides.style || provided.style || 'balanced',
    formation: overrides.formation || provided.formation || '4-2-3-1',
    source: overrides.source || provided.source || 'stable-fallback',
  });
}

function sideContext(raw = {}) {
  const tactic = TACTICS[raw.tactic] || TACTICS.balanced;
  const formation = FORMATIONS[raw.formation] || FORMATIONS['4-2-3-1'];
  return {
    tacticName: TACTICS[raw.tactic] ? raw.tactic : 'balanced',
    tactic,
    formationName: FORMATIONS[raw.formation] ? raw.formation : '4-2-3-1',
    formation,
    availability: clamp(raw.playerAvailability ?? 1, 0.55, 1),
    fatigue: clamp(raw.fatigue ?? 0, 0, 1),
    restDays: clamp(raw.restDays ?? 4, 0, 10),
    travel: clamp(raw.travel ?? 0, 0, 1),
    substitutions: clamp(raw.substitutions ?? 0.5, 0, 1),
    redCards: Math.round(clamp(raw.redCards ?? 0, 0, 2)),
    yellowCards: Math.round(clamp(raw.yellowCards ?? 0, 0, 8)),
    momentum: clamp(raw.momentum ?? 0, -1, 1),
    goalDiff: Math.round(clamp(raw.goalDiff ?? 0, -6, 6)),
    minute: clamp(raw.minute ?? 0, 0, 120),
  };
}

function attackingLevel(profile, ctx) {
  const raw = profile.attack * 0.43 + profile.midfield * 0.27
    + profile.squadQuality * 0.16 + profile.baseStrength * 0.14;
  const availability = 0.82 + ctx.availability * 0.18;
  const fatigue = 1 - ctx.fatigue * 0.16 * ctx.tactic.fatigue;
  const rest = 1 + clamp(ctx.restDays - 3, -3, 4) * 0.008;
  const travel = 1 - ctx.travel * 0.05;
  const subs = 1 + ctx.substitutions * ctx.fatigue * 0.045;
  const red = 1 - ctx.redCards * 0.24;
  const cards = 1 - ctx.yellowCards * 0.004;
  const momentum = 1 + ctx.momentum * 0.06;
  const chase = ctx.minute >= 55 && ctx.goalDiff < 0 ? 1 + Math.min(0.12, -ctx.goalDiff * 0.035) : 1;
  const protect = ctx.minute >= 70 && ctx.goalDiff > 0 ? 1 - Math.min(0.1, ctx.goalDiff * 0.025) : 1;
  return raw * availability * fatigue * rest * travel * subs * red * cards
    * momentum * chase * protect * ctx.tactic.attack * ctx.formation.attack;
}

function resistanceLevel(profile, ctx) {
  const raw = profile.defence * 0.48 + profile.goalkeeper * 0.27
    + profile.midfield * 0.17 + profile.baseStrength * 0.08;
  const availability = 0.8 + ctx.availability * 0.2;
  const fatigue = 1 - ctx.fatigue * 0.2 * ctx.tactic.fatigue;
  const red = 1 - ctx.redCards * 0.3;
  const cards = 1 - ctx.yellowCards * 0.006;
  const travel = 1 - ctx.travel * 0.035;
  return raw * availability * fatigue * red * cards * travel
    * ctx.formation.defence / ctx.tactic.exposure;
}

/** Expected-goal model. Returned adjustments are developer-facing evidence;
 * the UI may summarize them but must not call them official statistics. */
export function expectedGoals(input = {}) {
  const home = resolveTeamProfile(input.home, input.homeProfile);
  const away = resolveTeamProfile(input.away, input.awayProfile);
  const hc = sideContext({ formation: home.formation, ...input.homeContext });
  const ac = sideContext({ formation: away.formation, ...input.awayContext });
  const hAttack = attackingLevel(home, hc);
  const aAttack = attackingLevel(away, ac);
  const hResist = resistanceLevel(home, hc);
  const aResist = resistanceLevel(away, ac);
  const homeAdvantage = clamp(input.homeAdvantage ?? 0.11, -0.1, 0.2);
  const venueNeutral = input.neutralVenue === true;
  const importance = clamp(input.matchImportance ?? 0.5, 0, 1);
  const caution = 1 - importance * 0.055;
  const homeControl = (home.midfield - away.midfield) / 1000 + hc.tactic.control - ac.tactic.control;
  const awayControl = -homeControl;
  const hBase = 1.28 * Math.exp(((hAttack - aResist) / 20) * 0.5);
  const aBase = 1.22 * Math.exp(((aAttack - hResist) / 20) * 0.5);
  const redSwingH = 1 + ac.redCards * 0.3;
  const redSwingA = 1 + hc.redCards * 0.3;
  const hxg = clamp(hBase * caution * (venueNeutral ? 1 : 1 + homeAdvantage) * (1 + homeControl) * redSwingH, 0.12, 4.8);
  const axg = clamp(aBase * caution * (venueNeutral ? 1 : 0.98) * (1 + awayControl) * redSwingA, 0.12, 4.8);
  const volatility = clamp(0.11 + hc.tactic.volatility + ac.tactic.volatility
    + (hc.redCards + ac.redCards) * 0.16, 0.04, 0.62);
  return Object.freeze({
    home: round(hxg), away: round(axg), volatility: round(volatility),
    profiles: Object.freeze({ home, away }),
    context: Object.freeze({
      home: Object.freeze({ ...hc, tactic: undefined, formation: undefined }),
      away: Object.freeze({ ...ac, tactic: undefined, formation: undefined }),
      neutralVenue: venueNeutral,
      homeAdvantage: venueNeutral ? 0 : homeAdvantage,
      matchImportance: importance,
    }),
    factors: Object.freeze({
      homeAttack: round(hAttack, 2), awayAttack: round(aAttack, 2),
      homeResistance: round(hResist, 2), awayResistance: round(aResist, 2),
      homeControl: round(homeControl),
    }),
  });
}

function sampleGoals(rng, lambda, volatility) {
  // Mean-preserving log variation: red cards and aggressive tactics widen the
  // distribution without making every match a shootout.
  const z = (rng() + rng() + rng() + rng() - 2) * 0.9;
  const sigma = volatility;
  const adjusted = lambda * Math.exp(z * sigma - (sigma * sigma) / 2);
  return poisson(rng, clamp(adjusted, 0.08, 6));
}

function shootout(rng, homeEdge) {
  let home = 0; let away = 0; let kicks = 0;
  while (kicks < 5 || home === away) {
    const sudden = kicks >= 5;
    if (rng() < clamp(0.745 + homeEdge, 0.64, 0.84)) home += 1;
    if (rng() < clamp(0.745 - homeEdge, 0.64, 0.84)) away += 1;
    kicks += 1;
    if (sudden && home !== away) break;
    if (kicks > 14 && home === away) home += rng() < 0.5 ? 1 : 0, away += home === away ? 1 : 0;
  }
  return { home, away };
}

export function simulateSoccerMatch(input = {}) {
  const seed = (Number(input.seed) || hashSeed(`${input.home}:${input.away}:u26`)) >>> 0 || 1;
  const rng = input.rng || createSeededRng(seed);
  const model = expectedGoals(input);
  let homeGoals = sampleGoals(rng, model.home, model.volatility);
  let awayGoals = sampleGoals(rng, model.away, model.volatility);
  let extraTime = null; let penalties = null;
  if (input.knockout && homeGoals === awayGoals) {
    const eh = sampleGoals(rng, model.home / 3.4, model.volatility);
    const ea = sampleGoals(rng, model.away / 3.4, model.volatility);
    homeGoals += eh; awayGoals += ea;
    extraTime = { home: eh, away: ea };
    if (homeGoals === awayGoals) {
      const ratingEdge = (model.profiles.home.goalkeeper - model.profiles.away.goalkeeper) / 500;
      penalties = shootout(rng, ratingEdge);
    }
  }
  const winner = penalties
    ? (penalties.home > penalties.away ? 'home' : 'away')
    : homeGoals > awayGoals ? 'home' : awayGoals > homeGoals ? 'away' : 'draw';
  return Object.freeze({
    modelVersion: SOCCER_MODEL_VERSION,
    seed,
    home: model.profiles.home.code,
    away: model.profiles.away.code,
    homeGoals,
    awayGoals,
    winner,
    penalties,
    extraTime,
    expectedGoals: Object.freeze({ home: model.home, away: model.away }),
    volatility: model.volatility,
    source: `${model.profiles.home.source}/${model.profiles.away.source}`,
    factors: model.factors,
    context: model.context,
  });
}

/** Deterministic calibration helper. It deliberately accepts no user-side or
 * AI-side input: the same teams/context always receive the same model. */
export function calibrateMatchup(input = {}, samples = 5000, seedBase = 1) {
  const out = { samples, homeWins: 0, draws: 0, awayWins: 0, homeGoals: 0, awayGoals: 0, totals: [] };
  for (let i = 0; i < samples; i += 1) {
    const m = simulateSoccerMatch({ ...input, knockout: false, seed: hashSeed(`${seedBase}:${i}`) || i + 1 });
    if (m.winner === 'home') out.homeWins += 1;
    else if (m.winner === 'away') out.awayWins += 1;
    else out.draws += 1;
    out.homeGoals += m.homeGoals; out.awayGoals += m.awayGoals;
    out.totals.push(m.homeGoals + m.awayGoals);
  }
  const meanTotal = (out.homeGoals + out.awayGoals) / samples;
  const variance = out.totals.reduce((n, v) => n + (v - meanTotal) ** 2, 0) / samples;
  return Object.freeze({
    samples,
    homeWinRate: out.homeWins / samples,
    drawRate: out.draws / samples,
    awayWinRate: out.awayWins / samples,
    homeGoalsPerMatch: out.homeGoals / samples,
    awayGoalsPerMatch: out.awayGoals / samples,
    goalsPerMatch: meanTotal,
    totalGoalVariance: variance,
  });
}
