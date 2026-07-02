// United 2026 — Road. A phone-first path through the knockout tournament:
// Full Road by default, Follow a Team when the fan wants a personal path, and
// a hidden canonical bracket surface kept for structural truth guards.

import { getState, setBracketMode, openMatchCenter } from '../core/app-state.js';
import { allFixtures, teamName, teamFlag, fixture, slotLabel, STAGE_NAMES, STAGE_ORDER } from '../core/canonical-truth.js';
import { TEAMS, TEAM_COLORS, FIXTURES } from '../data/fixtures.js';
import { bracketHTML, teamRoute } from '../components/bracket.js';
import { segmentedControl } from '../components/segmented-control.js';
import { formatDayKey } from '../core/time.js';
import { esc } from '../components/match-row.js';
import { fixtureModel } from '../data/tournament-model.js';

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

function roundLabel(stage) {
  return stage === 'r32' ? 'Start'
    : stage === 'r16' ? 'Survive'
      : stage === 'qf' ? 'Breakthrough'
        : stage === 'sf' ? 'One Night'
          : stage === 'final' ? 'Destination'
            : 'Aftermath';
}

function roadState(m) {
  if (m.live) return 'LIVE' + (m.min != null ? ' ' + m.min + '\'' : '');
  if (m.final) return m.scoreKnown ? `${m.gh}-${m.ga} FT` : 'FT';
  return m.dateLabel + ' · ' + m.time;
}

function teamLine(side, goals, winner, eliminated) {
  return `<div class="road-team${side.pending ? ' pending' : ''}${winner ? ' winner' : ''}${eliminated ? ' eliminated' : ''}">
    <span class="road-team-name">${side.flag ? `<span aria-hidden="true">${side.flag}</span>` : ''}${esc(side.name)}</span>
    <span class="road-team-tail">${winner ? '<em>Advanced</em>' : eliminated ? '<em>Eliminated</em>' : ''}${goals != null ? `<b class="road-team-score">${goals}</b>` : ''}</span>
  </div>`;
}

function roadMatchCard(m, { featured = false, muted = false } = {}) {
  const homeWin = m.winner === 'home';
  const awayWin = m.winner === 'away';
  const showScores = m.scoreKnown;
  const hc = !m.home.pending ? TEAM_COLORS[m.home.code] || '' : '';
  const ac = !m.away.pending ? TEAM_COLORS[m.away.code] || '' : '';
  return `<button class="road-match${featured ? ' featured' : ''}${muted ? ' muted' : ''}${m.live ? ' live' : ''}${m.final ? ' finaled' : ''}"
    data-match="${m.id}" data-bkid="${m.id}" style="${hc ? `--hc:${hc};` : ''}${ac ? `--ac:${ac};` : ''}">
    <span class="road-match-meta">${esc(m.stageName)} · Match ${m.id}</span>
    ${teamLine(m.home, showScores ? m.gh : null, homeWin, m.final && m.winner && !homeWin)}
    ${teamLine(m.away, showScores ? m.ga : null, awayWin, m.final && m.winner && !awayWin)}
    <span class="road-match-state">${esc(roadState(m))}</span>
  </button>`;
}

function sortedKOModels(overlay) {
  return allFixtures()
    .filter((f) => f.stage !== 'group')
    .map((f) => fixtureModel(f, overlay))
    .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.epoch - b.epoch || a.id - b.id);
}

function followRoadHTML(overlay, code) {
  const world = realWorld(overlay);
  const route = teamRoute(world, code) || new Set();
  const models = sortedKOModels(overlay).filter((m) => route.has(m.id));
  const byStage = new Map();
  for (const m of models) {
    if (!byStage.has(m.stage)) byStage.set(m.stage, []);
    byStage.get(m.stage).push(m);
  }
  const stages = ['r32', 'r16', 'qf', 'sf', 'final', 'bronze'];
  return `<section class="road-mobile follow-road" aria-label="${esc(teamName(code))} road">
    <header class="road-hero" style="--tc:${TEAM_COLORS[code] || 'var(--official)'}">
      <span class="road-hero-flag" aria-hidden="true">${teamFlag(code)}</span>
      <div><p>${esc(teamName(code))} road</p><h2>Path to the Final</h2></div>
    </header>
    <div class="road-stage-strip">
      ${stages.map((stage, i) => {
    const list = byStage.get(stage) || [];
    const isDestination = stage === 'final';
    const visible = list.length ? list : sortedKOModels(overlay).filter((m) => m.stage === stage).slice(0, isDestination ? 1 : 0);
    if (!visible.length && stage !== 'bronze') {
      return `<section class="road-stage unresolved ${isDestination ? 'destination' : ''}" data-road-stage="${stage}">
        <span class="road-step">${String(i + 1).padStart(2, '0')}</span>
        <h3>${esc(STAGE_NAMES[stage])}</h3>
        <p class="road-stage-note">Route unlocks after the previous result.</p>
      </section>`;
    }
    if (!visible.length) return '';
    return `<section class="road-stage${isDestination ? ' destination' : ''}${stage === 'sf' ? ' dramatic' : ''}" data-road-stage="${stage}">
        <span class="road-step">${String(i + 1).padStart(2, '0')}</span>
        <p class="road-stage-kicker">${roundLabel(stage)}</p>
        <h3>${esc(STAGE_NAMES[stage])}</h3>
        ${visible.map((m) => roadMatchCard(m, { featured: isDestination || stage === 'sf' })).join('')}
      </section>`;
  }).join('')}
    </div>
  </section>`;
}

function fullRoadHTML(overlay) {
  const models = sortedKOModels(overlay);
  const stages = ['r32', 'r16', 'qf', 'sf', 'final', 'bronze'];
  return `<section class="road-mobile full-road" aria-label="Full Road">
    <header class="road-hero full">
      <div><p>Full Road</p><h2>Round by round</h2></div>
      <span class="road-hero-count">32 teams</span>
    </header>
    <div class="road-stage-strip">
      ${stages.map((stage, i) => {
    const list = models.filter((m) => m.stage === stage);
    const destination = stage === 'final';
    return `<section class="road-stage${destination ? ' destination' : ''}${stage === 'sf' ? ' dramatic' : ''}" data-road-stage="${stage}">
      <span class="road-step">${String(i + 1).padStart(2, '0')}</span>
      <p class="road-stage-kicker">${roundLabel(stage)}</p>
      <h3>${esc(STAGE_NAMES[stage])}</h3>
      <div class="road-match-grid">
        ${list.map((m) => roadMatchCard(m, { featured: destination || stage === 'sf' })).join('')}
      </div>
    </section>`;
  }).join('')}
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
      { value: 'full', label: 'Full Road' },
      { value: 'follow', label: 'Follow a Team' },
    ],
  })}
      ${follow ? followPicker(follow) : ''}
      ${follow ? routeSummary(overlay, follow) : ''}
      ${roundJump()}
    </div>
    ${follow ? followRoadHTML(overlay, follow) : fullRoadHTML(overlay)}
    <div class="ko-truth-shadow" aria-hidden="true">
      <div class="bk-scroll" tabindex="-1" aria-label="Canonical bracket truth surface">
        ${bracketHTML(realWorld(overlay), { follow })}
      </div>
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
  outlet.querySelectorAll('.road-match[data-match]').forEach((card) => {
    card.addEventListener('click', () => openMatchCenter(Number(card.dataset.match)));
  });
  const jumps = outlet.querySelector('.ko-jump');
  if (jumps) {
    jumps.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-jump]');
      if (!btn) return;
      const strip = outlet.querySelector('.road-stage-strip');
      const target = outlet.querySelector(`[data-road-stage="${btn.dataset.jump}"]`);
      if (strip && target) {
        strip.scrollTo({ left: Math.max(0, target.offsetLeft - strip.offsetLeft), behavior: 'smooth' });
      }
      jumps.querySelectorAll('.ko-jump-chip').forEach((chip) => chip.classList.toggle('active', chip === btn));
    });
  }
}
