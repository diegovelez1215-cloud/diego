// United 2026 — canonical truth.
// The canonical fixture registry is the ONLY owner of fixture identity: teams,
// stage, kickoff, venue, round, advancement. Everything derived here (group
// standings, knockout slot resolution) is computed exclusively from validated
// provider FINAL results handed in by the overlay layer — never from storage,
// never from unmatched provider payloads, never hard-coded.

import { TEAMS, FIXTURES, TP3, TP3_SLOTS } from '../data/fixtures.js';
import { kickoffEpoch, dayKey } from './time.js';

export const STAGE_NAMES = {
  group: 'Group Stage', r32: 'Round of 32', r16: 'Round of 16',
  qf: 'Quarter-final', sf: 'Semi-final', bronze: 'Third-place Match', final: 'Final',
};
export const STAGE_ORDER = ['group', 'r32', 'r16', 'qf', 'sf', 'bronze', 'final'];

/* ---------------- registry indexes (built once) ---------------- */

const byId = new Map();
const byDay = new Map();
for (const f of FIXTURES) {
  const epoch = kickoffEpoch(f.kickoff);
  const rec = Object.freeze({ ...f, epoch, day: dayKey(epoch) });
  byId.set(f.id, rec);
  if (!byDay.has(rec.day)) byDay.set(rec.day, []);
  byDay.get(rec.day).push(rec);
}
for (const list of byDay.values()) list.sort((a, b) => a.epoch - b.epoch || a.id - b.id);

export function fixture(id) { return byId.get(id) || null; }
export function allFixtures() { return [...byId.values()].sort((a, b) => a.epoch - b.epoch || a.id - b.id); }
export function fixturesOnDay(key) { return byDay.get(key) ? [...byDay.get(key)] : []; }
export function allDayKeys() { return [...byDay.keys()].sort(); }

/** Advancement edges: match id -> the match its winner (and loser) feeds. */
const advancesTo = new Map();
const loserTo = new Map();
for (const f of FIXTURES) {
  for (const [side, spec] of [['home', f.home], ['away', f.away]]) {
    let m;
    if ((m = /^W(\d+)$/.exec(spec))) advancesTo.set(Number(m[1]), { id: f.id, side });
    else if ((m = /^L(\d+)$/.exec(spec))) loserTo.set(Number(m[1]), { id: f.id, side });
  }
}
export function winnerFeeds(id) { return advancesTo.get(id) || null; }
export function loserFeeds(id) { return loserTo.get(id) || null; }

/* ---------------- team identity + provider-name resolution ---------------- */

export function teamName(code) { return TEAMS[code] ? TEAMS[code][0] : code; }
export function teamFlag(code) { return TEAMS[code] ? TEAMS[code][1] : ''; }

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const ALIASES = {
  USA: ['united states', 'usa', 'united states of america'],
  BIH: ['bosnia and herzegovina', 'bosnia herzegovina', 'bosnia'],
  CIV: ['ivory coast', 'cote d ivoire', 'cote divoire'],
  CZE: ['czechia', 'czech republic'],
  COD: ['dr congo', 'congo dr', 'democratic republic of the congo', 'congo kinshasa'],
  CPV: ['cape verde', 'cabo verde', 'cape verde islands'],
  KOR: ['korea republic', 'south korea', 'korea'],
  IRN: ['iran', 'ir iran', 'islamic republic of iran'],
  KSA: ['saudi arabia'],
  UZB: ['uzbekistan'],
  CUW: ['curacao'],
  NZL: ['new zealand'],
  RSA: ['south africa'],
  NED: ['netherlands', 'holland'],
  SUI: ['switzerland'],
  SCO: ['scotland'],
};

const nameIndex = new Map();
for (const [code, [name]] of Object.entries(TEAMS)) nameIndex.set(norm(name), code);
for (const [code, list] of Object.entries(ALIASES)) for (const alias of list) nameIndex.set(norm(alias), code);

/** Provider display name -> canonical team code, or null when unknown. */
export function resolveTeamCode(providerName) {
  return nameIndex.get(norm(providerName)) || null;
}

/* ---------------- standings (derived from validated finals only) ---------------- */

/**
 * @param finals Map<fixtureId, {gh, ga}> — validated FINAL group results,
 *               oriented to the canonical home/away order.
 * @returns { groups: {A: [{code,p,w,d,l,gf,ga,gd,pts}, ...ranked], ...},
 *            complete: {A: boolean, ...} }
 */
export function computeStandings(finals) {
  const groups = {};
  const complete = {};
  for (const f of FIXTURES) {
    if (f.stage !== 'group') continue;
    const g = f.group;
    if (!groups[g]) { groups[g] = new Map(); complete[g] = true; }
    for (const code of [f.home, f.away]) {
      if (!groups[g].has(code)) groups[g].set(code, { code, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 });
    }
    const r = finals.get(f.id);
    if (!r || r.gh == null || r.ga == null) { complete[g] = false; continue; }
    const H = groups[g].get(f.home), A = groups[g].get(f.away);
    H.p++; A.p++; H.gf += r.gh; H.ga += r.ga; A.gf += r.ga; A.ga += r.gh;
    if (r.gh > r.ga) { H.w++; A.l++; H.pts += 3; }
    else if (r.gh < r.ga) { A.w++; H.l++; A.pts += 3; }
    else { H.d++; A.d++; H.pts++; A.pts++; }
  }
  const ranked = {};
  for (const [g, map] of Object.entries(groups)) {
    const rows = [...map.values()];
    rows.forEach((t) => { t.gd = t.gf - t.ga; });
    rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.code.localeCompare(b.code));
    ranked[g] = rows;
  }
  return { groups: ranked, complete };
}

/* ---------------- knockout slot resolution ---------------- */

/** Best 8 third-placed teams -> {r32MatchId: teamCode} via the FIFA matrix. */
function assignThirds(standings) {
  const letters = Object.keys(standings.groups).sort();
  if (letters.length !== 12 || letters.some((g) => !standings.complete[g])) return null;
  const thirds = letters.map((g) => ({ g, t: standings.groups[g][2] }));
  thirds.sort((a, b) => b.t.pts - a.t.pts || b.t.gd - a.t.gd || b.t.gf - a.t.gf || a.g.localeCompare(b.g));
  const qual = thirds.slice(0, 8).map((x) => x.g);
  const key = qual.slice().sort().join('');
  const order = TP3[key];
  if (!order) return null;
  const out = {};
  for (let i = 0; i < 8; i++) out[TP3_SLOTS[i]] = standings.groups[order.charAt(i)][2].code;
  return out;
}

/**
 * Resolve every knockout slot that can be known from derived truth.
 * @param standings computeStandings() output
 * @param koFinals  Map<fixtureId, {winner:'home'|'away'}> validated KO finals
 * @returns Map<fixtureId, {home: code|null, away: code|null}>
 */
export function resolveSlots(standings, koFinals) {
  const thirds = assignThirds(standings);
  const out = new Map();
  const resolveSide = (fx, spec) => {
    let m;
    if (TEAMS[spec]) return spec;
    if ((m = /^([12])([A-L])$/.exec(spec))) {
      const g = m[2];
      return standings.complete[g] ? standings.groups[g][Number(m[1]) - 1].code : null;
    }
    if (/^3:/.test(spec)) return thirds ? (thirds[fx.id] || null) : null;
    if ((m = /^([WL])(\d+)$/.exec(spec))) {
      const src = Number(m[2]);
      const res = koFinals.get(src);
      if (!res || !res.winner || res.winner === 'draw') return null;
      const srcSlots = out.get(src);
      if (!srcSlots) return null;
      const winCode = res.winner === 'home' ? srcSlots.home : srcSlots.away;
      const loseCode = res.winner === 'home' ? srcSlots.away : srcSlots.home;
      return m[1] === 'W' ? winCode : loseCode;
    }
    return null;
  };
  for (const f of allFixtures()) {
    if (f.stage === 'group') { out.set(f.id, { home: f.home, away: f.away }); continue; }
    out.set(f.id, { home: resolveSide(f, f.home), away: resolveSide(f, f.away) });
  }
  return out;
}

/**
 * Third-place race table: every group's third-placed team ranked by the FIFA
 * criteria used in resolveSlots. `qualified` marks the best 8 (only meaningful
 * once every group is complete); `slot` carries the R32 match id once the
 * combination is decided. Incomplete groups are listed as provisional.
 */
export function thirdPlaceTable(standings) {
  const letters = Object.keys(standings.groups).sort();
  const rows = letters
    .filter((g) => standings.groups[g][2])
    .map((g) => ({ group: g, complete: !!standings.complete[g], t: standings.groups[g][2] }));
  rows.sort((a, b) => b.t.pts - a.t.pts || b.t.gd - a.t.gd || b.t.gf - a.t.gf || a.group.localeCompare(b.group));
  const allComplete = letters.length === 12 && letters.every((g) => standings.complete[g]);
  let assignment = null;
  if (allComplete) {
    const qual = rows.slice(0, 8).map((x) => x.group);
    const order = TP3[qual.slice().sort().join('')];
    if (order) {
      assignment = {};
      for (let i = 0; i < 8; i++) assignment[order.charAt(i)] = TP3_SLOTS[i];
    }
  }
  return {
    decided: allComplete,
    rows: rows.map((r, i) => ({
      group: r.group,
      code: r.t.code,
      pts: r.t.pts, gd: r.t.gd, gf: r.t.gf, p: r.t.p,
      complete: r.complete,
      qualified: allComplete && i < 8,
      slot: assignment ? (assignment[r.group] || null) : null,
    })),
  };
}

/** Honest placeholder label for an unresolved knockout slot spec. */
export function slotLabel(spec) {
  let m;
  if ((m = /^1([A-L])$/.exec(spec))) return 'Group ' + m[1] + ' winners';
  if ((m = /^2([A-L])$/.exec(spec))) return 'Group ' + m[1] + ' runners-up';
  if ((m = /^3:([A-L]+)$/.exec(spec))) return 'Best third (' + m[1].split('').join('/') + ')';
  if ((m = /^W(\d+)$/.exec(spec))) return 'Winner, Match ' + m[1];
  if ((m = /^L(\d+)$/.exec(spec))) return 'Loser, Match ' + m[1];
  return spec;
}
