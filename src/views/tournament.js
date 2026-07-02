// United 2026 — Tournament. Exactly: Matches (editorial matchday board),
// Groups, the official graphical Knockout bracket, and Match Center.

import { getState, setTournamentView, setMatchesDate, openMatchCenter } from '../core/app-state.js';
import { segmentedControl } from '../components/segmented-control.js';
import { wireBracketScroller } from '../components/bracket.js';
import { renderMatches } from './matches.js';
import { renderGroups } from './groups.js';
import { renderKnockout, wireKnockout } from './knockout.js';

export const seedHTML = `<div class="view tournament-view">
  <header class="view-head"><h1>Tournament</h1><p class="view-sub">Official schedule, groups, bracket</p></header>
  <div class="view-shell-note">Loading fixtures…</div>
</div>`;

export function render(outlet) {
  const { nav, real } = getState();
  const sub = nav.tournamentView;
  const pane = sub === 'groups' ? renderGroups(real.overlay)
    : sub === 'knockout' ? renderKnockout(real.overlay)
      : renderMatches(real.overlay);
  outlet.innerHTML = `<div class="view tournament-view">
    <header class="view-head"><p class="view-kicker">United 2026</p><h1>Tournament</h1></header>
    ${segmentedControl({
    id: 'tournament-view', label: 'Tournament sections', value: sub,
    options: [
      { value: 'matches', label: 'Matches' },
      { value: 'groups', label: 'Groups' },
      { value: 'knockout', label: 'Knockout' },
    ],
  })}
    ${pane}
  </div>`;
  outlet.querySelector('[data-segmented="tournament-view"]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-value]');
    if (btn) setTournamentView(btn.dataset.value);
  });
  const dc = outlet.querySelector('[data-segmented="matches-date"]');
  if (dc) {
    dc.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-value]');
      if (btn) setMatchesDate(btn.dataset.value);
    });
  }
  if (sub === 'knockout') {
    wireKnockout(outlet);
    wireBracketScroller(outlet);
  }
  outlet.querySelectorAll('[data-match]').forEach((el) => {
    el.addEventListener('click', () => openMatchCenter(Number(el.dataset.match)));
  });
}
