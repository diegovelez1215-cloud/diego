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

function leaderRows(rows, empty) {
  if (!rows.length) return `<p class="stats-empty">${esc(empty)}</p>`;
  return rows.slice(0, 8).map((r, i) => {
    const code = resolveTeamCode(r.team);
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

export function renderStats(overlay, stats) {
  const teams = teamTotals(overlay);
  const stamp = updatedLabel(stats && stats.fetchedAt);
  const goals = stats && Array.isArray(stats.goals) ? stats.goals : [];
  const assists = stats && Array.isArray(stats.assists) ? stats.assists : [];
  return `<section class="stats-pane" aria-label="Stats">
    <div class="stats-lede">
      <div><p class="venue-kicker">Verified leaders</p><h2>Stats that have a source</h2></div>
      ${stamp ? `<span>${esc(stamp)}</span>` : '<span>Player feed unavailable</span>'}
    </div>
    <article class="stats-card">
      <h3>Top scorers</h3>
      ${leaderRows(goals, 'Official scorer feed is unavailable. No player goals invented.')}
    </article>
    <article class="stats-card">
      <h3>Assists</h3>
      ${leaderRows(assists, 'Official assist data is unavailable from the current feed.')}
    </article>
    <article class="stats-card">
      <h3>Team goals</h3>
      ${teamRows(teams, 'goals')}
    </article>
    <article class="stats-card">
      <h3>Clean sheets</h3>
      ${teamRows([...teams].sort((a, b) => b.clean - a.clean || b.goals - a.goals || teamName(a.code).localeCompare(teamName(b.code))), 'clean')}
    </article>
  </section>`;
}
