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
      knockoutSlotStatus:knockoutSlotStatus, fdFixtureState:fdFixtureState,
      TRUTH_PROVISIONAL_EXPIRY_MS:TRUTH_PROVISIONAL_EXPIRY_MS,
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

function setOfficial(app, state, num, h, a) {
  app.REAL[num] = [h, a];
  state.sc[num] = { h, a };
  state.real[num] = 1;
}

function finishAllGroupsTiedWithAuthority(app, state) {
  state.providerGroupOrder = {};
  Object.keys(app.GROUPS).forEach((g) => {
    state.providerGroupOrder[g] = app.GROUPS[g].slice();
    app.gMatches(g).forEach((m) => setOfficial(app, state, m.num, 0, 0));
  });
  app.setState(state);
}

function koPayload(home, away, winner, gh = 1, ga = 0) {
  return { home, away, gh, ga, status: 'FINISHED', kind: 'final', stage: 'LAST_32', winner };
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

test('expired provisional states are removed from truth and shown as awaiting confirmed update', () => withApp((app) => {
  const s = resetOfficial(app);
  const m = app.gMatches('B')[0];
  const at = Date.now() - app.TRUTH_PROVISIONAL_EXPIRY_MS - 1000;
  s.rwState[m.num] = { kind: 'live', sh: 4, sa: 0, min: 90, status: '2H', label: 'Live', at };
  s._rwlive = { [m.num]: { kind: 'live', sh: 4, sa: 0, min: 90, status: '2H', label: 'Live', at } };
  app.setState(s);
  const snap = app.tournamentTruthSnapshot();
  assert.equal(snap.provisional.live[m.num], undefined, 'expired live state is not current truth');
  assert.equal(app.tccRealTable(m.group).find((r) => r.code === m.home).GF, 0, 'expired live score does not move projected table');
  assert.equal(app.matchLiveState(m.num).label, 'Awaiting confirmed update');
  assert.equal(app.fdFixtureState(m.num).kind, 'awaiting_confirmed_update');
}));

test('corrected official knockout result rebuilds the bracket and prunes impossible downstream winners', () => withApp((app) => {
  const s = resetOfficial(app);
  finishAllGroupsTiedWithAuthority(app, s);
  const r32a = app.knockoutSlotStatus(73, true);
  const r32b = app.knockoutSlotStatus(75, true);
  assert.equal(r32a.state, 'confirmed');
  assert.equal(r32b.state, 'confirmed');
  app.ingestFinished([
    koPayload(r32a.home, r32a.away, 'HOME_TEAM', 2, 0),
    koPayload(r32b.home, r32b.away, 'HOME_TEAM', 1, 0)
  ], { receipt: app.truthRefreshStart('/api/results') });
  const r16 = app.knockoutSlotStatus(90, true);
  assert.equal(r16.home, r32a.home);
  assert.equal(r16.away, r32b.home);
  app.ingestFinished([koPayload(r16.home, r16.away, 'HOME_TEAM', 1, 0)], { receipt: app.truthRefreshStart('/api/results') });
  assert.equal(app.getState().realko[90], r32a.home, 'downstream result stored under original bracket path');

  app.ingestFinished([koPayload(r32a.home, r32a.away, 'AWAY_TEAM', 0, 1)], { receipt: app.truthRefreshStart('/api/results') });
  assert.equal(app.getState().realko[73], r32a.away, 'earlier official correction is applied');
  assert.equal(app.getState().realko[75], r32b.home, 'unrelated valid official result is preserved');
  assert.equal(app.getState().realko[90], undefined, 'impossible downstream winner is pruned');
  assert.equal(app.knockoutSlotStatus(90, true).home, r32a.away, 'downstream slot is rebuilt from latest official state');
}));

test('exact score ties stay unresolved unless authoritative provider order exists', () => withApp((app) => {
  const s = resetOfficial(app);
  app.gMatches('A').forEach((m) => setOfficial(app, s, m.num, 0, 0));
  app.setState(s);
  app.GROUPS.A.forEach((code) => {
    const st = app.tccTeamTournamentStatus(code);
    assert.equal(st.provisionalByTiebreaker, true, `${code} remains unresolved without provider order`);
    assert.notEqual(st.type, 'officially_confirmed');
  });
  const slot = app.MATCHES.find((m) => m.home === '1A' || m.away === '1A');
  assert.ok(slot, 'test fixture includes 1A slot');
  assert.notEqual(app.knockoutSlotStatus(slot.num, true).state, 'confirmed', 'manual fallback order cannot confirm bracket slot');

  s.providerGroupOrder = { A: app.GROUPS.A.slice() };
  app.setState(s);
  assert.equal(app.tccTeamTournamentStatus(app.GROUPS.A[0]).type, 'officially_confirmed', 'authoritative provider order resolves exact tie');
  assert.equal(app.knockoutSlotStatus(slot.num, true).state, 'one', 'direct slot can lock once its tied group has authority');
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
