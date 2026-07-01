// United 2026 — Match Center. Factual and immediate: status, score, kickoff,
// venue, stage, and tournament consequence for one canonical fixture.
// Renders as a compact glass sheet over the current tab. Never playful.

import { getState, closeMatchCenter } from '../core/app-state.js';
import { matchCenterModel } from '../data/tournament-model.js';
import { esc } from '../components/match-row.js';

let host = null;

function statusLine(m) {
  if (m.live) return `<span class="live-dot" aria-hidden="true"></span>LIVE${m.min != null ? ' · ' + m.min + '&prime;' : ''}`;
  if (m.final) return 'FULL TIME';
  if (m.status === 'hold') return 'DELAYED · awaiting official update';
  return 'KICKOFF ' + m.time + ' · ' + m.dateLabel;
}

function scoreBlock(m) {
  if (m.scoreKnown) return `<div class="mc-score">${m.gh}<span class="mc-sep">–</span>${m.ga}</div>`;
  if (m.live) return '<div class="mc-score pending">Score pending</div>';
  if (m.final) return '<div class="mc-score pending">Full time · score pending</div>';
  return '<div class="mc-score vs">v</div>';
}

export function renderMatchCenter() {
  const { nav, real } = getState();
  if (!host) {
    host = document.createElement('div');
    host.id = 'match-center-host';
    document.body.appendChild(host);
  }
  if (nav.matchCenterId == null) { host.innerHTML = ''; return; }
  const m = matchCenterModel(nav.matchCenterId, real.overlay);
  if (!m) { host.innerHTML = ''; return; }
  host.innerHTML = `
    <div class="mc-scrim" data-close></div>
    <section class="mc-sheet" role="dialog" aria-modal="true" aria-label="Match Center: ${esc(m.home.name)} versus ${esc(m.away.name)}">
      <div class="mc-grab" aria-hidden="true"></div>
      <div class="mc-round">${esc(m.stageName)} · Match ${m.id}</div>
      <div class="mc-status">${statusLine(m)}</div>
      <div class="mc-teams">
        <div class="mc-team${m.home.pending ? ' pending' : ''}">${m.home.flag ? `<span class="mc-flag" aria-hidden="true">${m.home.flag}</span>` : ''}<span>${esc(m.home.name)}</span></div>
        ${scoreBlock(m)}
        <div class="mc-team${m.away.pending ? ' pending' : ''}">${m.away.flag ? `<span class="mc-flag" aria-hidden="true">${m.away.flag}</span>` : ''}<span>${esc(m.away.name)}</span></div>
      </div>
      <dl class="mc-facts">
        <div><dt>Venue</dt><dd>${esc(m.stadium || m.venueCity)}, ${esc(m.venueCity)}</dd></div>
        <div><dt>Kickoff</dt><dd>${esc(m.dateLabel)} · ${esc(m.time)} AST</dd></div>
        ${m.feeds ? `<div><dt>Consequence</dt><dd>Winner advances to Match ${m.feeds.id}</dd></div>` : ''}
        ${m.final && m.winner && m.winner !== 'draw' ? `<div><dt>Result</dt><dd>${esc(m[m.winner].name)} advance</dd></div>` : ''}
      </dl>
      <button class="mc-close" data-close aria-label="Close Match Center">Close</button>
    </section>`;
  host.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => closeMatchCenter()));
}
