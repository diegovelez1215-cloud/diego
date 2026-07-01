// United 2026 — Knockout. The complete official bracket as a monumental,
// horizontally navigable canvas: Round of 32 → Final plus the third-place
// match, real advancing connectors, honest unresolved chips, and a
// Follow-a-Team mode that illuminates one nation's route while the rest of
// the field falls into shadow. Factual and calm — drama comes from truth.

import { getState, setBracketMode } from '../core/app-state.js';
import { teamName, teamFlag, thirdPlaceTable, STAGE_NAMES } from '../core/canonical-truth.js';
import { TEAMS } from '../data/fixtures.js';
import { bracketHTML } from '../components/bracket.js';
import { segmentedControl } from '../components/segmented-control.js';
import { esc } from '../components/match-row.js';

function realWorld(overlay) {
  return { slots: overlay.slots, results: overlay.byFixture, mode: 'real' };
}

function followPicker(followTeam) {
  const opts = Object.keys(TEAMS)
    .sort((a, b) => teamName(a).localeCompare(teamName(b)))
    .map((c) => `<option value="${c}"${c === followTeam ? ' selected' : ''}>${teamFlag(c)} ${esc(teamName(c))}</option>`)
    .join('');
  return `<div class="ko-follow-bar">
    <label class="ko-follow-label" for="ko-follow-team">Following</label>
    <select id="ko-follow-team" aria-label="Team to follow">${opts}</select>
  </div>`;
}

function roundJump() {
  const chips = [['r32', 'R32'], ['r16', 'R16'], ['qf', 'QF'], ['sf', 'SF'], ['final', 'Final']];
  return `<div class="ko-jump" role="group" aria-label="Jump to round">
    ${chips.map(([st, label], i) => `<button class="ko-jump-chip${i === 0 ? ' active' : ''}" data-jump="${st}">${label}</button>`).join('')}
  </div>`;
}

function thirdPlacePanel(overlay) {
  const table = thirdPlaceTable(overlay.standings);
  if (!table.rows.length) {
    return `<section class="ko-thirds" aria-label="Third-place race">
      <h3>Best thirds</h3>
      <p class="empty-line">The third-place race begins once group results arrive.</p>
    </section>`;
  }
  return `<section class="ko-thirds" aria-label="Third-place race">
    <header class="ko-thirds-head">
      <h3>Best thirds</h3>
      <span class="ko-thirds-sub">${table.decided ? 'Top 8 advance — slots locked' : 'Top 8 advance · race in progress'}</span>
    </header>
    <div class="ko-thirds-grid">
    ${table.rows.map((r, i) => `
      <div class="ko-third${r.qualified ? ' in' : ''}${!r.complete ? ' provisional' : ''}">
        <span class="ko-third-rank">${i + 1}</span>
        <span class="ko-third-team">${teamFlag(r.code)} ${esc(teamName(r.code))}</span>
        <span class="ko-third-meta">3rd · Grp ${r.group} · ${r.pts} pts</span>
        <span class="ko-third-slot">${r.qualified ? (r.slot ? '→ Match ' + r.slot : 'Qualified') : (r.complete ? 'Out' : String(r.p) + ' of 3 played')}</span>
      </div>`).join('')}
    </div>
  </section>`;
}

export function renderKnockout(overlay) {
  const { nav } = getState();
  const follow = nav.bracketMode === 'follow' ? (nav.followTeam || 'USA') : null;
  return `<div class="knockout-pane">
    <div class="ko-controls">
      ${segmentedControl({
    id: 'bracket-mode', label: 'Bracket mode', value: nav.bracketMode,
    options: [
      { value: 'full', label: 'Full Bracket' },
      { value: 'follow', label: 'Follow a Team' },
    ],
  })}
      ${nav.bracketMode === 'follow' ? followPicker(follow) : ''}
      ${roundJump()}
    </div>
    <div class="bk-scroll" tabindex="0" aria-label="Knockout bracket, ${STAGE_NAMES.r32} to ${STAGE_NAMES.final}. Scroll horizontally.">
      ${bracketHTML(realWorld(overlay), { follow })}
    </div>
    ${thirdPlacePanel(overlay)}
  </div>`;
}

export function wireKnockout(outlet) {
  const mode = outlet.querySelector('[data-segmented="bracket-mode"]');
  if (mode) {
    mode.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-value]');
      if (btn) setBracketMode(btn.dataset.value);
    });
  }
  const picker = outlet.querySelector('#ko-follow-team');
  if (picker) picker.addEventListener('change', () => setBracketMode('follow', picker.value));
}
