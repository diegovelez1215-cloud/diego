const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

process.env.TZ = 'America/Puerto_Rico';

function loadApp(now = '2026-06-30T18:00:00-04:00') {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const RealDate = window.Date;
  const fixedNow = new RealDate(now).getTime();
  let fetchCount = 0;
  window.Date = class extends RealDate {
    constructor(...args) { return args.length ? new RealDate(...args) : new RealDate(fixedNow); }
    static now() { return fixedNow; }
    static parse(v) { return RealDate.parse(v); }
    static UTC(...args) { return RealDate.UTC(...args); }
  };
  window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {}, fillRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillText() {},
    getImageData() { return { data: new Uint8ClampedArray(24 * 24 * 4) }; },
  });
  window.fetch = () => { fetchCount += 1; return Promise.resolve({ ok: true, json: () => Promise.resolve({ configured: true, response: [], finished: [] }) }); };
  window.scrollTo = () => {};
  window.requestAnimationFrame = (fn) => { fn(); return 1; };
  window.cancelAnimationFrame = () => {};
  window.MutationObserver = class { observe() {} disconnect() {} };
  window.AudioContext = function () {};
  window.webkitAudioContext = window.AudioContext;
  window.eval(`${script}
    window.__sched = {
      blankState:blankState, setState:function(v){S=v;}, getState:function(){return S;},
      MATCHES:MATCHES, M:M, GROUPS:GROUPS, REAL:REAL,
      curISO:curISO, nextISO:nextISO, matchDay:matchDay, officialFixtureDisplayTime:officialFixtureDisplayTime,
      renderHome:renderHome, renderSchedule:renderSchedule, homeHTML:function(){return document.getElementById('home').innerHTML;},
      scheduleHTML:function(){return document.getElementById('schedule').innerHTML;},
      todayRailHTML:todayRailHTML, kickoffWindowModel:kickoffWindowModel, kickoffWindowFixtureNums:kickoffWindowFixtureNums,
      schedJumpToday:schedJumpToday, schedJumpTomorrow:schedJumpTomorrow, schedShowAllDates:schedShowAllDates,
      goSchedule:goSchedule, switchTab:switchTab, render:render, setTab:function(v){TAB=v;}, getTab:function(){return TAB;},
      goTab:function(v){TAB=v;switchTab();render();}, getSchedDay:function(){return S._schedDay;},
      ingestProviderOfficialFixtures:ingestProviderOfficialFixtures, ingestProviderKOFixtures:ingestProviderKOFixtures,
      ingestFinished:ingestFinished, truthRefreshStart:truthRefreshStart, matchCenterTruth:matchCenterTruth,
      mrow:mrow, komR32CardHTML:komR32CardHTML, r32FixtureStates:r32FixtureStates, homeFixtureCardHTML:homeFixtureCardHTML,
      getApiTimer:function(){return ApiBus.timer;}, clearApiTimer:function(){if(ApiBus.timer)clearTimeout(ApiBus.timer);ApiBus.timer=null;},
      mountText:function(h){var d=document.createElement('div');d.innerHTML=h||'';return d.textContent;},
      fetchCount:function(){return ${'fetchCount'};},
      doc:document
    };`);
  window.__sched.fetchCount = () => fetchCount;
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  try { return fn(dom.window.__sched, dom.window); }
  finally { dom.window.close(); }
}

function reset(app) {
  Object.keys(app.REAL).forEach((k) => delete app.REAL[k]);
  const s = app.blankState();
  s.mode = 'real';
  Object.keys(app.GROUPS).forEach((g) => { s.order[g] = app.GROUPS[g].slice(); });
  app.MATCHES.forEach((m) => { m.date = '2099-12-31'; m.time = '09:00'; });
  [74, 75, 76, 77, 78].forEach((n) => { app.M[n].date = '2099-12-31'; app.M[n].time = '09:00'; });
  app.setState(s);
  app.clearApiTimer();
  return s;
}

function providerRows() {
  return [
    { matchNum: 74, providerId: 'fd-fra-swe', home: 'France', away: 'Sweden', gh: null, ga: null, status: 'TIMED', kind: 'scheduled', stage: 'LAST_32', utcDate: '2026-06-30T17:00:00Z' },
    { matchNum: 75, providerId: 'fd-ger-par', home: 'Germany', away: 'Paraguay', gh: null, ga: null, status: 'TIMED', kind: 'scheduled', stage: 'LAST_32', utcDate: '2026-07-01T01:00:00Z' },
    { matchNum: 76, providerId: 'fd-bra-jpn', home: 'Brazil', away: 'Japan', gh: null, ga: null, status: 'TIMED', kind: 'scheduled', stage: 'LAST_32', utcDate: '2026-07-01T21:00:00Z' },
    { matchNum: 77, providerId: 'fd-arg-cpv', home: 'Argentina', away: 'Cape Verde', gh: null, ga: null, status: 'TIMED', kind: 'scheduled', stage: 'LAST_32', utcDate: '2026-07-02T21:00:00Z' },
  ];
}

function seedProviderSchedule(app) {
  const s = reset(app);
  const receipt = app.truthRefreshStart('/api/results');
  app.ingestProviderOfficialFixtures(providerRows(), { receipt, authoritative: true });
  app.ingestProviderKOFixtures(providerRows(), { receipt, authoritative: true });
  s.rwState[74] = { kind: 'live', sh: 0, sa: 0, min: 22, status: 'IN_PLAY', label: 'Live', homeCode: 'FRA', awayCode: 'SWE' };
  app.setState(s);
  return s;
}

test('live fixtures are excluded from left-today count and next kickoff', () => withApp((app) => {
  seedProviderSchedule(app);
  const rail = app.todayRailHTML({});
  const text = app.mountText(rail);
  assert.match(text, /2 fixtures today/);
  assert.match(text, /1 still to play/);
  assert.match(text, /Final match today · 9:00 PM/);
  assert.doesNotMatch(text, /2 matches left today/);
  assert.doesNotMatch(text, /next 1:00 PM/);
  assert.doesNotMatch(text, /First match today/);
  assert.doesNotMatch(rail, /openSheet\(74\)/, 'live fixture is not an upcoming rail item');
  assert.match(rail, /openSheet\(75\)/, 'future fixture remains upcoming');
}));

test('one live plus one future fixture renders Live Now and the honest later rail', () => withApp((app) => {
  seedProviderSchedule(app);
  app.renderHome();
  const text = app.mountText(app.homeHTML());
  assert.match(text, /Live Now/);
  assert.match(text, /France/);
  assert.match(text, /0–0/);
  assert.match(text, /Sweden/);
  assert.match(text, /Later today/);
  assert.match(text, /2 fixtures today · 1 still to play/);
  assert.match(text, /Final match today · 9:00 PM/);
  assert.doesNotMatch(text, /First match today/);
}));

test('Today, Tomorrow, and All Dates render complete canonical schedule sets', () => withApp((app) => {
  seedProviderSchedule(app);
  app.schedJumpToday();
  let html = app.scheduleHTML();
  assert.match(html, /id="fx-74"/, 'Today includes the live fixture');
  assert.match(html, /id="fx-75"/, 'Today includes the later fixture');
  assert.doesNotMatch(html, /id="fx-76"/, 'Today excludes tomorrow');

  app.schedJumpTomorrow();
  html = app.scheduleHTML();
  assert.match(html, /id="fx-76"/, 'Tomorrow includes the local tomorrow fixture');
  assert.doesNotMatch(html, /id="fx-74"/);
  assert.doesNotMatch(html, /id="fx-75"/);

  app.schedShowAllDates();
  html = app.scheduleHTML();
  [74, 75, 76, 77].forEach((n) => assert.match(html, new RegExp(`id="fx-${n}"`), `All Dates missed #${n}`));
  assert.ok(html.indexOf('id="fx-74"') < html.indexOf('id="fx-76"'));
  assert.ok(html.indexOf('id="fx-76"') < html.indexOf('id="fx-77"'));
}));

test('Home All matches opens Matches with Today selected', () => withApp((app) => {
  seedProviderSchedule(app);
  app.setTab('home');
  app.goSchedule();
  assert.equal(app.getTab(), 'schedule');
  assert.equal(app.getSchedDay(), app.curISO());
  assert.match(app.scheduleHTML(), /id="day-2026-06-30"/);
  assert.match(app.scheduleHTML(), /id="fx-74"/);
  assert.match(app.scheduleHTML(), /id="fx-75"/);
  assert.doesNotMatch(app.scheduleHTML(), /id="fx-76"/);
}));

test('penalty shootout totals stay separate from the primary match score', () => withApp((app) => {
  reset(app);
  const receipt = app.truthRefreshStart('/api/results');
  app.ingestProviderKOFixtures([{ matchNum: 78, providerId: 'fd-par-arg', home: 'Paraguay', away: 'Argentina', status: 'TIMED', kind: 'scheduled', stage: 'LAST_32', utcDate: '2026-07-03T21:00:00Z' }], { receipt, authoritative: true });
  app.ingestFinished([{
    matchNum: 78, providerId: 'fd-par-arg', home: 'Paraguay', away: 'Argentina',
    gh: 4, ga: 5, score: { fullTime: { home: 1, away: 1 } },
    penalties: { home: 4, away: 5 }, winner: 'AWAY_TEAM', status: 'PEN', kind: 'final', stage: 'LAST_32',
  }], { receipt });
  const truth = app.matchCenterTruth(78);
  assert.equal(truth.score.h, 1);
  assert.equal(truth.score.a, 1);
  assert.equal(truth.statusText, 'Final · penalties');
  const card = app.mountText(app.komR32CardHTML(app.r32FixtureStates().find((x) => x.matchNum === 78)));
  assert.match(card, /Final 1-1|FINAL · 1–1/);
  assert.match(card, /Argentina advances 4-5 on penalties|Argentina advances 4–5 on penalties/);
}));

test('switching tabs and schedule controls do not fetch, refresh, or ingest provider data', () => withApp((app) => {
  seedProviderSchedule(app);
  assert.equal(app.fetchCount(), 0);
  assert.equal(app.getApiTimer(), null);
  app.goTab('schedule');
  app.goTab('home');
  app.goTab('bet');
  app.schedJumpToday();
  app.schedJumpTomorrow();
  app.schedShowAllDates();
  assert.equal(app.fetchCount(), 0);
  assert.equal(app.getApiTimer(), null);
}));

test('Home, Matches, Knockout, and Match Center share canonical provider time and status', () => withApp((app) => {
  seedProviderSchedule(app);
  const home = app.todayRailHTML({});
  assert.match(home, /9:00[\s\S]*PM/);
  assert.match(app.mrow(app.M[75], false), /9:00[\s\S]*PM/);
  assert.match(app.komR32CardHTML(app.r32FixtureStates().find((x) => x.matchNum === 75)), /9:00 PM/);
  app.doc.getElementById('sheet').innerHTML = '';
  const truth = app.matchCenterTruth(75);
  assert.equal(truth.phase, 'scheduled');
  app.doc.getElementById('sheet').innerHTML = '';
  assert.equal(app.matchCenterTruth(74).phase, 'live');
}));
