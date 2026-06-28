'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

function loadApp(opts = {}) {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  let script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
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
  window.requestAnimationFrame = (fn) => window.setTimeout(() => fn(Date.now()), 16);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  window.scrollTo = () => {};
  window.Element.prototype.scrollIntoView = () => {};
  window.MutationObserver = class { observe() {} disconnect() {} };
  window.AudioContext = function AudioContext() {};
  window.webkitAudioContext = window.AudioContext;
  if (opts.playState) window.localStorage.setItem('wc26_play_v1', JSON.stringify(opts.playState));
  const boot = 'seedLive();restoreState();recoverPlayColdOpenState();';
  assert.ok(script.includes(boot));
  script = script.replace(boot, `${opts.beforeBoot || ''}\n${boot}`);
  window.eval(`${script}
    window.__core = {
      getState:function(){return S;}, setState:function(v){S=v;}, blankState:blankState,
      GROUPS:GROUPS, MATCHES:MATCHES, M:M, REAL:REAL,
      renderBetting:renderBetting, bettingText:function(){return document.getElementById('betting').textContent;},
      playOpenMatches:playOpenMatches, openMatchTicket:openMatchTicket, getTk:function(){return _tk;},
      quickMatchState:quickMatchState, qmSet:qmSet, qmPick:qmPick, qmStake:qmStake, quickMatchRun:quickMatchRun, quickMatchNew:quickMatchNew,
      playCoreEnsure:playCoreEnsure, playCoreReplay:playCoreReplay, playCoreRematch:playCoreRematch, playCoreCreateRecord:playCoreCreateRecord, playCoreOpenRecord:playCoreOpenRecord,
      mywcStart:mywcStart, mywcRun:mywcRun, mywcNextMatch:mywcNextMatch, mywcPick:mywcPick, mywcRunNext:mywcRunNext,
      runWhatIf:runWhatIf, whatIfState:whatIfState, matchDeskHTML:matchDeskHTML,
      ts2Skip:ts2Skip, ts2Replay:ts2Replay, ts2SetSpeed:ts2SetSpeed, ts2Cancel:ts2Cancel,
      ts2Ctx:function(){return _ts2;}, ts2Runtime:function(){return window.__ts2.runtimeState();},
      tournamentTruthSnapshot:tournamentTruthSnapshot, standings:standings, matchCenterTruth:matchCenterTruth,
      text:function(sel){var el=document.querySelector(sel);return el?el.textContent:'';},
      playSave:function(){return JSON.parse(localStorage.getItem('wc26_play_v1')||'{}');}
    };`);
  return dom;
}

function withApp(opts, fn) {
  const dom = loadApp(opts);
  try { return fn(dom.window.__core, dom.window); }
  finally { dom.window.close(); }
}

const futureFixture = "M[55].date='2099-06-12';M[55].time='16:00';";

test('Play opens with all three lanes reachable and never blank', () => withApp({ beforeBoot: futureFixture }, (app) => {
  app.renderBetting();
  const text = app.bettingText();
  assert.match(text, /Real World Cup/, 'factual lane renders');
  assert.match(text, /Play Now/, 'Quick Match lane renders');
  assert.match(text, /My World Cup/, 'My World Cup lane renders');
  assert.match(text, /Official SIM\$ Pick/, 'official action language is visible');
  assert.doesNotMatch(text, /No confirmed official fixtures are open/, 'confirmed fixtures do not open blank/fallback');
}));

test('Official SIM$ Pick is isolated from virtual simulation records', () => withApp({ beforeBoot: futureFixture }, (app) => {
  app.openMatchTicket(55, 'h', 'official');
  const tk = app.getTk();
  assert.equal(tk.origin, 'official');
  tk.place(50);
  const s = app.getState();
  assert.equal(s.bets[s.bets.length - 1].origin, 'official');
  assert.equal(s.live, null, 'official pick never starts Matchcast');
  assert.equal(Object.keys(app.playCoreEnsure().virtualMatches).length, 0, 'official pick creates no virtual match');
}));

test('Quick Match prevents duplicate teams', () => withApp({}, (app) => {
  const q = app.quickMatchState();
  q.home = 'USA';
  q.away = 'USA';
  const before = Object.keys(app.playCoreEnsure().virtualMatches).length;
  app.quickMatchRun(false);
  assert.equal(Object.keys(app.playCoreEnsure().virtualMatches).length, before, 'duplicate-team match is not created');
  assert.equal(app.ts2Ctx(), null, 'duplicate-team match does not launch Matchcast');
}));

test('Quick Match creates one stable virtual match, launches at 0-0, settles once, replays unchanged, and rematches new', () => withApp({}, (app) => {
  const q = app.quickMatchState();
  q.home = 'USA';
  q.away = 'CAN';
  q.pick = 'h';
  q.stake = 100;
  const bank0 = app.getState().bank;

  app.quickMatchRun(false);
  let ids = Object.keys(app.playCoreEnsure().virtualMatches);
  assert.equal(ids.length, 1, 'one virtual match record is created');
  const rec = app.playCoreEnsure().virtualMatches[ids[0]];
  assert.equal(rec.source, 'quick_match');
  assert.ok(rec.seed != null && rec.probabilitySnapshot && rec.result && rec.capturedEventLog, 'canonical record is locked');
  assert.match(app.text('#ts2'), /SIMULATION/, 'visible Matchcast launch is mounted');
  assert.match(app.text('#ts2stage'), /0:0|0–0|0 – 0/, 'launch is visible before meaningful progression');
  assert.equal(app.getState().bank, bank0 - 100, 'challenge stake is debited once at launch');

  app.ts2Skip();
  const settledBank = app.getState().bank;
  assert.equal(rec.settlement.settled, true, 'result settles once');
  const settledAt = rec.settlement.settledAt;
  app.playCoreReplay(rec.id);
  app.ts2Skip();
  assert.equal(app.getState().bank, settledBank, 'replay never pays again');
  assert.equal(rec.settlement.settledAt, settledAt, 'replay keeps settlement stable');

  app.playCoreRematch(rec.id);
  ids = Object.keys(app.playCoreEnsure().virtualMatches);
  assert.equal(ids.length, 2, 'rematch creates a new record');
  const next = app.playCoreEnsure().virtualMatches[ids.find((id) => id !== rec.id)];
  assert.notEqual(next.seed, rec.seed, 'rematch deliberately uses a new seed');
}));

test('Existing Run What-If creates a canonical record and keeps one active fixture result path', () => withApp({ beforeBoot: futureFixture }, (app) => {
  app.runWhatIf(55);
  const records = Object.values(app.playCoreEnsure().virtualMatches).filter((r) => r.source === 'what_if');
  assert.equal(records.length, 1, 'Run What-If stores a canonical virtual record');
  assert.equal(records[0].officialFixtureRef.num, 55);
  app.runWhatIf(55);
  const again = Object.values(app.playCoreEnsure().virtualMatches).filter((r) => r.source === 'what_if');
  assert.equal(again.length, 1, 're-entering the active What-If does not duplicate the record');
  assert.equal(app.whatIfState(55), 'active');
}));

test('My World Cup saves, resumes, advances virtual standings without changing real Tournament state', () => withApp({ beforeBoot: futureFixture }, (app) => {
  const officialBefore = JSON.stringify(app.tournamentTruthSnapshot().official);
  const realScoreBefore = app.getState().sc[55];
  app.mywcStart();
  let run = app.mywcRun();
  const nx = app.mywcNextMatch(run);
  assert.ok(nx, 'saved run has a next virtual fixture');
  app.mywcPick('h');
  app.mywcRunNext(false);
  const rec = app.playCoreEnsure().virtualMatches[run.lastMatchId];
  app.ts2Skip();
  run = app.mywcRun();
  assert.ok(run.sc[rec.myWorldCupRef.num], 'My World Cup run records the virtual score');
  assert.equal(app.getState().sc[55], realScoreBefore, 'real Tournament score state is untouched');
  assert.equal(JSON.stringify(app.tournamentTruthSnapshot().official), officialBefore, 'official truth is unchanged');
  assert.ok(app.playSave().myWorldCup, 'run persists in wc26_play_v1');
}));

test('Speed-up, replay, and re-entry cannot duplicate timers, records, or settlement', () => withApp({}, (app) => {
  const q = app.quickMatchState();
  q.home = 'ARG';
  q.away = 'FRA';
  q.pick = 'd';
  q.stake = 25;
  app.quickMatchRun(false);
  const id = Object.keys(app.playCoreEnsure().virtualMatches)[0];
  app.ts2SetSpeed('fast');
  assert.equal(app.ts2Ctx().speed, 'fast');
  assert.ok(app.ts2Runtime().raf || app.ts2Runtime().runtime, 'one runtime is active');
  app.ts2Skip();
  const bank = app.getState().bank;
  const count = Object.keys(app.playCoreEnsure().virtualMatches).length;
  app.playCoreReplay(id);
  app.ts2SetSpeed('cinematic');
  app.ts2Skip();
  assert.equal(Object.keys(app.playCoreEnsure().virtualMatches).length, count, 'replay creates no duplicate record');
  assert.equal(app.getState().bank, bank, 'replay creates no duplicate settlement');
}));

test('Virtual Play remains isolated from official tickets, wallet history, Home/Tournament truth, standings, bracket and Match Center', () => withApp({ beforeBoot: futureFixture }, (app) => {
  app.openMatchTicket(55, 'a', 'official');
  app.getTk().place(40);
  const before = {
    official: JSON.stringify(app.tournamentTruthSnapshot().official),
    standings: app.standings('A').map((r) => `${r.code}:${r.Pts}:${r.GF}:${r.GA}`).join('|'),
    bracket: JSON.stringify(app.getState().realko),
    mc: JSON.stringify(app.matchCenterTruth(55)),
    officialBet: JSON.stringify(app.getState().bets[0]),
    hist: JSON.stringify(app.getState().bankHist),
  };
  const q = app.quickMatchState();
  q.home = 'BRA';
  q.away = 'GER';
  q.pick = 'a';
  q.stake = 10;
  app.quickMatchRun(false);
  app.ts2Skip();
  assert.equal(JSON.stringify(app.tournamentTruthSnapshot().official), before.official);
  assert.equal(app.standings('A').map((r) => `${r.code}:${r.Pts}:${r.GF}:${r.GA}`).join('|'), before.standings);
  assert.equal(JSON.stringify(app.getState().realko), before.bracket);
  assert.equal(JSON.stringify(app.matchCenterTruth(55)), before.mc);
  assert.equal(JSON.stringify(app.getState().bets[0]), before.officialBet, 'official ticket remains unchanged');
  assert.equal(JSON.stringify(app.getState().bankHist), before.hist, 'wallet history shape is preserved by virtual flow');
}));
