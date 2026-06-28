const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

function loadApp(options = {}) {
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
  if (options.legacyState) window.localStorage.setItem('wc26_v1', JSON.stringify(options.legacyState));
  if (options.userState) window.localStorage.setItem('wc26_user_v1', JSON.stringify(options.userState));
  if (options.playState) window.localStorage.setItem('wc26_play_v1', JSON.stringify(options.playState));
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
      ingestProviderKOFixtures:ingestProviderKOFixtures,
      ingestMatchStates:ingestMatchStates, tccOffTable:tccOffTable, tccRealTable:tccRealTable,
      tccTeamTournamentStatus:tccTeamTournamentStatus, matchLiveState:matchLiveState,
      matchCenterTruth:matchCenterTruth, standings:standings, winner:winner,
      knockoutSlotStatus:knockoutSlotStatus, knockoutPathCardHTML:knockoutPathCardHTML,
      matchupIntelligence:matchupIntelligence, koParts:koParts, fdFixtureState:fdFixtureState,
      TRUTH_PROVISIONAL_EXPIRY_MS:TRUTH_PROVISIONAL_EXPIRY_MS,
      scheduleRefresh:scheduleRefresh, ApiBus:ApiBus, dataStatusHTML:dataStatusHTML,
      mxRefreshIfStale:mxRefreshIfStale, fetchRealWorldData:fetchRealWorldData,
      mxState:function(){return _mxState;}, setMxState:function(v){_mxState=v;},
      saveState:saveState, resetMyPlaySave:resetMyPlaySave, playSaveFromState:playSaveFromState,
      userSaveFromState:userSaveFromState, applyUserSave:applyUserSave,
      applyPlaySave:applyPlaySave, markPlayScore:markPlayScore, markPlayKO:markPlayKO,
      markPlayOrder:markPlayOrder, bump:bump, setKo:setKo, settleAllBets:settleAllBets,
      matchcastHTML:matchcastHTML,
      renderCount:function(){return window.__renderCount;},
      resetRenderCount:function(){window.__renderCount=0;},
      mountText:function(html){var d=document.createElement('div');d.innerHTML=html||'';return d.textContent;}
    };`);
  return dom;
}

function withApp(fn, options = {}) {
  const dom = loadApp(options);
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

function scheduledKOPayload(matchNum, home, away, extra = {}) {
  return Object.assign({ matchNum, home, away, gh: null, ga: null, status: 'TIMED', kind: 'scheduled', stage: 'LAST_32' }, extra);
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

test('named future provider knockout fixture is confirmed in bracket and Route Explorer', () => withApp((app) => {
  const s = resetOfficial(app);
  app.ingestProviderKOFixtures([scheduledKOPayload(73, 'Germany', 'Paraguay')], { authoritative: true });
  const st = app.knockoutSlotStatus(73, true);
  assert.equal(st.state, 'confirmed');
  assert.equal(st.home, 'GER');
  assert.equal(st.away, 'PAR');
  const card = app.knockoutPathCardHTML(73, new Set(), false, true);
  assert.match(card, /Germany/);
  assert.match(card, /Paraguay/);
  assert.match(card, /Confirmed/);
  const route = app.matchupIntelligence('GER', 'PAR');
  assert.equal(route.verdict, 'confirmed');
  assert.equal(route.knockoutPossibilities[0].matchNum, 73);
  assert.equal(s.realko[73], undefined);
}));

test('named provider fixture overrides unresolved inferred slots for participant display only', () => withApp((app) => {
  resetOfficial(app);
  app.ingestProviderKOFixtures([scheduledKOPayload(74, 'Australia', 'Egypt')], { authoritative: true });
  const st = app.knockoutSlotStatus(74, true);
  assert.equal(st.state, 'confirmed');
  assert.deepEqual([st.home, st.away], ['AUS', 'EGY']);
  assert.deepEqual(Array.from(app.koParts(74)), ['AUS', 'EGY']);
  const snap = app.tournamentTruthSnapshot();
  assert.equal(snap.official.confirmedKnockoutFixtures[74].home, 'AUS');
  assert.equal(snap.official.knockoutWinners[74], undefined);
}));

test('TBD provider knockout fixture stays pending', () => withApp((app) => {
  resetOfficial(app);
  app.ingestProviderKOFixtures([scheduledKOPayload(75, 'TBD', 'Sweden')], { authoritative: true });
  const st = app.knockoutSlotStatus(75, true);
  assert.notEqual(st.state, 'confirmed');
  assert.equal(app.tournamentTruthSnapshot().official.confirmedKnockoutFixtures[75], undefined);
}));

test('scheduled named provider fixture does not advance either team', () => withApp((app) => {
  const s = resetOfficial(app);
  app.ingestProviderKOFixtures([scheduledKOPayload(76, 'France', 'Sweden')], { authoritative: true });
  assert.equal(app.knockoutSlotStatus(76, true).state, 'confirmed');
  assert.equal(s.realko[76], undefined);
  assert.equal(app.knockoutSlotStatus(91, true).state === 'confirmed', false);
  assert.deepEqual(Array.from(app.koParts(91)), [null, null]);
}));

test('virtual simulation cannot affect provider-named fixture confirmation', () => withApp((app) => {
  const s = resetOfficial(app);
  app.ingestProviderKOFixtures([scheduledKOPayload(77, 'Argentina', 'Cape Verde')], { authoritative: true });
  s.sc[77] = { h: 9, a: 0 };
  s.betsim[77] = 1;
  app.setState(s);
  const st = app.knockoutSlotStatus(77, true);
  assert.equal(st.state, 'confirmed');
  assert.deepEqual([st.home, st.away], ['ARG', 'CPV']);
  assert.equal(s.realko[77], undefined);
}));

test('provider failure or stale data cannot invent a confirmed knockout fixture', () => withApp((app) => {
  resetOfficial(app);
  assert.equal(app.ingestProviderKOFixtures([scheduledKOPayload(78, 'Australia', 'Egypt')], { authoritative: false }), false);
  assert.notEqual(app.knockoutSlotStatus(78, true).state, 'confirmed');
  const receipt = app.truthRefreshStart('/api/results');
  app.truthRecordReceipt('/api/results', { configured: true, sourceStatus: 'stale-fallback' }, receipt);
  assert.equal(app.ingestProviderKOFixtures([scheduledKOPayload(78, 'Australia', 'Egypt')], { receipt, authoritative: false }), false);
  assert.notEqual(app.knockoutSlotStatus(78, true).state, 'confirmed');
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

test('future Play results persist only in wc26_play_v1 and preserve legacy wc26_v1.sc', () => {
  const legacyState = {
    v: 1,
    sc: { 55: { h: 7, a: 7 } },
    ko: { 73: 'ARG' },
    order: { A: ['MEX', 'RSA', 'KOR', 'FRA'] },
    thirds: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    betsim: {},
    mode: 'sim',
    bank: 12345,
    bets: [{ id: 'legacy-ticket', num: 55, pick: 'h', stake: 25, settled: false }],
  };
  withApp((app, window) => {
    const rawBefore = window.localStorage.getItem('wc26_v1');
    const s = app.getState();
    s.mode = 'sim';
    app.setState(s);

    app.bump(55, 'h', 1);
    app.saveState();

    assert.equal(window.localStorage.getItem('wc26_v1'), rawBefore);
    const play = JSON.parse(window.localStorage.getItem('wc26_play_v1'));
    assert.equal(play.owner, 'play');
    assert.equal(play.scores['55'].h, 8);
    assert.equal(play.scores['55'].a, 7);
    assert.equal(play.scoreMeta['55'].owner, 'play');
    assert.equal(play.scoreMeta['55'].kind, 'manual-score');
    assert.equal(Object.prototype.hasOwnProperty.call(play, 'bank'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(play, 'bets'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(play, 'slip'), false);
    const user = JSON.parse(window.localStorage.getItem('wc26_user_v1'));
    assert.equal(user.owner, 'user');
    assert.equal(user.bank, 12345);
    assert.equal(user.bets[0].id, 'legacy-ticket');
    assert.equal(JSON.parse(rawBefore).sc['55'].h, 7);

    app.resetMyPlaySave();
    const after = app.getState();
    const resetSave = JSON.parse(window.localStorage.getItem('wc26_play_v1'));
    assert.equal(window.localStorage.getItem('wc26_v1'), rawBefore);
    assert.equal(after.sc[55].h, 7);
    assert.equal(after.sc[55].a, 7);
    assert.equal(Object.keys(resetSave.scores).length, 0);
    assert.equal(Object.prototype.hasOwnProperty.call(resetSave, 'bets'), false);
  }, { legacyState });
});

test('normal save and fresh load still restore authoritative official truth', () => {
  let officialNum;
  withApp((app) => {
    const snap = app.tournamentTruthSnapshot();
    officialNum = Number(Object.keys(snap.official.finalResults)[0]);
    assert.ok(officialNum > 0);
    app.saveState();
    assert.equal(app.tournamentTruthSnapshot().official.finalResults[officialNum].source, 'official_final');
  });
  withApp((app) => {
    const fresh = app.tournamentTruthSnapshot();
    assert.equal(fresh.official.finalResults[officialNum].source, 'official_final');
    assert.equal(fresh.official.finalResults[officialNum].score.h >= 0, true);
    assert.equal(fresh.official.finalResults[officialNum].score.a >= 0, true);
  });
});

test('Reset My Play Save cannot mutate official truth, standings, bracket, provider state, or Match Center', () => withApp((app) => {
  const s = resetOfficial(app);
  const officialMatch = app.gMatches('A')[0];
  app.ingestFinished([finalPayload(officialMatch, 2, 0)], { receipt: app.truthRefreshStart('/api/results') });

  const state = app.getState();
  state.providerGroupOrder = { A: ['MEX', 'RSA', 'KOR', 'FRA'] };
  state.rwState[2] = { sh: 1, sa: 1, min: 67, status: 'IN_PLAY', label: '67', kind: 'live', at: Date.now(), receiptSeq: 1 };
  state.realko[73] = 'ARG';
  state.officialKOFixtures[74] = { num: 74, home: 'BRA', away: 'GER', stage: 'Round of 32', status: 'TIMED', source: 'official_provider_fixture' };
  state.mode = 'sim';
  app.setState(state);

  const playMatch = app.gMatches('B')[0];
  state.sc[playMatch.num] = { h: 4, a: 3 };
  app.markPlayScore(playMatch.num, state.sc[playMatch.num], 'test');
  state.ko[89] = 'BRA';
  app.markPlayKO(89, 'BRA', 'test');
  state.bank = 9876;
  state.bankHist = [10000, 9876];
  state.slip = [{ k: 'm', num: officialMatch.num, pick: 'h', odds: -110, label: 'Official fixture pick', key: 'official-pick' }];
  state.bets = [
    { id: 'official-ticket', num: officialMatch.num, pick: 'h', stake: 124, odds: -110, settled: false, state: 'pending', sourceMode: 'sim' },
    { id: 'settled-history', num: officialMatch.num, pick: 'a', stake: 40, odds: 125, settled: true, state: 'lost', net: -40, sourceMode: 'sim' },
  ];
  app.saveState();

  const beforeSnap = app.tournamentTruthSnapshot();
  const beforeStanding = app.standings('A').map((r) => `${r.code}:${r.Pts}:${r.GF}:${r.GA}`).join('|');
  const beforeMatchCenter = app.matchCenterTruth(officialMatch.num);
  const beforeProviderOrder = state.providerGroupOrder.A.join(',');
  const beforeBets = state.bets.map((b) => `${b.id}:${b.num}:${b.stake}:${b.settled}:${b.state}:${b.net || 0}`).join('|');
  const beforeSlip = state.slip.map((l) => `${l.key}:${l.num}:${l.pick}:${l.odds}`).join('|');
  const beforeBank = state.bank;
  const beforeBankHist = state.bankHist.join(',');
  const userSaveBefore = app.userSaveFromState();

  app.resetMyPlaySave();

  const afterState = app.getState();
  const afterSnap = app.tournamentTruthSnapshot();
  const afterStanding = app.standings('A').map((r) => `${r.code}:${r.Pts}:${r.GF}:${r.GA}`).join('|');
  const afterMatchCenter = app.matchCenterTruth(officialMatch.num);

  assert.equal(afterSnap.official.finalResults[officialMatch.num].score.h, beforeSnap.official.finalResults[officialMatch.num].score.h);
  assert.equal(afterSnap.official.finalResults[officialMatch.num].score.a, beforeSnap.official.finalResults[officialMatch.num].score.a);
  assert.equal(afterSnap.freshness.officialStateFingerprint, beforeSnap.freshness.officialStateFingerprint);
  assert.equal(afterSnap.provisional.live[2].score.h, 1);
  assert.equal(afterState.providerGroupOrder.A.join(','), beforeProviderOrder);
  assert.equal(afterState.realko[73], 'ARG');
  assert.equal(afterState.officialKOFixtures[74].home, 'BRA');
  assert.equal(afterStanding, beforeStanding);
  assert.equal(afterMatchCenter.phase, beforeMatchCenter.phase);
  assert.equal(afterMatchCenter.score.h, beforeMatchCenter.score.h);
  assert.equal(afterMatchCenter.score.a, beforeMatchCenter.score.a);
  assert.equal(afterState.sc[playMatch.num], undefined);
  assert.equal(afterState.ko[89], undefined);
  assert.equal(afterState.bank, beforeBank);
  assert.equal(afterState.bankHist.join(','), beforeBankHist);
  assert.equal(afterState.bets.map((b) => `${b.id}:${b.num}:${b.stake}:${b.settled}:${b.state}:${b.net || 0}`).join('|'), beforeBets);
  assert.equal(afterState.slip.map((l) => `${l.key}:${l.num}:${l.pick}:${l.odds}`).join('|'), beforeSlip);
  const userSaveAfter = app.userSaveFromState();
  assert.equal(userSaveAfter.bank, userSaveBefore.bank);
  assert.equal(userSaveAfter.bets.map((b) => b.id).join(','), userSaveBefore.bets.map((b) => b.id).join(','));
  assert.equal(userSaveAfter.slip.map((l) => l.key).join(','), userSaveBefore.slip.map((l) => l.key).join(','));
  app.settleAllBets();
  assert.equal(afterState.bets[0].settled, true);
  assert.equal(afterState.bets[0].state, 'won');
  assert.equal(afterState.bank > beforeBank, true);
}));

test('simulation labels remain visible in Matchcast copy', () => withApp((app) => {
  resetOfficial(app);
  const text = app.mountText(app.matchcastHTML(1, null));
  assert.match(text, /SIMULATED MATCHCAST/);
  assert.match(text, /No real money/);
  assert.match(text, /Does not affect official results/);
}));

test('internal feed-state enums do not leak into user-facing copy', () => withApp((app) => {
  resetOfficial(app);
  app.truthRecordReceipt('/api/live', { configured: true, sourceStatus: 'stale-fallback', isStale: true, response: [] }, app.truthRefreshStart('/api/live'));
  const text = app.mountText(app.dataStatusHTML());
  assert.doesNotMatch(text, /\b(?:healthy|unavailable|stale|sourceHealthState|officialStateFingerprint|liveStateFingerprint)\b/i);
}));
