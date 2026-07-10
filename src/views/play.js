// United 2026 — Play. The arcade: a lobby plus three connected modes, all
// sealed off from real tournament truth. Match Lab runs an interactive
// 90-minute simulation with momentum, cards, stoppage time, and decisions.
// My World Cup is a private, tappable bracket journey. Prediction Run is
// non-monetary tournament intelligence — picks, confidence, streaks.
// Gold light, tactile controls, rare weirdness. It can never modify real
// fixtures, standings, Home, the official bracket, or Match Center —
// everything here operates on deep copies in the Play namespace only.
// Arcade Points are a private game score for local progression — game
// progression only, never money.

import { getState, setPlay, setSims, setPlayMode } from '../core/app-state.js';
import { savePlay, saveSims } from '../core/persistence.js';
import {
  allFixtures, teamName, teamFlag, computeStandings, resolveSlots, STAGE_NAMES, STAGE_ORDER,
} from '../core/canonical-truth.js';
import { TEAMS, RATINGS, TEAM_COLORS } from '../data/fixtures.js';
import { bracketHTML, wireBracketScroller } from '../components/bracket.js';
import { currentUser, pushPick } from '../core/leaderboard.js';
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

const EXTRA_TIME_DECISION = {
  prompt: 'Extra time. One call, thirty minutes.',
  options: [
    { id: 'push', label: 'Push for it', atk: 1.24, def: 0.82, plan: 'push' },
    { id: 'fresh', label: 'Fresh legs', atk: 1.08, def: 1.05, plan: 'fresh' },
    { id: 'protect', label: 'Protect and counter', atk: 0.82, def: 1.18, plan: 'protect' },
  ],
};

const FORMATION = [
  ['GK', 7, 50],
  ['LB', 20, 24], ['LCB', 18, 42], ['RCB', 18, 58], ['RB', 20, 76],
  ['DM', 36, 50], ['LM', 43, 28], ['RM', 43, 72],
  ['LW', 66, 25], ['ST', 72, 50], ['RW', 66, 75],
];
const ROLE_NAMES = {
  GK: 'Keeper', LB: 'Left back', LCB: 'Centre back', RCB: 'Centre back', RB: 'Right back',
  DM: 'Anchor', LM: 'Midfield', RM: 'Midfield', LW: 'Wing', ST: 'Striker', RW: 'Wing',
};
const RED_DROP_ROLE = 'RM';
const POSSESSION_TYPES = ['possession', 'pass', 'carry', 'transition', 'pressure'];
const FEATURED_POOL = [
  ['FRA', 'BRA'], ['ARG', 'ENG'], ['ESP', 'POR'], ['USA', 'MEX'],
  ['GER', 'NED'], ['MAR', 'SEN'], ['JPN', 'KOR'], ['COL', 'URU'],
  ['SUI', 'CRO'], ['CAN', 'USA'], ['BRA', 'ARG'], ['ENG', 'NED'],
];
const LAB_KIT_SECONDARY_COLORS = {
  MEX: '#ffffff', RSA: '#1f3a93', KOR: '#ffffff', CZE: '#ffffff',
  CAN: '#ffffff', BIH: '#f6c445', QAT: '#ffffff', SUI: '#ffffff',
  BRA: '#1f3a93', MAR: '#ffffff', HAI: '#c81438', SCO: '#ffffff',
  USA: '#ffffff', PAR: '#1f3a93', AUS: '#0a6640', CIV: '#ffffff',
  ARG: '#1b2a6b', ALG: '#ffffff', AUT: '#ffffff', JOR: '#ce1126',
  POR: '#c60b1e', URU: '#ffffff', COL: '#1f3a93', KSA: '#ffffff',
  FRA: '#ffffff', SEN: '#f6c445', IRQ: '#ffffff', NOR: '#ffffff',
  GER: '#1a1a1a', CUW: '#f6c445', CRO: '#ffffff', ECU: '#1f3a93',
  NED: '#1b2a6b', JPN: '#ffffff', TUN: '#ffffff', CPV: '#ffffff',
  BEL: '#1a1a1a', EGY: '#ffffff', IRN: '#ffffff', NZL: '#ffffff',
  ESP: '#fcd116', UZB: '#ffffff', PAN: '#ffffff', GHA: '#1f3a93',
  ENG: '#1f3a93', SWE: '#1f3a93', TUR: '#ffffff', COD: '#ce1126',
};
const LAB_MAJOR_TYPES = new Set(['goal', 'save', 'var', 'confirmed', 'overturned', 'card', 'red', 'extra', 'interval', 'pens', 'penalty', 'final']);
const LAB_PACE_OPTIONS = [
  ['normal', 'Normal', 'Normal'],
  ['fast', 'Turbo', 'Turbo'],
  ['key', 'Key moments', 'Key'],
];
export const LAB_PACE_CONTRACT = {
  normal: { label: 'Normal', beatMs: 220, ticks: 1, targetMs: [25000, 40000] },
  fast: { label: 'Turbo', beatMs: 115, ticks: 2, targetMs: [10000, 18000] },
  key: { label: 'Key Moments', beatMs: 55, ticks: 12, targetMs: [4500, 14000] },
};
const LAB_EVENT_MS = {
  quiet: { normal: 90, fast: 55, key: 0 },
  open: { normal: 240, fast: 150, key: 0 },
  whistle: { normal: 180, fast: 140, key: 120 },
  shot: { normal: 360, fast: 230, key: 210 },
  chance: { normal: 360, fast: 220, key: 180 },
  corner: { normal: 340, fast: 210, key: 170 },
  free: { normal: 380, fast: 240, key: 220 },
  save: { normal: 620, fast: 520, key: 500 },
  goal: { normal: 820, fast: 720, key: 700 },
  var: { normal: 860, fast: 760, key: 740 },
  confirmed: { normal: 620, fast: 540, key: 520 },
  overturned: { normal: 620, fast: 540, key: 520 },
  card: { normal: 560, fast: 480, key: 460 },
  red: { normal: 680, fast: 580, key: 560 },
  extra: { normal: 760, fast: 620, key: 580 },
  interval: { normal: 520, fast: 420, key: 380 },
  pens: { normal: 680, fast: 580, key: 560 },
  penalty: { normal: 700, fast: 600, key: 580 },
  final: { normal: 900, fast: 780, key: 760 },
  decision: { normal: 220, fast: 160, key: 140 },
  sub: { normal: 220, fast: 160, key: 0 },
  board: { normal: 240, fast: 170, key: 0 },
  note: { normal: 240, fast: 160, key: 0 },
};

function normalizeLabPace(p) {
  return p === 'fast' || p === 'turbo' ? 'fast' : p === 'key' ? 'key' : 'normal';
}

export function isLabMajorMoment(eventOrType) {
  const type = typeof eventOrType === 'string' ? eventOrType : eventOrType?.type;
  return LAB_MAJOR_TYPES.has(type);
}

export function labVisualDuration(eventOrType, pace = 'normal') {
  const p = normalizeLabPace(pace);
  const type = typeof eventOrType === 'string' ? eventOrType : eventOrType?.type;
  const bucket = POSSESSION_TYPES.includes(type) ? LAB_EVENT_MS.open : LAB_EVENT_MS[type] || LAB_EVENT_MS.open;
  return bucket[p] ?? bucket.normal;
}

export function estimateLabPlaybackMs(events = [], pace = 'normal', {
  minutes = 90,
  excludeDecisionPauses = true,
  excludeExtraTime = true,
} = {}) {
  const p = normalizeLabPace(pace);
  const cfg = LAB_PACE_CONTRACT[p] || LAB_PACE_CONTRACT.normal;
  const baseMinutes = excludeExtraTime ? Math.min(90, minutes) : minutes;
  let ms = Math.ceil(baseMinutes / cfg.ticks) * cfg.beatMs;
  for (const event of events) {
    if (!event) continue;
    if (excludeDecisionPauses && event.type === 'decision') continue;
    if (excludeExtraTime && event.min > 90 && event.type !== 'final') continue;
    const dur = labVisualDuration(event, p);
    if (dur > 0) ms += dur;
  }
  return ms;
}

function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < String(text).length; i++) {
    h ^= String(text).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function localDayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function featuredShowdownForDate(dateKey = localDayKey(), shuffle = 0) {
  const idx = hashSeed(`u26-lab-${dateKey}-${shuffle}`) % FEATURED_POOL.length;
  return { dateKey, shuffle, home: FEATURED_POOL[idx][0], away: FEATURED_POOL[idx][1], seed: hashSeed(`lab-seed-${dateKey}-${shuffle}`) || 1 };
}

/* Simulation identity — a deterministic tactical flavour per team, used only
   inside Play. It is game colour, never an official claim about a real side. */
const SIM_STYLES = [
  'high press', 'counter surge', 'possession weave', 'wing overloads',
  'deep block steel', 'box-crash chaos', 'midfield strangle', 'direct running',
];
export function teamSimStyle(code) {
  return SIM_STYLES[hashSeed(`u26-style-${code}`) % SIM_STYLES.length];
}

/* ================= Your Side =================
   A local allegiance for Play only. Choosing a side never claims anything
   about the real tournament — it colours the arcade, points Match Lab and
   Final Minute at your team, and gives every result a Win/Defeat verdict
   that accumulates into a per-side record kept on this phone. */

export function currentSide(play) {
  const code = play && play.side && play.side.code;
  return code && TEAMS[code] ? play.side : null;
}

/** Pick (or clear) your side. Records are kept per team code, so switching
    sides never erases another side's history. */
export function chooseSide(code) {
  const { play } = getState();
  const next = { ...play, side: code && TEAMS[code] ? { code, since: new Date().toISOString() } : null };
  setPlay(next);
  savePlay(next);
}

const EMPTY_SIDE_RECORD = Object.freeze({ w: 0, l: 0, d: 0, played: 0, streak: 0, best: 0 });

export function sideRecordFor(play, code) {
  const rec = play && play.sideStats && play.sideStats[code];
  return rec ? { ...EMPTY_SIDE_RECORD, ...rec } : { ...EMPTY_SIDE_RECORD };
}

/** Fold one perspective result ('W' | 'L' | 'D') into the per-side records.
    Pure: returns the next sideStats map, never mutates the old one. */
export function recordSideResult(sideStats, code, result) {
  if (!code || !['W', 'L', 'D'].includes(result)) return sideStats || {};
  const prev = (sideStats && sideStats[code]) || EMPTY_SIDE_RECORD;
  const streak = result === 'W' ? (prev.streak || 0) + 1 : 0;
  return {
    ...(sideStats || {}),
    [code]: {
      w: (prev.w || 0) + (result === 'W' ? 1 : 0),
      l: (prev.l || 0) + (result === 'L' ? 1 : 0),
      d: (prev.d || 0) + (result === 'D' ? 1 : 0),
      played: (prev.played || 0) + 1,
      streak,
      best: Math.max(prev.best || 0, streak),
    },
  };
}

/** Which side of a Lab run you occupy, if your chosen team is playing. */
export function labPerspective(run, sideCode) {
  if (!sideCode) return null;
  if (run.home === sideCode) return 'h';
  if (run.away === sideCode) return 'a';
  return null;
}

/** Win or Defeat from your seat. Lab knockouts are always decisive. */
export function labPerspectiveResult(run, you) {
  if (!you) return null;
  const homeWin = run.pens ? run.pens.ph > run.pens.pa : run.gh > run.ga;
  return (you === 'h') === homeWin ? 'W' : 'L';
}

function labHexRGB(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return labHexRGB('#ffffff');
  const n = Number.parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function labLum(hex) {
  const c = labHexRGB(hex);
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

export function labColorContrast(a, b) {
  const ar = labHexRGB(a);
  const br = labHexRGB(b);
  const dist = Math.hypot(ar.r - br.r, ar.g - br.g, ar.b - br.b);
  const l1 = labLum(a);
  const l2 = labLum(b);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return { distance: +dist.toFixed(2), ratio: +ratio.toFixed(2), distinct: ratio >= 1.8 || dist >= 105 };
}

function labMarkerInk(color) {
  return labLum(color) > 0.46 ? '#06101f' : '#f2f6ff';
}

export function resolveLabTeamColors(home, away) {
  const homePrimary = TEAM_COLORS[home] || '#d4ab55';
  const awayPrimary = TEAM_COLORS[away] || '#d4ab55';
  const awaySecondary = LAB_KIT_SECONDARY_COLORS[away] || awayPrimary;
  let awayColor = awayPrimary;
  let mode = 'primary';
  if (!labColorContrast(homePrimary, awayPrimary).distinct) {
    if (awaySecondary !== awayPrimary && labColorContrast(homePrimary, awaySecondary).distinct) {
      awayColor = awaySecondary;
      mode = 'away-secondary';
    } else {
      mode = 'away-ring';
    }
  }
  const finalContrast = labColorContrast(homePrimary, awayColor);
  const fallback = !finalContrast.distinct;
  return {
    home: {
      code: home,
      primary: homePrimary,
      color: homePrimary,
      markerInk: labMarkerInk(homePrimary),
      markerRing: 'rgba(242,246,255,0.38)',
      keeperRing: '#f2f6ff',
    },
    away: {
      code: away,
      primary: awayPrimary,
      secondary: awaySecondary,
      color: awayColor,
      usedSecondary: mode === 'away-secondary',
      markerInk: labMarkerInk(awayColor),
      markerRing: fallback ? '#fff5c6' : 'rgba(242,246,255,0.54)',
      keeperRing: fallback ? '#fff5c6' : '#f2f6ff',
    },
    ball: { color: '#fff5c6', ring: '#06101f' },
    momentumClass: fallback ? 'kit-collision' : mode === 'away-secondary' ? 'kit-secondary' : 'kit-primary',
    pitchClass: fallback ? 'kit-collision' : mode === 'away-secondary' ? 'kit-secondary' : '',
    fallback,
    mode,
    contrast: finalContrast,
  };
}

function currentFeaturedShowdown(play) {
  const today = localDayKey();
  const saved = play.labFeatured || {};
  return featuredShowdownForDate(today, saved.dateKey === today ? saved.shuffle || 0 : 0);
}

export function activeFormation(side, run) {
  if (run?.phase === 'pens' || run?.shootout) return shootoutFormation(side, run);
  const red = side === 'h' ? run.redH : run.redA;
  const redRole = side === 'h' ? run.redRoleH : run.redRoleA;
  const extraTime = (run?.minute || 0) > 90 || String(run?.phase || '').startsWith('et');
  return FORMATION
    .filter(([role]) => !(red && role === (redRole || RED_DROP_ROLE)))
    .map(([role, x, y], i) => {
      const home = side === 'h';
      const mo = run.mo || 0;
      const attack = home ? mo : -mo;
      const urgent = run.minute > 80 && ((home && run.gh <= run.ga) || (!home && run.ga <= run.gh));
      const compact = side === 'h' ? (run.mods?.def || 1) > 1.12 : (run.awayCompact || 1);
      const rolePush = role === 'GK' ? 0 : role === 'ST' ? 11 : role.includes('W') ? 8 : role.includes('M') ? 5 : 2;
      const etRisk = extraTime ? (run.etPlan === 'push' ? 4 : run.etPlan === 'protect' ? -2 : 1.5) : 0;
      const tacticalPush = attack * (extraTime ? 8.8 : 7) + (urgent ? (extraTime ? 7 : 5) : 0) + (compact ? -4 : 0) + etRisk;
      const minuteWave = Math.sin((run.minute + i * 13) / (extraTime ? 10 : 8)) * (role === 'GK' ? 0.5 : extraTime ? 3.1 : 2.2);
      const stretchedY = extraTime && role !== 'GK' ? (y - 50) * 0.08 : 0;
      const px = Math.max(4, Math.min(96, x + rolePush + tacticalPush + minuteWave));
      const py = Math.max(10, Math.min(90, y + stretchedY + Math.cos((run.minute + i * 7) / (extraTime ? 11 : 9)) * (extraTime ? 2.8 : 2)));
      return {
        side, role,
        x: home ? px : 100 - px,
        y: py,
        label: `${home ? teamName(run.home) : teamName(run.away)} ${ROLE_NAMES[role] || role}`,
      };
    });
}

function shootoutFormation(side, run) {
  const home = side === 'h';
  const red = side === 'h' ? run.redH : run.redA;
  const redRole = side === 'h' ? run.redRoleH : run.redRoleA;
  const kick = run.currentKick;
  const taking = kick && kick.side === side;
  const roles = FORMATION.map(([role]) => role).filter((role) => !(red && role === (redRole || RED_DROP_ROLE)));
  const fieldRoles = roles.filter((role) => role !== 'GK');
  const group = fieldRoles.map((role, i) => {
    const n = Math.max(1, fieldRoles.length);
    const angle = (Math.PI * 2 * i) / n + (home ? -0.25 : 0.25);
    const radiusX = role.includes('W') ? 7 : 5.6;
    const radiusY = role.includes('B') ? 9 : 7;
    return {
      side, role,
      x: 50 + Math.cos(angle) * radiusX + (home ? -6 : 6),
      y: 50 + Math.sin(angle) * radiusY,
      label: `${teamName(home ? run.home : run.away)} ${ROLE_NAMES[role] || role}`,
    };
  });
  const players = [{
    side,
    role: 'GK',
    x: home ? 7 : 93,
    y: 50,
    label: `${teamName(home ? run.home : run.away)} Keeper`,
  }, ...group];
  if (taking) {
    const takerRole = kick.actor || (fieldRoles.includes('ST') ? 'ST' : fieldRoles[0]);
    const taker = players.find((p) => p.role === takerRole);
    if (taker) {
      taker.x = home ? 76 : 24;
      taker.y = 50;
      taker.label = `${teamName(home ? run.home : run.away)} penalty taker`;
    }
  }
  return players;
}

function actorFor(run, side, kind = 'possession') {
  const players = activeFormation(side, run);
  const pool = kind === 'save' ? ['GK']
    : kind === 'shot' ? ['ST', 'LW', 'RW']
      : kind === 'defence' ? ['DM', 'LCB', 'RCB', 'LB', 'RB']
        : ['DM', 'LM', 'RM', 'LW', 'RW', 'ST'];
  return players.find((p) => pool.includes(p.role)) || players[Math.min(players.length - 1, 5)] || players[0];
}

function playerPoint(run, side, role, kind = 'possession') {
  const p = activeFormation(side, run).find((x) => x.role === role) || actorFor(run, side, kind);
  return {
    x: p?.x || 50,
    y: p?.y || 50,
    side,
    from: p?.role || role || 'DM',
    kind,
  };
}

function goalPoint(side, kind = 'goal') {
  return { x: side === 'h' ? 98 : 2, y: 50, side, from: 'goal', kind };
}

function missPoint(side, dir = 'left') {
  const y = dir === 'left' ? 31 : 69;
  return { x: side === 'h' ? 99 : 1, y, side, from: 'wide', kind: 'miss' };
}

function keeperPoint(run, attackingSide, kind = 'save') {
  return playerPoint(run, attackingSide === 'h' ? 'a' : 'h', 'GK', kind);
}

function cornerPoint(side, run, kind = 'corner') {
  const top = run.minute % 2 === 0;
  return { x: side === 'h' ? 97 : 3, y: top ? 8 : 92, side, from: 'corner', kind };
}

function boxPoint(side, run, kind = 'cross') {
  return { x: side === 'h' ? 84 : 16, y: 41 + ((run.minute * 7) % 18), side, from: 'ST', kind };
}

function incidentPoint(run, side, role) {
  const p = playerPoint(run, side, role || actorFor(run, side, 'defence')?.role || 'DM', 'foul');
  return { ...p, x: Math.max(16, Math.min(84, p.x + (side === 'h' ? 3 : -3))), kind: 'foul' };
}

function possessionPath(run, side, kind) {
  const patterns = {
    possession: ['LCB', 'DM', 'LM', 'ST'],
    pass: ['DM', 'RM', 'RW', 'ST'],
    carry: ['LB', 'LM', 'LW', 'ST'],
    transition: ['RCB', 'DM', 'RW', 'ST'],
    pressure: ['LW', 'ST', 'RW', 'DM'],
  };
  const roles = patterns[kind] || patterns.possession;
  const offset = Math.floor((run.seed + run.minute + (side === 'h' ? 3 : 7)) % roles.length);
  const count = kind === 'carry' ? 3 : 4 + ((run.minute + offset) % 2);
  const ordered = Array.from({ length: count }, (_, i) => roles[(offset + i) % roles.length]);
  return ordered.map((role) => playerPoint(run, side, role, kind));
}

function labVisualForEvent(run, event) {
  const side = event.side || 'h';
  const actor = event.actor || actorFor(run, side, event.type)?.role || 'DM';
  if (POSSESSION_TYPES.includes(event.type) || event.type === 'pass') return possessionPath(run, side, event.type);
  if (event.type === 'shot' || event.type === 'chance') return [playerPoint(run, side, actor, 'shot'), boxPoint(side, run, 'shot'), goalPoint(side, 'shot')];
  if (event.type === 'save') return [playerPoint(run, side, actor, 'shot'), boxPoint(side, run, 'shot'), keeperPoint(run, side, 'save')];
  if (event.type === 'corner') return [cornerPoint(side, run), boxPoint(side, run, 'cross'), playerPoint(run, side, 'ST', 'corner')];
  if (event.type === 'free') return [incidentPoint(run, side, actor), incidentPoint(run, side, actor), boxPoint(side, run, 'free')];
  if (event.type === 'card' || event.type === 'red') return [incidentPoint(run, side, actor), incidentPoint(run, side, actor), incidentPoint(run, side, actor)];
  if (event.type === 'goal') return [playerPoint(run, side, actor, 'shot'), boxPoint(side, run, 'shot'), goalPoint(side, 'goal')];
  if (event.type === 'var') return [goalPoint(side, 'var'), goalPoint(side, 'var')];
  if (event.type === 'confirmed') return [goalPoint(side, 'goal'), goalPoint(side, 'goal')];
  if (event.type === 'overturned') return [goalPoint(side, 'var'), keeperPoint(run, side, 'save')];
  if (event.type === 'extra') return [run.ball || playerPoint(run, side, 'DM', 'possession'), { x: 50, y: 50, side, from: 'whistle', kind: 'extra' }];
  if (event.type === 'interval') return [run.ball || playerPoint(run, side, 'DM', 'possession'), { x: 50, y: 50, side, from: 'whistle', kind: 'interval' }];
  if (event.type === 'penalty') {
    // regulation penalty award: whistle at the incident, ball to the spot
    const spot = { x: side === 'h' ? 88 : 12, y: 50, side, from: 'spot', kind: 'penalty' };
    return [incidentPoint(run, side, actor), spot];
  }
  if (event.type === 'pens') {
    const taker = event.kick?.actor || 'ST';
    const spot = { x: side === 'h' ? 88 : 12, y: 50, side, from: 'spot', kind: 'penalty' };
    const result = event.scored ? goalPoint(side, 'goal')
      : event.outcome === 'miss' ? missPoint(side, event.kick?.dir)
        : keeperPoint(run, side, 'save');
    return [playerPoint(run, side, taker, 'penalty'), spot, result];
  }
  if (event.type === 'final') return [run.ball || playerPoint(run, side, 'DM', 'possession'), { x: 50, y: 50, side, from: 'whistle', kind: 'final' }];
  return [playerPoint(run, side, actor, event.type || 'possession')];
}

function setBallPoint(run, point) {
  if (!point) return;
  run.ball = {
    x: Math.max(2, Math.min(98, point.x)),
    y: Math.max(6, Math.min(94, point.y)),
    side: point.side || 'h',
    kind: point.kind || 'possession',
    from: point.from || 'DM',
  };
  run.visualTrace = (run.visualTrace || []).concat([{ x: +run.ball.x.toFixed(1), y: +run.ball.y.toFixed(1), side: run.ball.side, from: run.ball.from, kind: run.ball.kind }]).slice(-32);
}

/* Quiet minutes still play football: every minute without a feed event moves
   the live ball target across a compact possession chain. It does not enqueue
   a blocking broadcast sequence, so the clock can sprint while the director
   keeps easing the ball naturally toward fresh targets. */
function queueLabFlow(run, side, kind = 'possession') {
  const type = kind === 'pass' ? 'possession' : kind;
  const flow = { type, side, silent: true, visual: possessionPath(run, side, type) };
  for (const point of flow.visual) setBallPoint(run, point);
  if (canAnimateLab()) startDirector();
}

function eventText(type, side, team, run) {
  const name = teamName(team);
  if (type === 'possession') return `${name} work through midfield`;
  if (type === 'pass') return `${name} split the line with a progressive pass`;
  if (type === 'carry') return `${name} carry into the final third`;
  if (type === 'transition') return `Transition — ${name} break into space`;
  if (type === 'pressure') return `${name} squeeze high and force the issue`;
  if (type === 'free') return `Free kick — ${name} stand over it`;
  if (type === 'save') return `Save — the keeper keeps ${name} out`;
  if (type === 'var') return 'VAR checking the final touch';
  if (type === 'confirmed') return `VAR confirms the goal (${run.gh + (side === 'h' ? 1 : 0)}–${run.ga + (side === 'a' ? 1 : 0)})`;
  if (type === 'overturned') return 'VAR overturns it — no goal';
  return `${name} build again`;
}

function addLabEvent(run, type, side, text, extra = {}) {
  const event = { min: run.minute, phase: run.phase || 'reg', type, side, text, ...extra };
  event.visual = labVisualForEvent(run, event);
  run.events.push(event);
  run.lastEventType = type;
  run.lastEventSide = side;
  if (event.visual?.length) queueLabVisual(run, event);
}

function canAnimateLab() {
  return !labMute
    && typeof window !== 'undefined'
    && typeof document !== 'undefined'
    && typeof requestAnimationFrame === 'function'
    && !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

let labDraining = false;

function queueLabVisual(run, event) {
  run.visualQueue = run.visualQueue || [];
  run.visualQueue.push(event);
  if (labDraining) return; // the active drain loop will consume it
  if (canAnimateLab()) startDirector();
  else drainLabVisuals(run);
}

/* Resolve every pending visual instantly (headless, reduced motion, pause,
   or tab hidden): each waypoint still lands in the deterministic trace and
   every commit (score, cards, penalties) still happens in order. */
function drainLabVisuals(run) {
  labDraining = true;
  try {
    while (run.visual || run.visualQueue?.length) {
      if (run.visual) {
        const v = run.visual;
        run.visual = null;
        setBallPoint(run, v.points[v.points.length - 1]);
        commitLabVisual(run, v.event);
        continue;
      }
      const event = run.visualQueue.shift();
      for (const point of event.visual || []) setBallPoint(run, point);
      commitLabVisual(run, event);
    }
  } finally {
    labDraining = false;
  }
}

/* ================= broadcast director =================
   One persistent pitch scene, one bounded requestAnimationFrame loop.
   The deterministic minute timeline stays the source of truth; the director
   only interpolates the current ball sequence and drifts the 22 role markers
   toward their live formation targets. It never rebuilds DOM mid-frame and
   stops immediately when the match is paused, finished, hidden, or
   reduced-motion is enabled. */
const director = {
  raf: 0,
  scene: null,
  pos: new Map(),
  ballPos: { x: 50, y: 50 },
};

function directorShouldRun() {
  return !!labRun && !labRun.done && !labRun.paused
    && canAnimateLab()
    && !(typeof document !== 'undefined' && document.hidden);
}

function bindLabScene() {
  if (typeof document === 'undefined') { director.scene = null; return; }
  const card = document.querySelector('.play-view .lab.running');
  const pitch = card ? card.querySelector('.lab-pitch') : null;
  if (!card || !pitch) { director.scene = null; return; }
  const players = new Map();
  pitch.querySelectorAll('.pitch-player').forEach((el) => players.set(el.dataset.key, el));
  director.scene = {
    card,
    pitch,
    players,
    ball: pitch.querySelector('[data-ball]'),
    clock: card.querySelector('.lab-clock'),
    score: card.querySelector('#lab-score'),
    mo: card.querySelector('#lab-mo'),
    stage: card.querySelector('.lab-stage'),
    feed: card.querySelector('#lab-feed'),
    banners: card.querySelector('[data-lab-banners]'),
    pens: card.querySelector('[data-lab-pens]'),
    counts: pitch.querySelectorAll('.pitch-counts span'),
  };
  director.pos = new Map();
  director.ballPos = labRun && labRun.ball
    ? { x: labRun.ball.x, y: labRun.ball.y }
    : { x: 50, y: 50 };
}

function startDirector() {
  if (director.raf || !directorShouldRun()) return;
  if (!director.scene || !director.scene.pitch.isConnected) bindLabScene();
  if (!director.scene) return;
  director.raf = requestAnimationFrame(directorFrame);
}

function stopDirector({ drain = true } = {}) {
  if (director.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(director.raf);
  director.raf = 0;
  if (drain && labRun) drainLabVisuals(labRun);
}

function updateFormationMarkers(run, ts, holder, ballPos, segKind) {
  const scene = director.scene;
  const wave = ts / 1000;
  for (const side of ['h', 'a']) {
    const formation = activeFormation(side, run);
    for (let i = 0; i < formation.length; i++) {
      const p = formation[i];
      const key = `${side}-${p.role}`;
      const el = scene.players.get(key);
      if (!el) continue;
      const possessing = run.ball && run.ball.side === side;
      // support runners advance with the ball; the defending shape compresses
      const push = possessing ? 1.8 : -1.5;
      let tx = p.x + (side === 'h' ? push : -push) + Math.sin(wave * 1.3 + i * 1.7) * 1.2;
      let ty = p.y + Math.cos(wave * 1.1 + i * 2.3) * 1.1;
      if (p.role === 'GK') {
        const defensive = side === 'h' ? ballPos.x < 32 : ballPos.x > 68;
        tx = p.x + (defensive ? 0 : (side === 'h' ? 2 : -2));
        ty = p.y + (defensive ? (ballPos.y - 50) * 0.3 : 0);
      }
      if (holder && segKind === 'carry' && holder.side === side && holder.role === p.role) {
        tx = ballPos.x + (side === 'h' ? -1.5 : 1.5); // the carrier travels with the ball
        ty = ballPos.y;
      }
      let cur = director.pos.get(key);
      if (!cur) { cur = { x: p.x, y: p.y }; director.pos.set(key, cur); }
      const recovery = run.minute > 90 ? 0.045 : 0.06;
      cur.x += (Math.max(2, Math.min(98, tx)) - cur.x) * recovery;
      cur.y += (Math.max(6, Math.min(94, ty)) - cur.y) * recovery;
      el.style.left = `${cur.x.toFixed(2)}%`;
      el.style.top = `${cur.y.toFixed(2)}%`;
      el.classList.toggle('has-ball', !!holder && holder.side === side && holder.role === p.role);
    }
  }
}

function directorFrame(ts) {
  const run = labRun;
  if (!directorShouldRun()) { director.raf = 0; return; }
  if (!director.scene || !director.scene.pitch.isConnected) {
    bindLabScene();
    if (!director.scene) { director.raf = 0; return; }
  }
  // 1) advance the active ball sequence (one at a time, in timeline order)
  if (!run.visual && run.visualQueue && run.visualQueue.length) {
    const next = run.visualQueue.shift();
    const points = next.visual && next.visual.length
      ? next.visual
      : [run.ball || { x: 50, y: 50, side: next.side || 'h' }];
    run.visual = {
      event: next,
      points,
      started: ts,
      duration: labVisualDuration(next, labPace),
    };
  }
  let ballTarget;
  let segKind;
  let holder = null;
  let visualDriving = false;
  let visualEvent = null;
  if (run.visual) {
    visualDriving = true;
    const v = run.visual;
    visualEvent = v.event;
    const total = Math.max(1, v.points.length - 1);
    const t = Math.min(1, (ts - v.started) / v.duration);
    const eased = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
    const raw = eased * total;
    const idx = Math.min(total - 1, Math.floor(raw));
    const local = raw - idx;
    const a = v.points[idx];
    const b = v.points[idx + 1] || a;
    ballTarget = { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local };
    segKind = (local < 0.5 ? a.kind : b.kind) || 'possession';
    holder = { side: b.side || v.event.side || 'h', role: local < 0.5 ? a.from : b.from };
    if (t >= 1) {
      run.visual = null;
      setBallPoint(run, v.points[v.points.length - 1]);
      commitLabVisual(run, v.event);
      if (run.paceRestartPending) {
        run.paceRestartPending = false;
        startLabTimer({ drainDirector: false });
      }
      paintLab(); // one targeted update per completed sequence — never per frame
      if (!labRun || labRun !== run) { director.raf = 0; return; }
    }
  } else {
    // idle possession: the ball breathes at the current holder's feet
    const b = run.ball || { x: 50, y: 50 };
    ballTarget = { x: b.x + Math.sin(ts / 900) * 1.1, y: b.y + Math.cos(ts / 700) * 0.8 };
    segKind = (run.ball && run.ball.kind) || 'possession';
    holder = run.ball ? { side: run.ball.side, role: run.ball.from } : null;
  }
  // 2) ease the visible ball toward its target — smooth travel, never a jump
  const bp = director.ballPos;
  const ballEase = visualDriving ? (isLabMajorMoment(visualEvent) ? 0.32 : 0.12) : 0.055;
  bp.x += (ballTarget.x - bp.x) * ballEase;
  bp.y += (ballTarget.y - bp.y) * ballEase;
  const ballEl = director.scene && director.scene.ball;
  if (ballEl) {
    ballEl.style.left = `${bp.x.toFixed(2)}%`;
    ballEl.style.top = `${bp.y.toFixed(2)}%`;
    if (ballEl.dataset.kind !== segKind) {
      ballEl.dataset.kind = segKind;
      ballEl.className = `pitch-ball ${segKind}`;
    }
  }
  // 3) drift the role markers toward the live shape
  if (director.scene) updateFormationMarkers(run, ts, holder, bp, segKind);
  director.raf = requestAnimationFrame(directorFrame);
}

/* Stop all animation work the moment the tab is hidden; resume cleanly. */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopDirector({ drain: true });
    } else if (labRun && !labRun.done && !labRun.paused) {
      paintLab();
      startDirector();
    }
  });
}

function applyScoreDelta(run, side) {
  if (side === 'h') run.gh += 1;
  else run.ga += 1;
}

function commitLabVisual(run, event) {
  if (!run || !event || event.committed) return;
  event.committed = true;
  if (event.type === 'shot') labSound('shot');
  if (event.type === 'save') labSound(event.fromPenalty ? 'pen-save' : 'save');
  if (event.type === 'goal' && event.scoreDelta && !event.underReview) {
    applyScoreDelta(run, event.side);
    run.goalAt = run.minute;
  }
  if (event.type === 'confirmed' && event.scoreDelta) {
    applyScoreDelta(run, event.side);
    run.goalAt = run.minute;
  }
  if (event.type === 'red') {
    if (event.side === 'h') {
      run.redH = true; run.redRoleH = event.redRole || RED_DROP_ROLE; run.homeMod = 0.78;
    } else {
      run.redA = true; run.redRoleA = event.redRole || RED_DROP_ROLE; run.oppMod = 0.78;
    }
    run.sceneDirty = true; // one marker leaves the pitch — rebuild the scene once
  }
  if (event.type === 'pens' && event.kick) {
    run.pens = run.pens || { ph: 0, pa: 0, kicks: [] };
    run.pens.ph = event.kick.ph;
    run.pens.pa = event.kick.pa;
    run.pens.kicks.push(event.kick);
    queueNextPenalty(run);
  }
  if (event.afterVar && !event.afterVarQueued) {
    event.afterVarQueued = true;
    addLabEvent(run, 'var', event.side, eventText('var', event.side, event.team, run), { scoreDelta: event.scoreDelta, verdict: event.verdict });
    labSound('var');
  } else if (event.type === 'var' && event.verdict) {
    const type = event.verdict === 'overturned' ? 'overturned' : 'confirmed';
    addLabEvent(run, type, event.side, eventText(type, event.side, event.team, run), {
      scoreDelta: type === 'confirmed',
      visual: true,
    });
    labSound(type === 'confirmed' ? 'var-confirmed' : 'var-overturned');
  }
  if (event.type === 'confirmed') labSound('goal');
  if (event.type === 'pens') labSound(event.scored ? 'pen-goal' : event.outcome === 'miss' ? 'pen-miss' : 'pen-save');
  if (event.type === 'final') completeLabRun(run);
}

function completeLabRun(run) {
  if (!run || run.done) return;
  clearInterval(labTimer);
  labTimer = null;
  run.done = true;
  run.line = grugLine(run.rng);
  finishLab();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('u26:high-attention-end'));
}

function requestLabComplete(run) {
  if (!run || run.done || run.finalQueued) return;
  run.finalQueued = true;
  addLabEvent(run, 'final', 'h', 'Full-time whistle.');
  labSound('final');
}

function enterExtraTime(run) {
  if (!run || run.extraStarted) return;
  run.extraStarted = true;
  run.phase = 'et-decision';
  run.paused = true;
  run.decisionAt = 'ET';
  run.minute = 90;
  run.added = 0;
  addLabEvent(run, 'extra', 'h', 'EXTRA TIME — thirty more minutes.');
}

function shootoutStillLive(ph, pa, hTaken, aTaken) {
  const remH = Math.max(0, 5 - hTaken);
  const remA = Math.max(0, 5 - aTaken);
  if (hTaken < 5 || aTaken < 5) return ph <= pa + remA && pa <= ph + remH;
  if (hTaken !== aTaken) return true;
  return ph === pa;
}

function buildPenaltyKicks(run) {
  const rng = run.rng;
  const kicks = [];
  let ph = 0; let pa = 0;
  let hTaken = 0; let aTaken = 0;
  const rolesH = activeFormation('h', { ...run, phase: 'pens', currentKick: null }).filter((p) => p.role !== 'GK').map((p) => p.role);
  const rolesA = activeFormation('a', { ...run, phase: 'pens', currentKick: null }).filter((p) => p.role !== 'GK').map((p) => p.role);
  for (let guard = 0; guard < 24; guard++) {
    hTaken++;
    const hScored = rng() < 0.76; if (hScored) ph++;
    const hDir = rng() < 0.5 ? 'left' : 'right';
    const hOutcome = hScored ? 'goal' : (rng() < 0.72 ? 'save' : 'miss');
    kicks.push({ side: 'h', n: hTaken, actor: rolesH[(hTaken - 1) % Math.max(1, rolesH.length)] || 'ST', scored: hScored, outcome: hOutcome, ph, pa, dir: hDir, hTaken, aTaken });
    if (!shootoutStillLive(ph, pa, hTaken, aTaken)) break;
    aTaken++;
    const aScored = rng() < 0.76; if (aScored) pa++;
    const aDir = rng() < 0.5 ? 'left' : 'right';
    const aOutcome = aScored ? 'goal' : (rng() < 0.72 ? 'save' : 'miss');
    kicks.push({ side: 'a', n: aTaken, actor: rolesA[(aTaken - 1) % Math.max(1, rolesA.length)] || 'ST', scored: aScored, outcome: aOutcome, ph, pa, dir: aDir, hTaken, aTaken });
    if (!shootoutStillLive(ph, pa, hTaken, aTaken)) break;
  }
  return kicks;
}

function startPenaltyShootout(run, forcedKicks = null) {
  if (!run || run.shootout) return;
  run.phase = 'pens';
  run.sceneDirty = true;
  run.shootout = { kicks: forcedKicks || buildPenaltyKicks(run), index: 0 };
  run.pens = { ph: 0, pa: 0, kicks: [] };
  queueNextPenalty(run);
}

function queueNextPenalty(run) {
  if (!run?.shootout) return;
  const kick = run.shootout.kicks[run.shootout.index++];
  if (!kick) {
    run.shootout = null;
    run.currentKick = null;
    requestLabComplete(run);
    return;
  }
  run.currentKick = kick;
  addLabEvent(run, 'pens', kick.side, `${teamName(kick.side === 'h' ? run.home : run.away)} penalty ${kick.scored ? 'scores' : kick.outcome === 'miss' ? 'misses' : 'saved'} (${kick.ph}–${kick.pa})`, {
    kick,
    scored: kick.scored,
    outcome: kick.outcome,
  });
}

// Minute-by-minute segment simulation. Lab state lives in the Play namespace;
// the ticking run itself is module-local (never persisted mid-run).
let labRun = null; // { home, away, seed, rng, minute, gh, ga, events, momentum, approach, mods, paused, decisionAt, done, pens }
let labTimer = null;
// Broadcast pace: how fast simulated minutes pass. 'key' sprints between the
// moments that matter and breathes on them. Never persisted; UI-only.
let labPace = 'normal'; // normal | fast(Turbo) | key
let labMute = false;    // true while a beat batches ticks — paint once per beat
let audioCtx = null;
let audioUnlocked = false;
let audioBlocked = false;
let lastSoundEvent = null;
const audioNodes = new Set();

function soundEnabled() {
  return getState().play.labSound !== false;
}

function audioSupported() {
  return typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
}

function labAudioDiagnostic() {
  const state = audioCtx?.state || 'none';
  return {
    supported: audioSupported(),
    contextState: state,
    unlocked: audioUnlocked && state === 'running',
    enabled: soundEnabled(),
    blocked: audioBlocked,
    lastSoundEvent,
  };
}

function labSoundButtonModel() {
  const diag = labAudioDiagnostic();
  if (!diag.supported || audioBlocked) {
    return { label: 'Sound unavailable', data: 'unavailable', pressed: 'false', disabled: true };
  }
  if (!diag.enabled) return { label: 'Sound off', data: 'off', pressed: 'false', disabled: false };
  if (!diag.unlocked) return { label: 'Tap to enable sound', data: 'pending', pressed: 'false', disabled: false };
  return { label: 'Sound on', data: 'on', pressed: 'true', disabled: false };
}

function updateAudioButtons() {
  if (typeof document === 'undefined') return;
  const model = labSoundButtonModel();
  document.querySelectorAll('#lab-sound').forEach((button) => {
    button.textContent = model.label;
    button.dataset.sound = model.data;
    button.setAttribute('aria-pressed', model.pressed);
    button.toggleAttribute('disabled', !!model.disabled);
  });
}

function persistLabSound(on) {
  const { play } = getState();
  const nextPlay = { ...play, labSound: !!on };
  setPlay(nextPlay);
  savePlay(nextPlay);
  if (!on) silenceAudio();
  updateAudioButtons();
}

function markAudioState() {
  audioUnlocked = !!audioCtx && audioCtx.state === 'running';
  updateAudioButtons();
}

function playableAudio() {
  if (!soundEnabled() || !audioSupported() || !audioCtx || audioCtx.state !== 'running') return null;
  audioUnlocked = true;
  return audioCtx;
}

function audioContextFromGesture() {
  if (!soundEnabled()) return null;
  if (!audioSupported()) {
    audioBlocked = true;
    updateAudioButtons();
    return null;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  try {
    if (!audioCtx) {
      audioCtx = new Ctx();
      audioCtx.onstatechange = markAudioState;
    }
    if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
      const resumeAttempt = audioCtx.resume();
      if (resumeAttempt && typeof resumeAttempt.catch === 'function') {
        resumeAttempt.catch(() => { audioBlocked = true; markAudioState(); });
      }
    }
  } catch (_) {
    audioBlocked = true;
    updateAudioButtons();
    return null;
  }
  markAudioState();
  return audioCtx;
}

function unlockAudioFromGesture() {
  const ctx = audioContextFromGesture();
  if (!ctx) return null;
  playUnlockCue(ctx);
  markAudioState();
  return ctx;
}

function trackAudioNode(node) {
  if (!node) return node;
  audioNodes.add(node);
  return node;
}

function silenceAudio() {
  for (const node of audioNodes) {
    try { node.stop(0); } catch (_) {}
  }
  audioNodes.clear();
  lastSoundEvent = 'muted';
}

function tone(freq, dur = 0.12, gain = 0.04, type = 'sine', delay = 0, sweepTo = null, ctxOverride = null) {
  const ctx = ctxOverride || playableAudio();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const osc = trackAudioNode(ctx.createOscillator());
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (sweepTo && osc.frequency.exponentialRampToValueAtTime) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), start + dur * 0.85);
  }
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.018);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(amp).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
  setTimeout(() => audioNodes.delete(osc), Math.ceil((delay + dur + 0.08) * 1000));
}

function noiseBurst(level = 0.05, dur = 0.45, delay = 0, cutoff = 620, ctxOverride = null) {
  const ctx = ctxOverride || playableAudio();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const src = trackAudioNode(ctx.createBufferSource());
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.linearRampToValueAtTime(level, start + Math.min(0.12, dur * 0.35));
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.buffer = buffer;
  src.connect(filter).connect(amp).connect(ctx.destination);
  src.start(start);
  src.stop(start + dur);
  setTimeout(() => audioNodes.delete(src), Math.ceil((delay + dur + 0.08) * 1000));
}

function chord(notes, dur = 0.18, gain = 0.028, type = 'triangle', delay = 0, ctxOverride = null) {
  notes.forEach((n, i) => tone(n, dur + i * 0.035, gain * (1 - i * 0.12), type, delay + i * 0.045, null, ctxOverride));
}

function playUnlockCue(ctx) {
  if (!ctx || !soundEnabled()) return;
  lastSoundEvent = 'enable';
  tone(660, 0.07, 0.018, 'triangle', 0, 880, ctx);
  tone(990, 0.08, 0.014, 'sine', 0.08, 740, ctx);
}

function labSound(kind) {
  lastSoundEvent = kind;
  if (!soundEnabled()) return;
  if (!playableAudio()) { updateAudioButtons(); return; }
  if (kind === 'kickoff') { tone(720, 0.09, 0.035, 'square', 0, 980); tone(1180, 0.1, 0.028, 'sine', 0.11, 760); noiseBurst(0.018, 0.18, 0, 900); }
  else if (kind === 'shot') { tone(180, 0.11, 0.026, 'sawtooth', 0, 330); tone(540, 0.08, 0.018, 'triangle', 0.08, 760); }
  else if (kind === 'save') { noiseBurst(0.042, 0.24, 0, 720); tone(260, 0.13, 0.028, 'triangle', 0.06, 180); tone(620, 0.08, 0.018, 'sine', 0.2); }
  else if (kind === 'goal') { noiseBurst(0.075, 0.95, 0, 760); chord([392, 523, 784, 1046], 0.24, 0.036, 'triangle', 0.03); tone(1568, 0.16, 0.018, 'sine', 0.38); }
  else if (kind === 'ref') { tone(1280, 0.1, 0.038, 'square'); tone(1320, 0.1, 0.034, 'square', 0.13); noiseBurst(0.018, 0.12, 0.03, 1500); }
  else if (kind === 'var') { tone(196, 0.34, 0.03, 'sawtooth', 0, 247); tone(294, 0.28, 0.022, 'sine', 0.2, 220); noiseBurst(0.02, 0.38, 0.06, 420); }
  else if (kind === 'var-confirmed') { chord([330, 494, 660], 0.16, 0.026, 'triangle'); }
  else if (kind === 'var-overturned') { tone(330, 0.16, 0.028, 'triangle', 0, 220); tone(165, 0.22, 0.02, 'sine', 0.17); }
  else if (kind === 'pen') { tone(220, 0.22, 0.026, 'triangle'); tone(330, 0.18, 0.02, 'sine', 0.22); }
  else if (kind === 'pen-goal') { chord([440, 660, 880], 0.18, 0.03, 'triangle'); noiseBurst(0.04, 0.4, 0.04, 820); }
  else if (kind === 'pen-save') { noiseBurst(0.05, 0.24, 0, 640); tone(196, 0.18, 0.028, 'triangle', 0.08, 140); }
  else if (kind === 'pen-miss') { tone(260, 0.16, 0.024, 'sine', 0, 180); noiseBurst(0.024, 0.18, 0.08, 520); }
  else if (kind === 'final') { tone(980, 0.12, 0.036, 'square'); tone(740, 0.12, 0.032, 'square', 0.16); tone(523, 0.28, 0.03, 'triangle', 0.34); noiseBurst(0.036, 0.55, 0.22, 620); }
}

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
  if (run.minute > 90) {
    const fatigue = Math.min(0.45, (run.minute - 90) * 0.018);
    h *= 1.08 + fatigue;
    aRate *= 1.08 + fatigue;
    if (run.etPlan === 'push') { h *= 1.18; aRate *= 1.12; }
    if (run.etPlan === 'fresh') { h *= 1.06; aRate *= 0.96; }
    if (run.etPlan === 'protect') { h *= 0.88; aRate *= 0.92; }
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

/* ---- chance quality (deterministic flavour, zero rng consumption) ----
   Every shot gets a football shape — tap-in, header, cutback, long shot,
   set-piece move, solo run — picked by hashing the run's own facts so the
   same seed always tells the same story, and a team's sim style leans the
   mix (wing overloads cross more, direct runners let fly). Flavour only:
   it never touches rates, scores, or the rng stream. */
export const LAB_CHANCE_FLAVORS = [
  { kind: 'tap-in', shot: 'square it for the tap-in', goal: 'taps it in at the far post' },
  { kind: 'header', shot: 'hang a cross up for the header', goal: 'buries the header' },
  { kind: 'cutback', shot: 'carve out the cutback', goal: 'sweeps in the cutback' },
  { kind: 'long shot', shot: 'let fly from thirty yards', goal: 'arrows one in from distance' },
  { kind: 'set piece', shot: 'work the set-piece routine', goal: 'finishes the set-piece scramble' },
  { kind: 'solo run', shot: 'drive straight at the back line', goal: 'finishes the solo run' },
];
const LAB_STYLE_FLAVOR = {
  'high press': [0, 5, 2], 'counter surge': [5, 2, 3], 'possession weave': [0, 2, 1],
  'wing overloads': [1, 2, 0], 'deep block steel': [4, 3, 5], 'box-crash chaos': [0, 1, 4],
  'midfield strangle': [2, 3, 0], 'direct running': [3, 5, 1],
};

export function labChanceFlavor(seed, minute, side, teamCode, n = 0) {
  const prefs = LAB_STYLE_FLAVOR[teamSimStyle(teamCode)] || [0, 1, 2];
  // style-preferred shapes twice as likely, all six always possible
  const pool = [...prefs, ...prefs, 0, 1, 2, 3, 4, 5];
  const idx = pool[hashSeed(`u26-flavor-${seed}-${minute}-${side}-${n}`) % pool.length];
  return LAB_CHANCE_FLAVORS[idx];
}

const LAB_SAVE_LINES = [
  'Fingertip save — tipped over the bar',
  'Smothered at the near post',
  'Strong wrists — beaten away',
  'Down low — pushed around the post',
];
export function labSaveLine(seed, minute, side) {
  return LAB_SAVE_LINES[hashSeed(`u26-save-${seed}-${minute}-${side}`) % LAB_SAVE_LINES.length];
}

/* ---- the night's honours (derived facts, never stored claims) ----
   Result tags are replayed from committed events at full time: clutch wins,
   comebacks, clean sheets, shootout nerve, heartbreak. Pure and testable. */
export const LAB_TAG_LABELS = {
  upset: 'Giant slain', comeback: 'Comeback', clutch: 'Clutch win',
  nerve: 'Shootout nerve', shutout: 'Clean sheet', heartbreak: 'Heartbreak',
  goalfest: 'Goal rush',
};

export function labResultTags(run) {
  const tags = [];
  const add = (id) => { if (!tags.includes(id)) tags.push(id); };
  const winSide = run.pens ? (run.pens.ph > run.pens.pa ? 'h' : 'a') : run.gh > run.ga ? 'h' : run.gh < run.ga ? 'a' : null;
  if (!winSide) return tags;
  const loseSide = winSide === 'h' ? 'a' : 'h';
  const winTeam = winSide === 'h' ? run.home : run.away;
  const loseTeam = winSide === 'h' ? run.away : run.home;
  const scoring = (run.events || []).filter((e) => (e.type === 'goal' && !e.underReview) || e.type === 'confirmed');
  const lastGoal = scoring[scoring.length - 1] || null;
  if ((RATINGS[loseTeam] || 70) - (RATINGS[winTeam] || 70) >= 6) add('upset');
  if (labComebackDepth(run.events, winSide) >= 1) add('comeback');
  if (!run.pens && lastGoal && lastGoal.side === winSide && lastGoal.min >= 85 && Math.abs(run.gh - run.ga) === 1) add('clutch');
  if (run.pens) add('nerve');
  const concededByWinner = winSide === 'h' ? run.ga : run.gh;
  if (concededByWinner === 0) add('shutout');
  if (run.pens || (lastGoal && lastGoal.side === loseSide && lastGoal.min >= 88)) {
    // heartbreak belongs to the losing seat; recorded so YOUR defeats sting honestly
    add('heartbreak');
  }
  if (run.gh + run.ga >= 5) add('goalfest');
  return tags;
}

/** How many times this pairing has already been fought on this phone —
    rivalry copy is derived from local history, never an official claim. */
export function labRivalryCount(labHistory, home, away) {
  return (labHistory || []).filter((e) => (e.home === home && e.away === away) || (e.home === away && e.away === home)).length;
}

function labTick() {
  const run = labRun;
  if (!run || run.paused || run.done) return;
  if (run.visual || run.visualQueue?.length || run.shootout) return;
  if (run.minute === 0) addLabEvent(run, 'whistle', 'h', 'Kick off.');
  run.minute++;
  if (run.phase === 'et-ready' && run.minute < 91) run.minute = 91;
  if (run.phase === 'et-ready') run.phase = 'et1';
  const rng = run.rng;
  const rates = labChanceRates(run);
  const swing = (rng() - 0.5) * 0.5;
  run.mo = Math.max(-1, Math.min(1, (run.mo || 0) * 0.9 + swing + (rates.h - rates.aRate) * 6));
  const possSide = rng() < 0.5 + (run.mo || 0) * 0.24 ? 'h' : 'a';
  const possKind = POSSESSION_TYPES[Math.floor(rng() * POSSESSION_TYPES.length)];
  if (labPace !== 'key' && run.minute % 7 === 0 && rng() < 0.58) {
    addLabEvent(run, possKind, possSide, eventText(possKind, possSide, possSide === 'h' ? run.home : run.away, run));
  } else {
    queueLabFlow(run, possSide, possKind);
  }
  for (const [side, rate] of [['h', rates.h], ['a', rates.aRate]]) {
    if (rng() < rate) {
      const team = side === 'h' ? run.home : run.away;
      const shooter = actorFor(run, side, 'shot')?.role || 'ST';
      const flavor = labChanceFlavor(run.seed, run.minute, side, team, run.sh + run.sa);
      addLabEvent(run, 'shot', side, `Shot — ${teamName(team)} ${flavor.shot}`, { actor: shooter, quality: flavor.kind });
      if (side === 'h') run.sh++; else run.sa++; // every chance is an attempt
      if (rng() < rates.convert) {
        const hasVar = run.minute > 14 && rng() < 0.16;
        const overturned = hasVar && rng() < 0.28;
        const nextGh = run.gh + (side === 'h' && !hasVar ? 1 : 0);
        const nextGa = run.ga + (side === 'a' && !hasVar ? 1 : 0);
        const who = (ROLE_NAMES[shooter] || 'Striker').toLowerCase();
        addLabEvent(run, 'goal', side, hasVar
          ? `Goal? ${teamName(team)} wait on the check`
          : `GOAL — ${teamName(team)}'s ${who} ${flavor.goal} (${nextGh}–${nextGa})`, {
          actor: shooter,
          team,
          scoreDelta: true,
          underReview: hasVar,
          afterVar: hasVar,
          verdict: overturned ? 'overturned' : 'confirmed',
        });
        if (!hasVar) labSound('goal');
        const swingTo = side === 'h' ? 0.6 : -0.6;
        // turning point: the moment that swung the night hardest
        if (Math.abs(swingTo) + Math.abs(run.mo) >= (run.turnMag || 0)) {
          run.turnMag = Math.abs(swingTo) + Math.abs(run.mo);
          run.turn = { min: run.minute, text: `${teamName(team)}'s goal changed the match` };
        }
        run.mo += swingTo;
      } else if (rng() < 0.42) {
        // an unconverted chance often dies as a corner — texture plus a count
        if (side === 'h') run.ckh = (run.ckh || 0) + 1; else run.cka = (run.cka || 0) + 1;
        addLabEvent(run, 'corner', side, `Corner — ${teamName(team)} keep the pressure on`);
      } else if (rng() < 0.22) {
        addLabEvent(run, 'save', side, `${labSaveLine(run.seed, run.minute, side)} — ${teamName(team)} denied`, { actor: shooter });
      } else if (rng() < 0.2) {
        addLabEvent(run, 'free', side, eventText('free', side, team, run), { actor: shooter });
      } else if (rng() < 0.3) {
        addLabEvent(run, 'chance', side, CHANCE_LINES[Math.floor(rng() * CHANCE_LINES.length)](teamName(team)), { actor: shooter });
      }
    }
  }
  // regulation penalties — rare, loud, resolved from the spot. The award and
  // its resolution ride the existing event pipeline, so score commits, sounds,
  // pacing, and reduced-motion draining all behave exactly like open play.
  if (rng() < 0.009 && run.phase !== 'pens') {
    const side = rng() < 0.5 + (run.mo || 0) * 0.2 ? 'h' : 'a';
    const team = side === 'h' ? run.home : run.away;
    addLabEvent(run, 'penalty', side, `PENALTY — ${teamName(team)} win it, contact in the box`);
    labSound('pen');
    if (side === 'h') run.sh++; else run.sa++;
    const roll = rng();
    if (roll < 0.74) {
      const nextGh = run.gh + (side === 'h' ? 1 : 0);
      const nextGa = run.ga + (side === 'a' ? 1 : 0);
      addLabEvent(run, 'goal', side, `GOAL — ${teamName(team)} bury the penalty (${nextGh}–${nextGa})`, {
        actor: 'ST', team, scoreDelta: true, fromPenalty: true,
      });
      labSound('goal');
      const swingTo = side === 'h' ? 0.55 : -0.55;
      if (Math.abs(swingTo) + Math.abs(run.mo) >= (run.turnMag || 0)) {
        run.turnMag = Math.abs(swingTo) + Math.abs(run.mo);
        run.turn = { min: run.minute, text: `${teamName(team)}'s penalty changed the match` };
      }
      run.mo += swingTo;
    } else if (roll < 0.88) {
      addLabEvent(run, 'save', side, 'SAVED — the keeper reads the penalty', { actor: 'ST', fromPenalty: true });
      if (run.minute > 70 && Math.abs(run.gh - run.ga) <= 1 && 1.0 >= (run.turnMag || 0)) {
        run.turnMag = 1.0;
        run.turn = { min: run.minute, text: `the penalty save that kept ${teamName(side === 'h' ? run.away : run.home)} alive` };
      }
      run.mo += side === 'h' ? -0.35 : 0.35;
    } else {
      addLabEvent(run, 'chance', side, 'Off the post — the penalty stays out', { actor: 'ST', fromPenalty: true });
      run.mo += side === 'h' ? -0.2 : 0.2;
    }
  }
  // bookings — rare, real consequences on a red
  if (rng() < 0.016) {
    const side = rng() < 0.5 ? 'h' : 'a';
    const team = teamName(side === 'h' ? run.home : run.away);
    const redRole = actorFor(run, side, 'defence')?.role || RED_DROP_ROLE;
    if (rng() < 0.1 && !run[side === 'h' ? 'redH' : 'redA']) {
      addLabEvent(run, 'red', side, `RED CARD — ${team} down to ten`, { actor: redRole, redRole });
      labSound('ref');
      if (1.1 >= (run.turnMag || 0)) { run.turnMag = 1.1; run.turn = { min: run.minute, text: `the red card that left ${team} with ten` }; }
      run.mo += side === 'h' ? -0.4 : 0.4;
    } else {
      addLabEvent(run, 'card', side, `Booking for ${team}`, { actor: redRole });
      labSound('ref');
    }
  }
  // substitutions as match texture (the 68' decision is the real lever)
  if ((run.minute === 61 || run.minute === 74) && rng() < 0.7) {
    const side = rng() < 0.5 ? 'h' : 'a';
    addLabEvent(run, 'sub', side, `Substitution — fresh legs for ${teamName(side === 'h' ? run.home : run.away)}`);
  }
  // fatigue is already priced into the rates after 72' — at 76' the broadcast
  // says it out loud once, so the pressure you feel on screen has a reason
  if (run.minute === 76 && !run.fatigueNoted) {
    run.fatigueNoted = true;
    const a = APPROACHES[run.approach] || APPROACHES.balanced;
    const aggressive = a.atk * (run.mods?.atk || 1) > 1.1;
    addLabEvent(run, 'note', aggressive ? 'h' : 'a', aggressive
      ? `Legs are heavy — ${teamName(run.home)}'s press is leaving gaps behind it`
      : 'Legs are heavy — the tempo drops and every sprint costs more');
  }
  // running possession from the momentum trace
  run.possAcc = (run.possAcc || 0) + 0.5 + (run.mo || 0) * 0.13;
  if (DECISIONS[run.minute] && !run.decided[run.minute]) {
    run.paused = true;
    run.decisionAt = run.minute;
  }
  // the fourth official's board goes up at 90
  if (run.phase !== 'et1' && run.phase !== 'et2' && run.minute === 90 && run.added == null) {
    const lateEvents = run.events.filter((e) => e.min > 75 && (e.type === 'goal' || e.type === 'card' || e.type === 'red' || e.type === 'sub')).length;
    run.added = Math.max(1, Math.min(6, 2 + lateEvents));
    addLabEvent(run, 'board', 'h', `+${run.added} minutes of stoppage time`);
  }
  if (run.phase === 'et1' && run.minute >= 105 && !run.etInterval) {
    run.etInterval = true;
    run.phase = 'et2';
    addLabEvent(run, 'interval', 'h', 'Extra-time interval.');
  }
  if (run.phase === 'et2' && run.minute === 120 && run.etAdded == null) {
    const lateEvents = run.events.filter((e) => e.min > 105 && (e.type === 'goal' || e.type === 'card' || e.type === 'red' || e.type === 'sub')).length;
    run.etAdded = Math.max(1, Math.min(3, 1 + lateEvents));
    addLabEvent(run, 'board', 'h', `+${run.etAdded} minutes of extra-time stoppage`);
  }
  if (run.phase === 'et2' && run.minute >= 120 + (run.etAdded || 0)) {
    if (run.knockout && run.gh === run.ga) {
      startPenaltyShootout(run);
      labSound('pen');
      return;
    }
    requestLabComplete(run);
  } else if (run.phase !== 'et1' && run.phase !== 'et2' && run.minute >= 90 + (run.added || 0)) {
    if (run.knockout && run.gh === run.ga) {
      enterExtraTime(run);
      labSound('ref');
    }
    else requestLabComplete(run);
  }
  if (!labMute) paintLab();
  if (run.paused || run.done) stopLabTimer();
}

function stopLabTimer({ drainDirector = true } = {}) {
  clearInterval(labTimer);
  labTimer = null;
  if (drainDirector) stopDirector({ drain: true });
}

function startLabTimer({ drainDirector = true } = {}) {
  stopLabTimer({ drainDirector });
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { while (labRun && !labRun.done && !labRun.paused) labTick(); return; }
  const ms = (LAB_PACE_CONTRACT[labPace] || LAB_PACE_CONTRACT.normal).beatMs;
  labTimer = setInterval(labBeat, ms);
}

/* One broadcast beat. Normal walks minute-by-minute; Turbo advances compactly;
   Key Moments sprints quietly between events and lets each moment land on screen. */
function labBeat() {
  const run = labRun;
  if (!run || run.paused || run.done) return;
  if (labPace === 'key') {
    const before = run.events.length;
    const ticks = (LAB_PACE_CONTRACT[labPace] || LAB_PACE_CONTRACT.key).ticks;
    let guard = 0;
    do { labTick(); guard++; } while (
      labRun && !labRun.done && !labRun.paused
      && !labRun.visual && !labRun.visualQueue?.length
      && labRun.events.length === before && guard < ticks);
  } else {
    const ticks = (LAB_PACE_CONTRACT[labPace] || LAB_PACE_CONTRACT.normal).ticks;
    for (let i = 0; i < ticks; i++) {
      if (!labRun || labRun.done || labRun.paused || labRun.visual || labRun.visualQueue?.length) break;
      labTick();
    }
  }
  paintLab(); // one paint per beat, plus rAF paints while a sequence is active
}

function setLabPace(p) {
  labPace = normalizeLabPace(p);
  const card = document.querySelector('.play-view .lab.running');
  if (card) {
    card.querySelectorAll('[data-pace]').forEach((b) => b.classList.toggle('active', b.dataset.pace === labPace));
  }
  if (labRun && !labRun.done && !labRun.paused) {
    if (labRun.visual && !isLabMajorMoment(labRun.visual.event)) {
      startLabTimer({ drainDirector: false });
    } else if (!labRun.visual && !labRun.visualQueue?.length) {
      startLabTimer();
    } else {
      labRun.paceRestartPending = true;
    }
  }
}

function createLabRun(home, away, approach = 'balanced', seed = (Date.now() % 2147483647) | 1) {
  labRun = {
    home, away, approach, seed, rng: mulberry32(seed),
    minute: 0, gh: 0, ga: 0, sh: 0, sa: 0, mo: 0, events: [], decided: {}, mods: { atk: 1, def: 1 },
    paused: false, decisionAt: null, done: false, pens: null, knockout: true, phase: 'reg',
    visualQueue: [], visualTrace: [],
    ball: { x: 50, y: 50, side: 'h', kind: 'kickoff', from: 'DM' },
  };
  return labRun;
}

function beginLab(home, away, approach, seed) {
  createLabRun(home, away, approach, seed);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('u26:high-attention-start'));
  unlockAudioFromGesture();
  labSound('kickoff');
  repaintPlay();
  startLabTimer();
}

function applyLabDecision(run, optionId) {
  if (!run || run.decisionAt == null) return false;
  const d = run.decisionAt === 'ET' ? EXTRA_TIME_DECISION : DECISIONS[run.decisionAt];
  const opt = d.options.find((o) => o.id === optionId);
  if (!opt) return false;
  run.mods = { atk: run.mods.atk * opt.atk, def: run.mods.def * opt.def };
  if (run.decisionAt === 'ET') {
    run.phase = 'et-ready';
    run.etPlan = opt.plan || optionId;
    run.awayCompact = optionId === 'protect' ? 1.08 : 0.98;
  }
  run.decided[run.decisionAt] = optionId;
  addLabEvent(run, 'decision', 'h', opt.label);
  run.paused = false; run.decisionAt = null;
  return true;
}

function decideLab(optionId) {
  const run = labRun;
  if (!applyLabDecision(run, optionId)) return;
  repaintPlay();
  startLabTimer();
}

export function simulateLabForSeed(home, away, { seed = 1, approach = 'balanced', decisions = { 45: 'steady', 68: 'fresh', ET: 'fresh' } } = {}) {
  createLabRun(home, away, approach, seed);
  const wasMuted = labMute;
  labMute = true;
  let guard = 0;
  try {
    while (labRun && !labRun.done && guard < 220) {
      if (labRun.paused && labRun.decisionAt != null) {
        applyLabDecision(labRun, decisions[labRun.decisionAt] || (labRun.decisionAt === 'ET' ? 'fresh' : 'steady'));
      } else {
        labTick();
      }
      guard++;
    }
  } finally {
    labMute = wasMuted;
  }
  const r = labRun;
  return {
    seed: r.seed,
    score: [r.gh, r.ga],
    pens: r.pens ? { ph: r.pens.ph, pa: r.pens.pa, kicks: r.pens.kicks.length } : null,
    phase: r.phase,
    extraStarted: !!r.extraStarted,
    etPlan: r.etPlan || null,
    minute: r.minute,
    players: { home: activeFormation('h', r).length, away: activeFormation('a', r).length },
    visualTrace: r.visualTrace,
    events: r.events.map((e) => ({
      min: e.min,
      phase: e.phase || 'reg',
      type: e.type,
      side: e.side,
      text: e.text,
      scoreDelta: !!e.scoreDelta,
      underReview: !!e.underReview,
      committed: !!e.committed,
      redRole: e.redRole || null,
      kick: e.kick ? { ...e.kick } : null,
      visual: (e.visual || []).map((p) => [Number(p.x.toFixed(1)), Number(p.y.toFixed(1)), p.from || '', p.kind || '']),
    })),
  };
}

/* The payoff: every finished simulation resolves into points, a story, and a
   turning point — computed from the events that actually happened in the run. */
function labResultFacts(run) {
  const win = run.pens ? run.pens.ph > run.pens.pa : run.gh > run.ga;
  const gap = (RATINGS[run.away] || 70) - (RATINGS[run.home] || 70);
  const upset = win && gap >= 6;
  return { win, gap, upset, margin: Math.abs(run.gh - run.ga) };
}

/** Largest deficit the given side overcame, replayed from the committed
    scoring events — a derived fact, never a stored claim. */
export function labComebackDepth(events, side = 'h') {
  let h = 0; let a = 0; let deepest = 0;
  for (const e of events || []) {
    if (!((e.type === 'goal' && !e.underReview) || e.type === 'confirmed')) continue;
    if (e.side === 'h') h++; else a++;
    const deficit = side === 'h' ? a - h : h - a;
    if (deficit > deepest) deepest = deficit;
  }
  return deepest;
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
  if (run.pens) bits.push(`Level after extra time — settled ${run.pens.ph}–${run.pens.pa} on penalties.`);
  else if (run.extraStarted) bits.push('Extra time found the winner before penalties.');
  else if (decider) bits.push(`The decisive goal came at ${minLabel(decider.min, decider.phase)}'.`);
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
  run.tags = labResultTags(run);
  // rivalry copy: this pairing's local history gives the night a chapter number
  const meetings = labRivalryCount(play.labHistory, run.home, run.away);
  if (meetings >= 1) run.story += ` Chapter ${meetings + 1} of this rivalry on this phone.`;
  // perspective: if your chosen side played tonight, this night has a verdict
  const side = currentSide(play);
  run.you = labPerspective(run, side && side.code);
  run.result = labPerspectiveResult(run, run.you);
  const entry = {
    at: new Date().toISOString(),
    home: run.home, away: run.away, gh: run.gh, ga: run.ga,
    pens: run.pens, approach: run.approach, line: run.line,
    cp, win: facts.win, upset: facts.upset, story: run.story, extraStarted: !!run.extraStarted,
    seed: run.seed,
    you: run.you, result: run.result,
    tags: run.tags,
    comeback: facts.win ? labComebackDepth(run.events, 'h') : 0,
    events: run.events.slice(-18).map((e) => ({ min: e.min, phase: e.phase || 'reg', type: e.type, side: e.side, text: e.text })),
  };
  let nextPlay = {
    ...play,
    labHistory: [entry, ...(play.labHistory || [])].slice(0, 30),
    ...(run.result ? { sideStats: recordSideResult(play.sideStats, side.code, run.result) } : {}),
  };
  // the Showdown stop of an active Arcade Cup settles from this real run
  if (run.result) {
    const prog = withCupProgress(nextPlay, 'showdown', run.result);
    nextPlay = prog.play;
    run.cupAdvance = prog.advanced ? prog : null;
  }
  setPlay(nextPlay);
  savePlay(nextPlay);
}

function resetLab() { stopLabTimer(); labRun = null; repaintPlay(); }

/** Replay a museum night exactly: same teams, same approach, same seed.
    Used by the You museum — local replay only, no official data involved. */
export function replayLabEntry(entry) {
  if (!entry || !entry.home || !entry.away) return;
  setPlayMode('lab');
  beginLab(entry.home, entry.away, entry.approach || 'balanced', entry.seed);
}

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

const CONF = { 1: 'Cool', 2: 'Confident', 3: 'Certain' };

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
  // Global leaderboard sync: my own pick, pre-kickoff only (the database
  // enforces the same lock). Fire-and-forget — local play never blocks.
  if (currentUser()) pushPick(fixtureId, picks[fixtureId]);
}

/* ================= Penalty Rush =================
   The arcade's hands-on minigame: five kicks against a keeper who studies
   your habits. Entirely local — a seeded, deterministic duel with nothing
   no network, no official claims. A perfect five earns sudden death
   that lasts until the keeper finally wins. */

export const RUSH_ZONES = ['left', 'centre', 'right'];
const RUSH_ZONE_LABELS = { left: 'low left', centre: 'down the middle', right: 'low right' };

export function dailyGauntletSeed(dateKey = localDayKey(), attempt = 0) {
  return hashSeed(`u26-rush-${dateKey}-${attempt}`) || 1;
}

export function createPenaltyRush(seed = dailyGauntletSeed()) {
  const s = (seed >>> 0) || 1;
  return {
    seed: s,
    rng: mulberry32(s),
    kicks: [], goals: 0, sudden: false, over: false,
    aims: { left: 0, centre: 0, right: 0 },
  };
}

/* The keeper reads habits, never the current pick: with two or more kicks of
   history it leans toward your most-used zone — harder in sudden death. */
function rushKeeperPick(run) {
  const total = run.aims.left + run.aims.centre + run.aims.right;
  const r = run.rng();
  if (total >= 2) {
    const fav = RUSH_ZONES.reduce((a, b) => (run.aims[a] >= run.aims[b] ? a : b));
    if (r < (run.sudden ? 0.62 : 0.45)) return fav;
    const rest = RUSH_ZONES.filter((z) => z !== fav);
    return rest[Math.min(rest.length - 1, Math.floor(run.rng() * rest.length))];
  }
  return RUSH_ZONES[Math.min(2, Math.floor(r * 3))];
}

/** One kick. Deterministic for a given seed and aim history; mutates only the
    passed run. Returns the resolved kick or null when the duel is over. */
export function rushShoot(run, aim) {
  if (!run || run.over || !RUSH_ZONES.includes(aim)) return null;
  const keeper = rushKeeperPick(run);
  const r = run.rng();
  const outcome = keeper === aim
    ? (r < (run.sudden ? 0.14 : 0.2) ? 'goal' : 'save')
    : (r < 0.94 ? 'goal' : 'post');
  run.aims[aim] += 1;
  const kick = { n: run.kicks.length + 1, aim, keeper, outcome, sudden: run.sudden };
  run.kicks.push(kick);
  if (outcome === 'goal') run.goals += 1;
  if (run.sudden) {
    if (outcome !== 'goal') run.over = true;
  } else if (run.kicks.length >= 5) {
    if (run.goals === 5) run.sudden = true;
    else run.over = true;
  }
  return kick;
}

export function rushRating(goals) {
  if (goals >= 8) return "the keeper's nightmare";
  if (goals >= 5) return 'ice in the veins';
  if (goals === 4) return 'clinical from twelve yards';
  if (goals === 3) return 'composed under the lights';
  if (goals === 2) return 'shaky legs tonight';
  return 'the keeper owns tonight';
}

/** Fold a finished gauntlet into the local record — day-scoped bests plus
    all-time bests, every number derived from runs that actually happened. */
export function rushRecordAfter(rec, { dateKey, score, perfect }) {
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

// Live gauntlet — module-local, never persisted mid-run (same policy as labRun).
let rushRun = null;

function ensureRushRun() {
  if (rushRun) return rushRun;
  const { play } = getState();
  const today = localDayKey();
  const rec = play.penaltyRush;
  const attempt = rec && rec.dateKey === today ? rec.attemptsToday || 0 : 0;
  rushRun = createPenaltyRush(dailyGauntletSeed(today, attempt));
  return rushRun;
}

function finishRush() {
  const { play } = getState();
  let next = {
    ...play,
    penaltyRush: rushRecordAfter(play.penaltyRush, {
      dateKey: localDayKey(),
      score: rushRun.goals,
      perfect: rushRun.goals >= 5,
    }),
  };
  // the Penalty Rush stop of an active Arcade Cup settles from this gauntlet
  const prog = withCupProgress(next, 'rush', cupResultFromRush(rushRun.goals));
  next = prog.play;
  rushRun.cupAdvance = prog.advanced ? prog : null;
  setPlay(next);
  savePlay(next);
}

function rushCallout(run) {
  const last = run.kicks[run.kicks.length - 1];
  if (!last) return 'The keeper is set. Pick your corner.';
  const zone = RUSH_ZONE_LABELS[last.aim] || last.aim;
  if (run.over) {
    return last.outcome === 'save'
      ? `The keeper read it — gauntlet over at ${run.goals}.`
      : last.outcome === 'post'
        ? `Off the post — gauntlet over at ${run.goals}.`
        : `Full gauntlet — ${run.goals} buried.`;
  }
  if (last.outcome === 'goal') {
    return run.sudden
      ? `Buried ${zone}. Sudden death — keep scoring.`
      : `Kick ${last.n} — buried ${zone}. ${run.goals} in.`;
  }
  if (last.outcome === 'save') return `Kick ${last.n} — the keeper read your habit.`;
  return `Kick ${last.n} — off the post.`;
}

function rushDotsHTML(run) {
  const cells = [];
  for (let i = 0; i < Math.max(5, run.kicks.length); i++) {
    const k = run.kicks[i];
    const cls = !k ? 'pending' : k.outcome === 'goal' ? 'goal' : k.outcome === 'save' ? 'save' : 'post';
    const label = !k ? `Kick ${i + 1} pending` : `Kick ${i + 1}: ${k.outcome}`;
    cells.push(`<i class="rush-dot ${cls}${k && k.sudden ? ' sudden' : ''}" role="img" aria-label="${label}"></i>`);
  }
  return cells.join('');
}

function rushHTML(play) {
  const run = ensureRushRun();
  const rec = play.penaltyRush || null;
  const today = localDayKey();
  const sameDay = rec && rec.dateKey === today;
  const bestToday = sameDay ? rec.bestToday || 0 : 0;
  const last = run.kicks[run.kicks.length - 1] || null;
  const perfect = run.over && run.goals >= 5;
  const personalBest = run.over && run.goals > 0 && run.goals >= ((rec && rec.bestEver) || 0);
  const newBest = run.over && run.goals > 0 && run.goals >= bestToday;
  const side = currentSide(play);
  const target = Math.max(bestToday, (rec && rec.bestEver) || 0);
  return `<section class="play-card rush${side ? ' has-side' : ''}" aria-label="Penalty Rush"${side ? ` style="--side:${TEAM_COLORS[side.code] || 'var(--gold)'}"` : ''}>
    <div class="rush-head">
      <div><h2 class="display">Penalty Rush</h2>
      <p class="play-sub">Daily Gauntlet · five kicks against a keeper who studies your habits. Local practice only, nothing real at risk.</p></div>
      <span class="sim-badge">SIMULATION</span>
    </div>
    ${side ? `<p class="rush-side">${teamFlag(side.code)} <b>${esc(teamName(side.code))}</b> step up — every strike wears your colours</p>` : ''}
    <div class="rush-chips" role="group" aria-label="Gauntlet record">
      <span class="rush-chip"><b>${bestToday}</b>best today</span>
      <span class="rush-chip"><b>${(rec && rec.bestEver) || 0}</b>best ever</span>
      <span class="rush-chip"><b>${(rec && rec.perfects) || 0}</b>perfect fives</span>
    </div>
    <div class="rush-stage${last ? ' ' + last.outcome : ''}${run.sudden && !run.over ? ' sudden' : ''}">
      <div class="rush-goalframe" aria-hidden="true">
        <span class="rush-net"></span>
        <span class="rush-keeper${last ? ' dive-' + last.keeper : ''}"><em></em></span>
        ${last ? `<b class="rush-ball at-${last.aim} ${last.outcome}"></b>` : ''}
      </div>
      <p class="rush-callout" role="status" aria-live="polite">${esc(rushCallout(run))}</p>
    </div>
    <div class="rush-dots" aria-label="Kick record">${rushDotsHTML(run)}</div>
    ${!run.over && target > 0 ? `<p class="rush-target">Target: beat <b>${target}</b>${run.goals >= target ? ' — you are past it, keep going' : ''}</p>` : ''}
    ${run.over ? `<div class="rush-recap${perfect ? ' perfect' : ''}">
      <p class="rush-score"><strong class="display">${run.goals}</strong><span>${run.goals === 1 ? 'goal' : 'goals'} tonight</span></p>
      <p class="rush-rating">${esc(rushRating(run.goals))}${perfect ? ' · perfect five' : ''}</p>
      ${personalBest ? '<p class="rush-newbest">Personal best — kept on this phone</p>'
    : newBest ? '<p class="rush-newbest">New daily best — kept on this phone</p>' : ''}
      ${cupAdvanceHTML(run.cupAdvance)}
      <div class="play-actions">
        <button class="play-btn gold" id="rush-again">${run.goals > 0 && !personalBest ? `Beat your ${(rec && rec.bestEver) || 0} — run it again` : 'Step up again'}</button>
        <button class="play-btn quiet" data-goto="lobby">Back to Lobby</button>
      </div>
    </div>` : `<div class="rush-aims" role="group" aria-label="Pick your corner">
      <button class="rush-aim" data-rush-aim="left">Low left</button>
      <button class="rush-aim" data-rush-aim="centre">Middle</button>
      <button class="rush-aim" data-rush-aim="right">Low right</button>
    </div>`}
    <p class="lab-saved-note">Seeded daily on this phone · the keeper never sees your pick, only your habits.</p>
  </section>`;
}

function wireRush(outlet) {
  outlet.querySelectorAll('[data-rush-aim]').forEach((b) => {
    b.addEventListener('click', () => {
      const run = ensureRushRun();
      if (run.over) return;
      unlockAudioFromGesture();
      const kick = rushShoot(run, b.dataset.rushAim);
      if (!kick) return;
      labSound(kick.outcome === 'goal' ? 'pen-goal' : kick.outcome === 'save' ? 'pen-save' : 'pen-miss');
      if (run.over) finishRush();
      repaintPlay();
    });
  });
  const again = outlet.querySelector('#rush-again');
  if (again) {
    again.addEventListener('click', () => {
      rushRun = null; // next attempt draws the day's next deterministic seed
      ensureRushRun();
      unlockAudioFromGesture();
      repaintPlay();
    });
  }
}

/* ================= Final Minute =================
   The clutch challenge: your side, six minutes left, three calls. A seeded,
   deterministic scenario resolves Win / Draw / Defeat from your seat and
   feeds your local side record. Entirely local — no network, no official
   claims, nothing real at risk. */

export const FM_SCENARIOS = [
  { id: 'protect', name: 'Protect the lead', you: 1, them: 0, brief: 'You lead by one. Survive six minutes.' },
  { id: 'edge', name: 'Find the winner', you: 1, them: 1, brief: 'Level game. One moment decides the night.' },
  { id: 'rescue', name: 'Rescue the night', you: 0, them: 1, brief: 'One down. Chase it without dying twice.' },
];

export const FM_STEPS = [
  {
    clock: "88'", prompt: 'Six minutes left. Set the shape.',
    options: [
      { id: 'shut', label: 'Shut it down', you: 0.5, them: 0.62 },
      { id: 'hold', label: 'Hold our shape', you: 0.9, them: 0.9 },
      { id: 'hunt', label: 'Go hunting', you: 1.5, them: 1.4 },
    ],
  },
  {
    clock: "90+1'", prompt: 'The board says five. Next call.',
    options: [
      { id: 'restarts', label: 'Kill every restart', you: 0.55, them: 0.6 },
      { id: 'fresh', label: 'Fresh legs wide', you: 1.15, them: 0.95 },
      { id: 'overload', label: 'Overload the left', you: 1.45, them: 1.3 },
    ],
  },
  {
    clock: "90+4'", prompt: 'Last action of the night.',
    options: [
      { id: 'wall', label: 'Everyone behind the ball', you: 0.4, them: 0.55 },
      { id: 'break', label: 'Spring one counter', you: 1.1, them: 0.85 },
      { id: 'forward', label: 'Send everyone forward', you: 1.7, them: 1.6 },
    ],
  },
];

const FM_STEP_MINUTES = [["88'", "89'", "90'"], ["90+1'", "90+2'", "90+3'"], ["90+4'", "90+5'", "90+6'"]];

export function dailyFinalMinuteSeed(dateKey = localDayKey(), attempt = 0) {
  return hashSeed(`u26-fm-${dateKey}-${attempt}`) || 1;
}

export function createFinalMinute(seed, you, opp) {
  const s = (seed >>> 0) || 1;
  return {
    seed: s,
    rng: mulberry32(s),
    you, opp,
    scenario: FM_SCENARIOS[s % FM_SCENARIOS.length],
    gYou: FM_SCENARIOS[s % FM_SCENARIOS.length].you,
    gThem: FM_SCENARIOS[s % FM_SCENARIOS.length].them,
    step: 0, choices: [], events: [], over: false, result: null,
  };
}

/** One tactical call. Deterministic for a given seed + choice history;
    resolves a window of chances, then either asks again or ends the night. */
export function finalMinuteDecide(run, optionId) {
  if (!run || run.over) return null;
  const step = FM_STEPS[run.step];
  const opt = step && step.options.find((o) => o.id === optionId);
  if (!opt) return null;
  run.choices.push(optionId);
  const edge = ((RATINGS[run.you] || 70) - (RATINGS[run.opp] || 70)) / 40;
  const youRate = Math.max(0.03, 0.17 * (1 + edge) * opt.you);
  const themRate = Math.max(0.03, 0.17 * (1 - edge) * opt.them);
  const minutes = FM_STEP_MINUTES[run.step];
  const resolved = [];
  for (let w = 0; w < 3; w++) {
    const min = minutes[w];
    if (run.rng() < youRate) {
      run.gYou += 1;
      resolved.push({ min, side: 'you', type: 'goal', text: `GOAL — ${teamName(run.you)} strike (${run.gYou}–${run.gThem})` });
    } else if (run.rng() < themRate) {
      run.gThem += 1;
      resolved.push({ min, side: 'them', type: 'goal', text: `They score — ${teamName(run.opp)} (${run.gYou}–${run.gThem})` });
    } else if (run.rng() < 0.3) {
      const yours = run.rng() < 0.5 + edge * 0.3;
      resolved.push({
        min,
        side: yours ? 'you' : 'them',
        type: 'chance',
        text: yours ? `${teamName(run.you)} go close` : `${teamName(run.opp)} threaten — cleared`,
      });
    }
  }
  run.events.push(...resolved);
  run.step += 1;
  if (run.step >= FM_STEPS.length) {
    run.over = true;
    run.result = run.gYou > run.gThem ? 'W' : run.gYou < run.gThem ? 'L' : 'D';
    run.events.push({ min: "90+6'", side: 'you', type: 'final', text: 'Full-time whistle.' });
  }
  return resolved;
}

/** Fold a finished Final Minute into the local record — day-scoped attempts
    plus all-time totals, all derived from runs that actually happened. */
export function fmRecordAfter(rec, { dateKey, result }) {
  const sameDay = !!rec && rec.dateKey === dateKey;
  return {
    dateKey,
    attemptsToday: (sameDay ? rec.attemptsToday || 0 : 0) + 1,
    w: ((rec && rec.w) || 0) + (result === 'W' ? 1 : 0),
    l: ((rec && rec.l) || 0) + (result === 'L' ? 1 : 0),
    d: ((rec && rec.d) || 0) + (result === 'D' ? 1 : 0),
    played: ((rec && rec.played) || 0) + 1,
    lastResult: result,
  };
}

// Live scenario — module-local, never persisted mid-run (same policy as labRun).
let fmRun = null;

function fmOpponentFor(play, sideCode) {
  const featured = currentFeaturedShowdown(play);
  return featured.home === sideCode ? featured.away : featured.home;
}

function ensureFmRun() {
  if (fmRun) return fmRun;
  const { play } = getState();
  const side = currentSide(play);
  if (!side) return null;
  const today = localDayKey();
  const rec = play.finalMinute;
  const attempt = rec && rec.dateKey === today ? rec.attemptsToday || 0 : 0;
  fmRun = createFinalMinute(dailyFinalMinuteSeed(today, attempt), side.code, fmOpponentFor(play, side.code));
  return fmRun;
}

function finishFm(run) {
  const { play } = getState();
  const side = currentSide(play);
  const entry = {
    at: new Date().toISOString(),
    seed: run.seed,
    scenario: run.scenario.id,
    you: run.you, opp: run.opp,
    gYou: run.gYou, gThem: run.gThem,
    result: run.result,
  };
  let next = {
    ...play,
    finalMinute: fmRecordAfter(play.finalMinute, { dateKey: localDayKey(), result: run.result }),
    fmHistory: [entry, ...(play.fmHistory || [])].slice(0, 12),
    ...(side && side.code === run.you ? { sideStats: recordSideResult(play.sideStats, side.code, run.result) } : {}),
  };
  // the Final Minute stop of an active Arcade Cup settles from this scenario
  const prog = withCupProgress(next, 'clutch', run.result);
  next = prog.play;
  run.cupAdvance = prog.advanced ? prog : null;
  setPlay(next);
  savePlay(next);
}

const FM_VERDICT = {
  W: ['HELD — YOU WIN', 'The night is yours.'],
  D: ['ALL LEVEL', 'A point rescued from the fire.'],
  L: ['IT SLIPPED', 'Six minutes can be cruel.'],
};

function fmVerdictCopy(run) {
  if (run.result === 'W' && run.scenario.id === 'rescue') return ['TURNED AROUND', 'From one down to all three. Absurd.'];
  if (run.result === 'D' && run.scenario.id === 'protect') return ['THEY CLAWED ONE', 'The lead slipped at the death.'];
  return FM_VERDICT[run.result] || FM_VERDICT.D;
}

function fmHTML(play) {
  const side = currentSide(play);
  if (!side) {
    return `<section class="play-card fm" aria-label="Final Minute">
      <div class="rush-head">
        <div><h2 class="display">Final Minute</h2>
        <p class="play-sub">Six minutes, three calls, one verdict. This challenge needs a side to fight for.</p></div>
        <span class="sim-badge">SIMULATION</span>
      </div>
      <button class="play-btn gold" id="fm-pickside">Pick your side</button>
    </section>`;
  }
  const run = ensureFmRun();
  const rec = play.finalMinute || null;
  const step = run.over ? null : FM_STEPS[run.step];
  const sideColor = TEAM_COLORS[side.code] || 'var(--gold)';
  const verdict = run.over ? fmVerdictCopy(run) : null;
  return `<section class="play-card fm${run.over ? ` over r-${run.result.toLowerCase()}` : ''}" aria-label="Final Minute" style="--side:${sideColor}">
    <div class="rush-head">
      <div><h2 class="display">Final Minute</h2>
      <p class="play-sub">${esc(run.scenario.name)} · ${esc(run.scenario.brief)} Local scenario only — never a real result.</p></div>
      <span class="sim-badge">SIMULATION</span>
    </div>
    <div class="fm-stage">
      <div class="fm-clock" aria-live="polite">${run.over ? 'FULL TIME' : esc(step.clock)}</div>
      <div class="fm-score-row">
        <div class="fm-team you">${teamFlag(run.you)}<span>${esc(teamName(run.you))}</span><em class="lab-you-tag">You</em></div>
        <div class="fm-score">${run.gYou}<span class="lab-sep">–</span>${run.gThem}</div>
        <div class="fm-team">${teamFlag(run.opp)}<span>${esc(teamName(run.opp))}</span></div>
      </div>
      ${run.over ? `<div class="fm-verdict" role="status">
        <strong class="display">${esc(verdict[0])}</strong>
        <span>${esc(verdict[1])}</span>
      </div>` : ''}
    </div>
    <ol class="lab-feed fm-feed" aria-live="polite" aria-label="Final minutes">
      ${run.events.slice(-6).map((e) => `<li class="lab-ev ${e.type === 'goal' ? 'goal' : 'chance'} fm-${e.side}"><span class="lab-ev-min">${esc(e.min)}</span><span class="lab-ev-ic">${e.type === 'goal' ? '●' : '○'}</span>${esc(e.text)}</li>`).join('')}
    </ol>
    ${!run.over ? `<div class="fm-choice" role="group" aria-label="${esc(step.prompt)}">
      <p class="lab-decision-prompt">${esc(step.prompt)}</p>
      <div class="lab-decision-opts">
        ${step.options.map((o) => `<button class="lab-opt" data-fm-choice="${o.id}">${esc(o.label)}</button>`).join('')}
      </div>
    </div>` : `<div class="fm-recap">
      ${cupAdvanceHTML(run.cupAdvance)}
      ${rec ? `<p class="fm-record">Final Minute record: <b>${rec.w}W–${rec.l}L–${rec.d}D</b> on this phone</p>` : ''}
      <div class="play-actions">
        <button class="play-btn gold" id="fm-again">Run it again</button>
        <button class="play-btn quiet" data-goto="lobby">Back to Lobby</button>
      </div>
    </div>`}
    <p class="lab-saved-note">Seeded daily on this phone · results count toward your local side record only.</p>
  </section>`;
}

function wireFm(outlet) {
  const pick = outlet.querySelector('#fm-pickside');
  if (pick) {
    pick.addEventListener('click', () => {
      sidePickerOpen = true;
      setPlayMode('lobby');
      repaintPlay();
    });
  }
  outlet.querySelectorAll('[data-fm-choice]').forEach((b) => {
    b.addEventListener('click', () => {
      const run = ensureFmRun();
      if (!run || run.over) return;
      unlockAudioFromGesture();
      const resolved = finalMinuteDecide(run, b.dataset.fmChoice) || [];
      const goal = resolved.find((e) => e.type === 'goal');
      if (goal) labSound(goal.side === 'you' ? 'goal' : 'var-overturned');
      else labSound('ref');
      if (run.over) {
        labSound('final');
        finishFm(run);
      }
      repaintPlay();
    });
  });
  const again = outlet.querySelector('#fm-again');
  if (again) {
    again.addEventListener('click', () => {
      fmRun = null; // next attempt draws the day's next deterministic seed
      ensureFmRun();
      unlockAudioFromGesture();
      repaintPlay();
    });
  }
}

/* ================= Coach's Call =================
   The tactical minigame: one match situation, two calls from the dugout,
   a deterministic local sim resolves the night. Team sim styles matter —
   your arcade identity reads (or gets read by) the opponent's. Entirely
   local: seeded, no network, no official claims. */

/* Every sim style reads exactly one other and is read by exactly one — a
   closed cycle, so no team identity is strictly better than another. */
export const CC_STYLE_BEATS = {
  'high press': 'possession weave',
  'possession weave': 'midfield strangle',
  'midfield strangle': 'direct running',
  'direct running': 'deep block steel',
  'deep block steel': 'box-crash chaos',
  'box-crash chaos': 'wing overloads',
  'wing overloads': 'counter surge',
  'counter surge': 'high press',
};

export function styleMatchup(yourStyle, theirStyle) {
  if (CC_STYLE_BEATS[yourStyle] === theirStyle) {
    return { edge: 0.06, tag: `your ${yourStyle} reads their ${theirStyle}` };
  }
  if (CC_STYLE_BEATS[theirStyle] === yourStyle) {
    return { edge: -0.06, tag: `their ${theirStyle} punishes your ${yourStyle}` };
  }
  return { edge: 0, tag: 'the styles cancel out — the calls decide it' };
}

export const CC_SITUATIONS = [
  { id: 'response', name: 'Find a response', gYou: 0, gThem: 1, clock: "60'", brief: 'They lead from a set piece. The bench looks at you.' },
  { id: 'deadlock', name: 'Break the deadlock', gYou: 0, gThem: 0, clock: "62'", brief: 'Goalless and coiled. One idea wins this.' },
  { id: 'guard', name: 'Guard the lead', gYou: 1, gThem: 0, clock: "64'", brief: 'You lead by one. Half an hour of nerve to go.' },
];

export const CC_STEPS = [
  {
    prompt: 'Set the plan.',
    options: [
      { id: 'press', label: 'Press high', you: 1.5, them: 1.35, risk: 'bold' },
      { id: 'counter', label: 'Sit and counter', you: 1.05, them: 0.8, risk: 'measured' },
      { id: 'control', label: 'Control midfield', you: 0.95, them: 0.9, risk: 'safe' },
    ],
  },
  {
    prompt: "75'. Last big call from the dugout.",
    options: [
      { id: 'chaos', label: 'Chaos run — all forward', you: 1.65, them: 1.5, risk: 'bold' },
      { id: 'setpiece', label: 'Hunt set pieces', you: 1.2, them: 1.0, risk: 'measured' },
      { id: 'lock', label: 'Lock it down', you: 0.5, them: 0.62, risk: 'safe' },
    ],
  },
];

const CC_WINDOW_MINUTES = [["66'", "70'", "74'"], ["79'", "85'", "90+3'"]];

export function dailyCoachSeed(dateKey = localDayKey(), attempt = 0) {
  return hashSeed(`u26-cc-${dateKey}-${attempt}`) || 1;
}

export function createCoachCall(seed, you, opp) {
  const s = (seed >>> 0) || 1;
  const situation = CC_SITUATIONS[s % CC_SITUATIONS.length];
  return {
    seed: s,
    rng: mulberry32(s),
    you, opp,
    situation,
    matchup: styleMatchup(teamSimStyle(you), teamSimStyle(opp)),
    gYou: situation.gYou, gThem: situation.gThem,
    step: 0, choices: [], events: [], over: false, result: null,
  };
}

/** One dugout call. Deterministic for a given seed + choice history; resolves
    a window of chances, then either asks for the last call or ends the night. */
export function coachCallDecide(run, optionId) {
  if (!run || run.over) return null;
  const step = CC_STEPS[run.step];
  const opt = step && step.options.find((o) => o.id === optionId);
  if (!opt) return null;
  run.choices.push(optionId);
  const edge = ((RATINGS[run.you] || 70) - (RATINGS[run.opp] || 70)) / 40 + (run.matchup.edge || 0);
  const youRate = Math.max(0.04, 0.16 * (1 + edge) * opt.you);
  const themRate = Math.max(0.04, 0.16 * (1 - edge) * opt.them);
  const minutes = CC_WINDOW_MINUTES[run.step];
  const resolved = [];
  for (let w = 0; w < 3; w++) {
    const min = minutes[w];
    if (run.rng() < youRate) {
      run.gYou += 1;
      resolved.push({ min, side: 'you', type: 'goal', text: `GOAL — ${teamName(run.you)} make the call pay (${run.gYou}–${run.gThem})` });
    } else if (run.rng() < themRate) {
      run.gThem += 1;
      resolved.push({ min, side: 'them', type: 'goal', text: `They punish it — ${teamName(run.opp)} (${run.gYou}–${run.gThem})` });
    } else if (run.rng() < 0.32) {
      const yours = run.rng() < 0.5 + edge * 0.3;
      resolved.push({
        min,
        side: yours ? 'you' : 'them',
        type: 'chance',
        text: yours ? `${teamName(run.you)} carve a chance from the plan` : `${teamName(run.opp)} threaten — scrambled away`,
      });
    }
  }
  run.events.push(...resolved);
  run.step += 1;
  if (run.step >= CC_STEPS.length) {
    run.over = true;
    run.result = run.gYou > run.gThem ? 'W' : run.gYou < run.gThem ? 'L' : 'D';
    run.events.push({ min: "90+5'", side: 'you', type: 'final', text: 'Full-time whistle.' });
  }
  return resolved;
}

/** Fold a finished Coach's Call into the local record — same honest shape as
    the Final Minute record: day-scoped attempts plus all-time totals. */
export function ccRecordAfter(rec, { dateKey, result }) {
  const sameDay = !!rec && rec.dateKey === dateKey;
  return {
    dateKey,
    attemptsToday: (sameDay ? rec.attemptsToday || 0 : 0) + 1,
    w: ((rec && rec.w) || 0) + (result === 'W' ? 1 : 0),
    l: ((rec && rec.l) || 0) + (result === 'L' ? 1 : 0),
    d: ((rec && rec.d) || 0) + (result === 'D' ? 1 : 0),
    played: ((rec && rec.played) || 0) + 1,
    lastResult: result,
  };
}

/* ================= Arcade Cup =================
   The run layer that ties the arcade together: your side, four stops, one
   trophy. Each stop is one of the arcade's own games — the Cup only strings
   them into a road and keeps the medals. Entirely local: deterministic seed,
   no network, no official claims, no global rank. */

export const CUP_STOPS = [
  { id: 'call', name: "Coach's Call", mode: 'coach', desc: 'Two calls from the dugout swing the night.' },
  { id: 'rush', name: 'Penalty Rush', mode: 'shootout', desc: 'Five kicks. Bury four to take the stop.' },
  { id: 'clutch', name: 'Final Minute', mode: 'finalminute', desc: 'Six minutes, three calls, hold your nerve.' },
  { id: 'showdown', name: 'The Showdown', mode: 'lab', desc: 'A full broadcast night against your rival.' },
];

export const CUP_TROPHIES = {
  gold: { tier: 'gold', icon: '🏆', label: 'Gold Cup — perfect run' },
  silver: { tier: 'silver', icon: '🥈', label: 'Silver Cup' },
  bronze: { tier: 'bronze', icon: '🥉', label: 'Bronze Cup' },
  finisher: { tier: 'finisher', icon: '🎖️', label: 'Road Medal — run complete' },
};

export function dailyCupSeed(dateKey = localDayKey(), side = 'ANY', attempt = 0) {
  return hashSeed(`u26-cup-${dateKey}-${side}-${attempt}`) || 1;
}

/** Four rivals for the road — drawn deterministically from the strongest
    sides that are not yours. Sim flavour only, never an official claim. */
export function cupRivals(seed, sideCode) {
  const pool = Object.keys(TEAMS)
    .filter((c) => c !== sideCode)
    .sort((a, b) => (RATINGS[b] || 70) - (RATINGS[a] || 70))
    .slice(0, 16);
  const rivals = [];
  for (let i = 0; rivals.length < 4 && i < 32; i++) {
    const pick = pool[hashSeed(`u26-cup-rival-${seed}-${i}`) % pool.length];
    if (!rivals.includes(pick)) rivals.push(pick);
  }
  return rivals;
}

export function createArcadeCup(sideCode, dateKey = localDayKey(), attempt = 0) {
  if (!sideCode || !TEAMS[sideCode]) return null;
  const seed = dailyCupSeed(dateKey, sideCode, attempt);
  return {
    seed, dateKey, attempt,
    side: sideCode,
    rivals: cupRivals(seed, sideCode),
    stops: { call: null, rush: null, clutch: null, showdown: null },
    startedAt: new Date().toISOString(),
    done: false,
    trophy: null,
  };
}

export function cupNextStop(cup) {
  if (!cup || cup.done) return null;
  const next = CUP_STOPS.find((s) => !cup.stops[s.id]);
  return next ? next.id : null;
}

export function cupWins(cup) {
  return CUP_STOPS.filter((s) => cup && cup.stops[s.id] === 'W').length;
}

export function cupTrophy(cup) {
  const w = cupWins(cup);
  return w >= 4 ? CUP_TROPHIES.gold : w === 3 ? CUP_TROPHIES.silver : w === 2 ? CUP_TROPHIES.bronze : CUP_TROPHIES.finisher;
}

/** A finished road gets a short, fact-derived memory line. No result or
    opponent is invented: every branch reads only the four settled stops. */
export function cupRunStory(cup) {
  const stops = cup && cup.stops ? cup.stops : {};
  const results = CUP_STOPS.map((s) => stops[s.id]).filter((v) => ['W', 'L', 'D'].includes(v));
  const wins = Number.isFinite(cup?.wins) ? cup.wins : results.filter((v) => v === 'W').length;
  if (results.length < CUP_STOPS.length) return 'Road still in progress.';
  if (wins === 4) return 'Perfect road — four stops, four wins.';
  if (stops.showdown === 'L' && stops.call === 'W' && stops.rush === 'W' && stops.clutch === 'W') {
    return 'Gold slipped away at the final stop.';
  }
  if (stops.call !== 'W' && stops.showdown === 'W') return 'Recovered from the opening stumble and closed under the lights.';
  if (stops.showdown === 'W') return 'Finished strong — the Showdown belongs to you.';
  if (wins >= 3) return 'One stop short of a perfect road.';
  if (wins >= 2) return 'A hard road, a trophy, and a story to answer.';
  return 'Finished the road. The next run starts fresh.';
}

/** All-time local Cup facts, optionally scoped to one side. History is already
    capped by persistence, so the summary stays small and deterministic. */
export function cupSeasonSummary(history = [], sideCode = null) {
  const runs = (Array.isArray(history) ? history : []).filter((c) => c && (!sideCode || c.side === sideCode));
  const totals = { W: 0, L: 0, D: 0 };
  let bestWins = 0;
  for (const run of runs) {
    const results = CUP_STOPS.map((s) => run.stops && run.stops[s.id]).filter((v) => v in totals);
    for (const result of results) totals[result] += 1;
    const wins = Number.isFinite(run.wins) ? run.wins : results.filter((v) => v === 'W').length;
    bestWins = Math.max(bestWins, wins);
  }
  return {
    runs: runs.length,
    perfect: runs.filter((c) => (c.trophy && c.trophy.tier === 'gold') || c.wins === 4).length,
    bestWins,
    stopWins: totals.W,
    stopLosses: totals.L,
    stopDraws: totals.D,
    form: runs.slice(0, 5).map((c) => Number.isFinite(c.wins)
      ? c.wins
      : CUP_STOPS.filter((s) => c.stops && c.stops[s.id] === 'W').length),
    latest: runs[0] || null,
  };
}

/** Record one stop result. Pure: returns the next cup, never mutates. Stops
    resolve strictly in road order; anything else is refused unchanged. */
export function cupRecordStop(cup, stopId, result) {
  if (!cup || cup.done || !['W', 'L', 'D'].includes(result)) return cup;
  if (cupNextStop(cup) !== stopId) return cup;
  const next = { ...cup, stops: { ...cup.stops, [stopId]: result } };
  if (!cupNextStop(next)) {
    next.done = true;
    next.trophy = cupTrophy(next);
  }
  return next;
}

/** Penalty Rush stop verdict: four or more goals takes the stop. */
export function cupResultFromRush(goals) {
  return goals >= 4 ? 'W' : goals === 3 ? 'D' : 'L';
}

/** Fold a finished arcade game into the active run. Pure on the play object:
    returns { play, advanced, done, trophy }. Only the run's current stop can
    advance, only for the side that started the run — everything else passes
    through untouched. A completed run archives itself into cupHistory. */
export function withCupProgress(play, stopId, result) {
  const cup = play && play.arcadeCup;
  const side = play && play.side && play.side.code;
  if (!cup || cup.done || !side || cup.side !== side) return { play, advanced: false, done: false, trophy: null };
  if (cupNextStop(cup) !== stopId || !['W', 'L', 'D'].includes(result)) {
    return { play, advanced: false, done: false, trophy: null };
  }
  const nextCup = cupRecordStop(cup, stopId, result);
  let cupHistory = play.cupHistory || [];
  if (nextCup.done) {
    cupHistory = [{
      at: new Date().toISOString(),
      side: cup.side, dateKey: cup.dateKey, seed: cup.seed,
      attempt: cup.attempt || 0,
      rivals: Array.isArray(cup.rivals) ? [...cup.rivals] : [],
      stops: { ...nextCup.stops },
      wins: cupWins(nextCup),
      trophy: nextCup.trophy,
    }, ...cupHistory].slice(0, 20);
  }
  return {
    play: { ...play, arcadeCup: nextCup, cupHistory },
    advanced: true,
    done: !!nextCup.done,
    trophy: nextCup.trophy || null,
    stopId,
    result,
  };
}

function startArcadeCup({ restart = false } = {}) {
  const { play } = getState();
  const side = currentSide(play);
  if (!side) return;
  const today = localDayKey();
  const prev = play.arcadeCup;
  const attempt = prev && prev.dateKey === today && prev.side === side.code
    ? (prev.attempt || 0) + (restart || prev.done ? 1 : 0)
    : 0;
  const cup = createArcadeCup(side.code, today, attempt);
  const next = { ...play, arcadeCup: cup };
  setPlay(next);
  savePlay(next);
}

/* Live Coach's Call — module-local, never persisted mid-run (labRun policy). */
let ccRun = null;

function activeCup(play) {
  const side = currentSide(play);
  const cup = play.arcadeCup;
  return side && cup && !cup.done && cup.side === side.code ? cup : null;
}

function ensureCcRun() {
  if (ccRun) return ccRun;
  const { play } = getState();
  const side = currentSide(play);
  if (!side) return null;
  const cup = activeCup(play);
  if (cup && cupNextStop(cup) === 'call') {
    ccRun = createCoachCall(hashSeed(`u26-cup-call-${cup.seed}`) || 1, side.code, cup.rivals[0]);
    return ccRun;
  }
  const today = localDayKey();
  const rec = play.coachCall;
  const attempt = rec && rec.dateKey === today ? rec.attemptsToday || 0 : 0;
  ccRun = createCoachCall(dailyCoachSeed(today, attempt), side.code, fmOpponentFor(play, side.code));
  return ccRun;
}

function finishCc(run) {
  const { play } = getState();
  const side = currentSide(play);
  const entry = {
    at: new Date().toISOString(),
    seed: run.seed,
    situation: run.situation.id,
    you: run.you, opp: run.opp,
    gYou: run.gYou, gThem: run.gThem,
    result: run.result,
  };
  let next = {
    ...play,
    coachCall: ccRecordAfter(play.coachCall, { dateKey: localDayKey(), result: run.result }),
    ccHistory: [entry, ...(play.ccHistory || [])].slice(0, 12),
    ...(side && side.code === run.you ? { sideStats: recordSideResult(play.sideStats, side.code, run.result) } : {}),
  };
  const prog = withCupProgress(next, 'call', run.result);
  next = prog.play;
  run.cupAdvance = prog.advanced ? prog : null;
  setPlay(next);
  savePlay(next);
}

const CC_VERDICT = {
  W: ['THE CALL LANDS', 'The dugout won this one.'],
  D: ['HONOURS EVEN', 'Neither bench blinked.'],
  L: ['OUT-COACHED', 'The plan got read tonight.'],
};

function ccVerdictCopy(run) {
  if (run.result === 'W' && run.situation.id === 'response') return ['TURNED AROUND', 'From behind to in front — pure dugout.'];
  if (run.result === 'L' && run.situation.id === 'guard') return ['IT SLIPPED', 'The lead died on your last call.'];
  return CC_VERDICT[run.result] || CC_VERDICT.D;
}

/* Cup progress banner shared by every stop recap — the "one more stop" pull. */
function cupAdvanceHTML(adv) {
  if (!adv) return '';
  const stop = CUP_STOPS.find((s) => s.id === adv.stopId);
  if (adv.done) {
    return `<div class="cup-advance done">
      <span class="cup-adv-kicker">Arcade Cup</span>
      <strong>${adv.trophy ? adv.trophy.icon + ' ' + esc(adv.trophy.label) : 'Run complete'}</strong>
      <button class="play-btn gold" data-goto="cup">Collect it in the Cup</button>
    </div>`;
  }
  return `<div class="cup-advance">
    <span class="cup-adv-kicker">Arcade Cup</span>
    <strong>${esc(stop ? stop.name : adv.stopId)} ${adv.result === 'W' ? 'cleared' : adv.result === 'D' ? 'held' : 'survived'} — the road goes on</strong>
    <button class="play-btn gold" data-goto="cup">Next stop</button>
  </div>`;
}

function coachHTML(play) {
  const side = currentSide(play);
  if (!side) {
    return `<section class="play-card fm cc" aria-label="Coach's Call">
      <div class="rush-head">
        <div><h2 class="display">Coach&rsquo;s Call</h2>
        <p class="play-sub">One situation, two calls from the dugout. This challenge needs a side to coach.</p></div>
        <span class="sim-badge">SIMULATION</span>
      </div>
      <button class="play-btn gold" id="cc-pickside">Pick your side</button>
    </section>`;
  }
  const run = ensureCcRun();
  const rec = play.coachCall || null;
  const step = run.over ? null : CC_STEPS[run.step];
  const sideColor = TEAM_COLORS[side.code] || 'var(--gold)';
  const verdict = run.over ? ccVerdictCopy(run) : null;
  return `<section class="play-card fm cc${run.over ? ` over r-${run.result.toLowerCase()}` : ''}" aria-label="Coach's Call" style="--side:${sideColor}">
    <div class="rush-head">
      <div><h2 class="display">Coach&rsquo;s Call</h2>
      <p class="play-sub">${esc(run.situation.name)} · ${esc(run.situation.brief)} Local scenario only — never a real result.</p></div>
      <span class="sim-badge">SIMULATION</span>
    </div>
    <div class="fm-stage">
      <div class="fm-clock" aria-live="polite">${run.over ? 'FULL TIME' : esc(run.step === 0 ? run.situation.clock : "75'")}</div>
      <div class="fm-score-row">
        <div class="fm-team you">${teamFlag(run.you)}<span>${esc(teamName(run.you))}</span><em class="lab-you-tag">You</em></div>
        <div class="fm-score">${run.gYou}<span class="lab-sep">–</span>${run.gThem}</div>
        <div class="fm-team">${teamFlag(run.opp)}<span>${esc(teamName(run.opp))}</span></div>
      </div>
      ${run.over ? `<div class="fm-verdict" role="status">
        <strong class="display">${esc(verdict[0])}</strong>
        <span>${esc(verdict[1])}</span>
      </div>` : ''}
    </div>
    <p class="cc-matchup">${esc(teamSimStyle(run.you))} <em>v</em> ${esc(teamSimStyle(run.opp))} — ${esc(run.matchup.tag)}</p>
    <ol class="lab-feed fm-feed" aria-live="polite" aria-label="Match events">
      ${run.events.slice(-6).map((e) => `<li class="lab-ev ${e.type === 'goal' ? 'goal' : 'chance'} fm-${e.side}"><span class="lab-ev-min">${esc(e.min)}</span><span class="lab-ev-ic">${e.type === 'goal' ? '●' : '○'}</span>${esc(e.text)}</li>`).join('')}
    </ol>
    ${!run.over ? `<div class="fm-choice" role="group" aria-label="${esc(step.prompt)}">
      <p class="lab-decision-prompt">${esc(step.prompt)}</p>
      <div class="lab-decision-opts cc-opts">
        ${step.options.map((o) => `<button class="lab-opt" data-cc-choice="${o.id}"><span>${esc(o.label)}</span><em class="cc-risk ${o.risk}">${o.risk}</em></button>`).join('')}
      </div>
    </div>` : `<div class="fm-recap">
      ${cupAdvanceHTML(run.cupAdvance)}
      ${rec ? `<p class="fm-record">Dugout record: <b>${rec.w}W–${rec.l}L–${rec.d}D</b> on this phone</p>` : ''}
      <div class="play-actions">
        <button class="play-btn gold" id="cc-again">Take the touchline again</button>
        <button class="play-btn quiet" data-goto="lobby">Back to Lobby</button>
      </div>
    </div>`}
    <p class="lab-saved-note">Seeded on this phone · results count toward your local side record only.</p>
  </section>`;
}

function wireCoach(outlet) {
  const pick = outlet.querySelector('#cc-pickside');
  if (pick) {
    pick.addEventListener('click', () => {
      sidePickerOpen = true;
      setPlayMode('lobby');
      repaintPlay();
    });
  }
  outlet.querySelectorAll('[data-cc-choice]').forEach((b) => {
    b.addEventListener('click', () => {
      const run = ensureCcRun();
      if (!run || run.over) return;
      unlockAudioFromGesture();
      const resolved = coachCallDecide(run, b.dataset.ccChoice) || [];
      const goal = resolved.find((e) => e.type === 'goal');
      if (goal) labSound(goal.side === 'you' ? 'goal' : 'var-overturned');
      else labSound('ref');
      if (run.over) {
        labSound('final');
        finishCc(run);
      }
      repaintPlay();
    });
  });
  const again = outlet.querySelector('#cc-again');
  if (again) {
    again.addEventListener('click', () => {
      ccRun = null; // next attempt draws the day's next deterministic seed
      ensureCcRun();
      unlockAudioFromGesture();
      repaintPlay();
    });
  }
}

/* ---------------- Arcade Cup surface ---------------- */

function cupStopStateLabel(v, isNext) {
  if (v === 'W') return 'won';
  if (v === 'L') return 'lost';
  if (v === 'D') return 'held';
  return isNext ? 'up next' : 'locked';
}

function cupSeasonHTML(history, sideCode = null, className = '') {
  const season = cupSeasonSummary(history, sideCode);
  if (!season.runs) return '';
  const latestStory = season.latest ? cupRunStory(season.latest) : '';
  return `<section class="cup-season ${className}" aria-label="Arcade season">
    <div class="cup-season-head">
      <div><span class="cup-season-kicker">Arcade season · on this phone</span>
      <strong>${season.bestWins}/4 best road</strong></div>
      <span class="cup-season-form" aria-label="Last ${season.form.length} runs">
        ${season.form.map((wins) => `<i class="f-${wins}" title="${wins} of 4 stops won">${wins}</i>`).join('')}
      </span>
    </div>
    <div class="cup-season-stats" role="group" aria-label="Season record">
      <span><b>${season.runs}</b><small>${season.runs === 1 ? 'run' : 'runs'}</small></span>
      <span><b>${season.perfect}</b><small>perfect</small></span>
      <span><b>${season.stopWins}W–${season.stopLosses}L${season.stopDraws ? `–${season.stopDraws}D` : ''}</b><small>road record</small></span>
    </div>
    <p class="cup-season-story">${esc(latestStory)}</p>
  </section>`;
}

function cupHTML(play) {
  const side = currentSide(play);
  if (!side) {
    return `<section class="play-card cup" aria-label="Arcade Cup">
      <div class="rush-head">
        <div><h2 class="display">Arcade Cup</h2>
        <p class="play-sub">Four stops, one trophy, all on this phone. The road needs a side to run it.</p></div>
        <span class="sim-badge">SIMULATION</span>
      </div>
      <button class="play-btn gold" id="cup-pickside">Pick your side</button>
    </section>`;
  }
  const sideColor = TEAM_COLORS[side.code] || 'var(--gold)';
  const cup = play.arcadeCup && play.arcadeCup.side === side.code ? play.arcadeCup : null;
  const history = (play.cupHistory || []).filter((c) => c.side === side.code).slice(0, 4);
  if (!cup) {
    return `<section class="play-card cup" aria-label="Arcade Cup" style="--side:${sideColor}">
      <div class="rush-head">
        <div><h2 class="display">Arcade Cup</h2>
        <p class="play-sub">${teamFlag(side.code)} ${esc(teamName(side.code))} run a four-stop road — dugout call, penalty gauntlet, final-minute fire, then the Showdown. Win stops, take the trophy. Local run only.</p></div>
        <span class="sim-badge">SIMULATION</span>
      </div>
      <div class="cup-route preview">
        ${CUP_STOPS.map((s, i) => `<div class="cup-stop"><span class="cup-stop-n">${i + 1}</span><div><strong>${esc(s.name)}</strong><small>${esc(s.desc)}</small></div></div>`).join('')}
      </div>
      <div class="play-actions">
        <button class="play-btn gold" id="cup-start">Start today&rsquo;s run</button>
      </div>
      ${cupSeasonHTML(history, side.code)}
      ${history.length ? cupShelfHTML(history) : ''}
      <p class="lab-saved-note">Seeded daily on this phone · trophies are a local game prize, never money.</p>
    </section>`;
  }
  const next = cupNextStop(cup);
  const wins = cupWins(cup);
  const rivalName = (i) => teamName(cup.rivals[i] || cup.rivals[0]);
  return `<section class="play-card cup${cup.done ? ' done' : ''}" aria-label="Arcade Cup" style="--side:${sideColor}">
    <div class="rush-head">
      <div><h2 class="display">Arcade Cup</h2>
      <p class="play-sub">${teamFlag(side.code)} ${esc(teamName(side.code))} on the road · ${esc(cup.dateKey)}${cup.attempt ? ` · run ${cup.attempt + 1}` : ''} · local run only</p></div>
      <span class="sim-badge">SIMULATION</span>
    </div>
    ${cup.done ? `<div class="cup-final" role="status">
      <span class="cup-final-icon" aria-hidden="true">${cup.trophy ? cup.trophy.icon : '🎖️'}</span>
      <strong class="display">${esc(cup.trophy ? cup.trophy.label : 'Run complete')}</strong>
      <span>${wins} of 4 stops won · kept in your trophy room</span>
    </div>` : `<div class="cup-progress" role="group" aria-label="Run progress">
      ${CUP_STOPS.map((s) => `<i class="cup-dot ${cup.stops[s.id] ? cup.stops[s.id].toLowerCase() : s.id === next ? 'now' : 'wait'}" aria-label="${esc(s.name)}: ${esc(cupStopStateLabel(cup.stops[s.id], s.id === next))}"></i>`).join('')}
      <span class="cup-progress-label">${wins}W so far</span>
    </div>`}
    <div class="cup-route">
      ${CUP_STOPS.map((s, i) => {
    const v = cup.stops[s.id];
    const isNext = s.id === next;
    return `<div class="cup-stop ${v ? 'r-' + v.toLowerCase() : isNext ? 'now' : 'locked'}">
        <span class="cup-stop-n">${v === 'W' ? '✓' : v === 'L' ? '✗' : v === 'D' ? '=' : i + 1}</span>
        <div>
          <strong>${esc(s.name)}</strong>
          <small>${v ? `${cupStopStateLabel(v, false)} · v ${esc(rivalName(i))}` : isNext ? `v ${esc(rivalName(i))} — ${esc(s.desc)}` : esc(s.desc)}</small>
        </div>
        ${isNext && !cup.done ? `<button class="cup-play" data-cup-stop="${s.id}">Play</button>` : ''}
      </div>`;
  }).join('')}
    </div>
    <div class="play-actions">
      ${cup.done ? '<button class="play-btn gold" id="cup-restart">Run it again</button>' : `
      <button class="play-btn gold" data-cup-stop="${next}">Play stop ${CUP_STOPS.findIndex((s) => s.id === next) + 1} — ${esc(CUP_STOPS.find((s) => s.id === next).name)}</button>
      <button class="play-btn quiet" id="cup-restart">Restart run</button>`}
    </div>
    ${cupSeasonHTML(history, side.code)}
    ${history.length ? cupShelfHTML(history) : ''}
    <p class="lab-saved-note">Stops settle from the games you actually play · on this phone only.</p>
  </section>`;
}

function cupShelfHTML(history) {
  return `<div class="cup-shelf" aria-label="Recent runs">
    ${history.map((c) => `<span class="cup-medal t-${c.trophy ? c.trophy.tier : 'finisher'}" title="${esc(c.trophy ? c.trophy.label : 'Run complete')}">${c.trophy ? c.trophy.icon : '🎖️'} ${teamFlag(c.side)} ${c.wins}/4</span>`).join('')}
  </div>`;
}

function wireCup(outlet) {
  const pick = outlet.querySelector('#cup-pickside');
  if (pick) {
    pick.addEventListener('click', () => {
      sidePickerOpen = true;
      setPlayMode('lobby');
      repaintPlay();
    });
  }
  const start = outlet.querySelector('#cup-start');
  if (start) start.addEventListener('click', () => { startArcadeCup(); repaintPlay(); });
  const restart = outlet.querySelector('#cup-restart');
  if (restart) {
    restart.addEventListener('click', () => {
      ccRun = null; // a fresh road re-seeds the dugout stop
      startArcadeCup({ restart: true });
      repaintPlay();
    });
  }
  outlet.querySelectorAll('[data-cup-stop]').forEach((b) => {
    b.addEventListener('click', () => {
      const { play } = getState();
      const cup = activeCup(play);
      const stopId = b.dataset.cupStop;
      const stop = CUP_STOPS.find((s) => s.id === stopId);
      if (!cup || !stop) return;
      if (stopId === 'call') ccRun = null; // the Cup seeds the dugout stop
      if (stopId === 'showdown') {
        const side = currentSide(play);
        setPlayMode('lab');
        beginLab(side.code, cup.rivals[3], 'balanced', hashSeed(`u26-cup-showdown-${cup.seed}`) || 1);
        return;
      }
      setPlayMode(stop.mode);
    });
  });
}

/* ================= personal arcade ledger ================= */
// One player: you. Every number is derived from things that actually happened
// in this Play space — finished Lab runs, graded predictions, saved runs.
// Arcade Points are a private game score for local progression — game
// progression only, never money.

/** Official leaderboard points — settled ONLY from validated official results.
    Derived live, never stored, idempotent: the same official truth always
    yields the same total, so duplicate settlement cannot duplicate points. */
export function officialPickPoints(play, overlay) {
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
      .filter((e) => e.win && (e.extraStarted || e.pens)).length >= 3,
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

/* Tale of the tape — two rating bars facing off, each with its simulation
   identity. Arcade flavour, clearly sim-side; never an official claim. */
function tapeHTML(home, away) {
  const rh = RATINGS[home] || 70; const ra = RATINGS[away] || 70;
  const lo = 60; const hi = 95;
  const pct = (r) => Math.round(((r - lo) / (hi - lo)) * 100);
  return `<div class="lab-tape" id="lab-tape" aria-hidden="true">
    <div class="lab-tape-row">
      <span class="lab-tape-flag">${teamFlag(home)}</span>
      <div class="lab-tape-bar"><i style="width:${pct(rh)}%;background:${TEAM_COLORS[home] || 'var(--gold)'}"></i></div>
      <span class="lab-tape-style">${esc(teamSimStyle(home))}</span>
      <span class="lab-tape-num">${rh}</span>
    </div>
    <div class="lab-tape-row">
      <span class="lab-tape-flag">${teamFlag(away)}</span>
      <div class="lab-tape-bar"><i style="width:${pct(ra)}%;background:${TEAM_COLORS[away] || 'var(--gold)'}"></i></div>
      <span class="lab-tape-style">${esc(teamSimStyle(away))}</span>
      <span class="lab-tape-num">${ra}</span>
    </div>
  </div>`;
}

function labSetupHTML(play) {
  const last = (play.labHistory || [])[0];
  const featured = currentFeaturedShowdown(play);
  const side = currentSide(play);
  // your side takes the home bench by default; the featured pair fills in
  const home = side ? side.code : featured.home;
  const away = side
    ? (featured.home === side.code ? featured.away : featured.home)
    : featured.away;
  const sound = labSoundButtonModel();
  return `<section class="play-card lab lab-lobby" aria-label="Match Lab">
    <div class="lab-showdown-label">
      <span>Tonight’s Showdown</span>
      <small>${side ? 'Your side takes the stage · not a live fixture' : 'Daily featured simulation · not a live fixture'}</small>
    </div>
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
    <div class="lab-feature-actions">
      <button class="play-btn quiet" id="lab-shuffle">Shuffle exhibition</button>
      ${last ? `<button class="play-btn quiet" id="lab-runback">${teamFlag(last.home)} Run it back ${teamFlag(last.away)}</button>` : ''}
    </div>
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
    <div class="lab-start-row">
      <button class="play-btn gold lab-kick" id="lab-kickoff">Start Showdown</button>
      <button class="lab-sound" id="lab-sound" aria-pressed="${sound.pressed}" data-sound="${sound.data}"${sound.disabled ? ' disabled' : ''}>${sound.label}</button>
    </div>
    ${last ? `<p class="lab-last">Last time: ${teamFlag(last.home)} ${last.gh}–${last.ga}${last.pens ? ' (' + last.pens.ph + '–' + last.pens.pa + 'p)' : ''} ${teamFlag(last.away)} · <span class="grug-line">${esc(last.line || '')}</span></p>` : ''}
  </section>`;
}

function labEventIcon(type) {
  return type === 'goal' ? '●'
    : type === 'pens' || type === 'penalty' ? '◐'
      : type === 'extra' || type === 'interval' ? 'ET'
      : type === 'var' || type === 'confirmed' || type === 'overturned' ? '◇'
      : type === 'decision' ? '▸'
        : type === 'whistle' ? '♪'
          : type === 'card' ? '▮'
            : type === 'red' ? '▮'
              : type === 'sub' ? '⇄'
                : type === 'board' ? '➍'
                  : type === 'save' ? '▣'
                    : type === 'free' ? '⌁'
                      : type === 'note' ? '≈'
                  : '○';
}

/** Regulation stoppage is 90+; extra time shows 91-120, then 120+. */
function minLabel(min, phase = 'reg') {
  const p = String(phase || 'reg');
  if (p.startsWith('et') || p === 'pens') return min > 120 ? '120+' + (min - 120) : String(min);
  return min > 90 ? '90+' + (min - 90) : String(min);
}

function labPossessionPct(run) {
  return run.minute ? Math.round(Math.max(28, Math.min(72, ((run.possAcc || run.minute / 2) / run.minute) * 100))) : 50;
}

function labClockHTML(run) {
  if (run.done) return '<span class="lab-ft-stamp">FULL TIME</span>';
  if (run.phase === 'pens') return '<span class="lab-ft-stamp">PENALTIES</span>';
  if (run.phase === 'et-decision' || run.phase === 'et-ready') return '<span class="lab-ft-stamp">EXTRA TIME</span>';
  return `${minLabel(run.minute, run.phase)}&prime;`;
}

function labPhaseBadge(run) {
  if (run.phase === 'pens') return 'Penalty shootout';
  if (run.phase === 'et-decision' || run.phase === 'et-ready' || run.phase === 'et1' || run.phase === 'et2') return 'Extra time';
  return '';
}

function shootoutLabel(run) {
  if (!run.pens && !run.shootout) return '';
  const kick = run.currentKick;
  const count = kick ? ` · ${kick.side === 'h' ? teamName(run.home) : teamName(run.away)} kick ${kick.n}` : '';
  const score = run.pens ? `${run.pens.ph}–${run.pens.pa}` : '0–0';
  return `Penalties ${score}${count}`;
}

function labPitchHTML(run) {
  const ball = run.ball || { x: 50, y: 50, side: 'h', kind: 'possession' };
  const homePlayers = activeFormation('h', run);
  const awayPlayers = activeFormation('a', run);
  const possH = labPossessionPct(run);
  const kits = resolveLabTeamColors(run.home, run.away);
  const marker = (p, side) => `<i class="pitch-player ${side === 'h' ? 'home' : 'away'}${ball.side === side && ball.from === p.role ? ' has-ball' : ''}" data-key="${side}-${p.role}" data-player-side="${side === 'h' ? 'home' : 'away'}" data-role="${p.role}" title="${esc(p.label)}" style="left:${p.x.toFixed(1)}%;top:${p.y.toFixed(1)}%"><em>${p.role === 'GK' ? '1' : ''}</em></i>`;
  return `<div class="lab-pitch ${kits.pitchClass}" aria-label="Animated pitch simulation" style="--mo:${(run.mo || 0).toFixed(2)};--h-label:${kits.home.markerInk};--a-label:${kits.away.markerInk};--h-ring:${kits.home.markerRing};--a-ring:${kits.away.markerRing};--h-gk-ring:${kits.home.keeperRing};--a-gk-ring:${kits.away.keeperRing};--ball:${kits.ball.color};--ball-ring:${kits.ball.ring}">
    <i class="pitch-zone home" data-zone="h" style="opacity:${Math.max(0, run.mo || 0).toFixed(2)}"></i>
    <i class="pitch-zone away" data-zone="a" style="opacity:${Math.max(0, -(run.mo || 0)).toFixed(2)}"></i>
    <span class="pitch-line halfway"></span><span class="pitch-box left"></span><span class="pitch-box right"></span>
    <span class="pitch-centre"></span>
    ${homePlayers.map((p) => marker(p, 'h')).join('')}
    ${awayPlayers.map((p) => marker(p, 'a')).join('')}
    <b class="pitch-ball ${ball.kind || 'possession'}" data-ball data-kind="${ball.kind || 'possession'}" style="left:${ball.x.toFixed(1)}%;top:${ball.y.toFixed(1)}%"></b>
    <div class="pitch-counts"><span>${possH}% poss · ${run.sh} shots</span><span>${100 - possH}% · ${run.sa} shots</span></div>
  </div>`;
}

function labBannersHTML(goalLive, checking, redLive) {
  return `${goalLive ? '<div class="lab-goal-banner" aria-hidden="true">GOAL</div>' : ''}${
    checking ? '<div class="lab-var-banner" role="status">Checking</div>' : ''}${
    redLive ? '<div class="lab-card-banner" role="status">RED CARD</div>' : ''}`;
}

function labFeedItemsHTML(run) {
  return run.events.slice(-7).map((e) => `<li class="lab-ev ${e.type}"><span class="lab-ev-min">${minLabel(e.min, e.phase)}&prime;</span><span class="lab-ev-ic">${labEventIcon(e.type)}</span>${esc(e.text)}</li>`).join('');
}

function labRunHTML(run) {
  const kits = resolveLabTeamColors(run.home, run.away);
  const homeColor = kits.home.color;
  const awayColor = kits.away.color;
  const decision = run.decisionAt === 'ET' ? EXTRA_TIME_DECISION
    : run.decisionAt != null ? DECISIONS[run.decisionAt] : null;
  const moPct = ((run.mo + 1) / 2) * 100;
  const goalLive = !run.done && run.goalAt != null && run.minute - run.goalAt < 3;
  const last = run.events[run.events.length - 1] || null;
  const checking = last && last.type === 'var';
  const redLive = last && last.type === 'red' && run.minute - last.min < 4;
  const late = !run.done && run.minute >= 80 && Math.abs(run.gh - run.ga) <= 1;
  const sound = labSoundButtonModel();
  const phaseBadge = labPhaseBadge(run);
  const you = labPerspective(run, currentSide(getState().play)?.code);
  // stadium energy: tight late games and fresh goals raise the lights
  const closeness = 1 - Math.min(1, Math.abs(run.gh - run.ga) / 3);
  const energy = Math.min(1, 0.25 + (run.minute / 120) * 0.4 + closeness * 0.25 + (goalLive ? 0.35 : 0));
  return `<section class="play-card lab running${run.done ? ' done' : ''}${goalLive ? ' goal-live' : ''}${checking ? ' var-live' : ''}${late ? ' late-live' : ''}" aria-label="Match Lab simulation">
    <div class="lab-stage" style="--hc:${homeColor};--ac:${awayColor};--energy:${energy.toFixed(2)}">
      <div class="lab-banners" data-lab-banners>${labBannersHTML(goalLive, checking, redLive)}</div>
      <div class="lab-clock" aria-live="polite">${labClockHTML(run)}</div>
      ${phaseBadge ? `<div class="lab-phase-badge">${esc(phaseBadge)}</div>` : ''}
      <div class="lab-score-row">
        <div class="lab-team">${teamFlag(run.home)}<span>${esc(teamName(run.home))}</span>${you === 'h' ? '<em class="lab-you-tag">You</em>' : ''}</div>
        <div class="lab-score${goalLive ? ' flash' : ''}${run.done ? ' reveal' : ''}" id="lab-score" data-v="${run.gh}-${run.ga}">${run.gh}<span class="lab-sep">–</span>${run.ga}</div>
        <div class="lab-team away"><span>${esc(teamName(run.away))}</span>${teamFlag(run.away)}${you === 'a' ? '<em class="lab-you-tag">You</em>' : ''}</div>
      </div>
      <div class="lab-pens" data-lab-pens${run.pens || run.shootout ? '' : ' hidden'}>${esc(shootoutLabel(run))}</div>
      <div class="lab-momentum ${kits.momentumClass}" aria-hidden="true"><div class="lab-mo-fill" id="lab-mo" style="width:${moPct}%"></div></div>
      <div class="lab-mo-labels" aria-hidden="true"><span>${esc(teamName(run.home))}</span><span>momentum</span><span>${esc(teamName(run.away))}</span></div>
      ${labPitchHTML(run)}
    </div>
    ${!run.done ? `<div class="lab-pace" role="group" aria-label="Broadcast pace">
      ${LAB_PACE_OPTIONS.map(([p, label, short]) => `
        <button class="lab-pace-btn${labPace === p ? ' active' : ''}" data-pace="${p}" aria-label="${label}">${short}</button>`).join('')}
      <button class="lab-sound" id="lab-sound" aria-pressed="${sound.pressed}" data-sound="${sound.data}"${sound.disabled ? ' disabled' : ''}>${sound.label}</button>
    </div>` : ''}
    ${decision ? `<div class="lab-decision" role="group" aria-label="${esc(decision.prompt)}">
      <p class="lab-decision-prompt">${esc(decision.prompt)}</p>
      <div class="lab-decision-opts">
        ${decision.options.map((o) => `<button class="lab-opt" data-decide="${o.id}">${o.label}</button>`).join('')}
      </div>
    </div>` : ''}
    <ol class="lab-feed" id="lab-feed" aria-label="Match events" data-n="${run.events.length}">
      ${labFeedItemsHTML(run)}
    </ol>
    ${run.done ? labPayoffHTML(run) : ''}
  </section>`;
}

/* The night at a glance: every committed goal, red card, and penalty moment
   on one 0–FT strip. Derived from the run's own events — nothing invented. */
function labTimelineHTML(run) {
  const span = Math.max(run.minute || 90, 90);
  const marks = run.events.filter((e) => (e.type === 'goal' && !e.underReview)
    || e.type === 'confirmed' || e.type === 'red' || (e.type === 'penalty'));
  if (!marks.length) return '';
  return `<div class="lab-timeline" aria-label="Match timeline">
    <i class="lab-tl-track" aria-hidden="true"></i>
    ${marks.map((e) => {
    const kind = e.type === 'red' ? 'red' : e.type === 'penalty' ? 'pen' : 'goal';
    const pct = Math.max(1, Math.min(99, (e.min / span) * 100));
    return `<span class="lab-tl-mark ${kind} ${e.side === 'h' ? 'home' : 'away'}" style="left:${pct.toFixed(1)}%"
      title="${esc(minLabel(e.min, e.phase))}' ${esc(e.text)}"><em>${minLabel(e.min, e.phase)}'</em></span>`;
  }).join('')}
  </div>`;
}

/* Full-time payoff: story, points, streak, and a one-tap rematch. */
function labPayoffHTML(run) {
  const { play, real, sims } = getState();
  const ledger = arcadeLedger(play, real.overlay, sims);
  const streakLine = ledger.streak >= 2
    ? `${ledger.streak} lab wins in a row`
    : run.win ? 'Win streak: 1 — keep it alive' : 'Streak reset — one tap to respond';
  const possH = run.minute ? Math.round(Math.max(28, Math.min(72, ((run.possAcc || run.minute / 2) / run.minute) * 100))) : 50;
  // the verdict moment: when your side played, the night has a name
  const side = currentSide(play);
  const rec = run.result && side ? sideRecordFor(play, side.code) : null;
  const verdictHTML = run.result ? `<div class="lab-verdict ${run.result === 'W' ? 'won' : 'lost'}" role="status" style="--side:${TEAM_COLORS[side.code] || 'var(--gold)'}">
      <strong class="display">${run.result === 'W' ? 'YOU WIN' : 'DEFEAT'}</strong>
      <span>${teamFlag(side.code)} ${esc(teamName(side.code))} ${run.result === 'W' ? 'take the night' : 'will answer for this'}${run.pens ? ' — on kicks from the spot' : ''}</span>
      ${rec ? `<small>Local record ${rec.w}W–${rec.l}L${rec.d ? '–' + rec.d + 'D' : ''}${rec.streak >= 2 ? ` · 🔥${rec.streak} straight` : ''} · on this phone</small>` : ''}
    </div>` : '';
  const tags = run.tags || [];
  return `<div class="lab-payoff${run.win ? ' won' : ''}">
    ${verdictHTML}
    ${tags.length ? `<div class="lab-tags" aria-label="The night's honours">
      ${tags.map((t) => `<span class="lab-tag t-${t}">${esc(LAB_TAG_LABELS[t] || t)}</span>`).join('')}
    </div>` : ''}
    ${cupAdvanceHTML(run.cupAdvance)}
    <div class="lab-payoff-head">
      <span class="lab-payoff-cp">+${run.cp || 0} <em>Arcade Points</em></span>
      <span class="lab-payoff-streak">${esc(streakLine)}</span>
    </div>
    <div class="lab-boxscore" aria-label="Match numbers">
      <span>${run.sh}–${run.sa} shots</span><span>${possH}–${100 - possH} possession</span><span>${(run.ckh || 0)}–${(run.cka || 0)} corners</span><span>${run.events.filter((e) => e.type === 'card' || e.type === 'red').length} cards</span>
    </div>
    ${run.pens?.kicks ? `<div class="lab-shootout" aria-label="Penalty shootout sequence">
      ${run.pens.kicks.slice(-10).map((k) => `<span class="${k.scored ? 'scored' : 'miss'}">${k.side === 'h' ? teamFlag(run.home) : teamFlag(run.away)} ${k.scored ? '✓' : '×'}</span>`).join('')}
    </div>` : ''}
    ${labTimelineHTML(run)}
    ${run.turn ? `<p class="lab-turning"><span>Turning point</span>${minLabel(run.turn.min)}&prime; — ${esc(run.turn.text)}</p>` : ''}
    ${run.potm ? `<p class="lab-potm"><span>Player of the Match</span>${esc(run.potm)}</p>` : ''}
    ${run.story ? `<p class="lab-story">${esc(run.story)}</p>` : ''}
    <p class="grug-line">${esc(run.line || '')}</p>
    <div class="play-actions">
      <button class="play-btn gold" id="lab-again">${run.result === 'L' ? 'Rematch — answer this' : 'Rematch'}</button>
      <button class="play-btn quiet" id="lab-replay-night">Replay this exact night</button>
      <button class="play-btn quiet" id="lab-new">New matchup</button>
    </div>
    <p class="lab-saved-note">Saved to You · Arcade Points are only a local game score.</p>
  </div>`;
}

/* Targeted mid-run paint. Structural moments (decision, full time, red card,
   first render) swap the card once; every other beat only touches the small
   dynamic regions — clock, score, banners, feed, momentum — while the pitch
   scene and its 23 moving nodes persist untouched for the director. */
function paintLab() {
  if (typeof document === 'undefined') return;
  const card = document.querySelector('.play-view .lab.running');
  if (!card || !labRun) { repaintPlay(); return; }
  const run = labRun;
  const structural = run.done || run.paused || run.decisionAt != null || run.sceneDirty
    || !director.scene || director.scene.card !== card || !director.scene.pitch.isConnected;
  if (structural) {
    run.sceneDirty = false;
    const wrap = document.createElement('div');
    wrap.innerHTML = labRunHTML(run);
    card.replaceWith(wrap.firstElementChild);
    wireLab(document.querySelector('.play-view'));
    bindLabScene();
    startDirector();
    if (run.decisionAt != null || run.done) {
      const target = run.decisionAt != null
        ? document.querySelector('.play-view .lab-decision .lab-opt:last-child')
        : document.querySelector('.play-view .lab-payoff .play-actions');
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      }
    }
    return;
  }
  updateLabDynamic(run);
}

function updateLabDynamic(run) {
  const sc = director.scene;
  if (!sc) return;
  if (sc.clock && !run.done) sc.clock.innerHTML = labClockHTML(run);
  const scoreKey = `${run.gh}-${run.ga}`;
  if (sc.score && sc.score.dataset.v !== scoreKey) {
    sc.score.dataset.v = scoreKey;
    sc.score.innerHTML = `${run.gh}<span class="lab-sep">–</span>${run.ga}`;
    sc.score.classList.remove('flash');
    void sc.score.offsetWidth; // restart the goal-pop animation
    sc.score.classList.add('flash');
  }
  if (sc.mo) sc.mo.style.width = `${((((run.mo || 0) + 1) / 2) * 100).toFixed(1)}%`;
  const last = run.events[run.events.length - 1] || null;
  const goalLive = !run.done && run.goalAt != null && run.minute - run.goalAt < 3;
  const checking = !!last && last.type === 'var';
  const redLive = !!last && last.type === 'red' && run.minute - last.min < 4;
  const late = !run.done && run.minute >= 80 && Math.abs(run.gh - run.ga) <= 1;
  sc.card.classList.toggle('goal-live', goalLive);
  sc.card.classList.toggle('var-live', checking);
  sc.card.classList.toggle('late-live', late);
  if (sc.stage) {
    const closeness = 1 - Math.min(1, Math.abs(run.gh - run.ga) / 3);
    const energy = Math.min(1, 0.25 + (run.minute / 120) * 0.4 + closeness * 0.25 + (goalLive ? 0.35 : 0));
    sc.stage.style.setProperty('--energy', energy.toFixed(2));
    sc.stage.style.setProperty('--mo', (run.mo || 0).toFixed(2));
  }
  if (sc.banners) {
    const bannerKey = `${goalLive ? 'g' : ''}${checking ? 'v' : ''}${redLive ? 'r' : ''}`;
    if (sc.banners.dataset.state !== bannerKey) {
      sc.banners.dataset.state = bannerKey;
      sc.banners.innerHTML = labBannersHTML(goalLive, checking, redLive);
    }
  }
  if (sc.pens) {
    if (run.pens || run.shootout) {
      sc.pens.hidden = false;
      sc.pens.textContent = shootoutLabel(run);
    } else if (!sc.pens.hidden) {
      sc.pens.hidden = true;
      sc.pens.textContent = '';
    }
  }
  if (sc.feed && sc.feed.dataset.n !== String(run.events.length)) {
    sc.feed.dataset.n = String(run.events.length);
    sc.feed.innerHTML = labFeedItemsHTML(run);
  }
  if (sc.counts && sc.counts.length === 2) {
    const possH = labPossessionPct(run);
    sc.counts[0].textContent = `${possH}% poss · ${run.sh} shots`;
    sc.counts[1].textContent = `${100 - possH}% · ${run.sa} shots`;
  }
  const zones = sc.pitch.querySelectorAll('.pitch-zone');
  if (zones.length === 2) {
    zones[0].style.opacity = Math.max(0, run.mo || 0).toFixed(2);
    zones[1].style.opacity = Math.max(0, -(run.mo || 0)).toFixed(2);
  }
}

function labDebugAllowed() {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || window.location.search.includes('__wc26_e2e=1');
}

function forceLabMoment(type) {
  if (!labDebugAllowed()) return null;
  if (!labRun) createLabRun('USA', 'ARG', 'balanced', 260626);
  const run = labRun;
  stopLabTimer();
  run.paused = false;
  run.done = false;
  run.visualQueue = [];
  run.visual = null;
  run.shootout = null;
  run.currentKick = null;
  if (type !== 'pens' && type !== 'pens-red') run.pens = null;
  if (type !== 'final') run.finalQueued = false;
  if (type === 'open') {
    run.minute = Math.max(12, run.minute || 12);
    addLabEvent(run, 'pass', 'h', eventText('pass', 'h', run.home, run));
  } else if (type === 'goal') {
    run.minute = Math.max(82, run.minute || 82);
    run.sh += 1;
    addLabEvent(run, 'goal', 'h', `GOAL — ${teamName(run.home)} (${run.gh + 1}–${run.ga})`, { actor: 'ST', team: run.home, scoreDelta: true });
  } else if (type === 'var' || type === 'var-overturned') {
    run.minute = Math.max(63, run.minute || 63);
    run.sh += 1;
    addLabEvent(run, 'goal', 'h', `Goal? ${teamName(run.home)} wait on the check`, {
      actor: 'ST', team: run.home, scoreDelta: true, underReview: true, afterVar: true, verdict: type === 'var-overturned' ? 'overturned' : 'confirmed',
    });
  } else if (type === 'red') {
    run.minute = Math.max(67, run.minute || 67);
    addLabEvent(run, 'red', 'a', `RED CARD — ${teamName(run.away)} down to ten`, { actor: 'DM', redRole: 'DM' });
  } else if (type === 'pens') {
    run.minute = 120;
    run.phase = 'pens';
    run.gh = 1;
    run.ga = 1;
    startPenaltyShootout(run, [
      { side: 'h', n: 1, actor: 'ST', scored: true, outcome: 'goal', ph: 1, pa: 0, dir: 'left', hTaken: 1, aTaken: 0 },
      { side: 'a', n: 1, actor: 'ST', scored: true, outcome: 'goal', ph: 1, pa: 1, dir: 'right', hTaken: 1, aTaken: 1 },
      { side: 'h', n: 2, actor: 'LW', scored: true, outcome: 'goal', ph: 2, pa: 1, dir: 'right', hTaken: 2, aTaken: 1 },
      { side: 'a', n: 2, actor: 'LW', scored: false, outcome: 'save', ph: 2, pa: 1, dir: 'left', hTaken: 2, aTaken: 2 },
      { side: 'h', n: 3, actor: 'RW', scored: false, outcome: 'miss', ph: 2, pa: 1, dir: 'left', hTaken: 3, aTaken: 2 },
      { side: 'a', n: 3, actor: 'RW', scored: true, outcome: 'goal', ph: 2, pa: 2, dir: 'right', hTaken: 3, aTaken: 3 },
      { side: 'h', n: 4, actor: 'LM', scored: true, outcome: 'goal', ph: 3, pa: 2, dir: 'right', hTaken: 4, aTaken: 3 },
      { side: 'a', n: 4, actor: 'LM', scored: true, outcome: 'goal', ph: 3, pa: 3, dir: 'left', hTaken: 4, aTaken: 4 },
      { side: 'h', n: 5, actor: 'RM', scored: true, outcome: 'goal', ph: 4, pa: 3, dir: 'left', hTaken: 5, aTaken: 4 },
      { side: 'a', n: 5, actor: 'DM', scored: false, outcome: 'save', ph: 4, pa: 3, dir: 'right', hTaken: 5, aTaken: 5 },
    ]);
  } else if (type === 'pens-red') {
    run.minute = 120;
    run.phase = 'pens';
    run.gh = 1;
    run.ga = 1;
    run.redA = true;
    run.redRoleA = 'DM';
    startPenaltyShootout(run, [
      { side: 'h', n: 1, actor: 'ST', scored: true, outcome: 'goal', ph: 1, pa: 0, dir: 'left', hTaken: 1, aTaken: 0 },
      { side: 'a', n: 1, actor: 'ST', scored: false, outcome: 'save', ph: 1, pa: 0, dir: 'right', hTaken: 1, aTaken: 1 },
    ]);
  } else if (type === 'extra') {
    run.minute = 93;
    run.gh = 1;
    run.ga = 1;
    enterExtraTime(run);
  } else if (type === 'et-goal') {
    run.minute = Math.max(111, run.minute || 111);
    run.phase = 'et2';
    run.extraStarted = true;
    run.sh += 1;
    addLabEvent(run, 'goal', 'h', `GOAL — ${teamName(run.home)} (${run.gh + 1}–${run.ga})`, { actor: 'ST', team: run.home, scoreDelta: true });
  } else if (type === 'final') {
    run.minute = Math.max(93, run.minute || 93);
    if (run.gh === run.ga) run.gh += 1;
    if (!run.events.length) {
      const wasMuted = labMute;
      labMute = true;
      addLabEvent(run, 'whistle', 'h', 'Kick off.');
      labMute = wasMuted;
    }
    requestLabComplete(run);
  }
  paintLab();
  return {
    type,
    players: {
      home: activeFormation('h', run).length,
      away: activeFormation('a', run).length,
    },
    ball: run.ball,
    score: [run.gh, run.ga],
  };
}

function installLabDebug() {
  if (!labDebugAllowed()) return;
  window.__u26LabDebug = {
    start(home = 'USA', away = 'ARG', approach = 'balanced', seed = 260626) {
      beginLab(home, away, approach, seed);
      return forceLabMoment('open');
    },
    force: forceLabMoment,
    snapshot() {
      if (!labRun) return null;
      return {
        seed: labRun.seed,
        score: [labRun.gh, labRun.ga],
        done: labRun.done,
        players: {
          home: activeFormation('h', labRun).length,
          away: activeFormation('a', labRun).length,
        },
        ball: labRun.ball,
        visualTrace: labRun.visualTrace,
        shootout: labRun.pens ? { ph: labRun.pens.ph, pa: labRun.pens.pa, kicks: labRun.pens.kicks.length } : null,
        currentKick: labRun.currentKick || null,
        phase: labRun.phase,
        extraStarted: !!labRun.extraStarted,
        audio: labAudioDiagnostic(),
        events: labRun.events.slice(-8).map((e) => e.type),
        pace: labPace,
        activeMajor: !!labRun.visual && isLabMajorMoment(labRun.visual.event),
        timingMs: {
          normal: estimateLabPlaybackMs(labRun.events, 'normal'),
          turbo: estimateLabPlaybackMs(labRun.events, 'fast'),
          key: estimateLabPlaybackMs(labRun.events, 'key'),
        },
      };
    },
    pace(p) {
      setLabPace(p);
      return labPace;
    },
    audio() {
      return labAudioDiagnostic();
    },
  };
}

installLabDebug();

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
      <span class="prediction-chip">Local call</span>
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
    <p class="pr-board-note">Confirmed calls score on the global <b>World Cup Leaderboard</b> on the You tab — settled only from official results.</p>
  </section>`;
}

/* ================= Arcade Lobby ================= */

function formDots(form) {
  if (!form || !form.length) return '<span class="form-empty">no games yet</span>';
  return form.map((f) => `<i class="form-dot ${f === 'W' ? 'w' : 'l'}" aria-label="${f === 'W' ? 'Win' : 'Loss'}"></i>`).join('');
}

// Side picker sheet state — module-local UI state, discarded on navigation.
let sidePickerOpen = false;

/** You museum "Change side" lands here: open Play on the picker. */
export function openSidePicker() {
  sidePickerOpen = true;
  setPlayMode('lobby');
  repaintPlay();
}

function sidePickerHTML(play) {
  const side = currentSide(play);
  const codes = Object.keys(TEAMS).sort((a, b) => teamName(a).localeCompare(teamName(b)));
  return `<section class="play-card side-picker" aria-label="Pick your side">
    <div class="rush-head">
      <div><h2 class="display">Pick your side</h2>
      <p class="play-sub">Your team for the arcade — Match Lab, Final Minute, Penalty Rush. Local allegiance only; the real tournament never notices.</p></div>
      <button class="side-close" id="side-close" aria-label="Close team picker">×</button>
    </div>
    <div class="side-grid" role="group" aria-label="All 48 teams">
      ${codes.map((c) => `<button class="side-team${side && side.code === c ? ' on' : ''}" data-side-pick="${c}" style="--tc:${TEAM_COLORS[c] || 'var(--gold)'}">
        <span class="side-team-flag">${teamFlag(c)}</span>
        <span class="side-team-name">${esc(teamName(c))}</span>
        <span class="side-team-style">${esc(teamSimStyle(c))}</span>
      </button>`).join('')}
    </div>
    ${side ? '<button class="play-btn quiet" id="side-clear">Play without a side</button>' : ''}
  </section>`;
}

/* The side hero: your crest, your record, tonight's matchup — or the call to
   claim one. This is ownership, not officialdom: everything is local. */
function sideHeroHTML(play) {
  const side = currentSide(play);
  if (!side) {
    return `<button class="side-hero unclaimed" id="side-open" aria-label="Pick your side">
      <span class="lk-label">Pick your side</span>
      <span class="sh-cta">48 teams. One is yours.</span>
      <span class="lk-note">Claim a team for the arcade — every win and defeat starts counting.</span>
      <span class="sh-go" aria-hidden="true">Claim your team <b>→</b></span>
    </button>`;
  }
  const rec = sideRecordFor(play, side.code);
  const featured = currentFeaturedShowdown(play);
  const opp = featured.home === side.code ? featured.away : featured.home;
  return `<div class="side-hero claimed" style="--side:${TEAM_COLORS[side.code] || 'var(--gold)'}">
    <div class="sh-top">
      <span class="sh-flag" aria-hidden="true">${teamFlag(side.code)}</span>
      <div class="sh-id">
        <span class="lk-label">Your side · on this phone</span>
        <strong class="display">${esc(teamName(side.code))}</strong>
      </div>
      <button class="sh-change" id="side-open">Change</button>
    </div>
    <div class="sh-record" role="group" aria-label="Local record">
      <span class="sh-cell"><b>${rec.w}W–${rec.l}L${rec.d ? '–' + rec.d + 'D' : ''}</b><small>local record</small></span>
      <span class="sh-cell"><b>${rec.streak >= 2 ? '🔥' + rec.streak : rec.streak}</b><small>streak</small></span>
      <span class="sh-cell"><b>${rec.best}</b><small>best run</small></span>
    </div>
    <button class="lk-go sh-play" id="side-night">Play tonight: ${esc(teamName(side.code))} v ${esc(teamName(opp))}</button>
    <span class="lk-note">Daily featured simulation · not a live fixture</span>
  </div>`;
}

/* The run strip: the lobby's next best action. An active run says exactly
   where you are on the road; a finished run hands over the trophy; a claimed
   side with no run gets today's invitation. */
function cupStripHTML(play) {
  const side = currentSide(play);
  if (!side) return '';
  const cup = play.arcadeCup && play.arcadeCup.side === side.code ? play.arcadeCup : null;
  if (cup && !cup.done) {
    const next = cupNextStop(cup);
    const stop = CUP_STOPS.find((s) => s.id === next);
    const idx = CUP_STOPS.findIndex((s) => s.id === next) + 1;
    return `<button class="cup-strip active" data-goto="cup" style="--side:${TEAM_COLORS[side.code] || 'var(--gold)'}">
      <span class="lt-kicker">Arcade Cup · today&rsquo;s run</span>
      <strong>Stop ${idx} of 4 — ${esc(stop.name)}</strong>
      <span class="cup-progress" aria-hidden="true">
        ${CUP_STOPS.map((s) => `<i class="cup-dot ${cup.stops[s.id] ? cup.stops[s.id].toLowerCase() : s.id === next ? 'now' : 'wait'}"></i>`).join('')}
      </span>
      <small>Continue the run · v ${esc(teamName(cup.rivals[idx - 1] || cup.rivals[0]))}</small>
    </button>`;
  }
  if (cup && cup.done && cup.dateKey === localDayKey()) {
    return `<button class="cup-strip done" data-goto="cup" style="--side:${TEAM_COLORS[side.code] || 'var(--gold)'}">
      <span class="lt-kicker">Arcade Cup · run complete</span>
      <strong>${cup.trophy ? cup.trophy.icon + ' ' + esc(cup.trophy.label) : 'Run complete'}</strong>
      <small>Run it again — a fresh road is seeded</small>
    </button>`;
  }
  return `<button class="cup-strip start" data-goto="cup" style="--side:${TEAM_COLORS[side.code] || 'var(--gold)'}">
    <span class="lt-kicker">Arcade Cup</span>
    <strong>Four stops. One trophy.</strong>
    <small>Dugout call → penalty gauntlet → final-minute fire → the Showdown</small>
  </button>`;
}

/* Recent moment tape: a horizontal reel of the nights worth retelling —
   trophies, tagged wins, gauntlet bests. All derived from local history. */
function momentTapeHTML(play) {
  const chips = [];
  const cupLatest = (play.cupHistory || [])[0];
  if (cupLatest && cupLatest.trophy) {
    chips.push(`<span class="tape-chip t-${cupLatest.trophy.tier}">${cupLatest.trophy.icon} ${teamFlag(cupLatest.side)} ${esc(cupLatest.trophy.label)}</span>`);
  }
  for (const m of (play.labHistory || []).slice(0, 4)) {
    const tag = (m.tags || [])[0];
    chips.push(`<span class="tape-chip ${m.result === 'W' ? 'w' : m.result === 'L' ? 'l' : ''}">${teamFlag(m.home)} ${m.gh}–${m.ga} ${teamFlag(m.away)}${tag ? ` · ${esc(LAB_TAG_LABELS[tag] || tag)}` : ''}</span>`);
  }
  const cc = (play.ccHistory || [])[0];
  if (cc) chips.push(`<span class="tape-chip ${cc.result === 'W' ? 'w' : cc.result === 'L' ? 'l' : ''}">📋 Dugout ${cc.result === 'W' ? 'win' : cc.result === 'L' ? 'loss' : 'draw'} v ${teamFlag(cc.opp)}</span>`);
  const rush = play.penaltyRush;
  if (rush && rush.bestEver) chips.push(`<span class="tape-chip">◐ Gauntlet best ${rush.bestEver}</span>`);
  const fm = play.finalMinute;
  if (fm && fm.played) chips.push(`<span class="tape-chip">⏱ 90&rsquo;+ record ${fm.w}–${fm.l}–${fm.d}</span>`);
  if (!chips.length) return '';
  return `<div class="moment-tape" aria-label="Recent arcade moments">${chips.slice(0, 7).join('')}</div>`;
}

function lobbyHTML(overlay, play, sims) {
  const ledger = arcadeLedger(play, overlay, sims);
  const predStats = gradePredictions(play.predictions?.picks || {}, overlay);
  const lab = play.labHistory || [];
  const last = lab[0];
  const featured = currentFeaturedShowdown(play);
  const home = featured.home;
  const away = featured.away;
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
  const rushRec = play.penaltyRush || null;
  const rushBestToday = rushRec && rushRec.dateKey === localDayKey() ? rushRec.bestToday || 0 : 0;
  const side = currentSide(play);
  const fmRec = play.finalMinute || null;
  if (sidePickerOpen) return sidePickerHTML(play);
  return `<section class="play-card lobby" aria-label="Arcade lobby">
    ${sideHeroHTML(play)}
    ${cupStripHTML(play)}
    <div class="lobby-marquee" role="group" aria-label="Your arcade record">
      <div class="lm-stat cp"><strong class="display">${ledger.points}</strong><span>Arcade Points</span></div>
      <div class="lm-stat"><span class="lm-form">${formDots(ledger.form)}</span><span>Lab form</span></div>
      <div class="lm-stat"><strong>${ledger.streak >= 2 ? '🔥' + ledger.streak : ledger.streak}</strong><span>Win streak</span></div>
    </div>

    ${!side ? `<button class="lobby-kick" id="lobby-kick" style="--hc:${TEAM_COLORS[home] || 'var(--gold)'};--ac:${TEAM_COLORS[away] || 'var(--gold)'}">
      <span class="lk-label">Tonight’s Showdown</span>
      <span class="lk-tie">${teamFlag(home)} ${esc(teamName(home))} <em>v</em> ${esc(teamName(away))} ${teamFlag(away)}</span>
      <span class="lk-go">Start Showdown</span>
      <span class="lk-note">Daily featured simulation · not a live fixture</span>
    </button>` : ''}
    ${last ? `<button class="lobby-runback" id="lobby-runback">${teamFlag(last.home)} ${last.result === 'W' ? 'Defend the win' : last.result === 'L' ? 'Answer the defeat' : 'Run it back'} <b>${last.gh}–${last.ga}</b> ${teamFlag(last.away)}</button>` : ''}

    <button class="lobby-rush" data-goto="shootout">
      <span class="lt-kicker">Penalty Rush · Daily Gauntlet</span>
      <strong>${rushBestToday ? `Best today: ${rushBestToday} ${rushBestToday === 1 ? 'goal' : 'goals'}` : 'Five kicks. The keeper is reading you.'}</strong>
      <small>${rushRec && rushRec.bestEver ? `Best ever ${rushRec.bestEver} · step up` : 'New tonight — step up'}</small>
      <i class="lobby-rush-ball" aria-hidden="true"></i>
    </button>

    <div class="lobby-grid">
      <button class="lobby-tile fm-tile" data-goto="finalminute">
        <span class="lt-kicker">Final Minute</span>
        <strong>${fmRec && fmRec.played ? `${fmRec.w}W–${fmRec.l}L–${fmRec.d}D in the fire` : 'Six minutes. Three calls.'}</strong>
        <small>${side ? 'Hold on or turn it around — daily scenario' : 'Needs a side — pick yours first'}</small>
      </button>
      <button class="lobby-tile" data-goto="myworldcup">
        <span class="lt-kicker">My World Cup</span>
        <strong>${champion ? teamFlag(champion) + ' ' + esc(teamName(champion)) + ' reign' : simNext ? esc(STAGE_NAMES[simNext.stage]) + ' next' : 'Start a run'}</strong>
        <small>${champion ? 'Champion crowned — save or run it again' : simNext ? 'Your parallel tournament is mid-flight' : 'Pick winners, break brackets'}</small>
      </button>
      ${challenge && chSlots ? `<button class="lobby-tile" data-goto="prediction">
        <span class="lt-kicker">Tonight's challenge</span>
        <strong>${teamFlag(chSlots.home)} ${esc(teamName(chSlots.home))} v ${esc(teamName(chSlots.away))} ${teamFlag(chSlots.away)}</strong>
        <small>Call it before ${esc(formatKickoffTime(challenge.epoch))} · earn insight</small>
      </button>` : `<button class="lobby-tile" data-goto="prediction">
        <span class="lt-kicker">Prediction Run</span>
        <strong>${predStats.right}/${predStats.total} correct</strong>
        <small>${Object.keys(picks).length ? 'Review your calls' : 'Make your first call'}</small>
      </button>`}
      <button class="lobby-tile" data-goto="coach">
        <span class="lt-kicker">Coach&rsquo;s Call</span>
        <strong>${(play.coachCall && play.coachCall.played) ? `${play.coachCall.w}W–${play.coachCall.l}L–${play.coachCall.d}D from the dugout` : 'One situation. Two calls.'}</strong>
        <small>${side ? 'Your style against theirs — daily scenario' : 'Needs a side — pick yours first'}</small>
      </button>
      <button class="lobby-tile" data-goto="lab">
        <span class="lt-kicker">Match Lab</span>
        <strong>Any two teams, full broadcast</strong>
        <small>Momentum, decisions, extra time — your rules</small>
      </button>
    </div>

    ${momentTapeHTML(play)}

    <div class="lobby-season" aria-label="Season record">
      <span class="lt-kicker">Your season</span>
      <div class="season-grid">
        <span class="season-cell"><b>${bestWin ? `${teamFlag(bestWin.home)} ${bestWin.gh}–${bestWin.ga} ${teamFlag(bestWin.away)}` : '—'}</b><small>${bestWin ? 'record to beat' : 'no record yet — set one tonight'}</small></span>
        <span class="season-cell"><b>${ledger.wins}W–${ledger.played - ledger.wins}L</b><small>lab record</small></span>
        <span class="season-cell"><b>${(play.cupHistory || []).length ? (play.cupHistory || []).map((c) => (c.trophy ? c.trophy.icon : '🎖️')).slice(0, 3).join('') : predStats.right + '/' + predStats.total}</b><small>${(play.cupHistory || []).length ? 'cup shelf' : 'calls right'}</small></span>
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
      const featured = currentFeaturedShowdown(play);
      setPlayMode('lab');
      beginLab(featured.home, featured.away, 'balanced', featured.seed);
    });
  }
  const runback = outlet.querySelector('#lobby-runback');
  if (runback) {
    runback.addEventListener('click', () => {
      const { play } = getState();
      const last = (play.labHistory || [])[0];
      if (!last) return;
      setPlayMode('lab');
      beginLab(last.home, last.away, last.approach || 'balanced');
    });
  }
  // ---- your side: hero, nightly matchup, picker sheet ----
  const open = outlet.querySelector('#side-open');
  if (open) open.addEventListener('click', () => { sidePickerOpen = true; repaintPlay(); });
  const night = outlet.querySelector('#side-night');
  if (night) {
    night.addEventListener('click', () => {
      const { play } = getState();
      const side = currentSide(play);
      if (!side) return;
      const featured = currentFeaturedShowdown(play);
      const opp = featured.home === side.code ? featured.away : featured.home;
      const seed = hashSeed(`u26-side-night-${localDayKey()}-${side.code}-${opp}`) || 1;
      setPlayMode('lab');
      beginLab(side.code, opp, 'balanced', seed);
    });
  }
  const close = outlet.querySelector('#side-close');
  if (close) close.addEventListener('click', () => { sidePickerOpen = false; repaintPlay(); });
  outlet.querySelectorAll('[data-side-pick]').forEach((b) => {
    b.addEventListener('click', () => {
      chooseSide(b.dataset.sidePick);
      fmRun = null; // a new allegiance re-seeds tonight's scenario opponent
      ccRun = null;
      sidePickerOpen = false;
      repaintPlay();
    });
  });
  const clear = outlet.querySelector('#side-clear');
  if (clear) {
    clear.addEventListener('click', () => {
      chooseSide(null);
      fmRun = null;
      ccRun = null;
      sidePickerOpen = false;
      repaintPlay();
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
      const home = outlet.querySelector('#lab-home').value;
      const away = outlet.querySelector('#lab-away').value;
      const featured = currentFeaturedShowdown(getState().play);
      const seed = home === featured.home && away === featured.away ? featured.seed : undefined;
      beginLab(home, away, approach, seed);
    });
  }
  const shuffle = outlet.querySelector('#lab-shuffle');
  if (shuffle) {
    shuffle.addEventListener('click', () => {
      const { play } = getState();
      const today = localDayKey();
      const current = play.labFeatured?.dateKey === today ? play.labFeatured.shuffle || 0 : 0;
      const nextPlay = { ...play, labFeatured: { dateKey: today, shuffle: current + 1 } };
      setPlay(nextPlay);
      savePlay(nextPlay);
      repaintPlay();
    });
  }
  const runback = outlet.querySelector('#lab-runback');
  if (runback) {
    runback.addEventListener('click', () => {
      const last = (getState().play.labHistory || [])[0];
      if (last) beginLab(last.home, last.away, last.approach || 'balanced');
    });
  }
  const sound = outlet.querySelector('#lab-sound');
  if (sound) {
    sound.addEventListener('click', () => {
      const state = sound.dataset.sound;
      if (state === 'unavailable') return;
      if (state === 'on') {
        persistLabSound(false);
        updateAudioButtons();
        return;
      }
      persistLabSound(true);
      unlockAudioFromGesture();
      updateAudioButtons();
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
  const exact = outlet.querySelector('#lab-replay-night');
  if (exact) exact.addEventListener('click', () => { const r = labRun; beginLab(r.home, r.away, r.approach, r.seed); });
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
  else if (mode === 'shootout') body = rushHTML(play);
  else if (mode === 'finalminute') body = fmHTML(play);
  else if (mode === 'cup') body = cupHTML(play);
  else if (mode === 'coach') body = coachHTML(play);
  else body = lobbyHTML(real.overlay, play, sims);
  outlet.innerHTML = `<div class="view play-view">
    <header class="view-head"><p class="view-kicker gold">The Arcade</p><h1>Play</h1>
      <p class="view-sub">Private simulations · nothing here touches the real tournament</p></header>
    <div class="mode-rail">
    ${segmentedControl({
    id: 'play-mode', label: 'Play modes', value: mode,
    options: [
      { value: 'lobby', label: 'Lobby' },
      { value: 'cup', label: 'Arcade Cup', short: 'Cup' },
      { value: 'lab', label: 'Match Lab', short: 'Lab' },
      { value: 'shootout', label: 'Penalty Rush', short: 'Rush' },
      { value: 'finalminute', label: 'Final Minute', short: "90'+" },
      { value: 'coach', label: "Coach's Call", short: 'Coach' },
      { value: 'myworldcup', label: 'My World Cup', short: 'My Cup' },
      { value: 'prediction', label: 'Prediction Run', short: 'Predict' },
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
  if (mode === 'lab') {
    wireLab(outlet);
    // (re)bind the persistent pitch scene after any full render
    bindLabScene();
    startDirector();
  } else if (mode === 'myworldcup') wireMwc(outlet);
  else if (mode === 'prediction') wirePrediction(outlet);
  else if (mode === 'shootout') wireRush(outlet);
  else if (mode === 'finalminute') wireFm(outlet);
  else if (mode === 'cup') wireCup(outlet);
  else if (mode === 'coach') wireCoach(outlet);
  else wireLobby(outlet);
}
