// United 2026 — Matches. An editorial matchday board, not a card stack:
// a Live Now lane when football is actually happening, then Up Today,
// Earlier Today, and a quiet look at tomorrow. Today shows every canonical
// Puerto Rico-local-day fixture exactly once across its lanes.

import { getState } from '../core/app-state.js';
import { matchesModel } from '../data/tournament-model.js';
import { matchRow, esc } from '../components/match-row.js';
import { dateControl } from '../components/date-control.js';

function lane(title, list, { cls = '', note = '' } = {}) {
  if (!list.length) return '';
  return `<section class="md-lane ${cls}" aria-label="${esc(title)}">
    <header class="md-lane-head"><h3>${esc(title)}</h3>${note ? `<span class="md-lane-note">${esc(note)}</span>` : ''}</header>
    ${list.map((m) => matchRow(m, { context: m.stageName + ' · ' + m.venueCity })).join('')}
  </section>`;
}

function todayBoard(m) {
  const live = m.today.filter((x) => x.live);
  const upcoming = m.today.filter((x) => !x.live && !x.final);
  const finished = m.today.filter((x) => x.final);
  const preview = m.tomorrow.slice(0, 2);
  if (!m.today.length) {
    return `<p class="empty-line">No official matches today.</p>${lane('Tomorrow', preview)}`;
  }
  return [
    lane('Live Now', live, { cls: 'live-lane', note: live.length === 1 ? 'One match in play' : live.length + ' in play' }),
    lane('Up Today', upcoming),
    lane('Earlier Today', finished, { cls: 'done-lane' }),
    lane('Tomorrow', preview, { cls: 'preview-lane', note: 'first fixtures' }),
  ].join('');
}

export function renderMatches(overlay) {
  const { nav } = getState();
  const m = matchesModel(overlay);
  let body;
  if (nav.matchesDate === 'today') {
    body = `<h3 class="day-head today">${esc(m.days.find((d) => d.day === m.todayKey)?.label || 'Today')} · Today</h3>` + todayBoard(m);
  } else if (nav.matchesDate === 'tomorrow') {
    body = `<h3 class="day-head">${esc(m.days.find((d) => d.day === m.tomorrowKey)?.label || 'Tomorrow')}</h3>`
      + (m.tomorrow.length
        ? m.tomorrow.map((x) => matchRow(x, { context: x.stageName + ' · ' + x.venueCity })).join('')
        : '<p class="empty-line">No official matches tomorrow.</p>');
  } else {
    body = m.days.map((d) => `<h3 class="day-head${d.day === m.todayKey ? ' today' : ''}">${esc(d.label)}${d.day === m.todayKey ? ' · Today' : ''}</h3>`
      + d.list.map((x) => matchRow(x, { context: x.stageName + ' · ' + x.venueCity })).join('')).join('');
  }
  return `<div class="matches-pane">${dateControl(nav.matchesDate)}<div class="matches-list">${body}</div></div>`;
}
