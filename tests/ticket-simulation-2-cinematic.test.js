const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

// Loads the app exactly like the engine suite, and additionally surfaces the
// cinematic Ticket Simulation 2.0 presentation-layer helpers (window.__ts2).
function loadApp() {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {}, fillRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillText() {},
    getImageData() { return { data: new Uint8ClampedArray(24 * 24 * 4) }; },
  });
  window.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
  window.requestAnimationFrame = (fn) => window.setTimeout(fn, 16);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  window.MutationObserver = class MutationObserver { observe() {} disconnect() {} };
  window.AudioContext = function AudioContext() {};
  window.webkitAudioContext = window.AudioContext;
  window.eval(`${script}
    window.__ticketSimTest = {
      getState: function(){ return S; },
      setState: function(v){ S = v; },
      blankState: blankState,
      premiumSimMatch: premiumSimMatch,
      settleAllBets: settleAllBets,
      canonicalBetState: canonicalBetState,
      M: M, REAL: REAL
    };`);
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  try {
    return fn(dom.window.__ticketSimTest, dom.window.__ts2, dom.window);
  } finally {
    dom.window.close();
  }
}

test('cinematic helpers are exposed', () => withApp((app, ts2) => {
  assert.ok(ts2, 'window.__ts2 missing');
  ['ts2Legs', 'ts2StateAt', 'ts2FinalState', 'ts2ClosestMoment', 'ts2BestCall', 'ts2DecidingLeg', 'ts2Capture', 'ts2Finalize'].forEach((k) => {
    assert.equal(typeof ts2[k], 'function', `${k} not exposed`);
  });
}));

test('live leg-state mapping reflects the running score', () => withApp((app, ts2) => {
  assert.equal(ts2.ts2StateAt({ h: 2, a: 0 }, 'h'), 'win');
  assert.equal(ts2.ts2StateAt({ h: 1, a: 1 }, 'h'), 'sweat');
  assert.equal(ts2.ts2StateAt({ h: 0, a: 1 }, 'h'), 'lose');
  assert.equal(ts2.ts2StateAt({ h: 0, a: 2 }, 'a'), 'win');
  assert.equal(ts2.ts2StateAt({ h: 1, a: 1 }, 'd'), 'win');
  assert.equal(ts2.ts2StateAt({ h: 1, a: 0 }, 'd'), 'sweat');
}));

test('final leg-state honours knockout advancement (penalties)', () => withApp((app, ts2) => {
  const ko = app.premiumSimMatch(73, { home: 'POR', away: 'COL', knockout: true, seed: 82, forceRegulationDraw: true, forceExtraTimeDraw: true });
  assert.ok(ko.advancingTeam, 'expected an advancing team');
  const winPick = ko.advancingTeam === ko.teams.h ? 'h' : 'a';
  const losePick = winPick === 'h' ? 'a' : 'h';
  assert.equal(ts2.ts2FinalState(ko, winPick), 'win');
  assert.equal(ts2.ts2FinalState(ko, losePick), 'lose');
}));

test('ticket legs are built from single bets and multi-leg parlays', () => withApp((app, ts2) => {
  const state = app.blankState();
  state.mode = 'sim';
  state.order = app.getState().order;
  state.bets = [
    { id: 's1', num: 1, pick: 'h', stake: 10, odds: 120, settled: false, state: 'pending' },
    { id: 'p1', kind: 'par', stake: 20, odds: 260, settled: false, state: 'pending',
      legs: [{ k: 'm', num: 2, pick: 'h', label: 'Home · #2' }, { k: 'm', num: 3, pick: 'a', label: 'Away · #3' }] },
  ];
  app.setState(state);
  const legs = ts2.ts2Legs(state.bets);
  assert.equal(legs.length, 3, 'one single + two parlay match legs');
  assert.equal(legs[0].num, 1);
  assert.equal(legs[0].parlay, false);
  assert.equal(legs[1].parlay, true);
  assert.equal(legs.map((l) => l.num).join(','), '1,2,3');
}));

test('a one-leg ticket builds a single watchable leg', () => withApp((app, ts2) => {
  const state = app.blankState();
  state.mode = 'sim';
  state.order = app.getState().order;
  state.bets = [{ id: 'o1', num: 1, pick: 'h', stake: 25, odds: 120, settled: false, state: 'pending' }];
  app.setState(state);
  const legs = ts2.ts2Legs(state.bets);
  assert.equal(legs.length, 1);
  assert.equal(legs[0].num, 1);
}));

test('capture uses sim-only state and never mutates official truth', () => withApp((app, ts2) => {
  const state = app.blankState();
  state.mode = 'sim';
  state.order = app.getState().order;
  state.bank = 990;
  state.bets = [{ id: 'c1', num: 1, pick: 'h', stake: 10, odds: 100, settled: false, state: 'pending', sourceMode: 'sim' }];
  app.setState(state);
  const officialBefore = JSON.stringify(app.REAL);
  const legs = ts2.ts2Legs(state.bets);
  const cap = ts2.ts2Capture(legs);
  assert.ok(cap.order.includes(1), 'match 1 captured');
  assert.equal(!!app.getState().betsim[1], true, 'sim-only betsim flag set');
  assert.equal(JSON.stringify(app.REAL), officialBefore, 'official REAL untouched');
}));

test('finalize settles the wallet exactly once (replay never double-settles)', () => withApp((app, ts2) => {
  const state = app.blankState();
  state.mode = 'sim';
  state.order = app.getState().order;
  state.bank = 990;
  state.bets = [{ id: 'f1', num: 1, pick: 'h', stake: 10, odds: 100, settled: false, state: 'pending', sourceMode: 'sim' }];
  app.setState(state);
  const legs = ts2.ts2Legs(state.bets);
  ts2.ts2Capture(legs);
  ts2.setCtx({ targets: state.bets, legs, settled: false, bankStart: app.getState().bank });
  ts2.ts2Finalize();
  const once = app.getState().bank;
  ts2.ts2Finalize(); // replay path must not settle again
  assert.equal(app.getState().bank, once, 'second finalize must not move the wallet');
  assert.ok(['won', 'lost'].includes(app.canonicalBetState(app.getState().bets[0])));
}));

test('recap insight helpers stay honest and never throw', () => withApp((app, ts2) => {
  const res = app.premiumSimMatch(1, { seed: 99 });
  const winPick = res.score.h >= res.score.a ? 'h' : 'a';
  const legs = [{ num: 1, pick: winPick, simple: true, label: 'Pick · #1', result: res, finalState: ts2.ts2FinalState(res, winPick) }];
  const close = ts2.ts2ClosestMoment(legs);
  if (close) { assert.equal(typeof close.label, 'string'); assert.ok(close.label.length > 0); }
  const best = ts2.ts2BestCall(legs);
  const deciding = ts2.ts2DecidingLeg(legs);
  // exactly one of bestCall / decidingLeg is populated for a settled single leg
  assert.ok((best && !deciding) || (!best && deciding));
}));

test('end-to-end: launch builds the one-screen stage, skip lands a recap, settle once', () => withApp((app, ts2, window) => {
  const state = app.blankState();
  state.mode = 'sim';
  state.order = app.getState().order;
  state.bank = 1000;
  state.bets = [
    { id: 'e1', kind: 'par', stake: 30, odds: 320, settled: false, state: 'pending',
      legs: [{ k: 'm', num: 1, pick: 'h', label: 'Home · #1' }, { k: 'm', num: 2, pick: 'a', label: 'Away · #2' }] },
  ];
  app.setState(state);
  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message));
  // Build ticket -> launch Matchday
  window.ts2Launch(0);
  const stage = window.document.getElementById('ts2');
  assert.ok(stage, 'matchday overlay mounted');
  // top controls: cinematic by default, no old Normal/Fast/Cinematic mode labels
  const topText = window.document.getElementById('ts2top').textContent;
  assert.ok(/Watch live/.test(topText), 'watch-live control present');
  assert.ok(/Skip to result/.test(topText), 'skip-to-result control present');
  ['Normal', 'Fast', 'Cinematic'].forEach((label) => assert.ok(!topText.includes(label), `old playback label leaked: ${label}`));
  assert.ok(window.document.querySelector('#ts2top .ts2-x'), 'close control present');
  // main stage
  assert.ok(window.document.querySelector('#ts2stage .ts2-board'), 'score board present');
  assert.ok(window.document.querySelector('#ts2stage .ts2-score'), 'score present');
  assert.ok(window.document.querySelector('#ts2stage .ts2-period'), 'period state present');
  assert.ok(window.document.querySelector('#ts2stage .ts2-clock'), 'match clock present');
  // ticket rail mirrors the legs
  assert.equal(window.document.querySelectorAll('#ts2rail .ts2-leg').length, 2, 'two leg chips on the rail');
  // skip to result -> premium recap
  window.ts2Skip();
  assert.ok(window.document.getElementById('ts2recap'), 'recap shown after skip');
  const recapText = window.document.getElementById('ts2recap').textContent;
  assert.ok(/Back to Play/.test(recapText), 'back-to-play primary recap action present');
  assert.ok(/Return to What-If Match selection\./.test(recapText), 'supporting copy present');
  assert.ok(/World Cup Home/.test(recapText), 'world-cup-home secondary action present');
  assert.ok(/New slip/.test(recapText), 'new-slip recap action present');
  assert.ok(/Replay/.test(recapText), 'replay recap action present');
  assert.ok(!/Run it back/.test(recapText), 'completed recap never shows run-it-back');
  assert.ok(!/Edit slip/.test(recapText) && !/Edit ticket/.test(recapText), 'completed recap never shows edit-slip');
  assert.ok(!/Reset to live/.test(recapText), 'completed recap never shows reset-to-live');
  const settledBank = app.getState().bank;
  // replaying must not move the wallet again
  window.ts2Replay();
  window.ts2Skip();
  assert.equal(app.getState().bank, settledBank, 'replay must not re-settle the wallet');
  assert.equal(errors.length, 0, 'no uncaught errors during the experience: ' + errors.join(' | '));
}));

test('run-it-back clears the simulation context for a fresh start', () => withApp((app, ts2, window) => {
  const state = app.blankState();
  state.mode = 'sim';
  state.order = app.getState().order;
  state.bank = 1000;
  state.bets = [{ id: 'r1', num: 1, pick: 'h', stake: 20, odds: 120, settled: false, state: 'pending' }];
  app.setState(state);
  window.ts2Launch(0);
  assert.ok(ts2.getCtx(), 'context active during playback');
  window.ts2Skip();
  window.ts2RunItBack();
  assert.equal(ts2.getCtx(), null, 'run-it-back resets to a clean context');
  assert.equal(!!window.document.getElementById('ts2'), false, 'overlay removed on run-it-back');
}));
