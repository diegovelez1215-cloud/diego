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
  const boot = 'seedLive();restoreState();recoverPlayColdOpenState();';
  assert.ok(script.includes(boot));
  script = script.replace(boot, `${opts.beforeBoot || ''}\n${boot}`);
  window.eval(`${script}
    window.__game = {
      getState:function(){return S;}, setState:function(v){S=v;}, blankState:blankState,
      GROUPS:GROUPS, MATCHES:MATCHES, M:M, REAL:REAL,
      renderBetting:renderBetting, bettingText:function(){return document.getElementById('betting').textContent;},
      playCoreEnsure:playCoreEnsure, playCoreReplay:playCoreReplay, playCoreRematch:playCoreRematch,
      quickMatchState:quickMatchState, quickMatchRun:quickMatchRun, quickMatchNew:quickMatchNew,
      mywcStart:mywcStart, mywcRun:mywcRun, mywcNextMatch:mywcNextMatch, mywcRunNext:mywcRunNext, mywcProgress:mywcProgress,
      openMatchTicket:openMatchTicket, getTk:function(){return _tk;},
      ts2Skip:ts2Skip, ts2SetSpeed:ts2SetSpeed, ts2Ctx:function(){return _ts2;},
      ts2EstimatePlayback:ts2EstimatePlayback, ts2BuildDirectorPlan:ts2BuildDirectorPlan, ts2BuildStops:ts2BuildStops,
      tournamentTruthSnapshot:tournamentTruthSnapshot, standings:standings, matchCenterTruth:matchCenterTruth,
      text:function(sel){var el=document.querySelector(sel);return el?el.textContent:'';},
      playSave:function(){return JSON.parse(localStorage.getItem('wc26_play_v1')||'{}');}
    };`);
  return dom;
}

function withApp(opts, fn) {
  const dom = loadApp(opts);
  try { return fn(dom.window.__game, dom.window); }
  finally { dom.window.close(); }
}

const futureFixture = "M[55].date='2099-06-12';M[55].time='16:00';";

test('first-open hierarchy leads with Play Now, Start My World Cup second, and Real World Cup factual section', () => withApp({ beforeBoot: futureFixture }, (app) => {
  app.renderBetting();
  const text = app.bettingText();
  assert.ok(text.indexOf('Play Now') < text.indexOf('Start My World Cup'), 'Play Now leads before My World Cup start');
  assert.ok(text.indexOf('Start My World Cup') < text.indexOf('Real World Cup'), 'Real World Cup is separate after game actions');
  assert.match(text, /Official SIM\$ Pick/, 'factual lane still offers official picks');
}));

test('saved run hierarchy leads with Continue My World Cup, next fixture, and Run Next Match', () => withApp({ beforeBoot: futureFixture }, (app) => {
  app.mywcStart();
  app.renderBetting();
  const text = app.bettingText();
  assert.ok(text.indexOf('Continue My World Cup') < text.indexOf('Play Now'), 'saved run becomes primary');
  assert.match(text, /Run Next Match/, 'primary action is Run Next Match');
  assert.match(text, /played/, 'progress is visible');
  assert.ok(text.indexOf('Play Now') < text.indexOf('Real World Cup'), 'Quick Match remains secondary before factual section');
}));

test('official SIM$ Pick stays factual and never launches Matchcast or virtual records', () => withApp({ beforeBoot: futureFixture }, (app) => {
  app.openMatchTicket(55, 'h', 'official');
  const tk = app.getTk();
  assert.equal(tk.origin, 'official');
  tk.place(25);
  assert.equal(app.ts2Ctx(), null);
  assert.equal(app.getState().live, null);
  assert.equal(Object.keys(app.playCoreEnsure().virtualMatches).length, 0);
  assert.equal(app.getState().bets[0].origin, 'official');
}));

test('Play Now launches at 0-0, has fast deterministic pacing, replay is stable, rematch is new', () => withApp({}, (app) => {
  const q = app.quickMatchState();
  q.home = 'USA';
  q.away = 'MEX';
  q.pick = 'h';
  q.stake = 50;
  app.quickMatchRun(false);
  const ids = Object.keys(app.playCoreEnsure().virtualMatches);
  const rec = app.playCoreEnsure().virtualMatches[ids[0]];
  const lg = app.ts2Ctx().legs[0];
  const plan = app.ts2BuildDirectorPlan(lg, 'cinematic', 1, app.ts2BuildStops(lg));
  assert.match(app.text('#ts2'), /SIMULATION/);
  assert.match(app.text('#ts2stage'), /0:0|0–0|0 – 0/, 'kickoff shows 0-0');
  assert.ok(plan.firstRevealMs <= 2000, 'first event/progress starts quickly');
  assert.ok(plan.total >= 35000 && plan.total <= 55000, 'normal match is paced as a fast arcade match');
  const eventOrder = rec.capturedEventLog.map((e) => e.minute + ':' + e.type).join('|');
  app.ts2SetSpeed('fast');
  assert.equal(app.ts2Ctx().speed, 'fast', 'speed-up changes pace only');
  assert.equal(rec.capturedEventLog.map((e) => e.minute + ':' + e.type).join('|'), eventOrder, 'speed-up does not change events');
  app.ts2Skip();
  const bankAfter = app.getState().bank;
  app.playCoreReplay(rec.id);
  app.ts2Skip();
  assert.equal(app.getState().bank, bankAfter, 'replay cannot settle again');
  app.playCoreRematch(rec.id);
  const all = Object.values(app.playCoreEnsure().virtualMatches);
  assert.equal(all.length, 2);
  assert.notEqual(all[0].seed, all[1].seed, 'rematch creates a new seed');
}));

test('My World Cup starts, resumes on next match, and advances only the isolated run', () => withApp({ beforeBoot: futureFixture }, (app) => {
  const officialBefore = JSON.stringify(app.tournamentTruthSnapshot().official);
  const standingsBefore = app.standings('A').map((r) => `${r.code}:${r.Pts}:${r.GF}:${r.GA}`).join('|');
  app.mywcStart();
  let run = app.mywcRun();
  const first = app.mywcNextMatch(run);
  assert.ok(first, 'run starts at a playable fixture');
  app.mywcRunNext(false);
  const rec = app.playCoreEnsure().virtualMatches[run.lastMatchId];
  app.ts2Skip();
  run = app.mywcRun();
  assert.ok(run.sc[rec.myWorldCupRef.num], 'isolated tournament advances');
  assert.match(app.bettingText(), /Run Next Match|Continue My World Cup/, 'run can resume after the match');
  assert.equal(JSON.stringify(app.tournamentTruthSnapshot().official), officialBefore);
  assert.equal(app.standings('A').map((r) => `${r.code}:${r.Pts}:${r.GF}:${r.GA}`).join('|'), standingsBefore);
  assert.ok(app.playSave().myWorldCup, 'run persists in Play storage');
}));

test('Real World Cup cold-open and refresh availability remains provider-driven', () => withApp({ beforeBoot: futureFixture }, (app) => {
  app.renderBetting();
  assert.ok(app.bettingText().includes('Real World Cup'));
  assert.ok(app.bettingText().includes('Official SIM$ Pick'));
  assert.ok(app.bettingText().includes('Match Result'));
  const before = app.playCoreEnsure().virtualMatches;
  app.renderBetting();
  assert.equal(app.playCoreEnsure().virtualMatches, before, 'refresh/render does not invent virtual matches');
}));

test('virtual Play cannot mutate factual tournament, official tickets, wallet history, bracket, or Match Center', () => withApp({ beforeBoot: futureFixture }, (app) => {
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
  assert.equal(JSON.stringify(app.getState().bets[0]), before.officialBet);
  assert.equal(JSON.stringify(app.getState().bankHist), before.hist);
}));
