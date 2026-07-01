// United 2026 — the graphical knockout bracket.
// One component, two worlds: the official bracket (real mode, factual and
// calm) and My World Cup (sim mode, gold, tappable picks). The geometry is a
// true tournament tree derived from canonical advancement edges — Round of 32
// through the Final plus the third-place match — drawn with cheap absolutely-
// positioned cards and one SVG connector layer. No canvas, no heavy filters.
//
// Truth rules enforced here: an unresolved slot renders as an informative
// muted chip (never a blank box, never a score); only fixtures with two
// resolved identities can show numbers.

import {
  fixture, allFixtures, teamName, teamFlag, slotLabel, winnerFeeds, loserFeeds, STAGE_NAMES,
} from '../core/canonical-truth.js';
import { TEAM_COLORS } from '../data/fixtures.js';
import { esc } from './match-row.js';

/* ---------------- geometry ---------------- */

export const BR = {
  unit: 84,          // vertical pitch of one R32 slot
  colW: 216,         // column pitch
  cardW: 188,
  headerH: 44,
  pad: 12,
  cardH: { r32: 66, r16: 72, qf: 80, sf: 90, final: 104, bronze: 66 },
};

const COLUMNS = ['r32', 'r16', 'qf', 'sf', 'final'];
const COL_INDEX = { r32: 0, r16: 1, qf: 2, sf: 3, final: 4, bronze: 4 };

/** Ordered fixture ids per column, derived from advancement edges (not time). */
function buildTreeOrder() {
  const finalFx = allFixtures().find((f) => f.stage === 'final');
  const leavesOf = (id) => {
    const f = fixture(id);
    const kids = [];
    for (const spec of [f.home, f.away]) {
      const m = /^W(\d+)$/.exec(spec);
      if (m) kids.push(Number(m[1]));
    }
    if (!kids.length) return [id];
    return kids.flatMap(leavesOf);
  };
  const cols = { r32: leavesOf(finalFx.id), r16: [], qf: [], sf: [], final: [finalFx.id] };
  const fill = (stage, prevIds) => {
    const seen = new Set();
    const out = [];
    for (const id of prevIds) {
      const feed = winnerFeeds(id);
      if (feed && !seen.has(feed.id)) { seen.add(feed.id); out.push(feed.id); }
    }
    cols[stage] = out;
  };
  fill('r16', cols.r32); fill('qf', cols.r16); fill('sf', cols.qf);
  return cols;
}
const TREE = buildTreeOrder();
const BRONZE_ID = allFixtures().find((f) => f.stage === 'bronze').id;

function centerY(stage, index) {
  const c = COL_INDEX[stage];
  return BR.headerH + BR.pad + ((index + 0.5) * (2 ** c)) * BR.unit;
}
function cardTop(stage, index) { return centerY(stage, index) - BR.cardH[stage] / 2; }
function colX(stage) { return BR.pad + COL_INDEX[stage] * BR.colW; }

export const CANVAS = {
  width: BR.pad * 2 + COLUMNS.length * BR.colW,
  height: BR.headerH + BR.pad * 2 + 16 * BR.unit,
};
export function columnOffset(stage) { return colX(stage); }

const posOf = new Map(); // id -> {stage, index, x, y(top), cy}
for (const stage of COLUMNS) {
  TREE[stage].forEach((id, i) => {
    posOf.set(id, { stage, index: i, x: colX(stage), y: cardTop(stage, i), cy: centerY(stage, i) });
  });
}
// Third-place match sits under the Final card.
posOf.set(BRONZE_ID, {
  stage: 'bronze', index: 0, x: colX('final'),
  y: centerY('final', 0) + BR.cardH.final / 2 + 40,
  cy: centerY('final', 0) + BR.cardH.final / 2 + 40 + BR.cardH.bronze / 2,
});

/* ---------------- world reading ---------------- */

function sideOf(world, fx, which) {
  const s = world.slots.get(fx.id);
  const code = s ? s[which] : null;
  if (code) return { code, name: teamName(code), flag: teamFlag(code), pending: false };
  return { code: null, name: slotLabel(which === 'home' ? fx.home : fx.away), flag: '', pending: true };
}

function resultOf(world, id) { return world.results.get(id) || null; }

/** Fixture ids on a followed team's realized + potential route to the final. */
export function teamRoute(world, code) {
  if (!code) return null;
  const lit = new Set();
  let eliminated = false;
  let lastId = null;
  const ko = COLUMNS.flatMap((s) => TREE[s]).concat([BRONZE_ID]);
  for (const id of ko) {
    const fx = fixture(id);
    const s = world.slots.get(id) || {};
    if (s.home !== code && s.away !== code) continue;
    lit.add(id);
    lastId = id;
    const r = resultOf(world, id);
    if (r && r.winner && r.winner !== 'draw') {
      const winCode = r.winner === 'home' ? s.home : s.away;
      if (winCode !== code && fx.stage !== 'bronze' && !loserFeeds(id)) eliminated = true;
      if (winCode !== code && fx.stage === 'sf') eliminated = false; // bronze still ahead
    }
  }
  if (lastId != null && !eliminated) {
    // potential path forward from the deepest known fixture
    let cur = lastId;
    const rLast = resultOf(world, cur);
    const sLast = world.slots.get(cur) || {};
    const lostLast = rLast && rLast.winner && (rLast.winner === 'home' ? sLast.home : sLast.away) !== code;
    let feed = lostLast ? loserFeeds(cur) : winnerFeeds(cur);
    while (feed) {
      lit.add(feed.id);
      const r = resultOf(world, feed.id);
      const s = world.slots.get(feed.id) || {};
      if (r && r.winner && (r.winner === 'home' ? s.home : s.away) !== code) break;
      cur = feed.id;
      feed = r && r.winner ? winnerFeeds(cur) : null;
    }
  }
  return lit;
}

/* ---------------- rendering ---------------- */

function chipHTML(world, fx, which, r) {
  const side = sideOf(world, fx, which);
  const winner = r && r.winner && r.winner !== 'draw' ? r.winner : null;
  const isWin = winner === which;
  const isLoss = winner && winner !== which;
  const goals = r && !side.pending ? (which === 'home' ? r.gh : r.ga) : null;
  const pens = r && r.pens ? (which === 'home' ? r.pens.ph : r.pens.pa) : null;
  return `<div class="bk-side${side.pending ? ' pending' : ''}${isWin ? ' win' : ''}${isLoss ? ' out' : ''}">
    <span class="bk-team">${side.flag ? `<span class="bk-flag">${side.flag}</span>` : ''}<span class="bk-name">${esc(side.name)}</span></span>
    ${goals != null ? `<span class="bk-goals">${goals}${pens != null ? `<small>(${pens})</small>` : ''}</span>` : ''}
  </div>`;
}

function stateLine(world, fx, r) {
  if (r && r.status === 'live') return `<span class="bk-state live"><span class="live-dot"></span>${r.min != null ? r.min + '&prime;' : 'LIVE'}</span>`;
  if (r && (r.winner || r.status === 'final')) return r.picked ? '<span class="bk-state picked">your call</span>' : '<span class="bk-state ft">FT</span>';
  const s = world.slots.get(fx.id) || {};
  if (world.mode === 'sim' && s.home && s.away) return '<span class="bk-state pick">tap to pick</span>';
  const d = new Date(fx.epoch - 4 * 3600 * 1000);
  return `<span class="bk-state time">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} · Match ${fx.id}</span>`;
}

function cardHTML(world, id, litSet) {
  const fx = fixture(id);
  const p = posOf.get(id);
  const r = resultOf(world, id);
  const s = world.slots.get(id) || {};
  const decided = !!(r && r.winner && r.winner !== 'draw');
  const winCode = decided ? (r.winner === 'home' ? s.home : s.away) : null;
  const glow = winCode ? (TEAM_COLORS[winCode] || '') : '';
  const dim = litSet && !litSet.has(id);
  const pickable = world.mode === 'sim' && !decided && s.home && s.away;
  const live = r && r.status === 'live';
  return `<${pickable ? 'button' : 'div'} class="bk-card ${fx.stage}${decided ? ' done' : ''}${live ? ' live' : ''}${dim ? ' dim' : ''}${litSet && litSet.has(id) ? ' lit' : ''}${pickable ? ' pickable' : ''}"
    data-bkid="${id}" style="left:${p.x}px;top:${p.y}px;width:${BR.cardW}px;height:${BR.cardH[fx.stage]}px;${glow ? `--glow:${glow};` : ''}"
    aria-label="${esc(STAGE_NAMES[fx.stage])}, match ${id}">
    ${chipHTML(world, fx, 'home', r)}
    ${chipHTML(world, fx, 'away', r)}
    ${stateLine(world, fx, r)}
  </${pickable ? 'button' : 'div'}>`;
}

function connectorSVG(world, litSet) {
  const paths = [];
  const ko = COLUMNS.flatMap((st) => TREE[st]);
  for (const id of ko) {
    const feed = winnerFeeds(id);
    if (!feed) continue;
    const a = posOf.get(id); const b = posOf.get(feed.id);
    const x1 = a.x + BR.cardW; const y1 = a.cy;
    const x2 = b.x; const y2 = b.cy;
    const mx = x1 + (x2 - x1) / 2;
    const r = resultOf(world, id);
    const decided = !!(r && r.winner && r.winner !== 'draw');
    const s = world.slots.get(id) || {};
    const winCode = decided ? (r.winner === 'home' ? s.home : s.away) : null;
    const lit = litSet ? (litSet.has(id) && litSet.has(feed.id)) : decided;
    const color = winCode && lit ? (TEAM_COLORS[winCode] || '') : '';
    paths.push(`<path d="M${x1} ${y1} H${mx} V${y2} H${x2}" class="bk-link${lit ? ' on' : ''}"${color ? ` style="stroke:${color}"` : ''}/>`);
  }
  // semifinal losers feed the third-place match (dotted, informational)
  for (const sfId of TREE.sf) {
    const a = posOf.get(sfId); const b = posOf.get(BRONZE_ID);
    paths.push(`<path d="M${a.x + BR.cardW} ${a.cy + 14} H${a.x + BR.cardW + 18} V${b.cy} H${b.x}" class="bk-link loser"/>`);
  }
  return `<svg class="bk-links" width="${CANVAS.width}" height="${CANVAS.height}" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}" aria-hidden="true">${paths.join('')}</svg>`;
}

/**
 * Full bracket canvas HTML.
 * @param world { slots, results: Map, mode: 'real'|'sim' }
 * @param opts  { follow: teamCode|null }
 */
export function bracketHTML(world, opts = {}) {
  const litSet = opts.follow ? teamRoute(world, opts.follow) : null;
  const headers = COLUMNS.map((st) => `
    <div class="bk-round-label" style="left:${colX(st)}px;width:${BR.cardW}px" data-round="${st}">
      ${STAGE_NAMES[st]}</div>`).join('');
  const cards = COLUMNS.flatMap((st) => TREE[st]).concat([BRONZE_ID])
    .map((id) => cardHTML(world, id, litSet)).join('');
  const bronzeLabel = `<div class="bk-bronze-label" style="left:${colX('final')}px;top:${posOf.get(BRONZE_ID).y - 26}px;width:${BR.cardW}px">${STAGE_NAMES.bronze}</div>`;
  return `<div class="bk-canvas${opts.follow ? ' following' : ''}" style="width:${CANVAS.width}px;height:${CANVAS.height}px">
    <div class="bk-headers" style="width:${CANVAS.width}px;height:${BR.headerH}px">${headers}</div>
    ${connectorSVG(world, litSet)}
    ${bronzeLabel}
    ${cards}
  </div>`;
}

/** Round-jump chips + the scroller wiring shared by both bracket surfaces. */
export function wireBracketScroller(rootEl) {
  const scroller = rootEl.querySelector('.bk-scroll');
  const chips = [...rootEl.querySelectorAll('[data-jump]')];
  if (!scroller || !chips.length) return;
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      scroller.scrollTo({ left: columnOffset(chip.dataset.jump) - BR.pad, behavior: 'smooth' });
    });
  });
  // Desktop drag-to-pan (touch devices pan natively).
  let dragging = false; let startX = 0; let startLeft = 0;
  scroller.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    dragging = true; startX = e.clientX; startLeft = scroller.scrollLeft;
    scroller.classList.add('dragging');
  });
  scroller.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    scroller.scrollLeft = startLeft - (e.clientX - startX);
  });
  const endDrag = () => { dragging = false; scroller.classList.remove('dragging'); };
  scroller.addEventListener('pointerup', endDrag);
  scroller.addEventListener('pointerleave', endDrag);

  let ticking = false;
  scroller.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const x = scroller.scrollLeft + BR.colW / 2;
      let active = 'r32';
      for (const st of COLUMNS) if (colX(st) <= x) active = st;
      chips.forEach((c) => c.classList.toggle('active', c.dataset.jump === active));
    });
  }, { passive: true });
}
