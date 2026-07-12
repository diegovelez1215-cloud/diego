// United 2026 — Match Center. Factual and immediate: status, score, kickoff,
// venue, stage, and tournament consequence for one canonical fixture.
// Renders as a compact glass sheet over the current tab. Never playful.

import { getState, closeMatchCenter } from '../core/app-state.js';
import { matchCenterModel } from '../data/tournament-model.js';
import { esc } from '../components/match-row.js';

let host = null;
let returnFocus = null;
let returnSelector = '';
let wasOpen = false;
let lastHtml = '';

/** A stable identity for the opener. Live repaints can replace the opener's
    DOM node while the sheet is open; this lets close find the equivalent
    control (same id, or same tag + classes + data attributes) and restore
    focus to the logical opener instead of dumping it on the page. */
function focusSelectorFor(el) {
  if (!el || el === document.body) return '';
  if (el.id) return `#${el.id}`;
  const classes = [...el.classList].map((c) => '.' + c).join('');
  const data = [...el.attributes]
    .filter((a) => a.name.startsWith('data-'))
    .map((a) => `[${a.name}="${a.value}"]`).join('');
  return el.tagName.toLowerCase() + classes + data;
}

/** WebKit on macOS does not necessarily move focus to a button when it is
    clicked. Resolve the control that requested this match by fixture identity
    before falling back to the currently focused control, so closing restores
    the actual opener for both pointer and keyboard activation. */
function openerFor(matchId, active) {
  const requested = Number(matchId);
  const activeMatch = Number(active?.dataset?.match);
  if (active && active !== document.body && activeMatch === requested) return active;
  const matching = [...document.querySelectorAll('#app [data-match]')]
    .find((el) => Number(el.dataset.match) === requested);
  if (matching) return matching;
  return active && active !== document.body && !host?.contains(active) ? active : null;
}

/** Close the sheet completely: drop inertness and give focus back to the
    opener — or its logical equivalent after a repaint — or, when neither
    exists any more, to the active dock tab, so keyboard users are never
    stranded on a removed element. */
function releaseDialog() {
  host.innerHTML = '';
  lastHtml = '';
  document.getElementById('app')?.removeAttribute('inert');
  document.body.classList.remove('match-center-open');
  if (wasOpen) {
    let target = returnFocus?.isConnected ? returnFocus : null;
    if (!target && returnSelector) {
      try { target = document.querySelector(returnSelector); } catch { target = null; }
    }
    if (!target) target = document.querySelector('.dock-tab[aria-selected="true"]');
    if (target && typeof target.focus === 'function') target.focus();
  }
  returnFocus = null;
  returnSelector = '';
  wasOpen = false;
}

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
  if (nav.matchCenterId == null) { releaseDialog(); return; }
  const m = matchCenterModel(nav.matchCenterId, real.overlay);
  // An invalid or replaced match model closes the sheet cleanly — the page
  // must never stay inert with focus trapped on a removed dialog.
  if (!m) { releaseDialog(); return; }
  const opening = !wasOpen;
  const active = document.activeElement;
  const opener = opening ? openerFor(nav.matchCenterId, active) : null;
  if (opener && typeof opener.focus === 'function') {
    returnFocus = opener;
    returnSelector = focusSelectorFor(opener);
  }
  wasOpen = true;
  document.getElementById('app')?.setAttribute('inert', '');
  document.body.classList.add('match-center-open');
  const html = `
    <div class="mc-scrim" data-close></div>
    <section class="mc-sheet" role="dialog" aria-modal="true" tabindex="-1" aria-label="Match Center: ${esc(m.home.name)} versus ${esc(m.away.name)}">
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
      <button class="mc-close" data-close data-mc-key="close" aria-label="Close Match Center">Close</button>
    </section>`;
  // Live truth repaints the open sheet in place. Identical markup is left
  // completely alone — focus never even flickers. Changed markup is rebuilt,
  // then the focused logical control is restored by its stable key; when that
  // control no longer exists, focus falls safely to Close or the dialog
  // itself — never to the page, the dock, or the document body.
  if (html === lastHtml) return;
  const prior = document.activeElement;
  const hadDialogFocus = !opening && !!prior && host.contains(prior);
  const priorKey = hadDialogFocus ? prior.getAttribute('data-mc-key') : null;
  lastHtml = html;
  host.innerHTML = html;
  host.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => closeMatchCenter()));
  const dialog = host.querySelector('[role="dialog"]');
  dialog?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); closeMatchCenter(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  if (opening) {
    host.querySelector('.mc-close')?.focus();
  } else if (hadDialogFocus) {
    const restored = (priorKey && host.querySelector(`[data-mc-key="${priorKey}"]`))
      || host.querySelector('.mc-close')
      || dialog;
    restored?.focus();
  }
}
