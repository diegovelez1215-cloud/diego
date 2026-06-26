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
    window.__renderCount = 0;
    var __truthOriginalRender = render;
    render = function(){
      window.__renderCount += 1;
      return __truthOriginalRender.apply(this, arguments);
    };
    window.__truthTest = {
      getState:function(){return S;}, setState:function(v){S=v;}, blankState:blankState,
      MATCHES:MATCHES, GROUPS:GROUPS, REAL:REAL, M:M, gMatches:gMatches,
      tournamentTruthSnapshot:tournamentTruthSnapshot, truthRefreshStart:truthRefreshStart,
      truthRecordReceipt:truthRecordReceipt, ingestFinished:ingestFinished,
      ingestMatchStates:ingestMatchStates, tccOffTable:tccOffTable, tccRealTable:tccRealTable,
      tccTeamTournamentStatus:tccTeamTournamentStatus, matchLiveState:matchLiveState,
      scheduleRefresh:scheduleRefresh, ApiBus:ApiBus, dataStatusHTML:dataStatusHTML,
      mxRefreshIfStale:mxRefreshIfStale, fetchRealWorldData:fetchRealWorldData,
      mxState:function(){return _mxState;}, setMxState:function(v){_mxState=v;},
      renderCount:function(){return window.__renderCount;},
      resetRenderCount:function(){window.__renderCount=0;},
      mountText:function(html){var d=document.createElement('div');d.innerHTML=html||'';return d.textContent;}
    };`);
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  try {
    const result = fn(dom.window.__truthTest, dom.window);
    if (result && typeof result.then === 'function') return result.finally(() => dom.window.close());
    dom.window.close();
    return result;
  } catch (err) {
    dom.window.close();
    throw err;
  }
}

function resetOfficial(app) {
  Object.keys(app.REAL).forEach((k) => delete app.REAL[k]);
  const s = app.blankState();
  s.mode = 'real';
  Object.keys(app.GROUPS).forEach((g) => { s.order[g] = app.GROUPS[g].slice(); });
  app.setState(s);
  return s;
}

function finalPayload(m, h, a, extra = {}) {
  return Object.assign({ home: m.home, away: m.away, gh: h, ga: a, status: 'FINISHED', kind: 'final', stage: 'GROUP_STAGE' }, extra);
}

function livePayload(m, h, a, status = 'IN_PLAY') {
  return { home: m.home, away: m.away, gh: h, ga: a, min: 62, status, kind: 'live', statusLong: status };
}

test('official final payload updates the centralized truth snapshot', () => withApp((app) => {
  resetOfficial(app);
  const m = app.gMatches('A')[0];
  const receipt = app.truthRefreshStart('/api/results');
  assert.equal(app.ingestFinished([finalPayload(m, 2, 1)], { receipt }), true);
  const snap = app.tournamentTruthSnapshot();
  assert.equal(snap.official.finalResults[m.num].score.h, 2);
  assert.equal(snap.official.finalResults[m.num].score.a, 1);
  assert.match(snap.freshness.officialStateFingerprint, new RegExp(`${m.num}:2-1`));
}));

test('live payload remains provisional and never creates false confirmation', () => withApp((app) => {
  resetOfficial(app);
  const m = app.gMatches('B')[1];
  app.ingestMatchStates([livePayload(m, 0, 3)]);
  const snap = app.tournamentTruthSnapshot();
  assert.equal(snap.official.finalResults[m.num], undefined);
  assert.equal(snap.provisional.live[m.num].score.h, 0);
  assert.equal(snap.provisional.live[m.num].score.a, 3);
  assert.equal(app.tccOffTable(m.group).some((r) => r.Pl > 0), false);
  assert.equal(app.tccTeamTournamentStatus(m.away).type === 'officially_confirmed', false);
}));

test('delayed, suspended, empty, failed, and stale responses preserve official truth', () => withApp((app) => {
  resetOfficial(app);
  const [official, delayed] = app.gMatches('C');
  app.ingestFinished([finalPayload(official, 1, 0)]);
  const before = app.tournamentTruthSnapshot().freshness.officialStateFingerprint;
  app.ingestMatchStates([livePayload(delayed, null, null, 'SUSPENDED')]);
  app.ingestFinished([]);
  app.truthRecordReceipt('/api/results', { configured: true, error: true, sourceStatus: 'error', finished: [] }, app.truthRefreshStart('/api/results'));
  app.truthRecordReceipt('/api/live', { configured: true, isStale: true, sourceStatus: 'stale-fallback', response: [] }, app.truthRefreshStart('/api/live'));
  const snap = app.tournamentTruthSnapshot();
  assert.equal(snap.freshness.officialStateFingerprint, before);
  assert.equal(snap.official.finalResults[official.num].score.h, 1);
  assert.equal(snap.official.finalResults[official.num].score.a, 0);
  assert.equal(snap.provisional.hold[delayed.num].kind, 'hold');
}));

test('failed live refresh updates source health without global rerender', async () => withApp(async (app, window) => {
  const s = resetOfficial(app);
  const m = app.gMatches('H')[0];
  s.rwState[m.num] = { kind: 'live', sh: 0, sa: 0, min: 4, status: 'IN_PLAY', label: 'Live', at: Date.now() };
  app.setState(s);
  app.resetRenderCount();
  app.fetchRealWorldData();
  await new Promise((resolve) => window.setTimeout(resolve, 30));
  const liveReceipt = app.tournamentTruthSnapshot().freshness.sourceReceipts['/api/live'];
  assert.equal(app.renderCount(), 0);
  assert.equal(liveReceipt.health, 'unavailable');
  assert.equal(app.tournamentTruthSnapshot().provisional.live[m.num].score.h, 0);
}));

test('out-of-order live and final responses cannot regress newer state', () => withApp((app) => {
  resetOfficial(app);
  const m = app.gMatches('D')[0];
  const older = app.truthRefreshStart('/api/results');
  const newer = app.truthRefreshStart('/api/results');
  assert.equal(app.ingestFinished([finalPayload(m, 2, 0)], { receipt: newer }), true);
  assert.equal(app.ingestFinished([finalPayload(m, 1, 0)], { receipt: older }), false);
  assert.equal(app.tournamentTruthSnapshot().official.finalResults[m.num].score.h, 2);
  assert.equal(app.tournamentTruthSnapshot().official.finalResults[m.num].score.a, 0);
}));

test('duplicate and corrected final payloads are safe and idempotent', () => withApp((app) => {
  resetOfficial(app);
  const m = app.gMatches('E')[0];
  app.ingestFinished([finalPayload(m, 1, 1)], { receipt: app.truthRefreshStart('/api/results') });
  const first = app.tournamentTruthSnapshot().freshness.officialStateFingerprint;
  assert.equal(app.ingestFinished([finalPayload(m, 1, 1)], { receipt: app.truthRefreshStart('/api/results') }), false);
  assert.equal(app.tournamentTruthSnapshot().freshness.officialStateFingerprint, first);
  assert.equal(app.ingestFinished([finalPayload(m, 2, 1)], { receipt: app.truthRefreshStart('/api/results') }), true);
  const corrected = app.tournamentTruthSnapshot().freshness.officialStateFingerprint;
  assert.match(corrected, new RegExp(`${m.num}:2-1`));
  assert.equal(app.ingestFinished([finalPayload(m, 2, 1)], { receipt: app.truthRefreshStart('/api/results') }), false);
  assert.equal(app.tournamentTruthSnapshot().freshness.officialStateFingerprint, corrected);
}));

test('navigation and rerender scheduling do not create duplicate refresh loops', () => withApp((app, window) => {
  let cleared = 0;
  const oldClear = window.clearTimeout;
  window.clearTimeout = function patchedClear(id) { if (id) cleared += 1; return oldClear.call(window, id); };
  try {
    app.scheduleRefresh(1000);
    const first = app.ApiBus.timer;
    app.scheduleRefresh(1000);
    const second = app.ApiBus.timer;
    assert.notEqual(first, second);
    assert.ok(cleared >= 1);
  } finally {
    if (app.ApiBus.timer) oldClear.call(window, app.ApiBus.timer);
    app.ApiBus.timer = null;
    window.clearTimeout = oldClear;
  }
}));

test('Matchup Explorer sees official fingerprint changes without losing selected teams', () => withApp((app, window) => {
  resetOfficial(app);
  const m = app.gMatches('F')[0];
  const initialFp = app.tournamentTruthSnapshot().freshness.officialStateFingerprint;
  window.document.body.innerHTML = '<div id="scrim" class="on"><div id="sheet"></div><div id="mxResult">old result</div></div>';
  app.setMxState({ view: 'select', a: m.home, b: m.away, q: '', fp: initialFp });
  app.ingestFinished([finalPayload(m, 3, 2)], { receipt: app.truthRefreshStart('/api/results') });
  app.mxRefreshIfStale();
  const st = app.mxState();
  assert.equal(st.a, m.home);
  assert.equal(st.b, m.away);
  assert.notEqual(st.fp, initialFp);
  assert.notEqual(window.document.getElementById('mxResult').textContent, 'old result');
}));

test('Virtual Play state remains separate from official tournament state', () => withApp((app) => {
  const s = resetOfficial(app);
  const m = app.gMatches('G')[0];
  s.live = { num: m.num, sh: 1, sa: 0, min: 44 };
  s.bets = [{ id: 'ticket', num: m.num, pick: 'h', stake: 10, settled: false, state: 'pending', sourceMode: 'sim' }];
  s.betsim[m.num] = 1;
  app.setState(s);
  app.ingestFinished([finalPayload(m, 0, 0)], { receipt: app.truthRefreshStart('/api/results') });
  const snap = app.tournamentTruthSnapshot();
  assert.equal(snap.virtual.activeMatch.score.h, 1);
  assert.equal(snap.virtual.activeMatch.score.a, 0);
  assert.equal(snap.virtual.openTickets, 1);
  assert.equal(snap.official.finalResults[m.num].score.h, 0);
  assert.equal(snap.official.finalResults[m.num].score.a, 0);
}));

test('internal feed-state enums do not leak into user-facing copy', () => withApp((app) => {
  resetOfficial(app);
  app.truthRecordReceipt('/api/live', { configured: true, sourceStatus: 'stale-fallback', isStale: true, response: [] }, app.truthRefreshStart('/api/live'));
  const text = app.mountText(app.dataStatusHTML());
  assert.doesNotMatch(text, /\b(?:healthy|unavailable|stale|sourceHealthState|officialStateFingerprint|liveStateFingerprint)\b/i);
}));
