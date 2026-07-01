// United 2026 — Groups. Dense tournament tables with honest state: a group is
// labeled Final ONLY when all six results are validated; anything less says
// exactly how much has been played. Qualification markers appear only when
// they are mathematically settled.

import { groupsModel } from '../data/tournament-model.js';
import { thirdPlaceTable } from '../core/canonical-truth.js';
import { esc } from '../components/match-row.js';

function groupState(g) {
  const played = g.rows.reduce((n, r) => n + r.p, 0) / 2;
  if (g.complete) return { label: 'Final', cls: 'final' };
  if (played === 0) return { label: 'Not started', cls: 'idle' };
  return { label: played + ' of 6 played', cls: 'progress' };
}

function qualMark(g, r, thirds) {
  if (!g.complete) return '';
  if (r.rank <= 2) return '<span class="q-mark in" title="Advances to Round of 32">Q</span>';
  if (r.rank === 3) {
    const row = thirds.rows.find((x) => x.code === r.code);
    if (row && row.qualified) return '<span class="q-mark third" title="Advances as best third">q3</span>';
    if (thirds.decided) return '<span class="q-mark out" title="Eliminated">–</span>';
    return '<span class="q-mark race" title="Third-place race">?</span>';
  }
  return '<span class="q-mark out" title="Eliminated">–</span>';
}

export function renderGroups(overlay, { thirds } = {}) {
  const groups = groupsModel(overlay);
  const t = thirds || thirdPlaceTable(overlay.standings);
  const anyPlayed = groups.some((g) => g.rows.some((r) => r.p > 0));
  return `<div class="groups-pane">
    ${anyPlayed ? '' : '<p class="data-note" role="status">Official results are temporarily unavailable — tables will fill in automatically.</p>'}
    <div class="groups-grid">
    ${groups.map((g) => {
    const st = groupState(g);
    return `
      <section class="group-card" aria-label="Group ${g.group}">
        <header class="group-head"><h3>Group ${esc(g.group)}</h3><span class="group-state ${st.cls}">${st.label}</span></header>
        <table class="group-table">
          <thead><tr><th class="t-team" scope="col">Team</th><th scope="col" title="Played">P</th><th scope="col" title="Won">W</th><th scope="col" title="Goal difference">GD</th><th scope="col" title="Points">Pts</th><th class="t-q" scope="col"><span class="sr-only">Qualification</span></th></tr></thead>
          <tbody>
            ${g.rows.map((r) => `<tr class="rank-${r.rank}${g.complete && r.rank <= 2 ? ' advancing' : ''}">
              <td class="t-team"><span class="t-flag" aria-hidden="true">${r.flag}</span><span class="t-name">${esc(r.name)}</span></td>
              <td>${r.p}</td><td>${r.w}</td><td class="t-gd">${r.gd > 0 ? '+' + r.gd : r.gd}</td><td class="t-pts">${r.pts}</td>
              <td class="t-q">${qualMark(g, r, t)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </section>`;
  }).join('')}
    </div>
  </div>`;
}
