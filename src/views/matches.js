// United 2026 — Matches. Today / Tomorrow / All Dates. Precise and editorial.
// Today shows every canonical Puerto Rico-local-day fixture exactly once.

import { getState } from '../core/app-state.js';
import { matchesModel } from '../data/tournament-model.js';
import { matchRow, esc } from '../components/match-row.js';
import { dateControl } from '../components/date-control.js';

function dayBlock(label, list, emptyLine) {
  if (!list.length) return `<p class="empty-line">${esc(emptyLine)}</p>`;
  return list.map((m) => matchRow(m, { context: m.stageName + ' · ' + m.venueCity })).join('');
}

export function renderMatches(overlay) {
  const { nav } = getState();
  const m = matchesModel(overlay);
  let body;
  if (nav.matchesDate === 'today') {
    body = `<h3 class="day-head">${esc(m.days.find((d) => d.day === m.todayKey)?.label || 'Today')}</h3>`
      + dayBlock('Today', m.today, 'No official matches today.');
  } else if (nav.matchesDate === 'tomorrow') {
    body = `<h3 class="day-head">${esc(m.days.find((d) => d.day === m.tomorrowKey)?.label || 'Tomorrow')}</h3>`
      + dayBlock('Tomorrow', m.tomorrow, 'No official matches tomorrow.');
  } else {
    body = m.days.map((d) => `<h3 class="day-head${d.day === m.todayKey ? ' today' : ''}">${esc(d.label)}${d.day === m.todayKey ? ' · Today' : ''}</h3>`
      + d.list.map((x) => matchRow(x, { context: x.stageName + ' · ' + x.venueCity })).join('')).join('');
  }
  return `<div class="matches-pane">${dateControl(nav.matchesDate)}<div class="matches-list">${body}</div></div>`;
}
