// United 2026 — Home. Score-first live front page: one dominant score stage,
// today's official fixtures, and the next important tournament action.
// Elite, factual, calm. Provider gaps render as honest pending states — the
// correct fixture is never replaced.

import { getState, openMatchCenter } from '../core/app-state.js';
import { homeModel } from '../data/tournament-model.js';
import { scoreStage } from '../components/score-stage.js';
import { matchRow, esc } from '../components/match-row.js';

export const seedHTML = `<div class="view home-view">
  <header class="view-head"><h1>United 2026</h1><p class="view-sub">World Cup · North America</p></header>
  <section class="score-stage none"><div class="ss-status">United 2026</div>
  <div class="ss-empty">Loading the official schedule…</div></section>
</div>`;

export function render(outlet) {
  const { real } = getState();
  const m = homeModel(real.overlay);
  const rail = m.today.filter((x) => !m.hero || x.id !== m.hero.id);
  outlet.innerHTML = `<div class="view home-view">
    <header class="view-head">
      <h1>United 2026</h1>
      <p class="view-sub">${esc(m.todayLabel)} · ${m.today.length ? m.today.length + (m.today.length === 1 ? ' match today' : ' matches today') : 'No matches today'}</p>
    </header>
    ${scoreStage(m.hero)}
    ${m.providerState !== 'ok' ? '<p class="data-note" role="status">Live scores are temporarily unavailable. Schedule shown is official.</p>' : ''}
    ${rail.length ? `<section class="today-rail" aria-label="Today's fixtures">
      <h2 class="rail-title">Today</h2>
      ${rail.map((x) => matchRow(x)).join('')}
    </section>` : ''}
    ${m.nextAction ? `<section class="next-action" aria-label="Next tournament action">
      <h2 class="rail-title">Up next</h2>
      ${matchRow(m.nextAction, { context: m.nextAction.stageName + ' · ' + m.nextAction.dateLabel })}
    </section>` : ''}
  </div>`;
  outlet.querySelectorAll('[data-match]').forEach((el) => {
    el.addEventListener('click', () => openMatchCenter(Number(el.dataset.match)));
  });
}
