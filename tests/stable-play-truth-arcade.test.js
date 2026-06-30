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
  window.requestAnimationFrame = (fn) => window.setTimeout(() => fn(Date.now()), 16);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  window.MutationObserver = class MutationObserver { observe() {} disconnect() {} };
  window.AudioContext = function AudioContext() {};
  window.webkitAudioContext = window.AudioContext;
  window.eval(`${script}
    window.__stable = {
      getState:function(){return S;}, setState:function(v){S=v;}, blankState:blankState,
      MATCHES:MATCHES, GROUPS:GROUPS, REAL:REAL, M:M,
      gMatches:gMatches, curISO:curISO, nextISO:nextISO,
      tournamentPhaseState:tournamentPhaseState, todayRailHTML:todayRailHTML,
      playLandingHTML:playLandingHTML, mountText:function(html){var d=document.createElement('div');d.innerHTML=html||'';return d.textContent;},
      whatIfChallengeSheet:whatIfChallengeSheet, whatIfRunChallenge:whatIfRunChallenge, whatIfSkipChallenge:whatIfSkipChallenge,
      ts2LaunchWhatIf:ts2LaunchWhatIf, playOpenMatches:playOpenMatches,
      renderBetting:renderBetting, truthOfficialFinalScore:truthOfficialFinalScore
    };`);
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  try { return fn(dom.window.__stable, dom.window, dom.window.__ts2); }
  finally { dom.window.close(); }
}

function reset(app) {
  Object.keys(app.REAL).forEach((k) => delete app.REAL[k]);
  const s = app.blankState();
  s.mode = 'real';
  Object.keys(app.GROUPS).forEach((g) => { s.order[g] = app.GROUPS[g].slice(); });
  app.setState(s);
  return s;
}

function setOfficial(app, state, num, h, a) {
  app.REAL[num] = [h, a];
  state.sc[num] = { h, a };
  state.real[num] = 1;
}

function fillAllGroups(app, state) {
  Object.keys(app.GROUPS).forEach((g) => {
    app.gMatches(g).forEach((m) => setOfficial(app, state, m.num, 1, 0));
  });
}

function firstOpenMatch(app) {
  const m = app.playOpenMatches()[0];
  assert.ok(m, 'expected an eligible What-If match');
  return m.num;
}

function makeFutureOpenFixture(app, state, skip = null) {
  const m = app.MATCHES.find((x) => x.stage === 'group' && x.num !== skip && !state.real[x.num]);
  assert.ok(m, 'expected a group fixture to make available');
  m.date = app.nextISO(app.curISO());
  m.time = '23:30';
  delete state.sc[m.num];
  delete state.real[m.num];
  delete app.REAL[m.num];
  return m.num;
}

test('named provider Round-of-32 fixtures move factual phase to knockout', () => withApp((app) => {
  const s = reset(app);
  fillAllGroups(app, s);
  s.officialKOFixtures = {};
  const teams = Object.values(app.GROUPS).flat();
  for (let n = 73; n <= 88; n += 1) {
    const i = (n - 73) * 2;
    s.officialKOFixtures[n] = { num: n, home: teams[i], away: teams[i + 1], source: 'official_provider_fixture', status: 'TIMED' };
  }
  const ph = app.tournamentPhaseState();
  assert.equal(ph.phase, 'round_of_32');
  assert.equal(ph.roundOf32PairingsConfirmed, true);
}));

test('scheduled fixtures do not count as completed today', () => withApp((app) => {
  const s = reset(app);
  app.MATCHES.forEach((m) => { m.date = '2026-07-30'; });
  const today = app.curISO(), tomorrow = app.nextISO(today);
  app.M[1].date = today; app.M[2].date = today; app.M[3].date = tomorrow;
  const text = app.mountText(app.todayRailHTML({}));
  assert.doesNotMatch(text, /completed today/);
  assert.match(text, /\b\d+ matches? left today\b/);
}));

test('Play exposes the What-If hero plus the My World Cup mode, no sportsbook routes', () => withApp((app, window) => {
  const s = reset(app);
  makeFutureOpenFixture(app, s);
  const html = app.playLandingHTML();
  const text = app.mountText(html);
  assert.match(text, /What-If arcade|What-If Match/);
  // My World Cup is now a deliberate, working private-tournament entry (Phase C).
  assert.match(text, /My World Cup/);
  assert.doesNotMatch(text, /Quick Match|Play Now/);
  app.renderBetting();
  const rendered = window.document.getElementById('betting').textContent;
  assert.doesNotMatch(rendered, /Simple Picks|Parlay Lab|Match picks|Favourites parlay|Longshot parlay/);
}));

test('SIM$ Challenge is pre-kickoff only and launches the Matchboard at 0-0', () => withApp((app, window, ts2) => {
  const s = reset(app);
  makeFutureOpenFixture(app, s);
  const num = firstOpenMatch(app);
  app.whatIfChallengeSheet(num, 'h');
  assert.match(window.document.getElementById('sheet').textContent, /SIM\$ Challenge/);
  const beforeBets = s.bets.length;
  app.whatIfRunChallenge();
  assert.equal(window.document.getElementById('whatIfChallenge'), null, 'challenge sheet is gone after kickoff');
  assert.equal(s.bets.length, beforeBets + 1, 'challenge ticket is created once');
  app.whatIfRunChallenge();
  assert.equal(s.bets.length, beforeBets + 1, 'challenge cannot be edited after kickoff');
  assert.ok(window.document.querySelector('#ts2stage .ts2-matchboard'), 'mini-pitch Matchboard mounted');
  assert.ok(window.document.querySelector('#ts2stage .ts2-ball'), 'moving ball marker mounted');
  assert.equal(window.document.getElementById('ts2sh').textContent, '0');
  assert.equal(window.document.getElementById('ts2sa').textContent, '0');
  assert.match(window.document.getElementById('ts2stage').textContent, /Kick-off/);
  assert.equal(ts2.getCtx().arcade, true);
}));

test('Matchboard movement reveals no future score early and Cash Out is active only in-play', () => withApp((app, window, ts2) => {
  const s = reset(app);
  makeFutureOpenFixture(app, s);
  const num = firstOpenMatch(app);
  app.whatIfChallengeSheet(num, 'h');
  app.whatIfRunChallenge();
  const ctx = ts2.getCtx(), leg = ctx.legs[0];
  const plan = ts2.ts2BuildDirectorPlan(leg, 'cinematic', 1);
  const f0 = ts2.ts2DirectorFrame(plan, leg, 0);
  const f250 = ts2.ts2DirectorFrame(plan, leg, 250);
  assert.notDeepEqual(f0.frame.ball, f250.frame.ball, 'ball moves immediately');
  assert.equal(f0.score.h, 0, 'no future home score at kickoff');
  assert.equal(f0.score.a, 0, 'no future away score at kickoff');
  assert.equal(window.document.getElementById('ts2cash').textContent, '', 'cash out hidden before live progress');
  ctx.liveMin = 12;
  ts2.ts2RenderCash();
  assert.match(window.document.getElementById('ts2cash').textContent, /Cash out/);
  window.ts2Skip();
  ts2.ts2RenderCash();
  assert.equal(window.document.getElementById('ts2cash').textContent, '', 'cash out hidden after full-time recap');
}));

test('Replay settles once and Rematch creates a fresh run', () => withApp((app, window, ts2) => {
  const s = reset(app);
  makeFutureOpenFixture(app, s);
  const num = firstOpenMatch(app);
  app.whatIfChallengeSheet(num, 'h');
  app.whatIfRunChallenge();
  const firstKey = ts2.getCtx().replayKey;
  window.ts2Skip();
  const afterSettle = s.bank;
  assert.equal(s.bets.filter((b) => b.settled).length, 1);
  window.ts2Replay();
  window.ts2Skip();
  assert.equal(s.bank, afterSettle, 'Replay never settles again');
  window.ts2Rematch();
  app.whatIfSkipChallenge();
  assert.notEqual(ts2.getCtx().replayKey, firstKey, 'Rematch captures a new seed/result');
}));

test('virtual What-If does not mutate official truth or official ledger state', () => withApp((app, window) => {
  const s = reset(app);
  setOfficial(app, s, 1, 3, 1);
  s.realko[73] = 'ARG';
  s.bets.push({ id: 'official-1', num: 1, pick: 'h', stake: 50, odds: -110, settled: false, state: 'pending', sourceMode: 'official' });
  const officialScore = JSON.stringify(app.REAL[1]);
  const officialKO = JSON.stringify(s.realko);
  const officialTicket = JSON.stringify(s.bets[0]);
  app.MATCHES.forEach((m) => { m.date = '2026-07-30'; });
  makeFutureOpenFixture(app, s, 1);
  const num = firstOpenMatch(app);
  app.M[num].date = app.curISO();
  app.M[num].time = '23:30';
  app.whatIfChallengeSheet(num, null);
  app.whatIfSkipChallenge();
  window.ts2Skip();
  assert.equal(JSON.stringify(app.REAL[1]), officialScore);
  assert.equal(JSON.stringify(s.realko), officialKO);
  assert.equal(JSON.stringify(s.bets[0]), officialTicket);
  const rail = app.mountText(app.todayRailHTML({}));
  assert.match(rail, /Later today/);
  assert.match(rail, /1 match left today/);
}));
