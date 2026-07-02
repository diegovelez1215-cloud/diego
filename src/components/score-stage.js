// United 2026 — the score stage. One dominant, broadcast-caliber current-match
// surface for the World Cup tab. Score, clock, round, and tournament
// consequence are the hero, lit by the two teams' colors. Cinematic through
// hierarchy and quiet light — no blur stacks, no invented data.

import { esc } from './match-row.js';
import { TEAM_COLORS } from '../data/fixtures.js';
import { fixture, STAGE_NAMES } from '../core/canonical-truth.js';

function teamHTML(side, cls) {
  return `<div class="ss-team ${cls}${side.pending ? ' pending' : ''}">
    ${side.flag ? `<div class="ss-flag" aria-hidden="true">${side.flag}</div>` : ''}
    <div class="ss-name">${esc(side.name)}</div>
  </div>`;
}

function consequence(m) {
  if (m.stage === 'final') return 'Winner lifts the World Cup';
  if (m.stage === 'bronze') return 'Third place decided tonight';
  if (m.stage === 'group') return 'Group ' + m.group + ' · group stage';
  if (m.feeds) {
    const next = fixture(m.feeds.id);
    const nextName = next ? STAGE_NAMES[next.stage] : null;
    return nextName
      ? `Winner advances to the ${nextName}`
      : 'Winner advances to Match ' + m.feeds.id;
  }
  return m.stageName;
}

export function scoreStage(m, { countdown = null } = {}) {
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
  const hc = !m.home.pending ? TEAM_COLORS[m.home.code] || '' : '';
  const ac = !m.away.pending ? TEAM_COLORS[m.away.code] || '' : '';
  const light = hc || ac ? ` style="${hc ? `--hc:${hc};` : ''}${ac ? `--ac:${ac};` : ''}"` : '';
  return `<section class="score-stage ${kindCls}" aria-label="${esc(m.home.name)} versus ${esc(m.away.name)}"${light}>
    <div class="ss-round">${esc(m.stageName)}</div>
    <div class="ss-status">${statusLine}</div>
    <div class="ss-stage-row">
      ${teamHTML(m.home, 'home')}
      <div class="ss-score" role="text">${scoreHTML}</div>
      ${teamHTML(m.away, 'away')}
    </div>
    ${countdown ? `<div class="ss-countdown">${esc(countdown)}</div>` : ''}
    <div class="ss-consequence">${esc(consequence(m))}</div>
    <div class="ss-venue">${esc(m.stadium || m.venueCity)} · ${esc(m.venueCity)}</div>
    <button class="ss-open" data-match="${m.id}">Match Center</button>
  </section>`;
}
