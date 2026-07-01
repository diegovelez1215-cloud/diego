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
  let localStorageWrites = 0;
  const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
  window.localStorage.setItem = function (...args) {
    localStorageWrites += 1;
    return originalSetItem(...args);
  };
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
  window.fetch = () => {
    fetchCount += 1;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ configured: true, response: [], scheduled: [], finished: [], live: [] }) });
  };
  window.scrollTo = () => {};
  window.requestAnimationFrame = (fn) => { fn(); return 1; };
  window.requestIdleCallback = (fn) => { fn(); return 1; };
  window.cancelAnimationFrame = () => {};
  window.MutationObserver = class { observe() {} disconnect() {} };
  window.AudioContext = function () {};
  window.webkitAudioContext = window.AudioContext;
  window.eval(`${script}
    var __calls={settle:0,picks:0,achv:0,matchCenter:0,save:0,saveNow:0,fetchResults:0,refreshVisible:0,controlledRefresh:0,ingestOfficial:0,ingestKO:0,renderHome:0,renderSchedule:0};
    var __origSettle=settleAllBets;settleAllBets=function(){__calls.settle++;return __origSettle.apply(this,arguments);};
    var __origPicks=checkPicks;checkPicks=function(){__calls.picks++;return __origPicks.apply(this,arguments);};
    var __origAchv=checkAchv;checkAchv=function(){__calls.achv++;return __origAchv.apply(this,arguments);};
    var __origMatchCenter=refreshMatchCenterTruth;refreshMatchCenterTruth=function(){__calls.matchCenter++;return __origMatchCenter.apply(this,arguments);};
    var __origSave=saveState;saveState=function(){__calls.save++;return __origSave.apply(this,arguments);};
    var __origSaveNow=saveStateNow;saveStateNow=function(){__calls.saveNow++;return __origSaveNow.apply(this,arguments);};
    var __origFetchResults=fetchResults;fetchResults=function(){__calls.fetchResults++;return __origFetchResults.apply(this,arguments);};
    var __origRefreshVisible=refreshVisibleData;refreshVisibleData=function(){__calls.refreshVisible++;return __origRefreshVisible.apply(this,arguments);};
    var __origControlledRefresh=controlledRefresh;controlledRefresh=function(){__calls.controlledRefresh++;return __origControlledRefresh.apply(this,arguments);};
    var __origIngestOfficial=ingestProviderOfficialFixtures;ingestProviderOfficialFixtures=function(){__calls.ingestOfficial++;return __origIngestOfficial.apply(this,arguments);};
    var __origIngestKO=ingestProviderKOFixtures;ingestProviderKOFixtures=function(){__calls.ingestKO++;return __origIngestKO.apply(this,arguments);};
    var __origRenderHome=renderHome;renderHome=function(){__calls.renderHome++;return __origRenderHome.apply(this,arguments);};
    var __origRenderSchedule=renderSchedule;renderSchedule=function(){__calls.renderSchedule++;return __origRenderSchedule.apply(this,arguments);};
    window.__runtime = {
      blankState:blankState,setState:function(v){S=v;},getState:function(){return S;},
      MATCHES:MATCHES,M:M,GROUPS:GROUPS,REAL:REAL,curISO:curISO,nextISO:nextISO,matchDay:matchDay,
      dayScheduleSummary:dayScheduleSummary,daySummaryCopy:daySummaryCopy,dayScheduleFixtures:dayScheduleFixtures,
      renderHome:renderHome,renderSchedule:renderSchedule,homeHTML:function(){return document.getElementById('home').innerHTML;},
      scheduleHTML:function(){return document.getElementById('schedule').innerHTML;},todayRailHTML:todayRailHTML,
      schedJumpToday:schedJumpToday,schedJumpTomorrow:schedJumpTomorrow,schedShowAllDates:schedShowAllDates,
      setTab:function(v){TAB=v;},getTab:function(){return TAB;},switchTab:switchTab,render:render,
      goTab:function(v){TAB=v;switchTab();render();},getSchedDay:function(){return S._schedDay;},
      ingestProviderOfficialFixtures:ingestProviderOfficialFixtures,ingestProviderKOFixtures:ingestProviderKOFixtures,
      truthRefreshStart:truthRefreshStart,mrow:mrow,komR32CardHTML:komR32CardHTML,r32FixtureStates:r32FixtureStates,
      matchCenterTruth:matchCenterTruth,officialFixtureDisplayTime:officialFixtureDisplayTime,
      mountText:function(h){var d=document.createElement('div');d.innerHTML=h||'';return d.textContent;},
      resetCalls:function(){Object.keys(__calls).forEach(function(k){__calls[k]=0;});},
      calls:function(){return Object.assign({},__calls);},
      clearApiTimer:function(){if(ApiBus.timer)clearTimeout(ApiBus.timer);ApiBus.timer=null;},
      doc:document
    };`);
  const resetInternal = window.__runtime.resetCalls;
  const callsInternal = window.__runtime.calls;
  window.__runtime.resetCalls = () => {
    resetInternal();
    fetchCount = 0;
    localStorageWrites = 0;
  };
  window.__runtime.calls = () => Object.assign({ fetch: fetchCount, localStorageWrites }, callsInternal());
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  try { return fn(dom.window.__runtime); }
  finally { dom.window.close(); }
}

function reset(app) {
  Object.keys(app.REAL).forEach((k) => delete app.REAL[k]);
  const s = app.blankState();
  s.mode = 'real';
  Object.keys(app.GROUPS).forEach((g) => { s.order[g] = app.GROUPS[g].slice(); });
  app.MATCHES.forEach((m) => { m.date = '2099-12-31'; m.time = '09:00'; });
  [74, 75, 76, 77].forEach((n) => { app.M[n].date = '2099-12-31'; app.M[n].time = '09:00'; });
  app.setState(s);
  app.clearApiTimer();
  return s;
}

function providerRows() {
  return [
    { matchNum: 74, providerId: 'fd-fra-swe', home: 'France', away: 'Sweden', status: 'FINISHED', kind: 'final', stage: 'LAST_32', utcDate: '2026-06-30T17:00:00Z', gh: 1, ga: 0 },
    { matchNum: 75, providerId: 'fd-ger-par', home: 'Germany', away: 'Paraguay', status: 'IN_PLAY', kind: 'live', stage: 'LAST_32', utcDate: '2026-06-30T21:00:00Z', gh: 0, ga: 0, min: 55 },
    { matchNum: 76, providerId: 'fd-bra-jpn', home: 'Brazil', away: 'Japan', status: 'TIMED', kind: 'scheduled', stage: 'LAST_32', utcDate: '2026-07-01T01:00:00Z' },
    { matchNum: 77, providerId: 'fd-arg-cpv', home: 'Argentina', away: 'Cape Verde', status: 'TIMED', kind: 'scheduled', stage: 'LAST_32', utcDate: '2026-07-01T21:00:00Z' },
  ];
}

function seedRuntimeSchedule(app) {
  const s = reset(app);
  const receipt = app.truthRefreshStart('/api/results');
  app.ingestProviderOfficialFixtures(providerRows(), { receipt, authoritative: true });
  app.ingestProviderKOFixtures(providerRows(), { receipt, authoritative: true });
  s.realko[74] = 'FRA';
  s.rwState[75] = { kind: 'live', sh: 0, sa: 0, min: 55, status: 'IN_PLAY', label: 'Live', homeCode: 'GER', awayCode: 'PAR' };
  app.setState(s);
  app.resetCalls();
  return s;
}

test('three fixtures today with one future fixture reports the final remaining match', () => withApp((app) => {
  seedRuntimeSchedule(app);
  const today = app.curISO();
  const summary = app.dayScheduleSummary(today);
  assert.equal(summary.total, 3);
  assert.equal(summary.live, 1);
  assert.equal(summary.final, 1);
  assert.equal(summary.remaining, 1);
  assert.equal(summary.next.num, 76);
  const copy = app.daySummaryCopy(today);
  assert.match(copy.summary, /3 fixtures today/);
  assert.match(copy.summary, /1 still to play/);
  assert.match(copy.focus, /Final match today/);
  assert.doesNotMatch(copy.focus, /First match today/);
}));

test('live and final fixtures are excluded from remaining and next', () => withApp((app) => {
  seedRuntimeSchedule(app);
  const remaining = app.dayScheduleSummary(app.curISO()).fixtures
    .filter((m) => app.dayScheduleSummary(app.curISO()).next && m.num === app.dayScheduleSummary(app.curISO()).next.num)
    .map((m) => m.num);
  assert.equal(remaining.join(','), '76');
  assert.notEqual(app.dayScheduleSummary(app.curISO()).next.num, 74);
  assert.notEqual(app.dayScheduleSummary(app.curISO()).next.num, 75);
}));

test('Home and Matches use the same shared day-summary result', () => withApp((app) => {
  seedRuntimeSchedule(app);
  const copy = app.daySummaryCopy(app.curISO());
  app.renderHome();
  app.setTab('schedule');
  app.switchTab();
  app.renderSchedule();
  const homeText = app.mountText(app.homeHTML());
  const matchesText = app.mountText(app.scheduleHTML());
  assert.match(homeText, new RegExp(copy.summary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(homeText, /Final match today/);
  assert.match(matchesText, new RegExp(copy.summary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(matchesText, /Final match today/);
}));

test('Today, Tomorrow, and All Dates return complete canonical sets', () => withApp((app) => {
  seedRuntimeSchedule(app);
  app.schedJumpToday();
  let html = app.scheduleHTML();
  [74, 75, 76].forEach((n) => assert.match(html, new RegExp(`id="fx-${n}"`)));
  assert.doesNotMatch(html, /id="fx-77"/);

  app.schedJumpTomorrow();
  html = app.scheduleHTML();
  assert.match(html, /id="fx-77"/);
  [74, 75, 76].forEach((n) => assert.doesNotMatch(html, new RegExp(`id="fx-${n}"`)));

  app.schedShowAllDates();
  html = app.scheduleHTML();
  [74, 75, 76, 77].forEach((n) => assert.match(html, new RegExp(`id="fx-${n}"`)));
  assert.ok(html.indexOf('id="fx-74"') < html.indexOf('id="fx-76"'));
  assert.ok(html.indexOf('id="fx-76"') < html.indexOf('id="fx-77"'));
}));

test('tab taps do not run provider refresh, ingestion, settlement, picks, achievements, Match Center refresh, or persistence', () => withApp((app) => {
  seedRuntimeSchedule(app);
  app.render();
  app.resetCalls();
  app.goTab('schedule');
  app.goTab('home');
  app.schedJumpToday();
  app.schedJumpTomorrow();
  const calls = app.calls();
  assert.equal(calls.fetch, 0);
  assert.equal(calls.fetchResults, 0);
  assert.equal(calls.refreshVisible, 0);
  assert.equal(calls.controlledRefresh, 0);
  assert.equal(calls.ingestOfficial, 0);
  assert.equal(calls.ingestKO, 0);
  assert.equal(calls.settle, 0);
  assert.equal(calls.picks, 0);
  assert.equal(calls.achv, 0);
  assert.equal(calls.matchCenter, 0);
  assert.equal(calls.save, 0);
  assert.equal(calls.saveNow, 0);
  assert.equal(calls.localStorageWrites, 0);
}));

test('warm tab switches reuse cached active-view data', () => withApp((app) => {
  seedRuntimeSchedule(app);
  app.setTab('schedule');
  app.switchTab();
  app.render();
  app.resetCalls();
  app.render();
  assert.equal(app.calls().renderSchedule, 0);
  app.goTab('home');
  app.resetCalls();
  app.goTab('schedule');
  assert.equal(app.calls().renderSchedule, 0);
}));

test('canonical provider times and statuses are unchanged across Home, Matches, Knockout, and Match Center', () => withApp((app) => {
  seedRuntimeSchedule(app);
  const homeText = app.mountText(app.todayRailHTML({}));
  assert.match(homeText, /9:00 PM/);
  assert.match(app.mrow(app.M[76], false), /9:00[\s\S]*PM/);
  assert.match(app.komR32CardHTML(app.r32FixtureStates().find((x) => x.matchNum === 76)), /9:00 PM/);
  assert.equal(app.matchCenterTruth(76).phase, 'scheduled');
  assert.equal(app.officialFixtureDisplayTime(app.M[76]), '9:00 PM');
  assert.equal(app.matchCenterTruth(75).phase, 'live');
}));
