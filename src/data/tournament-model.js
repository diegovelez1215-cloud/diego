// United 2026 — derived real-world view models.
// Views never touch raw provider data; they consume these memoized models.
// Each model is cached per (view, overlay.version). A canonical/overlay update
// bumps the version and invalidates ONLY real-view models. Play never reads or
// writes anything here except through explicit deep copies.

import {
  allFixtures, fixturesOnDay, fixture, teamName, teamFlag, slotLabel,
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
    gh: ov ? ov.gh : null,
    ga: ov ? ov.ga : null,
    min: ov ? ov.min : null,
    winner: ov ? ov.winner : null,
    scoreKnown: !!ov && ov.gh != null && ov.ga != null,
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
    return {
      hero,
      heroKind: hero ? (hero.live ? 'live' : hero.final ? 'final' : 'upcoming') : 'none',
      liveNow: live,
      today,
      todayLabel: formatDayKey(todayKey()),
      nextAction,
      providerState: overlay.providerState,
    };
  });
}
