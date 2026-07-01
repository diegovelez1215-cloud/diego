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
  const rafQueue = [];
  let fetchCount = 0;
  let storageWrites = 0;
  let transitionCount = 0;
  let rafId = 0;

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
    return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve({ configured: true, response: [], finished: [] }) });
  };
  const realSetItem = window.Storage.prototype.setItem;
  Object.defineProperty(window.Storage.prototype, 'setItem', {
    configurable: true,
    writable: true,
    value: function setItemSpy() {
      storageWrites += 1;
      return realSetItem.apply(this, arguments);
    },
  });
  window.scrollTo = () => {};
  window.requestAnimationFrame = (fn) => { rafQueue.push(fn); return ++rafId; };
  window.cancelAnimationFrame = () => {};
  window.document.startViewTransition = (fn) => {
    transitionCount += 1;
    fn();
    return { ready: Promise.resolve(), finished: Promise.resolve(), updateCallbackDone: Promise.resolve() };
  };
  window.MutationObserver = class { observe() {} disconnect() {} };
  window.AudioContext = function () {};
  window.webkitAudioContext = window.AudioContext;
  window.eval(`${script}
    var __providerCalls = { refresh:0, results:0, live:0, odds:0, scorers:0 };
    var __origRefreshVisibleData = refreshVisibleData;
    refreshVisibleData = function(){ __providerCalls.refresh++; return __origRefreshVisibleData.apply(this, arguments); };
    var __origFetchResults = fetchResults;
    fetchResults = function(){ __providerCalls.results++; return __origFetchResults.apply(this, arguments); };
    var __origFetchRealWorldData = fetchRealWorldData;
    fetchRealWorldData = function(){ __providerCalls.live++; return __origFetchRealWorldData.apply(this, arguments); };
    var __origFetchOdds = fetchOdds;
    fetchOdds = function(){ __providerCalls.odds++; return __origFetchOdds.apply(this, arguments); };
    var __origFetchScorers = fetchScorers;
    fetchScorers = function(){ __providerCalls.scorers++; return __origFetchScorers.apply(this, arguments); };
    window.__nav = {
      blankState: blankState,
      setState: function(v){ S = v; },
      getState: function(){ return S; },
      MATCHES: MATCHES,
      M: M,
      GROUPS: GROUPS,
      REAL: REAL,
      curISO: curISO,
      nextISO: nextISO,
      matchDay: matchDay,
      renderHome: renderHome,
      renderBracket: renderBracket,
      renderSchedule: renderSchedule,
      homeHTML: function(){ return document.getElementById('home').innerHTML; },
      bracketHTML: function(){ return document.getElementById('bracket').innerHTML; },
      scheduleHTML: function(){ return document.getElementById('schedule').innerHTML; },
      schedJumpToday: schedJumpToday,
      schedJumpTomorrow: schedJumpTomorrow,
      schedShowAllDates: schedShowAllDates,
      truthRefreshStart: truthRefreshStart,
      ingestProviderOfficialFixtures: ingestProviderOfficialFixtures,
      ingestProviderKOFixtures: ingestProviderKOFixtures,
      activeKey: function(){ return currentViewKey(); },
      activeScreenId: function(){ var el = document.querySelector('.screen.on'); return el ? el.id : ''; },
      activeScreenText: function(){ var el = document.querySelector('.screen.on'); return el ? el.textContent.replace(/\\s+/g, ' ').trim() : ''; },
      clickTab: function(screen){ document.querySelector('.tabbar button[data-screen="'+screen+'"]').onclick(); },
      setTab: function(v){ TAB = v; },
      getTab: function(){ return TAB; },
      activate: navActivateCurrentTab,
      counts: function(){ return Object.assign({}, _navRenderCounts); },
      providerCalls: function(){ return Object.assign({}, __providerCalls); },
      mountText: function(h){ var d = document.createElement('div'); d.innerHTML = h || ''; return d.textContent; },
      clearApiTimer: function(){ if(ApiBus.timer) clearTimeout(ApiBus.timer); ApiBus.timer = null; },
      doc: document
    };`);

  function flushRaf(count = 1) {
    for (let i = 0; i < count; i += 1) {
      const batch = rafQueue.splice(0);
      if (!batch.length) return;
      batch.forEach((fn) => fn(window.performance.now()));
    }
  }

  return {
    dom,
    window,
    app: window.__nav,
    flushRaf,
    rafDepth: () => rafQueue.length,
    fetchCount: () => fetchCount,
    storageWrites: () => storageWrites,
    transitionCount: () => transitionCount,
  };
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

test('rapid bottom-tab taps keep a non-empty active screen and the final target wins', () => {
  const t = loadApp();
  try {
    t.flushRaf();
    ['matches', 'bet', 'teams'].forEach((screen) => {
      t.app.clickTab(screen);
      assert.notEqual(t.app.activeScreenText(), '', `${screen} left an active blank screen`);
    });
    assert.equal(t.app.activeScreenId(), 'scr-teams');
    assert.equal(t.app.activeKey(), 'h2h');
    t.flushRaf(4);
    assert.equal(t.app.activeScreenId(), 'scr-teams');
    assert.equal(t.app.activeKey(), 'h2h');
    assert.notEqual(t.app.activeScreenText(), '');
  } finally {
    t.dom.window.close();
  }
});

test('returning to cached Home and Bracket does not rerun their render path', () => {
  const t = loadApp();
  try {
    t.flushRaf();
    const homeAfterInitial = t.app.counts().home;

    t.app.clickTab('bet');
    t.flushRaf();
    t.app.clickTab('home');
    t.flushRaf(3);
    assert.equal(t.app.counts().home, homeAfterInitial);

    t.app.setTab('bracket');
    t.app.activate();
    t.flushRaf();
    const bracketAfterInitial = t.app.counts().bracket;
    assert.equal(bracketAfterInitial, 1);

    t.app.setTab('bet');
    t.app.activate();
    t.flushRaf();
    t.app.setTab('bracket');
    t.app.activate();
    t.flushRaf(3);
    assert.equal(t.app.counts().bracket, bracketAfterInitial);
  } finally {
    t.dom.window.close();
  }
});

test('canonical official fixture changes invalidate Bracket cache and cause one next render', () => {
  const t = loadApp();
  try {
    t.flushRaf();
    t.app.setTab('bracket');
    t.app.activate();
    t.flushRaf();
    const before = t.app.counts().bracket;

    const receipt = t.app.truthRefreshStart('/api/results');
    t.app.ingestProviderKOFixtures([{ matchNum: 78, providerId: 'fd-par-arg', home: 'Paraguay', away: 'Argentina', status: 'TIMED', kind: 'scheduled', stage: 'LAST_32', utcDate: '2026-07-03T21:00:00Z' }], { receipt, authoritative: true });

    t.app.setTab('bet');
    t.app.activate();
    t.flushRaf();
    t.app.setTab('bracket');
    t.app.activate();
    assert.equal(t.app.counts().bracket, before, 'invalidated view should queue, not render in the tap path');
    t.flushRaf();
    assert.equal(t.app.counts().bracket, before + 1);
    t.flushRaf(3);
    assert.equal(t.app.counts().bracket, before + 1);
  } finally {
    t.dom.window.close();
  }
});

test('normal bottom-tab taps do not fetch, refresh, write storage, or start view transitions', () => {
  const t = loadApp();
  try {
    t.flushRaf();
    const beforeFetch = t.fetchCount();
    const beforeStorage = t.storageWrites();
    const beforeTransitions = t.transitionCount();
    const beforeProvider = t.app.providerCalls();

    ['matches', 'bet', 'teams', 'home'].forEach((screen) => t.app.clickTab(screen));

    assert.equal(t.fetchCount(), beforeFetch);
    assert.equal(t.storageWrites(), beforeStorage);
    assert.equal(t.transitionCount(), beforeTransitions);
    assert.deepEqual(t.app.providerCalls(), beforeProvider);
  } finally {
    t.dom.window.close();
  }
});

test('Today, Tomorrow, and All Dates schedule behavior remains intact', () => {
  const t = loadApp();
  try {
    seedProviderSchedule(t.app);
    t.app.schedJumpToday();
    let html = t.app.scheduleHTML();
    assert.match(html, /id="fx-74"/, 'Today includes the live fixture');
    assert.match(html, /id="fx-75"/, 'Today includes the later fixture');
    assert.doesNotMatch(html, /id="fx-76"/, 'Today excludes tomorrow');

    t.app.schedJumpTomorrow();
    html = t.app.scheduleHTML();
    assert.match(html, /id="fx-76"/, 'Tomorrow includes the local tomorrow fixture');
    assert.doesNotMatch(html, /id="fx-74"/);
    assert.doesNotMatch(html, /id="fx-75"/);

    t.app.schedShowAllDates();
    html = t.app.scheduleHTML();
    [74, 75, 76, 77].forEach((n) => assert.match(html, new RegExp(`id="fx-${n}"`), `All Dates missed #${n}`));
    assert.ok(html.indexOf('id="fx-74"') < html.indexOf('id="fx-76"'));
    assert.ok(html.indexOf('id="fx-76"') < html.indexOf('id="fx-77"'));
  } finally {
    t.dom.window.close();
  }
});
