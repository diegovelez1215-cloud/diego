// United 2026 — World Cup. The live tournament hub: one cinematic score
// stage, an editorial Today board, Coming Up, the Road to the Final, and
// group-race context only while qualification is genuinely in play.
// Elite, factual, calm. Provider gaps render as honest pending states — the
// correct fixture is never replaced.

import { getState, openMatchCenter } from '../core/app-state.js';
import { homeModel } from '../data/tournament-model.js';
import { scoreStage } from '../components/score-stage.js';
import { matchRow, esc } from '../components/match-row.js';

export const seedHTML = `<div class="view home-view">
  <header class="view-head"><p class="view-kicker">United 2026</p><h1>World Cup</h1></header>
  <section class="score-stage none"><div class="ss-status">United 2026</div>
  <div class="ss-empty">Loading the official schedule…</div></section>
</div>`;

/* Today board: live first, then kicking off, then settled — one clear read. */
function todayBoard(m) {
  const rail = m.today.filter((x) => !m.hero || x.id !== m.hero.id);
  if (!rail.length) return '';
  const live = rail.filter((x) => x.live);
  const up = rail.filter((x) => !x.live && !x.final);
  const done = rail.filter((x) => x.final);
  const row = (x) => matchRow(x, { context: x.stageName + ' · ' + x.venueCity });
  return `<section class="today-rail" aria-label="Today's fixtures">
    <h2 class="rail-title">Today${m.today.length ? `<span class="rail-count">${m.today.length}</span>` : ''}</h2>
    ${live.map(row).join('')}
    ${up.map(row).join('')}
    ${done.length ? `<div class="rail-done">${done.map(row).join('')}</div>` : ''}
  </section>`;
}

function comingUp(m) {
  if (!m.comingUp.length) return '';
  let lastDay = null;
  return `<section class="coming-up" aria-label="Coming up">
    <h2 class="rail-title">Coming up</h2>
    ${m.comingUp.map((x) => {
    const head = x.day !== lastDay ? `<h3 class="day-head">${esc(x.dateLabel)}</h3>` : '';
    lastDay = x.day;
    return head + matchRow(x, { context: x.stageName + ' · ' + x.venueCity });
  }).join('')}
  </section>`;
}

/* Road to the Final — a compact truth snapshot of the knockout arc. */
function roadHTML(road) {
  const groupsPhase = road.groupDone < road.groupTotal && road.stages.every((s) => s.done === 0 && s.state !== 'live');
  return `<section class="road" aria-label="Road to the final">
    <h2 class="rail-title">Road to the final</h2>
    <div class="road-strip">
      ${groupsPhase ? `<div class="road-node now">
        <span class="road-label">Groups</span>
        <span class="road-count">${road.groupDone}/${road.groupTotal}</span>
      </div><span class="road-arrow" aria-hidden="true"></span>` : ''}
      ${road.stages.map((s, i) => `
        <div class="road-node ${s.state}${s.stage === road.currentStage ? ' current' : ''}">
          <span class="road-label">${s.label}</span>
          <span class="road-count">${s.live ? 'LIVE' : s.done + '/' + s.total}</span>
        </div>${i < road.stages.length - 1 ? '<span class="road-arrow" aria-hidden="true"></span>' : ''}`).join('')}
    </div>
  </section>`;
}

/* Group races — rendered only while qualification is actually at stake. */
function racesHTML(races) {
  if (!races.length) return '';
  return `<section class="races" aria-label="Qualification races">
    <h2 class="rail-title">Qualification on the line</h2>
    <div class="races-grid">
    ${races.map((r) => `
      <div class="race-card${r.tight ? ' tight' : ''}">
        <div class="race-head"><span>Group ${esc(r.group)}</span><span class="race-note">${r.played} of 6 played</span></div>
        ${r.rows.map((row) => `
          <div class="race-row rank-${row.rank}">
            <span class="race-rank">${row.rank}</span>
            <span class="race-team">${row.flag} ${esc(row.name)}</span>
            <span class="race-pts">${row.pts} pts</span>
          </div>`).join('')}
      </div>`).join('')}
    </div>
  </section>`;
}

export function render(outlet) {
  const { real } = getState();
  const m = homeModel(real.overlay);
  outlet.innerHTML = `<div class="view home-view">
    <header class="view-head">
      <p class="view-kicker">United 2026${m.dayNumber ? ' · Day ' + m.dayNumber : ''}</p>
      <h1>World Cup</h1>
      <p class="view-sub">${esc(m.todayLabel)} · ${m.today.length ? m.today.length + (m.today.length === 1 ? ' match today' : ' matches today') : 'No matches today'}${m.liveNow.length ? ' · ' + m.liveNow.length + ' live' : ''}</p>
    </header>
    ${scoreStage(m.hero, { countdown: m.heroCountdown })}
    ${m.providerState !== 'ok' ? '<p class="data-note" role="status">Live scores are temporarily unavailable. Schedule shown is official.</p>' : ''}
    ${todayBoard(m)}
    ${comingUp(m)}
    ${roadHTML(m.road)}
    ${racesHTML(m.races)}
  </div>`;
  outlet.querySelectorAll('[data-match]').forEach((el) => {
    el.addEventListener('click', () => openMatchCenter(Number(el.dataset.match)));
  });
}
