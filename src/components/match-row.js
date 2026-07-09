// United 2026 — editorial match row. Factual, precise, tappable (opens Match
// Center). Score renders only when the validated overlay knows it; otherwise
// the row shows the honest schedule state for the correct fixture.

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Long names scale down and wrap at word boundaries — never mid-word.
    11-character single words (Netherlands, Switzerland) are the classic
    tight fits at 390px, so the downscale starts AT 11, not above it. */
export function nameSizeClass(name) {
  const n = String(name || '').length;
  return n > 16 ? ' xl' : n >= 11 ? ' lg' : '';
}

function sideHTML(side, cls) {
  return `<span class="mr-team ${cls}${side.pending ? ' pending' : ''}">
    ${side.flag ? `<span class="mr-flag" aria-hidden="true">${side.flag}</span>` : ''}
    <span class="mr-name${nameSizeClass(side.name)}">${esc(side.name)}</span>
  </span>`;
}

function stateHTML(m) {
  if (m.live) {
    const clock = m.min != null ? m.min + '&prime;' : 'LIVE';
    const score = m.scoreKnown ? `${m.gh}–${m.ga}` : '–';
    return `<span class="mr-state live"><span class="live-dot" aria-hidden="true"></span>${score}<span class="mr-clock">${clock}</span></span>`;
  }
  if (m.final) {
    const score = m.scoreKnown ? `${m.gh}–${m.ga}` : 'FT';
    return `<span class="mr-state final">${score}<span class="mr-ft">FT</span></span>`;
  }
  if (m.status === 'hold') return '<span class="mr-state hold">Delayed</span>';
  return `<span class="mr-state time">${esc(m.time)}</span>`;
}

export function matchRow(m, { context = '' } = {}) {
  const label = `${m.home.name} versus ${m.away.name}, ${m.stageName}, ${m.live ? 'live now' : m.final ? 'full time' : m.time}`;
  return `<button class="match-row${m.live ? ' is-live' : ''}" data-match="${m.id}" aria-label="${esc(label)}">
    <span class="mr-meta">${esc(context || m.stageName)}</span>
    <span class="mr-body">
      ${sideHTML(m.home, 'home')}
      ${stateHTML(m)}
      ${sideHTML(m.away, 'away')}
    </span>
  </button>`;
}
