// United 2026 — Knockout. The complete official bracket, chronological and
// monumental: Round of 32 through the Final, every tie exactly once, honest
// pending slots until derived truth resolves them.

import { knockoutModel } from '../data/tournament-model.js';
import { matchRow } from '../components/match-row.js';

export function renderKnockout(overlay) {
  const m = knockoutModel(overlay);
  return `<div class="knockout-pane">
    ${m.rounds.map((r) => `
      <section class="ko-round" aria-label="${r.name}">
        <header class="ko-round-head"><h3>${r.name}${r.plural ? '' : ''}</h3>
          <span class="ko-count">${r.list.length} ${r.list.length === 1 ? 'match' : 'matches'}</span></header>
        ${r.list.map((x) => matchRow(x, { context: 'Match ' + x.id + ' · ' + x.dateLabel + ' · ' + x.venueCity })).join('')}
      </section>`).join('')}
  </div>`;
}
