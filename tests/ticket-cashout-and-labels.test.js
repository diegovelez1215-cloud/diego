/* Focused regression tests for Phase 7 hotfix:
   (A) raw status enums never reach the user, and
   (B) the live virtual Cash Out inside Ticket Simulation 2.0 is deterministic,
       bounded, settles the wallet exactly once, lets the sim continue, and can
       never re-pay the ticket through replay / skip / final settlement.
   Virtual money only — no real odds feed. Tournament truth is never touched. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

function loadApp() {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {}, fillRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillText() {},
    beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {}, stroke() {}, closePath() {},
    createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; },
    getImageData() { return { data: new Uint8ClampedArray(24 * 24 * 4) }; },
  });
  window.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
  window.requestAnimationFrame = (fn) => window.setTimeout(fn, 16);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  window.MutationObserver = class MutationObserver { observe() {} disconnect() {} };
  window.AudioContext = function AudioContext() {};
  window.webkitAudioContext = window.AudioContext;
  window.eval(`${script}
    window.__cashTest = {
      getState: function(){ return S; },
      setState: function(v){ S = v; },
      setBank: function(v){ S.bank = v; },
      blankState: blankState,
      settleAllBets: settleAllBets,
      canonicalBetState: canonicalBetState,
      betResultSheet: betResultSheet,
      addToSlip: addToSlip,
      removeSlip: removeSlip,
      openSlip: openSlip,
      slipDec: slipDec,
      amerToDec: amerToDec,
      decToAmer: decToAmer,
      slipLegsGroupedHTML: slipLegsGroupedHTML,
      ticketDisplayState: ticketDisplayState,
      ticketLegDetailHTML: ticketLegDetailHTML,
      styleText: function(){ return document.querySelector('style') ? document.querySelector('style').textContent : (document.head.innerHTML); }
    };`);
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  try { return fn(dom.window.__cashTest, dom.window.__ts2, dom.window); }
  finally { dom.window.close(); }
}

// A minimal but valid live context: one straight bet, one live (in-play) match leg.
function liveCtx(bet, over) {
  const dec = bet.odds > 0 ? 1 + bet.odds / 100 : 1 + 100 / -bet.odds;
  const maxPay = Math.round(bet.stake * dec);
  const ctx = {
    idx: 0, targets: [bet],
    legs: [{ betIndex: 0, num: 1, pick: bet.pick, label: 'Pick', parlay: false, simple: true,
             finalState: 'win', result: { teams: { h: 'BRA', a: 'ARG' }, score: { h: 1, a: 0 }, events: [] } }],
    results: {}, bankStart: 0, settled: false, speed: 'normal', cur: 0, phase: 'play',
    liveScore: { h: 1, a: 0 }, liveRed: { h: 0, a: 0 }, livePeriod: 'second half',
    liveMin: 60, liveEvent: { type: 'goal' }, shootout: null, drama: null,
    stakeTotal: bet.stake, maxPayout: maxPay, _cashedOut: false, cashOutAmount: 0, _cashPending: null,
  };
  return Object.assign(ctx, over || {});
}

/* ---------------------------------------------------------------- A. labels */

test('display-label helper maps every internal enum to fan-facing copy', () => withApp((app, ts2) => {
  const f = ts2.displayStatusLabel;
  assert.equal(f('IN_PLAY', 'match'), 'Live');
  assert.equal(f('IN_PLAY', 'ticket'), 'In play');
  assert.equal(f('IN_PLAY', 'simulation'), 'Match in progress');
  assert.equal(f('SETTLED', 'ticket'), 'Complete');
  assert.equal(f('VOID', 'ticket'), 'Voided');
  assert.equal(f('CASHED_OUT', 'ticket'), 'Cashed out');
  assert.equal(f('PENDING', 'fixture'), 'Awaiting official update');
  // never echoes a raw machine enum back out
  ['IN_PLAY', 'PENDING', 'SETTLED', 'VOID', 'CASHED_OUT'].forEach((raw) => {
    ['match', 'ticket', 'simulation', 'fixture', 'generic'].forEach((c) => {
      assert.ok(!/[A-Z]{2,}_[A-Z]/.test(f(raw, c)), `leaked enum-shaped text for ${raw}/${c}: ${f(raw, c)}`);
      assert.notEqual(f(raw, c), raw);
    });
  });
}));

test('simulation recap sheet renders no raw enums (Voided / Cashed out instead)', () => withApp((app, ts2, window) => {
  const bets = [
    { id: 'v', num: 1, pick: 'h', stake: 10, odds: 100, settled: true, void: true, state: 'void', net: 0 },
    { id: 'c', num: 2, pick: 'h', stake: 10, odds: 120, settled: true, cashed: true, state: 'won', net: 5, cashoutAmount: 15 },
    { id: 'l', num: 3, pick: 'h', stake: 10, odds: 120, settled: true, state: 'lost', net: -10 },
  ];
  app.betResultSheet(bets, -5);
  const html = window.document.getElementById('sheet').innerHTML;
  assert.ok(/\bVoided\b/.test(html), 'void ticket shows "Voided"');
  assert.ok(/Cashed out/.test(html), 'cashed ticket shows "Cashed out"');
  ['IN_PLAY', 'PENDING', 'SETTLED', 'VOID', 'CASHED'].forEach((raw) => {
    assert.ok(!new RegExp('\\b' + raw + '\\b').test(html), `recap leaked raw enum "${raw}"`);
  });
}));

/* ------------------------------------------------------------ B. cash out */

test('eligible in-progress ticket produces a positive bounded offer', () => withApp((app, ts2) => {
  const state = app.blankState(); state.mode = 'sim'; state.order = app.getState().order;
  const bet = { id: 'b1', num: 1, pick: 'h', stake: 100, odds: 120, settled: false, state: 'pending' };
  state.bets = [bet]; app.setState(state);
  ts2.setCtx(liveCtx(bet));
  const cx = ts2.ts2CashContext();
  assert.ok(cx && cx.eligible, 'cash out eligible while in play');
  assert.ok(cx.offer > 0, 'offer is positive');
  assert.ok(cx.offer < cx.maxPay, 'offer below full payout pre-win');
}));

test('offer updates after a meaningful event (goal lifts the value)', () => withApp((app, ts2) => {
  const state = app.blankState(); state.mode = 'sim'; state.order = app.getState().order;
  const bet = { id: 'b2', num: 1, pick: 'h', stake: 100, odds: 150, settled: false, state: 'pending' };
  state.bets = [bet]; app.setState(state);
  ts2.setCtx(liveCtx(bet, { liveScore: { h: 0, a: 0 }, liveMin: 10, livePeriod: 'first half' }));
  const before = ts2.ts2CashContext().offer;
  const ctx = ts2.getCtx(); ctx.liveScore = { h: 1, a: 0 }; ctx.liveMin = 70; ctx.liveEvent = { type: 'goal' };
  const after = ts2.ts2CashContext().offer;
  assert.ok(after > before, `offer should rise after going ahead (${before} -> ${after})`);
}));

test('dead ticket cannot cash out and never moves the wallet', () => withApp((app, ts2) => {
  const state = app.blankState(); state.mode = 'sim'; state.order = app.getState().order; state.bank = 1000;
  const bet = { id: 'b3', num: 1, pick: 'h', stake: 100, odds: 120, settled: false, state: 'pending' };
  state.bets = [bet]; app.setState(state);
  // leg already revealed as a loss -> ticket dead
  ts2.setCtx(liveCtx(bet, {
    cur: 1,
    legs: [{ betIndex: 0, num: 1, pick: 'h', simple: true, _done: true, finalState: 'lose',
             result: { teams: { h: 'BRA', a: 'ARG' }, score: { h: 0, a: 1 }, events: [] } }],
  }));
  const cx = ts2.ts2CashContext();
  assert.equal(cx.eligible, false, 'dead ticket is not eligible');
  assert.equal(cx.dead, true);
  const bank = app.getState().bank;
  ts2.getCtx()._cashPending = 999;
  ts2.ts2CashConfirm(); // must be a no-op
  assert.equal(app.getState().bank, bank, 'dead-ticket cash out cannot pay');
  assert.equal(app.getState().bets[0].settled, false, 'dead-ticket bet stays unsettled by cash out');
}));

test('offer never exceeds the full virtual payout, even with everything winning', () => withApp((app, ts2) => {
  const state = app.blankState(); state.mode = 'sim'; state.order = app.getState().order;
  const bet = { id: 'b4', num: 1, pick: 'h', stake: 100, odds: 120, settled: false, state: 'pending' };
  state.bets = [bet]; app.setState(state);
  // both an early-favourite live state and a fully-resolved-win state stay under maxPay
  ts2.setCtx(liveCtx(bet, { liveScore: { h: 5, a: 0 }, liveMin: 90 }));
  const live = ts2.ts2CashContext();
  assert.ok(live.offer < live.maxPay, 'live offer < full payout');
  ts2.setCtx(liveCtx(bet, {
    cur: 1,
    legs: [{ betIndex: 0, num: 1, pick: 'h', simple: true, _done: true, finalState: 'win',
             result: { teams: { h: 'BRA', a: 'ARG' }, score: { h: 3, a: 0 }, events: [] } }],
  }));
  const resolved = ts2.ts2CashContext();
  assert.ok(resolved.offer <= resolved.maxPay, 'resolved offer never exceeds full payout');
  assert.ok(resolved.offer < resolved.maxPay, 'and stays strictly below until the ticket fully wins/settles');
}));

test('cash out changes the bankroll exactly once', () => withApp((app, ts2) => {
  const state = app.blankState(); state.mode = 'sim'; state.order = app.getState().order; state.bank = 1000;
  const bet = { id: 'b5', num: 1, pick: 'h', stake: 100, odds: 120, settled: false, state: 'pending' };
  state.bets = [bet]; app.setState(state);
  ts2.setCtx(liveCtx(bet, { bankStart: 1000 }));
  const offer = ts2.ts2CashContext().offer;
  ts2.getCtx()._cashPending = offer;
  ts2.ts2CashConfirm();
  assert.equal(app.getState().bank, 1000 + offer, 'bank credited once by the offer');
  assert.equal(app.getState().bets[0].settled, true, 'bet settled by cash out');
  assert.equal(app.getState().bets[0].cashed, true);
  assert.equal(app.getState().bets[0].cashoutAmount, offer);
  // second confirm + a full settlement pass must not pay again
  ts2.ts2CashConfirm();
  app.settleAllBets();
  assert.equal(app.getState().bank, 1000 + offer, 'no double credit after cash out');
}));

test('simulation continues after cash out (no recap forced, ticket marked cashed)', () => withApp((app, ts2) => {
  const state = app.blankState(); state.mode = 'sim'; state.order = app.getState().order; state.bank = 1000;
  const bet = { id: 'b6', num: 1, pick: 'h', stake: 100, odds: 120, settled: false, state: 'pending' };
  state.bets = [bet]; app.setState(state);
  ts2.setCtx(liveCtx(bet, { bankStart: 1000 }));
  ts2.getCtx()._cashPending = ts2.ts2CashContext().offer;
  ts2.ts2CashConfirm();
  const ctx = ts2.getCtx();
  assert.ok(ctx, 'context still alive after cash out');
  assert.equal(ctx.phase, 'play', 'still in play — sim keeps running for comparison');
  assert.equal(ctx._cashedOut, true);
  // and the live cash control disappears once cashed
  const cx = ts2.ts2CashContext();
  assert.ok(!cx.eligible, 'cash control no longer eligible once cashed');
}));

test('finalize after cash out is blocked (final settlement never re-pays)', () => withApp((app, ts2) => {
  const state = app.blankState(); state.mode = 'sim'; state.order = app.getState().order; state.bank = 1000;
  const bet = { id: 'b7', num: 1, pick: 'h', stake: 100, odds: 120, settled: false, state: 'pending' };
  state.bets = [bet]; app.setState(state);
  ts2.setCtx(liveCtx(bet, { bankStart: 1000 }));
  ts2.getCtx()._cashPending = ts2.ts2CashContext().offer;
  ts2.ts2CashConfirm();
  const after = app.getState().bank;
  ts2.ts2Finalize();      // simulates reaching the end-of-sim settlement
  ts2.ts2Finalize();
  assert.equal(app.getState().bank, after, 'finalize must not move the wallet after cash out');
}));

test('end-to-end: live cash control mounts, confirm settles once, skip cannot re-settle', () => withApp((app, ts2, window) => {
  const state = app.blankState(); state.mode = 'sim'; state.order = app.getState().order; state.bank = 1000;
  state.bets = [{ id: 'e1', num: 1, pick: 'h', stake: 50, odds: 140, settled: false, state: 'pending', sourceMode: 'sim' }];
  app.setState(state);
  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message));

  window.ts2Launch(0);
  assert.ok(window.document.getElementById('ts2'), 'stage mounted');
  // force an eligible, in-play state and render the cash control
  const ctx = ts2.getCtx();
  ctx.liveMin = 55; ctx.liveScore = { h: 1, a: 0 }; ctx.liveEvent = { type: 'goal' }; ctx.livePeriod = 'second half';
  window.ts2RenderCash();
  const cashEl = window.document.querySelector('#ts2cash .ts2-cash');
  assert.ok(cashEl, 'live cash out control visible while in play');
  const btn = cashEl.querySelector('button');
  assert.ok(btn && !btn.disabled, 'cash out button is enabled and reachable in the lower stage action band');
  const children = Array.from(window.document.getElementById('ts2').children).map((el) => el.id);
  assert.deepEqual(children.slice(0, 4), ['ts2top', 'ts2stage', 'ts2cash', 'ts2rail'], 'cash out sits above the ticket rail in the thumb zone');

  // open the compact confirmation sheet
  window.ts2CashOut();
  const confirm = window.document.getElementById('ts2confirm');
  assert.ok(confirm, 'confirmation sheet opens');
  assert.ok(/Cash out for \$\d/.test(confirm.textContent), 'confirm shows "Cash out for $X virtual?"');
  assert.ok(/simulation will continue/i.test(confirm.textContent), 'confirm explains the sim continues');
  assert.equal(confirm.querySelectorAll('.ts2-confirm-row button').length, 2, 'two-button confirm row');

  const bankBefore = app.getState().bank;
  window.ts2CashConfirm();
  const bankAfter = app.getState().bank;
  assert.ok(bankAfter > bankBefore, 'cash out credited the virtual bank once');
  assert.equal(app.getState().bets[0].cashed, true);

  // skip to result after cash out: recap shows Cashed out and the wallet does not move again
  window.ts2Skip();
  const recap = window.document.getElementById('ts2recap');
  assert.ok(recap, 'recap shown after skip');
  assert.ok(/Cashed out/.test(recap.textContent), 'recap reflects the cash out');
  assert.ok(/Back to Play/.test(recap.textContent), 'cashed-out recap returns to Play by default');
  assert.ok(/World Cup Home/.test(recap.textContent), 'cashed-out recap keeps a secondary world cup home route');
  assert.ok(/New slip/.test(recap.textContent), 'cashed-out recap offers a new slip');
  assert.ok(!/Reset to live/.test(recap.textContent), 'cashed-out recap does not show reset to live');
  assert.ok(!/Edit ticket/.test(recap.textContent) && !/Edit slip/.test(recap.textContent), 'cashed-out recap does not show edit slip');
  assert.equal(app.getState().bank, bankAfter, 'skip-to-result cannot settle again');

  // replay then skip again: still no re-pay
  window.ts2Replay();
  window.ts2Skip();
  assert.equal(app.getState().bank, bankAfter, 'replay + skip cannot re-pay the cashed ticket');
  assert.equal(errors.length, 0, 'no uncaught errors during the cash-out flow: ' + errors.join(' | '));
}));

test('confirmation sheet is phone-first: inset, non-overflowing, two-up actions', () => withApp((app, ts2, window) => {
  const css = app.styleText();
  // pinned to the viewport with left/right insets (never a full-bleed width that overflows)
  assert.ok(/\.ts2-confirm\{[^}]*left:14px;right:14px/.test(css), 'confirm sheet uses 14px side insets');
  assert.ok(!/\.ts2-confirm\{[^}]*width:100vw/.test(css), 'confirm sheet is not full-viewport width');
  // actions are a 2-column grid (fits side-by-side at 390px and 430px)
  assert.ok(/\.ts2-confirm-row\{[^}]*grid-template-columns:1fr 1fr/.test(css), 'confirm actions are a 2-up grid');
  // the whole stage forbids horizontal overflow
  assert.ok(/\.ts2\{[^}]*overflow:hidden/.test(css), 'stage hides overflow (no horizontal scroll)');
}));

test('SIM$ slip grouping preserves existing odds and payout math', () => withApp((app, ts2, window) => {
  const state = app.blankState(); state.mode = 'sim'; state.order = app.getState().order; state.bank = 1000;
  state.slip = [
    { k: 'm', num: 1, pick: 'h', odds: 120, label: 'Brazil · Group A #1', key: 'm1h' },
    { k: 'mkt', num: 1, market: 'ou', side: 'over', line: 2.5, odds: -110, label: 'Over 2.5 · Group A #1', key: 'm1ou' },
    { k: 'm', num: 2, pick: 'a', odds: 150, label: 'Away · Group A #2', key: 'm2a' },
  ];
  app.setState(state);
  const bankBefore = app.getState().bank;
  const decBefore = app.slipDec();
  const grouped = app.slipLegsGroupedHTML(state.slip);
  assert.equal((grouped.match(/slip-group-h/g) || []).length, 2, 'slip groups legs by match');

  app.openSlip();
  const input = window.document.getElementById('tkStake');
  input.value = '25';
  window.tkUpd();
  assert.equal(app.slipDec(), decBefore, 'open slip UI does not change combined odds');
  const normalizedDec = app.amerToDec(app.decToAmer(decBefore));
  assert.equal(window.document.getElementById('tkRet').textContent, '$' + Math.round(25 * normalizedDec).toLocaleString(), 'potential return follows existing decimal to American odds display math');
  assert.equal(app.getState().bank, bankBefore, 'opening/editing slip does not move wallet');
}));

test('adding and removing SIM$ selections gives visible feedback without changing wallet', () => withApp((app) => {
  const state = app.blankState(); state.mode = 'sim'; state.order = app.getState().order; state.bank = 1000; state.slip = [];
  app.setState(state);
  const leg = { k: 'm', num: 1, pick: 'h', odds: 120, label: 'Brazil · Group A #1', key: 'm1h' };
  app.addToSlip(leg);
  assert.equal(app.getState().slip.length, 1, 'selection added to slip');
  assert.equal(app.getState().bank, 1000, 'add to slip does not debit wallet');
  app.addToSlip(leg);
  assert.equal(app.getState().slip.length, 1, 'duplicate add stays as one visible selection');
  app.removeSlip(0);
  assert.equal(app.getState().slip.length, 0, 'selection removed from slip');
  assert.equal(app.getState().bank, 1000, 'remove from slip does not debit or credit wallet');
}));

test('active ticket presentation shows pending, cashed out, and settled states clearly', () => withApp((app) => {
  const pending = { id: 'p', num: 1, pick: 'h', stake: 25, odds: 120, settled: false, state: 'pending' };
  const cashed = { id: 'c', num: 1, pick: 'h', stake: 25, odds: 120, settled: true, state: 'won', cashed: true, cashoutAmount: 33 };
  const won = { id: 'w', num: 1, pick: 'h', stake: 25, odds: 120, settled: true, state: 'won' };
  assert.equal(app.ticketDisplayState(pending, { cls: 'pending', note: '' }).t, 'Pending');
  assert.equal(app.ticketDisplayState(cashed, { cls: 'won', note: '' }).t, 'Cashed out');
  assert.equal(app.ticketDisplayState(won, { cls: 'won', note: '' }).t, 'Settled · won');
  assert.ok(/Pending/.test(app.ticketLegDetailHTML({ kind: 'par', legs: [{ k: 'm', num: 72, pick: 'h', odds: 120, label: 'Brazil', key: 'm72h' }], stake: 25, odds: 120 })), 'leg detail reads pending before settlement');
}));
