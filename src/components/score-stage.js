// United 2026 — the score stage. One dominant, broadcast-caliber current-match
// surface for Home. Score, clock, round, and tournament consequence are the
// hero. Cinematic through hierarchy and quiet light — no blur stacks.

import { esc } from './match-row.js';

function teamHTML(side, cls) {
  return `<div class="ss-team ${cls}${side.pending ? ' pending' : ''}">
    ${side.flag ? `<div class="ss-flag" aria-hidden="true">${side.flag}</div>` : ''}
    <div class="ss-name">${esc(side.name)}</div>
  </div>`;
}

function consequence(m) {
  if (m.stage === 'group') return 'Group ' + m.group + ' · group stage';
  if (m.stage === 'final') return 'The World Cup Final';
  if (m.feeds) return 'Winner advances to Match ' + m.feeds.id;
  return m.stageName;
}

export function scoreStage(m) {
  if (!m) {
    return `<section class="score-stage none" aria-label="No current match">
      <div class="ss-status">United 2026</div>
      <div class="ss-empty">The tournament schedule is loading.</div>
    </section>`;
  }
  let statusLine; let scoreHTML; let kindCls;
  if (m.live) {
    kindCls = 'live';
    statusLine = `<span class="live-dot" aria-hidden="true"></span>LIVE${m.min != null ? ' · ' + m.min + '&prime;' : ''}`;
    scoreHTML = m.scoreKnown
      ? `<span class="ss-num">${m.gh}</span><span class="ss-sep">–</span><span class="ss-num">${m.ga}</span>`
      : '<span class="ss-pending-score">In play · score pending</span>';
  } else if (m.final) {
    kindCls = 'final';
    statusLine = 'FULL TIME';
    scoreHTML = m.scoreKnown
      ? `<span class="ss-num">${m.gh}</span><span class="ss-sep">–</span><span class="ss-num">${m.ga}</span>`
      : '<span class="ss-pending-score">Final · score pending</span>';
  } else {
    kindCls = 'upcoming';
    statusLine = m.dateLabel + ' · ' + m.time;
    scoreHTML = '<span class="ss-vs">v</span>';
  }
  return `<section class="score-stage ${kindCls}" aria-label="${esc(m.home.name)} versus ${esc(m.away.name)}">
    <div class="ss-round">${esc(m.stageName)}</div>
    <div class="ss-status">${statusLine}</div>
    <div class="ss-stage-row">
      ${teamHTML(m.home, 'home')}
      <div class="ss-score" role="text">${scoreHTML}</div>
      ${teamHTML(m.away, 'away')}
    </div>
    <div class="ss-consequence">${esc(consequence(m))}</div>
    <div class="ss-venue">${esc(m.stadium || m.venueCity)} · ${esc(m.venueCity)}</div>
    <button class="ss-open" data-match="${m.id}">Match Center</button>
  </section>`;
}
