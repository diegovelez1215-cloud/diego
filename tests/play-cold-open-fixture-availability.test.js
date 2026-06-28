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
  window.requestAnimationFrame = (fn) => window.setTimeout(fn, 16);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  window.scrollTo = () => {};
  window.MutationObserver = class { observe() {} disconnect() {} };
  window.AudioContext = function AudioContext() {};
  window.webkitAudioContext = window.AudioContext;
  if (opts.legacyState) window.localStorage.setItem('wc26_v1', JSON.stringify(opts.legacyState));
  if (opts.userState) window.localStorage.setItem('wc26_user_v1', JSON.stringify(opts.userState));
  if (opts.playState) window.localStorage.setItem('wc26_play_v1', JSON.stringify(opts.playState));
  const boot = 'seedLive();restoreState();recoverPlayColdOpenState();';
  assert.ok(script.includes(boot), 'test boot hook must match app startup');
  script = script.replace(boot, `${opts.beforeBoot || ''}\n${boot}`);
  window.eval(`${script}
    window.__coldPlay = {
      getState:function(){return S;}, setState:function(v){S=v;}, blankState:blankState,
      GROUPS:GROUPS, MATCHES:MATCHES, M:M, T:T, REAL:REAL,
      renderBetting:renderBetting, playOpenMatches:playOpenMatches,
      playFeaturedMarketHTML:playFeaturedMarketHTML, playLandingHTML:playLandingHTML,
      matchDeskHTML:matchDeskHTML, officialMarketHTML:officialMarketHTML,
      officialMarketLabel:officialMarketLabel, officialFixtureTeams:officialFixtureTeams,
      officialFixtureEligible:officialFixtureEligible, officialFixtureClosedReason:officialFixtureClosedReason,
      tournamentTruthSnapshot:tournamentTruthSnapshot, matchCenterTruth:matchCenterTruth,
      standings:standings, koParts:koParts, nm:nm,
      betCategory:function(){return _betCat;}, betMode:function(){return _betMode;},
      bettingText:function(){return document.getElementById('betting').textContent;},
      htmlText:function(html){var d=document.createElement('div');d.innerHTML=html||'';return d.textContent;}
    };`);
  return dom;
}

function withApp(opts, fn) {
  const dom = loadApp(opts);
  try { return fn(dom.window.__coldPlay, dom.window); }
  finally { dom.window.close(); }
}

function futureGroup(num = 55) {
  return `M[${num}].date='2099-06-12';M[${num}].time='16:00';`;
}

function futureKO(num = 89) {
  return `M[${num}].date='2099-07-04';M[${num}].time='16:00';`;
}

function officialTicket(num) {
  return { id: 'official-ticket', num, pick: 'h', stake: 111, odds: -110, settled: false, state: 'pending', origin: 'official', sourceMode: 'real' };
}

test('fresh cold open with a confirmed future group fixture renders factual Featured Match and Match Result picks', () => withApp({
  beforeBoot: futureGroup(55),
}, (app) => {
  app.renderBetting();
  const open = app.playOpenMatches().map((m) => m.num);
  const text = app.bettingText();

  assert.ok(open.includes(55), 'confirmed future group fixture reaches Play availability');
  assert.match(text, /Featured match/, 'a valid Featured Match is selected on cold open');
  assert.match(text, /Official Picks/, 'Official Picks are reachable');
  assert.match(text, /Match Result/, 'group fixture exposes Match Result');
  assert.match(text, /Draw/, 'group Match Result includes Draw');
  assert.doesNotMatch(text, /No confirmed official fixtures are open/, 'fixture availability does not fall through to blank/fallback');
}));

test('fresh cold open with a confirmed named future knockout fixture renders To Advance', () => withApp({
  beforeBoot: futureKO(89),
  legacyState: {
    v: 1,
    officialKOFixtures: {
      89: { num: 89, home: 'BRA', away: 'GER', stage: 'Quarter-finals', status: 'scheduled', source: 'official_provider_fixture' },
    },
  },
}, (app) => {
  app.renderBetting();
  const open = app.playOpenMatches().map((m) => m.num);
  const desk = app.htmlText(app.matchDeskHTML(89));

  assert.ok(open.includes(89), 'provider-named knockout fixture reaches Play availability');
  assert.deepEqual(Array.from(app.officialFixtureTeams(89)), ['BRA', 'GER'], 'knockout teams come from official provider fixture snapshot');
  assert.match(desk, /To Advance/, 'knockout market is To Advance');
  assert.doesNotMatch(desk, /Draw/, 'knockout market excludes Draw');
}));

test('refresh with stale Play state cannot hide otherwise eligible official fixtures', () => withApp({
  beforeBoot: futureGroup(55),
  legacyState: {
    v: 1,
    mode: 'sim',
    activeMatch: 12,
    activeFlow: 'whatif',
    postBetAction: { num: 12 },
    actionRail: { type: 'stale' },
    bets: [officialTicket(55)],
  },
  playState: {
    v: 1,
    owner: 'play',
    scores: { 55: { h: 4, a: 3 } },
    scoreMeta: { 55: { owner: 'play', kind: 'simulation', at: 1 } },
    betsim: { 55: 1 },
    live: { num: 55, h: 'CAN', a: 'QAT', sh: 1, sa: 1, min: 52 },
    _ts2: { run: 'stale' },
    ts2Return: { num: 55 },
  },
}, (app) => {
  app.renderBetting();
  const s = app.getState();

  assert.equal(app.betCategory(), 'matches', 'cold boot resets Play to the factual matches category');
  assert.equal(app.betMode(), 'single', 'cold boot resets Play to factual single-match browsing');
  assert.equal(s.activeMatch, null, 'stale active match is cleared');
  assert.equal(s.postBetAction, null, 'stale ticket action context is cleared');
  assert.equal(s.actionRail, null, 'stale action rail is cleared');
  assert.equal(s.live, null, 'stale virtual live state is cleared');
  assert.equal(s.ts2Return, null, 'stale virtual return state is cleared');
  assert.ok(app.playOpenMatches().some((m) => m.num === 55), 'factual fixture remains available after stale persistence is restored');
  assert.match(app.bettingText(), /Featured match/, 'fresh render selects a factual Featured Match');
}));

test('invalid previous selection/action context is discarded and a valid fixture is selected', () => withApp({
  beforeBoot: futureGroup(55),
  legacyState: {
    v: 1,
    activeMatch: 999,
    activeFlow: 'whatif',
    postBetAction: { num: 999 },
    actionRail: { type: 'invalid' },
  },
}, (app) => {
  app.renderBetting();
  const featured = app.htmlText(app.playFeaturedMarketHTML());

  assert.equal(app.getState().activeMatch, null, 'invalid persisted selected match is not kept');
  assert.equal(app.getState().postBetAction, null, 'invalid persisted action is not kept');
  assert.match(featured, /Featured match/, 'Featured Match is rebuilt from eligible official fixtures');
  assert.match(featured, /Official Picks/, 'selected fixture has a usable official action');
}));

test('past, live, delayed, suspended, TBD, projected, final, and unavailable fixtures stay excluded', () => withApp({
  beforeBoot: [
    futureGroup(40),
    futureGroup(41),
    futureGroup(42),
    futureGroup(43),
    futureGroup(44),
    futureGroup(45),
    futureGroup(55),
    futureKO(89),
  ].join(''),
}, (app) => {
  const s = app.getState();

  app.M[40].date = '2000-01-01';
  assert.equal(app.officialFixtureEligible(40), false, 'past kickoff is excluded');

  s.rwState = s.rwState || {};
  s.rwState[41] = { kind: 'live', sh: 0, sa: 0, min: 12, label: 'Live', at: Date.now() };
  assert.equal(app.officialFixtureEligible(41), false, 'live fixture is excluded');

  s.rwState[42] = { kind: 'hold', label: 'Delayed', at: Date.now() };
  assert.equal(app.officialFixtureEligible(42), false, 'delayed fixture is excluded');

  s.rwState[43] = { kind: 'hold', label: 'Suspended', at: Date.now() };
  assert.equal(app.officialFixtureEligible(43), false, 'suspended fixture is excluded');

  assert.equal(app.officialFixtureEligible(89), false, 'TBD knockout fixture without provider names is excluded');

  app.M[44].home = '1A';
  assert.equal(app.officialFixtureEligible(44), false, 'projected/unresolved team slot is excluded');

  app.REAL[45] = [2, 1];
  assert.equal(app.officialFixtureEligible(45), false, 'official final is excluded');

  app.M[46].date = '';
  app.M[46].time = '';
  assert.equal(app.officialFixtureEligible(46), false, 'provider-unavailable kickoff is excluded');

  assert.equal(app.officialFixtureEligible(55), true, 'a valid confirmed future fixture still qualifies');
}));

test('fallback appears only when zero eligible official fixtures truly exist', () => withApp({}, (app) => {
  app.renderBetting();
  assert.equal(app.playOpenMatches().length, 0, 'default local snapshot has no eligible future named official fixture in this test date');
  assert.match(app.bettingText(), /No confirmed official fixtures are open for Play right now/, 'fallback explains the factual no-fixture state');
  assert.match(app.bettingText(), /Open Tournament/, 'fallback provides Tournament action');
  assert.doesNotMatch(app.bettingText(), /Quick Match|Matchcast/, 'fallback does not invent a simulation feature');
}));

test('virtual results, tickets, wallet/history, standings, bracket, Home, Tournament and Match Center do not gate factual availability', () => withApp({
  beforeBoot: futureGroup(55),
  legacyState: {
    v: 1,
    mode: 'sim',
    bank: 7654,
    bankHist: [10000, 7654],
    bets: [officialTicket(55), { id: 'hist', num: 1, pick: 'a', stake: 50, odds: 120, settled: true, state: 'lost', net: -50, origin: 'official' }],
    slip: [{ k: 'm', num: 55, pick: 'h', odds: 100, origin: 'official', key: 'kept-slip' }],
    realko: { 73: 'ARG' },
    sc: { 55: { h: 9, a: 8 } },
    betsim: { 55: 1 },
  },
  playState: {
    v: 1,
    owner: 'play',
    scores: { 55: { h: 9, a: 8 } },
    scoreMeta: { 55: { owner: 'play', kind: 'simulation', at: 1 } },
    betsim: { 55: 1 },
  },
}, (app) => {
  const before = {
    wallet: app.getState().bank,
    history: JSON.stringify(app.getState().bankHist),
    bets: JSON.stringify(app.getState().bets),
    slip: JSON.stringify(app.getState().slip),
    standings: app.standings('A').map((r) => `${r.code}:${r.Pts}:${r.GF}:${r.GA}`).join('|'),
    bracket: JSON.stringify(app.getState().realko),
    home: JSON.stringify(app.tournamentTruthSnapshot().virtual),
    matchCenter: JSON.stringify(app.matchCenterTruth(55)),
  };

  app.renderBetting();

  assert.ok(app.playOpenMatches().some((m) => m.num === 55), 'eligible official fixture is available despite virtual/user surfaces');
  assert.equal(app.getState().bank, before.wallet, 'wallet is preserved');
  assert.equal(JSON.stringify(app.getState().bankHist), before.history, 'wallet history is preserved');
  assert.equal(JSON.stringify(app.getState().bets), before.bets, 'tickets are preserved');
  assert.equal(JSON.stringify(app.getState().slip), before.slip, 'slip is preserved');
  assert.equal(app.standings('A').map((r) => `${r.code}:${r.Pts}:${r.GF}:${r.GA}`).join('|'), before.standings, 'standings are not used as a Play availability gate');
  assert.equal(JSON.stringify(app.getState().realko), before.bracket, 'bracket state is preserved');
  assert.ok(before.home, 'Home/truth snapshot is readable without gating Play availability');
  assert.ok(before.matchCenter, 'Match Center truth is readable without gating Play availability');
}));
