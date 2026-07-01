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
  let startViewTransitionCalls = 0;
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
  window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ configured: true, response: [], scheduled: [], finished: [], live: [] }) });
  window.scrollTo = () => {};
  window.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
  window.cancelAnimationFrame = () => {};
  window.requestIdleCallback = (fn) => { fn(); return 1; };
  window.MutationObserver = class { observe() {} disconnect() {} };
  window.AudioContext = function () {};
  window.webkitAudioContext = window.AudioContext;
  window.document.startViewTransition = (fn) => {
    startViewTransitionCalls += 1;
    if (fn) fn();
    return { finished: Promise.resolve(), ready: Promise.resolve(), updateCallbackDone: Promise.resolve() };
  };
  window.eval(`${script}
    var __calls={home:0,schedule:0,bet:0,h2h:0,bracket:0};
    var __origHome=renderHome;renderHome=function(){__calls.home++;return __origHome.apply(this,arguments);};
    var __origSchedule=renderSchedule;renderSchedule=function(){__calls.schedule++;return __origSchedule.apply(this,arguments);};
    var __origBet=renderBetting;renderBetting=function(){__calls.bet++;return __origBet.apply(this,arguments);};
    var __origH2H=renderH2H;renderH2H=function(){__calls.h2h++;return __origH2H.apply(this,arguments);};
    var __origBracket=renderBracket;renderBracket=function(){__calls.bracket++;return __origBracket.apply(this,arguments);};
    window.__nav = {
      blankState:blankState,setState:function(v){S=v;},getState:function(){return S;},
      MATCHES:MATCHES,M:M,GROUPS:GROUPS,REAL:REAL,curISO:curISO,nextISO:nextISO,matchDay:matchDay,
      render:render,renderHome:renderHome,renderSchedule:renderSchedule,renderBracket:renderBracket,
      homeHTML:function(){return document.getElementById('home').innerHTML;},
      scheduleHTML:function(){return document.getElementById('schedule').innerHTML;},
      bracketHTML:function(){return document.getElementById('bracket').innerHTML;},
      activeScreen:function(){var el=document.querySelector('.screen.on');return el?el.id:'';},
      activeText:function(){var el=document.querySelector('.screen.on');return el?(el.textContent||''):'';},
      clickBottom:function(screen){var b=document.querySelector('.tabbar button[data-screen="'+screen+'"]');if(!b)throw new Error('missing tab '+screen);b.onclick.call(b);},
      schedJumpToday:schedJumpToday,schedJumpTomorrow:schedJumpTomorrow,schedShowAllDates:schedShowAllDates,
      ingestProviderOfficialFixtures:ingestProviderOfficialFixtures,ingestProviderKOFixtures:ingestProviderKOFixtures,
      truthRefreshStart:truthRefreshStart,truthCanonicalKOFixtures:truthCanonicalKOFixtures,canonicalR32FixtureNums:canonicalR32FixtureNums,
      r32FixtureStates:r32FixtureStates,knockoutModeHTML:knockoutModeHTML,komR32CardHTML:komR32CardHTML,
      mrow:mrow,matchCenterTruth:matchCenterTruth,officialFixtureDisplayTime:officialFixtureDisplayTime,
      mountText:function(h){var d=document.createElement('div');d.innerHTML=h||'';return d.textContent;},
      resetCalls:function(){Object.keys(__calls).forEach(function(k){__calls[k]=0;});},
      calls:function(){return Object.assign({},__calls);},
      setTab:function(v){TAB=v;},getTab:function(){return TAB;},
      doc:document
    };`);
  window.__nav.flushRaf = () => {
    let guard = 0;
    while (rafQueue.length) {
      if (guard++ > 50) throw new Error('rAF queue did not drain');
      const batch = rafQueue.splice(0);
      batch.forEach((fn) => fn());
    }
  };
  window.__nav.pendingRaf = () => rafQueue.length;
  window.__nav.startViewTransitionCalls = () => startViewTransitionCalls;
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  try { return fn(dom.window.__nav); }
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
  return s;
}

function providerRows() {
  return [
    { matchNum: 74, providerId: 'ko-74', home: 'France', away: 'Sweden', status: 'FINISHED', kind: 'final', stage: 'LAST_32', utcDate: '2026-06-30T17:00:00Z', gh: 1, ga: 0 },
    { matchNum: 75, providerId: 'ko-75', home: 'Germany', away: 'Paraguay', status: 'IN_PLAY', kind: 'live', stage: 'LAST_32', utcDate: '2026-06-30T21:00:00Z', gh: 0, ga: 0, min: 55 },
    { matchNum: 76, providerId: 'ko-76', home: 'Brazil', away: 'Japan', status: 'TIMED', kind: 'scheduled', stage: 'LAST_32', utcDate: '2026-07-01T01:00:00Z' },
    { matchNum: 77, providerId: 'ko-77', home: 'Argentina', away: 'Cape Verde', status: 'TIMED', kind: 'scheduled', stage: 'LAST_32', utcDate: '2026-07-01T21:00:00Z' },
  ];
}

function seedProviderTruth(app) {
  const s = reset(app);
  const rows = providerRows();
  const scheduledRows = rows.map((r) => Object.assign({}, r, { status: 'TIMED', kind: 'scheduled', gh: null, ga: null }));
  const receipt = app.truthRefreshStart('/api/results');
  app.ingestProviderOfficialFixtures(rows, { receipt, authoritative: true });
  app.ingestProviderKOFixtures(scheduledRows, { receipt, authoritative: true });
  s.realko[74] = 'FRA';
  s.rwState[75] = { kind: 'live', sh: 0, sa: 0, min: 55, status: 'IN_PLAY', label: 'Live', homeCode: 'GER', awayCode: 'PAR' };
  app.setState(s);
  return s;
}

function finishGroups(app, s) {
  app.MATCHES.filter((m) => m.stage === 'group').forEach((m) => {
    app.REAL[m.num] = [1, 0];
    s.real[m.num] = 1;
    s.sc[m.num] = { h: 1, a: 0 };
  });
  app.setState(s);
}

function fixtureIds(html) {
  return Array.from(html.matchAll(/id="fx-(\d+)"/g)).map((m) => Number(m[1]));
}

function koIds(html) {
  return Array.from(html.matchAll(/kom-rnd">[^#]*#(\d+)/g)).map((m) => Number(m[1]));
}

test('queued navigation is last-tap-wins and canonical schedule/KO truth stays complete', () => withApp((app) => {
  const state = seedProviderTruth(app);
  finishGroups(app, state);
  app.render();
  app.flushRaf();
  assert.equal(app.activeScreen(), 'scr-home');
  assert.ok(app.activeText().trim().length > 0, 'home has warm content');

  app.resetCalls();
  app.clickBottom('matches');
  app.clickBottom('bet');
  app.clickBottom('teams');
  assert.equal(app.startViewTransitionCalls(), 0, 'bottom tabs do not use View Transitions');
  assert.notEqual(app.activeText().trim(), '', 'old content remains visible before queued target render');
  app.flushRaf();
  assert.equal(app.getTab(), 'h2h');
  assert.equal(app.activeScreen(), 'scr-teams');
  assert.notEqual(app.activeText().trim(), '', 'final active screen is not blank');
  assert.equal(app.calls().schedule, 0, 'stale Tournament render skipped');
  assert.equal(app.calls().bet, 0, 'stale Play render skipped');
  assert.equal(app.calls().h2h, 1, 'only final You tab rendered');

  app.setTab('schedule');
  app.schedJumpToday();
  assert.equal(app.startViewTransitionCalls(), 0, 'date controls do not use View Transitions');
  app.flushRaf();
  assert.equal(fixtureIds(app.scheduleHTML()).join(','), '74,75,76', 'Today includes final, live, and scheduled local-day fixtures');

  app.schedJumpTomorrow();
  app.flushRaf();
  assert.equal(fixtureIds(app.scheduleHTML()).join(','), '77');

  app.schedShowAllDates();
  app.flushRaf();
  const allIds = fixtureIds(app.scheduleHTML());
  [74, 75, 76, 77].forEach((n) => assert.ok(allIds.includes(n), `All Dates missed provider fixture #${n}`));
  assert.ok(allIds.indexOf(74) < allIds.indexOf(77), 'All Dates preserves provider chronology');

  app.renderBracket();
  const expectedKo = app.canonicalR32FixtureNums().join(',');
  const actualKo = koIds(app.knockoutModeHTML()).join(',');
  assert.equal(actualKo, expectedKo, 'KO mode IDs match canonical deduped R32 IDs');

  assert.match(app.mountText(app.homeHTML()), /9:00 PM/);
  assert.match(app.mrow(app.M[76], false), /9:00[\s\S]*PM/);
  assert.match(app.komR32CardHTML(app.r32FixtureStates().find((x) => x.matchNum === 76)), /9:00 PM/);
  assert.equal(app.matchCenterTruth(76).phase, 'scheduled');
  assert.equal(app.matchCenterTruth(75).phase, 'live');
}));
