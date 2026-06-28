'use strict';
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
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    getImageData() { return { data: new Uint8ClampedArray(24 * 24 * 4) }; },
  });
  window.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
  window.requestAnimationFrame = (fn) => window.setTimeout(fn, 16);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  window.scrollTo = () => {};
  window.MutationObserver = class { observe() {} disconnect() {} };
  window.AudioContext = function AudioContext() {};
  window.webkitAudioContext = window.AudioContext;
  window.eval(`${script}
    window.__resetRecovery = {
      getState:function(){return S;}, setState:function(v){S=v;}, blankState:blankState,
      GROUPS:GROUPS, MATCHES:MATCHES, M:M, REAL:REAL,
      resetToLiveNow:resetToLiveNow, doReset:doReset, renderBetting:renderBetting,
      playOpenMatches:playOpenMatches, playFeaturedMarketHTML:playFeaturedMarketHTML,
      playLandingHTML:playLandingHTML, matchDeskHTML:matchDeskHTML,
      tournamentTruthSnapshot:tournamentTruthSnapshot, matchCenterTruth:matchCenterTruth,
      standings:standings, koParts:koParts,
      setPlayHidden:function(){_betCat='history';_betMode='parlay';S.playPick={num:1,pick:'h'};S.activeMatch=1;S.activeFlow='whatif';S.postBetAction={num:1};S.actionRail={type:'stale'};},
      betCategory:function(){return _betCat;},
      bettingText:function(){return document.getElementById('betting').textContent;},
      confirmReset:function(){doReset();var f=window.__cfn;window.__cfn=null;if(f)f();}
    };`);
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  try {
    return fn(dom.window.__resetRecovery, dom.window);
  } finally {
    dom.window.close();
  }
}

function freshState(app) {
  Object.keys(app.REAL).forEach((k) => { delete app.REAL[k]; });
  const s = app.blankState();
  Object.keys(app.GROUPS).forEach((g) => { s.order[g] = app.GROUPS[g].slice(); });
  s.mode = 'sim';
  s.bank = 8765;
  s.bankHist = [10000, 8765];
  app.setState(s);
  return s;
}

function makeFixtureAvailable(app, num = 1) {
  app.M[num].date = '2099-06-12';
  app.M[num].time = '16:00';
  return app.M[num];
}

function makeNoFixturesAvailable(app) {
  app.MATCHES.forEach((m) => {
    m.date = '2000-01-01';
    m.time = '12:00';
  });
}

function officialTicket(num = 2) {
  return { id: 'official-ticket', num, pick: 'h', stake: 111, odds: -110, settled: false, state: 'pending', origin: 'official', sourceMode: 'sim' };
}

test('reset from an active What-If restores factual Play fixtures and clears stale Play view state', () => withApp((app) => {
  const s = freshState(app);
  const m = makeFixtureAvailable(app, 1);
  s.live = { num: 1, h: m.home, a: m.away, isKO: false, min: 23, sh: 1, sa: 0, ev: [], feed: [], xgH: 1, xgA: 1 };
  s.sc[1] = { h: 1, a: 0 };
  s.betsim[1] = 1;
  s.bets = [officialTicket(2)];
  s.slip = [{ k: 'm', num: 1, pick: 'h', odds: 100, label: 'Virtual pick', key: 'v1' }];
  app.setState(s);
  app.setPlayHidden();

  app.confirmReset();
  app.renderBetting();

  assert.equal(app.getState().live, null, 'active What-If is cleared');
  assert.equal(app.getState().sc[1], undefined, 'virtual What-If score is cleared');
  assert.equal(app.getState().betsim[1], undefined, 'virtual result marker is cleared');
  assert.equal(app.betCategory(), 'matches', 'Play lands on the matches category');
  assert.equal(app.getState().playPick, null, 'stale Play selection is cleared');
  assert.equal(app.getState().activeMatch, null, 'stale active match context is cleared');
  assert.ok(app.playOpenMatches().some((x) => x.num === 1), 'confirmed official fixture is available again');
  assert.match(app.bettingText(), /Featured match|Match picks/, 'Play renders a factual fixture surface');
  assert.match(app.bettingText(), /Official SIM\$ Pick/, 'factual fixture includes official pick path');
}));

test('reset from a finished What-If restores a usable factual fixture surface without rerolling', () => withApp((app) => {
  const s = freshState(app);
  makeFixtureAvailable(app, 1);
  s.sc[1] = { h: 3, a: 2 };
  s.betsim[1] = 1;
  s._lastTicketSim = { seed: 123, score: { h: 3, a: 2 } };
  app.setState(s);
  app.setPlayHidden();

  app.confirmReset();
  app.renderBetting();

  assert.equal(app.getState().sc[1], undefined, 'finished virtual result is removed');
  assert.equal(app.getState().betsim[1], undefined, 'finished virtual marker is removed');
  assert.equal(app.getState().live, null, 'no virtual match is created by reset');
  assert.equal(app.getState()._lastTicketSim, undefined, 'reset did not create a fresh simulation result');
  assert.match(app.bettingText(), /Featured match|Match picks/, 'Play is usable after finished What-If reset');
}));

test('with no confirmed official fixture, reset renders an intentional fallback with Open Tournament', () => withApp((app) => {
  const s = freshState(app);
  makeNoFixturesAvailable(app);
  s.sc[1] = { h: 2, a: 1 };
  s.betsim[1] = 1;
  app.setState(s);
  app.setPlayHidden();

  app.confirmReset();
  app.renderBetting();

  assert.equal(app.playOpenMatches().length, 0, 'test setup has no open confirmed official fixtures');
  assert.match(app.bettingText(), /No confirmed official fixtures are open for Play right now/, 'fallback explains the factual no-fixture state');
  assert.match(app.bettingText(), /Open Tournament/, 'fallback offers Tournament as the recovery action');
  assert.doesNotMatch(app.bettingText(), /Matchcast/, 'factual fallback does not add a fake official sim feature');
}));

test('reset preserves official truth, user ledger, standings, bracket and Match Center', () => withApp((app) => {
  const s = freshState(app);
  makeFixtureAvailable(app, 3);
  app.REAL[2] = [1, 0];
  s.real[2] = 1;
  s.sc[2] = { h: 1, a: 0 };
  s.bank = 7654;
  s.bankHist = [10000, 7654];
  s.bets = [officialTicket(2), { id: 'history', num: 2, pick: 'a', stake: 50, odds: 120, settled: true, state: 'lost', net: -50 }];
  s.slip = [{ k: 'm', num: 3, pick: 'h', odds: 100, label: 'Kept slip', key: 'kept-slip' }];
  s.realko[73] = 'ARG';
  app.setState(s);

  const before = {
    truth: JSON.stringify(app.tournamentTruthSnapshot().official),
    standing: app.standings('A').map((r) => `${r.code}:${r.Pts}:${r.GF}:${r.GA}`).join('|'),
    bracket: JSON.stringify(app.getState().realko),
    matchCenter: JSON.stringify(app.matchCenterTruth(2)),
    bets: JSON.stringify(app.getState().bets),
    slip: JSON.stringify(app.getState().slip),
    bank: app.getState().bank,
    bankHist: JSON.stringify(app.getState().bankHist),
    mode: app.getState().mode,
  };

  app.confirmReset();

  assert.equal(JSON.stringify(app.tournamentTruthSnapshot().official), before.truth, 'official truth is preserved');
  assert.equal(app.standings('A').map((r) => `${r.code}:${r.Pts}:${r.GF}:${r.GA}`).join('|'), before.standing, 'standings are preserved');
  assert.equal(JSON.stringify(app.getState().realko), before.bracket, 'official bracket state is preserved');
  assert.equal(JSON.stringify(app.matchCenterTruth(2)), before.matchCenter, 'Match Center truth is preserved');
  assert.equal(JSON.stringify(app.getState().bets), before.bets, 'official ticket and history are preserved');
  assert.equal(JSON.stringify(app.getState().slip), before.slip, 'slip is preserved');
  assert.equal(app.getState().bank, before.bank, 'wallet is preserved');
  assert.equal(JSON.stringify(app.getState().bankHist), before.bankHist, 'wallet history is preserved');
  assert.equal(app.getState().mode, before.mode, 'reset does not switch hidden global mode');
}));
