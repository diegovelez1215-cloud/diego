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
      ticketStageContract: ticketStageContract,
      tseLegTimeline: tseLegTimeline,
      tseSideState: tseSideState,
      instantSimMatch: instantSimMatch,
      settleAllBets: settleAllBets,
      canonicalBetState: canonicalBetState,
      koParts: koParts,
      M: M,
      REAL: REAL
    };`);
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  try {
    return fn(dom.window.__ticketSimTest);
  } finally {
    dom.window.close();
  }
}

test('same seed reproduces the same full event log', () => withApp((app) => {
  const a = app.premiumSimMatch(1, { seed: 12345 });
  const b = app.premiumSimMatch(1, { seed: 12345 });
  assert.deepEqual(a.score, b.score);
  assert.deepEqual(a.events, b.events);
  assert.equal(a.replayKey, b.replayKey);
}));

test('one red card lowers expected attacking output across a seeded sample', () => withApp((app) => {
  let normal = 0;
  let red = 0;
  for (let i = 1; i <= 90; i++) {
    normal += app.premiumSimMatch(1, { seed: i, disableRandomCards: true }).metrics.h.attack;
    red += app.premiumSimMatch(1, { seed: i, redCards: { h: 1, a: 0 }, disableRandomCards: true }).metrics.h.attack;
  }
  assert.ok(red < normal * 0.72, `expected one red to suppress attack: ${red} vs ${normal}`);
}));

test('two red cards create a materially larger disadvantage', () => withApp((app) => {
  let one = 0;
  let two = 0;
  for (let i = 1; i <= 90; i++) {
    one += app.premiumSimMatch(1, { seed: i, redCards: { h: 1, a: 0 }, disableRandomCards: true }).metrics.h.attack;
    two += app.premiumSimMatch(1, { seed: i, redCards: { h: 2, a: 0 }, disableRandomCards: true }).metrics.h.attack;
  }
  assert.ok(two < one * 0.45, `expected two reds to be severe: ${two} vs ${one}`);
}));

test('a nine-man team can score rarely only through valid event reasons', () => withApp((app) => {
  const allowed = new Set(['counterattack', 'set piece', 'penalty', 'own goal', 'defensive error']);
  let nineManGoals = 0;
  for (let i = 1; i <= 420; i++) {
    const result = app.premiumSimMatch(1, { seed: i, redCards: { h: 2, a: 0 }, disableRandomCards: true });
    result.events.filter((ev) => ev.type === 'goal' && ev.side === 'h').forEach((ev) => {
      nineManGoals += 1;
      assert.equal(allowed.has(ev.reason), true, `invalid nine-man goal reason ${ev.reason}`);
    });
  }
  assert.ok(nineManGoals > 0, 'expected at least one rare nine-man goal in seeded sample');
}));

test('leading teams become conservative late', () => withApp((app) => {
  const state = app.tseSideState(2, 1, 82, 0, 0);
  assert.equal(state.gameState, 'leading');
  assert.equal(state.tacticalPosture, 'defensive');
}));

test('trailing teams attack late and take counterattack risk', () => withApp((app) => {
  const chasing = app.tseSideState(1, 2, 82, 0, 0);
  const leading = app.tseSideState(2, 1, 82, 0, 0);
  assert.equal(chasing.gameState, 'chasing');
  assert.equal(chasing.tacticalPosture, 'attacking');
  assert.ok(chasing.latePressure > leading.latePressure);
  assert.ok(chasing.intensity > leading.intensity);
}));

test('regulation draw in knockout simulation goes to extra time', () => withApp((app) => {
  const result = app.premiumSimMatch(73, { home: 'POR', away: 'COL', knockout: true, seed: 77, forceRegulationDraw: true });
  assert.ok(result.events.some((ev) => ev.type === 'extra_time_start'));
  assert.equal(result.regulationScore.h, result.regulationScore.a);
}));

test('extra-time draw goes to penalties', () => withApp((app) => {
  const result = app.premiumSimMatch(73, { home: 'POR', away: 'COL', knockout: true, seed: 77, forceRegulationDraw: true, forceExtraTimeDraw: true });
  assert.equal(result.period, 'penalties');
  assert.ok(result.shootout);
}));

test('penalty shootout creates exactly one advancing team', () => withApp((app) => {
  const result = app.premiumSimMatch(73, { home: 'POR', away: 'COL', knockout: true, seed: 82, forceRegulationDraw: true, forceExtraTimeDraw: true });
  assert.ok(['POR', 'COL'].includes(result.advancingTeam));
  assert.notEqual(result.shootout.h, result.shootout.a);
  assert.equal([result.advancingTeam].filter(Boolean).length, 1);
}));

test('ticket-leg states update through the event log', () => withApp((app) => {
  const ticket = { num: 1, pick: 'h', stake: 25, odds: 120, settled: false, state: 'pending' };
  const result = app.premiumSimMatch(1, { seed: 44 });
  const timeline = app.tseLegTimeline(ticket, result);
  assert.ok(timeline.length >= 1);
  assert.ok(['settled', 'losing'].includes(timeline[timeline.length - 1].legState));
  assert.ok(timeline.some((x) => x.keyEvent));
}));

test('simulation cannot mutate official tournament state', () => withApp((app) => {
  const before = JSON.stringify({ REAL: app.REAL, real: app.getState().real, realko: app.getState().realko, rwState: app.getState().rwState });
  app.premiumSimMatch(1, { seed: 888 });
  app.premiumSimMatch(73, { home: 'POR', away: 'COL', knockout: true, seed: 889, forceRegulationDraw: true, forceExtraTimeDraw: true });
  const after = JSON.stringify({ REAL: app.REAL, real: app.getState().real, realko: app.getState().realko, rwState: app.getState().rwState });
  assert.equal(after, before);
}));

test('primary-stage output fits the later one-screen mobile contract', () => withApp((app) => {
  const ticket = { num: 1, pick: 'h', stake: 25, odds: 120, settled: false, state: 'pending' };
  const result = app.premiumSimMatch(1, { seed: 99 });
  const stage = app.ticketStageContract(ticket, result, 1, 1);
  ['compactTicketSummary', 'currentMatch', 'score', 'matchClock', 'period', 'eventHeadline', 'ticketLegState', 'overallTicketState', 'playbackState', 'replayKey', 'detail'].forEach((key) => {
    assert.ok(Object.prototype.hasOwnProperty.call(stage, key), `${key} missing`);
  });
  assert.equal(stage.screenContract.minWidth, 390);
  assert.equal(stage.screenContract.maxWidth, 430);
  assert.equal(stage.screenContract.requiresVerticalScroll, false);
  assert.ok(stage.detail.events);
}));

test('instant ticket simulation uses sim-only state and existing settlement path once', () => withApp((app) => {
  const state = app.blankState();
  state.mode = 'sim';
  state.order = app.getState().order;
  state.bets = [{ id: 't1', num: 1, pick: 'h', stake: 10, odds: 100, settled: false, state: 'pending', sourceMode: 'sim' }];
  state.bank = 990;
  app.setState(state);
  const officialBefore = JSON.stringify(app.REAL);
  assert.equal(app.instantSimMatch(1), true);
  assert.equal(!!app.getState().betsim[1], true);
  assert.equal(JSON.stringify(app.REAL), officialBefore);
  app.settleAllBets();
  const once = app.getState().bank;
  app.settleAllBets();
  assert.equal(app.getState().bank, once);
  assert.ok(['won', 'lost'].includes(app.canonicalBetState(app.getState().bets[0])));
}));
