// United 2026 — Knockout. The complete official bracket as a monumental,
// horizontally navigable canvas: Round of 32 → Final plus the third-place
// match, real advancing light-trails, honest unresolved chips. Follow a Team
// is the default delight mode: pick a nation and its road to the trophy is
// instantly legible while the rest of the field falls into shadow.

import { getState, setBracketMode } from '../core/app-state.js';
import { teamName, teamFlag, fixture, slotLabel, STAGE_NAMES } from '../core/canonical-truth.js';
import { TEAMS, TEAM_COLORS, FIXTURES } from '../data/fixtures.js';
import { bracketHTML, teamRoute } from '../components/bracket.js';
import { segmentedControl } from '../components/segmented-control.js';
import { formatDayKey } from '../core/time.js';
import { esc } from '../components/match-row.js';

function realWorld(overlay) {
  return { slots: overlay.slots, results: overlay.byFixture, mode: 'real' };
}

/* Tactile follow picker: a scrollable rail of nation chips, not a form. */
function followPicker(followTeam) {
  const codes = Object.keys(TEAMS).sort((a, b) => teamName(a).localeCompare(teamName(b)));
  return `<div class="ko-follow-rail" id="ko-follow-team" role="listbox" aria-label="Team to follow">
    ${codes.map((c) => `
      <button class="ko-team-chip${c === followTeam ? ' on' : ''}" role="option"
        aria-selected="${c === followTeam}" data-follow="${c}"
        style="--tc:${TEAM_COLORS[c] || 'var(--official)'}">
        <span class="ko-chip-flag" aria-hidden="true">${teamFlag(c)}</span>
        <span class="ko-chip-name">${esc(teamName(c))}</span>
      </button>`).join('')}
  </div>`;
}

function roundJump() {
  const chips = [['r32', 'R32'], ['r16', 'R16'], ['qf', 'QF'], ['sf', 'SF'], ['final', 'Final']];
  return `<div class="ko-jump" role="group" aria-label="Jump to round">
    ${chips.map(([st, label], i) => `<button class="ko-jump-chip${i === 0 ? ' active' : ''}" data-jump="${st}">${label}</button>`).join('')}
  </div>`;
}

function teamGroup(code) {
  const gf = FIXTURES.find((f) => f.stage === 'group' && (f.home === code || f.away === code));
  return gf ? gf.group : null;
}

/* The followed team's road, spelled out: opponent by opponent, honestly. */
function routeSummary(overlay, code) {
  const world = realWorld(overlay);
  const lit = teamRoute(world, code) || new Set();
  const steps = [];
  for (const id of [...lit].sort((a, b) => fixture(a).epoch - fixture(b).epoch)) {
    const fx = fixture(id);
    const s = overlay.slots.get(id) || {};
    const inHome = s.home === code;
    const inAway = s.away === code;
    if (!inHome && !inAway) continue; // potential future tie — chips stay on the canvas
    const oppCode = inHome ? s.away : s.home;
    const oppSpec = inHome ? fx.away : fx.home;
    const opp = oppCode ? teamFlag(oppCode) + ' ' + esc(teamName(oppCode)) : esc(slotLabel(oppSpec));
    const r = overlay.byFixture.get(id);
    if (r && r.status === 'final' && r.winner && oppCode) {
      const won = (r.winner === 'home') === inHome;
      const score = r.gh != null ? (inHome ? `${r.gh}–${r.ga}` : `${r.ga}–${r.gh}`) : '';
      steps.push({
        label: STAGE_NAMES[fx.stage], opp,
        state: (won ? 'W ' : 'L ') + score, won, lost: !won && fx.stage !== 'bronze',
      });
    } else if (r && r.status === 'live') {
      steps.push({ label: STAGE_NAMES[fx.stage], opp, state: 'LIVE', live: true });
    } else {
      steps.push({ label: STAGE_NAMES[fx.stage], opp, state: formatDayKey(fx.day) });
    }
  }
  if (!steps.length) {
    const g = teamGroup(code);
    return `<div class="ko-route" role="status">
      <span class="ko-route-wait">${teamFlag(code)} ${esc(teamName(code))} — knockout place undecided${g ? ' · watching Group ' + esc(g) : ''}.</span>
    </div>`;
  }
  return `<div class="ko-route" aria-label="${esc(teamName(code))} route">
    ${steps.slice(0, 4).map((st) => `
      <div class="ko-route-step${st.won ? ' won' : ''}${st.lost ? ' lost' : ''}${st.live ? ' live' : ''}">
        <span class="ko-route-stage">${esc(st.label)}</span>
        <span class="ko-route-opp">${st.opp}</span>
        ${st.state ? `<span class="ko-route-state">${esc(st.state)}</span>` : ''}
      </div>`).join('')}
  </div>`;
}

export function renderKnockout(overlay) {
  const { nav } = getState();
  const follow = nav.bracketMode === 'follow' ? (nav.followTeam || 'USA') : null;
  return `<div class="knockout-pane">
    <div class="ko-controls">
      ${segmentedControl({
    id: 'bracket-mode', label: 'Bracket mode', value: nav.bracketMode,
    options: [
      { value: 'follow', label: 'Follow a Team' },
      { value: 'full', label: 'Full Bracket' },
    ],
  })}
      ${follow ? followPicker(follow) : ''}
      ${follow ? routeSummary(overlay, follow) : ''}
      ${roundJump()}
    </div>
    <div class="bk-scroll" tabindex="0" aria-label="Knockout bracket, ${STAGE_NAMES.r32} to ${STAGE_NAMES.final}. Scroll horizontally.">
      ${bracketHTML(realWorld(overlay), { follow })}
    </div>
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
  const rail = outlet.querySelector('#ko-follow-team');
  if (rail) {
    rail.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-follow]');
      if (chip) setBracketMode('follow', chip.dataset.follow);
    });
    // keep the chosen nation in view — scroll ONLY the rail, never ancestors
    const on = rail.querySelector('.ko-team-chip.on');
    if (on) rail.scrollLeft = Math.max(0, on.offsetLeft - rail.clientWidth / 2 + on.offsetWidth / 2);
  }
}
