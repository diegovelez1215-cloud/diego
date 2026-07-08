// United 2026 — verified tournament stats. Player leaders come only from the
// Football-Data scorer endpoint; derived team totals come from validated finals.

import { allFixtures, teamName, teamFlag, resolveTeamCode } from '../core/canonical-truth.js';
import { fixtureModel, updatedLabel } from '../data/tournament-model.js';
import { esc } from '../components/match-row.js';

function teamTotals(overlay) {
  const rows = new Map();
  const ensure = (code) => {
    if (!rows.has(code)) rows.set(code, { code, goals: 0, against: 0, clean: 0, played: 0 });
    return rows.get(code);
  };
  for (const f of allFixtures()) {
    const m = fixtureModel(f, overlay);
    if (!m.final || !m.scoreKnown || !m.home.code || !m.away.code) continue;
    const h = ensure(m.home.code);
    const a = ensure(m.away.code);
    h.played++; a.played++;
    h.goals += m.gh; h.against += m.ga;
    a.goals += m.ga; a.against += m.gh;
    if (m.ga === 0) h.clean++;
    if (m.gh === 0) a.clean++;
  }
  return [...rows.values()].sort((a, b) => b.goals - a.goals || b.clean - a.clean || teamName(a.code).localeCompare(teamName(b.code)));
}

function leaderRows(rows, empty, { hero = false } = {}) {
  if (!rows.length) return `<p class="stats-empty">${esc(empty)}</p>`;
  return rows.slice(0, 8).map((r, i) => {
    const code = resolveTeamCode(r.team);
    if (hero && i === 0) {
      return `<div class="stats-hero">
        <span class="stats-hero-n display">${r.n}</span>
        <span class="stats-hero-who"><strong>${esc(r.player)}</strong>
        <span>${code ? teamFlag(code) + ' ' + esc(teamName(code)) : esc(r.team)} · leads the race</span></span>
      </div>`;
    }
    return `<div class="stats-row">
      <span class="stats-rank">${i + 1}</span>
      <span class="stats-name">${esc(r.player)}</span>
      <span class="stats-team">${code ? teamFlag(code) + ' ' + esc(teamName(code)) : esc(r.team)}</span>
      <strong>${r.n}</strong>
    </div>`;
  }).join('');
}

function teamRows(rows, metric) {
  return rows.slice(0, 8).map((r, i) => `<div class="stats-row">
    <span class="stats-rank">${i + 1}</span>
    <span class="stats-name">${teamFlag(r.code)} ${esc(teamName(r.code))}</span>
    <span class="stats-team">${r.played} played</span>
    <strong>${r[metric]}</strong>
  </div>`).join('');
}

/* TRUTH MODEL — what this page may and may not rank.
 * The verified provider's scorer table is ranked by goals; assists exist only
 * as fields on those goal-scorer rows, so a player with assists but no goal
 * can never be ranked (proved against the provider docs and the live payload,
 * 2026-07-08). Therefore:
 *   • Top scorers ranks verified goals — the feed's native truth.
 *   • Goals + assists combines the verified goal and assist FIELDS of those
 *     same rows: every number shown is provider-verified, and the copy says
 *     where the numbers come from.
 *   • A standalone Assists leaderboard stays off the page until a complete
 *     assist source is connected — a ranking we cannot prove complete is a
 *     ranking we do not publish.
 * Nothing here is inferred from goals, scorelines, match events, or
 * simulations. */

/** G+A merges the verified goal and assist fields — never invents either. */
export function combinedGA(goals, assists) {
  const byKey = new Map();
  const add = (list, field) => {
    for (const r of list) {
      const key = r.player + '|' + r.team;
      if (!byKey.has(key)) byKey.set(key, { player: r.player, team: r.team, g: 0, a: 0 });
      byKey.get(key)[field] += r.n;
    }
  };
  add(goals, 'g'); add(assists, 'a');
  return [...byKey.values()]
    .map((r) => ({ ...r, n: r.g + r.a }))
    .sort((a, b) => b.n - a.n || b.g - a.g || b.a - a.a
      || a.player.localeCompare(b.player) || a.team.localeCompare(b.team));
}

export function renderStats(overlay, stats) {
  const teams = teamTotals(overlay);
  const stamp = updatedLabel(stats && stats.fetchedAt);
  const goals = stats && Array.isArray(stats.goals) ? stats.goals : [];
  const assists = stats && Array.isArray(stats.assists) ? stats.assists : [];
  const ga = goals.length && assists.length ? combinedGA(goals, assists) : [];
  return `<section class="stats-pane" aria-label="Stats">
    <div class="stats-lede">
      <div><p class="venue-kicker">Verified leaders</p><h2>Stats that have a source</h2></div>
      ${stamp ? `<span>${esc(stamp)}</span>` : '<span>Player feed unavailable</span>'}
    </div>
    <article class="stats-card">
      <h3>Top scorers</h3>
      ${leaderRows(goals, 'Official scorer feed is unavailable. No player goals invented.', { hero: true })}
      ${goals.length ? '<p class="stats-foot">Official scorer feed — every ranked goal is verified. Player stats move on a slower clock than live scores.</p>' : ''}
    </article>
    <article class="stats-card">
      <h3>Goals + assists</h3>
      ${ga.length ? ga.slice(0, 8).map((r, i) => {
    const code = resolveTeamCode(r.team);
    return `<div class="stats-row">
        <span class="stats-rank">${i + 1}</span>
        <span class="stats-name">${esc(r.player)}</span>
        <span class="stats-team">${r.g}g · ${r.a}a${code ? ' · ' + teamFlag(code) : ''}</span>
        <strong>${r.n}</strong>
      </div>`;
  }).join('') + '<p class="stats-foot">Combined from verified provider goal and assist fields. Standalone assist leaders require a complete assist source.</p>'
    : '<p class="stats-empty">G+A needs verified goal and assist fields from the provider — one of the two is unavailable right now. Nothing is invented in the meantime.</p>'}
    </article>
    <article class="stats-card">
      <h3>Team goals</h3>
      ${teamRows(teams, 'goals')}
      <p class="stats-foot">Derived from validated final scores only.</p>
    </article>
    <article class="stats-card">
      <h3>Clean sheets</h3>
      ${teamRows([...teams].sort((a, b) => b.clean - a.clean || b.goals - a.goals || teamName(a.code).localeCompare(teamName(b.code))), 'clean')}
      <p class="stats-foot">Derived from validated final scores only.</p>
    </article>
  </section>`;
}
