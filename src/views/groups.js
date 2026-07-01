// United 2026 — Groups. Dense, readable, factual. Standings derive only from
// validated provider finals; incomplete groups say so honestly.

import { groupsModel } from '../data/tournament-model.js';
import { esc } from '../components/match-row.js';

export function renderGroups(overlay) {
  const groups = groupsModel(overlay);
  const anyPlayed = groups.some((g) => g.rows.some((r) => r.p > 0));
  return `<div class="groups-pane">
    ${anyPlayed ? '' : '<p class="data-note" role="status">Official results are temporarily unavailable — tables will fill in automatically.</p>'}
    <div class="groups-grid">
    ${groups.map((g) => `
      <section class="group-card" aria-label="Group ${g.group}">
        <header class="group-head"><h3>Group ${esc(g.group)}</h3>${g.complete ? '<span class="group-done">Final</span>' : ''}</header>
        <table class="group-table">
          <thead><tr><th class="t-team" scope="col">Team</th><th scope="col" title="Played">P</th><th scope="col" title="Goal difference">GD</th><th scope="col" title="Points">Pts</th></tr></thead>
          <tbody>
            ${g.rows.map((r) => `<tr class="rank-${r.rank}">
              <td class="t-team"><span class="t-flag" aria-hidden="true">${r.flag}</span>${esc(r.name)}</td>
              <td>${r.p}</td><td>${r.gd > 0 ? '+' + r.gd : r.gd}</td><td class="t-pts">${r.pts}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </section>`).join('')}
    </div>
  </div>`;
}
