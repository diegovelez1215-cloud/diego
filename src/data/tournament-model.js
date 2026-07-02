// United 2026 — derived real-world view models.
// Views never touch raw provider data; they consume these memoized models.
// Each model is cached per (view, overlay.version). A canonical/overlay update
// bumps the version and invalidates ONLY real-view models. Play never reads or
// writes anything here except through explicit deep copies.

import {
  allFixtures, allDayKeys, fixture, teamName, teamFlag, slotLabel,
  winnerFeeds, STAGE_NAMES, STAGE_ORDER,
} from '../core/canonical-truth.js';
import { todayKey, tomorrowKey, formatKickoffTime, formatDayKey, now } from '../core/time.js';
import { VENUES } from './fixtures.js';

const cache = new Map(); // `${view}` -> { key, model }
export const stats = { computes: 0 };

function memo(view, key, build) {
  const hit = cache.get(view);
  if (hit && hit.key === key) return hit.model;
  stats.computes++;
  const model = build();
  cache.set(view, { key, model });
  return model;
}

/** Test/diagnostic seam. */
export function clearModelCache() { cache.clear(); stats.computes = 0; }

/* ---------------- fixture view model ---------------- */

function sideModel(fx, slots, which) {
  const spec = which === 'home' ? fx.home : fx.away;
  const s = slots.get(fx.id);
  const code = s ? s[which] : null;
  return code
    ? { code, name: teamName(code), flag: teamFlag(code), pending: false }
    : { code: null, name: slotLabel(spec), flag: '', pending: true };
}

export function fixtureModel(fx, overlay) {
  const ov = overlay.byFixture.get(fx.id) || null;
  const home = sideModel(fx, overlay.slots, 'home');
  const away = sideModel(fx, overlay.slots, 'away');
  const status = ov ? ov.status : 'scheduled';
  const venue = VENUES[fx.venue] || null;
  // TRUTH GUARD (belt and braces over the overlay rules): a score can only be
  // shown between two resolved canonical identities. Placeholders stay scoreless.
  const identityResolved = !home.pending && !away.pending;
  return {
    id: fx.id,
    stage: fx.stage,
    stageName: fx.stage === 'group' ? 'Group ' + fx.group : STAGE_NAMES[fx.stage],
    group: fx.group,
    day: fx.day,
    epoch: fx.epoch,
    time: formatKickoffTime(fx.epoch),
    dateLabel: formatDayKey(fx.day),
    venueCity: fx.venue,
    stadium: venue ? venue[1] : '',
    home, away,
    status, // scheduled | live | hold | final
    live: status === 'live',
    final: status === 'final',
    gh: identityResolved && ov ? ov.gh : null,
    ga: identityResolved && ov ? ov.ga : null,
    min: ov ? ov.min : null,
    winner: identityResolved && ov ? ov.winner : null,
    scoreKnown: identityResolved && !!ov && ov.gh != null && ov.ga != null,
    feeds: winnerFeeds(fx.id),
  };
}

/* ---------------- per-view models ---------------- */

export function matchesModel(overlay) {
  return memo('matches', overlay.version + ':' + todayKey(), () => {
    const tKey = todayKey(); const mKey = tomorrowKey();
    const models = allFixtures().map((f) => fixtureModel(f, overlay));
    const byDay = new Map();
    for (const m of models) {
      if (!byDay.has(m.day)) byDay.set(m.day, []);
      byDay.get(m.day).push(m);
    }
    return {
      todayKey: tKey, tomorrowKey: mKey,
      today: byDay.get(tKey) || [],
      tomorrow: byDay.get(mKey) || [],
      days: [...byDay.entries()].map(([day, list]) => ({ day, label: formatDayKey(day), list })),
    };
  });
}

export function groupsModel(overlay) {
  return memo('groups', overlay.version, () => {
    const { groups, complete } = overlay.standings;
    return Object.keys(groups).sort().map((g) => ({
      group: g,
      complete: complete[g],
      rows: groups[g].map((t, i) => ({
        rank: i + 1, ...t, name: teamName(t.code), flag: teamFlag(t.code),
      })),
    }));
  });
}

export function knockoutModel(overlay) {
  return memo('knockout', overlay.version, () => {
    const rounds = [];
    for (const stage of STAGE_ORDER) {
      if (stage === 'group') continue;
      const list = allFixtures().filter((f) => f.stage === stage).map((f) => fixtureModel(f, overlay));
      rounds.push({ stage, name: STAGE_NAMES[stage], plural: stage === 'r32' || stage === 'r16', list });
    }
    return { rounds };
  });
}

export function matchCenterModel(id, overlay) {
  const fx = fixture(id);
  return fx ? fixtureModel(fx, overlay) : null;
}

/* ---------------- World Cup hub extras ---------------- */

/** "in 2h 14m" / "in 12m" / "kickoff imminent" for an upcoming epoch. */
function kickoffIn(epoch, t) {
  const ms = epoch - t;
  if (ms <= 60000) return 'kickoff imminent';
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  if (h >= 48) return 'in ' + Math.round(h / 24) + ' days';
  if (h >= 1) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

const ROAD_STAGES = ['r32', 'r16', 'qf', 'sf', 'final'];
const ROAD_LABELS = { r32: 'R32', r16: 'R16', qf: 'QF', sf: 'SF', final: 'Final' };

/**
 * Road to the Final snapshot: per knockout round, how much of it is settled,
 * whether it is live, and when it plays. Derived from validated finals only.
 */
function roadToFinal(models, t) {
  const groupModels = models.filter((m) => m.stage === 'group');
  const groupDone = groupModels.filter((m) => m.final).length;
  const stages = ROAD_STAGES.map((stage) => {
    const list = models.filter((m) => m.stage === stage);
    const done = list.filter((m) => m.final).length;
    const live = list.some((m) => m.live);
    const first = list[0]; const last = list[list.length - 1];
    return {
      stage,
      label: ROAD_LABELS[stage],
      name: STAGE_NAMES[stage],
      total: list.length,
      done,
      live,
      state: live ? 'live' : done === list.length ? 'done' : first && t >= first.epoch - 6 * 3600000 ? 'now' : 'ahead',
      dateLabel: first ? formatDayKey(first.day) + (last && last.day !== first.day ? '–' + formatDayKey(last.day).split(', ')[1] : '') : '',
    };
  });
  const current = stages.find((s) => s.state === 'live' || s.state === 'now')
    || stages.find((s) => s.state === 'ahead') || stages[stages.length - 1];
  return { groupDone, groupTotal: groupModels.length, stages, currentStage: current ? current.stage : 'final' };
}

/**
 * Group-race context: only groups whose qualification is genuinely still in
 * play (incomplete, some football played, top three within reach). Empty
 * once the group stage ends — the section disappears rather than decorating.
 */
function groupRaces(overlay) {
  const { groups, complete } = overlay.standings;
  const races = [];
  for (const g of Object.keys(groups).sort()) {
    if (complete[g]) continue;
    const rows = groups[g];
    const played = rows.reduce((n, r) => n + r.p, 0) / 2;
    if (!played || rows.length < 3) continue;
    const gap = rows[1].pts - rows[2].pts;
    races.push({
      group: g,
      played,
      tight: gap <= 3,
      gap,
      rows: rows.slice(0, 3).map((r, i) => ({
        rank: i + 1, code: r.code, name: teamName(r.code), flag: teamFlag(r.code), pts: r.pts, gd: r.gd,
      })),
    });
  }
  races.sort((a, b) => a.gap - b.gap || b.played - a.played);
  return races.slice(0, 3);
}

/**
 * Home model. Priority is a hard rule: LIVE official matches outrank upcoming,
 * and upcoming outrank completed. Never substitutes a different fixture when a
 * score is missing — the correct fixture renders with an honest pending state.
 */
export function homeModel(overlay) {
  return memo('home', overlay.version + ':' + todayKey() + ':' + Math.floor(now() / 60000), () => {
    const t = now();
    const models = allFixtures().map((f) => fixtureModel(f, overlay));
    const live = models.filter((m) => m.live).sort((a, b) => a.epoch - b.epoch);
    const today = models.filter((m) => m.day === todayKey());
    const upcomingToday = today.filter((m) => !m.live && !m.final && m.epoch >= t - 30 * 60000);
    const upcomingAll = models.filter((m) => !m.live && !m.final && m.epoch >= t - 30 * 60000);
    const recentFinal = models.filter((m) => m.final).sort((a, b) => b.epoch - a.epoch);
    const hero = live[0] || upcomingToday[0] || upcomingAll[0] || recentFinal[0] || null;
    // "Up next" looks beyond today — it never duplicates the Today rail.
    const nextAction = upcomingAll.find((m) => m.day !== todayKey() && (!hero || m.id !== hero.id)) || null;
    // Coming Up: the next fixtures beyond today, grouped under day labels.
    const comingUp = upcomingAll.filter((m) => m.day !== todayKey()).slice(0, 4);
    const dayNumber = allDayKeys().indexOf(todayKey()) + 1; // 0 when outside the tournament
    return {
      hero,
      heroKind: hero ? (hero.live ? 'live' : hero.final ? 'final' : 'upcoming') : 'none',
      heroCountdown: hero && !hero.live && !hero.final ? kickoffIn(hero.epoch, t) : null,
      liveNow: live,
      today,
      todayLabel: formatDayKey(todayKey()),
      dayNumber,
      nextAction,
      comingUp,
      road: roadToFinal(models, t),
      races: groupRaces(overlay),
      providerState: overlay.providerState,
    };
  });
}
