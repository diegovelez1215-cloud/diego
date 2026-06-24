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
    window.__routeTest = {
      document: document,
      getState: function(){ return S; },
      setState: function(v){ S = v; },
      blankState: blankState,
      seedLive: seedLive,
      withTour: withTour,
      liveTour: liveTour,
      standings: standings,
      gMatches: gMatches,
      fdFixtureState: fdFixtureState,
      finalMatchdayGroupModel: finalMatchdayGroupModel,
      phaseLeadHTML: phaseLeadHTML,
      tournamentPhaseState: tournamentPhaseState,
      r32FixtureStates: r32FixtureStates,
      knockoutRouteForTeam: knockoutRouteForTeam,
      validFutureFixtureNums: validFutureFixtureNums,
      knockoutOfficialWinnerFromPayload: knockoutOfficialWinnerFromPayload,
      ingestKO: ingestKO,
      fullRouteExplorerEngine: fullRouteExplorerEngine,
      tccTeamTournamentStatus: tccTeamTournamentStatus,
      freDirectSlot: freDirectSlot,
      freThirdCandidateSlots: freThirdCandidateSlots,
      freConfirmedThirdSlot: freConfirmedThirdSlot,
      frePossibleTeamsForSlot: frePossibleTeamsForSlot,
      freScenarioPossible: freScenarioPossible,
      freExplorerHTML: freExplorerHTML,
      routeExplorerLiteHTML: routeExplorerLiteHTML,
      freMomentsHTML: freMomentsHTML,
      tccRoadSheet: tccRoadSheet,
      sheet: sheet,
      editorialItems: editorialItems,
      activeMode: activeMode,
      koParts: koParts,
      nm: nm,
      M: M,
      MATCHES: MATCHES,
      GROUPS: GROUPS,
      TP3: TP3,
      TP3C: TP3C,
      NEXTWIN: NEXTWIN,
      REAL: REAL
    };`);
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  try {
    return fn(dom.window.__routeTest);
  } finally {
    dom.window.close();
  }
}

function resetOfficial(app) {
  Object.keys(app.REAL).forEach((k) => delete app.REAL[k]);
  const state = app.blankState();
  state.mode = 'real';
  Object.keys(app.GROUPS).forEach((g) => { state.order[g] = app.GROUPS[g].slice(); });
  app.setState(state);
  return state;
}

function setOfficial(app, state, num, h, a) {
  app.REAL[num] = [h, a];
  state.sc[num] = { h, a };
  state.real[num] = 1;
}

function fillGroup(app, state, group, mode = 'ordered') {
  const order = app.GROUPS[group];
  const margin = Object.keys(app.GROUPS).indexOf(group) + 1;
  app.gMatches(group).forEach((m) => {
    if (mode === 'draws') return setOfficial(app, state, m.num, 0, 0);
    const hi = order.indexOf(m.home);
    const ai = order.indexOf(m.away);
    setOfficial(app, state, m.num, hi < ai ? margin : 0, hi < ai ? 0 : margin);
  });
}

function fillAllGroups(app, state, tiedGroup = null) {
  Object.keys(app.GROUPS).forEach((g) => fillGroup(app, state, g, g === tiedGroup ? 'draws' : 'ordered'));
}

function makeFinalMatchday(app, group = 'K') {
  const state = resetOfficial(app);
  const deciders = app.gMatches(group)
    .slice()
    .sort((a, b) => (a.date === b.date ? a.num - b.num : a.date < b.date ? -1 : 1))
    .slice(-2);
  const deciderNums = new Set(deciders.map((m) => m.num));
  app.gMatches(group).forEach((m) => {
    if (!deciderNums.has(m.num)) setOfficial(app, state, m.num, m.home === app.GROUPS[group][0] ? 1 : 0, m.away === app.GROUPS[group][0] ? 1 : 0);
  });
  state.rwState[deciders[0].num] = { kind: 'live', sh: 2, sa: 0, min: 63, label: 'Live', status: '2H' };
  state.rwState[deciders[1].num] = { kind: 'live', sh: 0, sa: 1, min: 63, label: 'Live', status: '2H' };
  state._rwlive = {};
  state._rwlive[deciders[0].num] = { sh: 2, sa: 0, min: 63, label: 'Live', status: '2H' };
  state._rwlive[deciders[1].num] = { sh: 0, sa: 1, min: 63, label: 'Live', status: '2H' };
  app.setState(state);
  return { state, deciders };
}

test('locked group winner has correct route slot', () => withApp((app) => {
  const route = app.fullRouteExplorerEngine('USA');
  assert.equal(route.resolverStatus.lockedWinner, true);
  assert.equal(route.scenarios.length, 1);
  assert.equal(route.scenarios[0].finishPosition, '1st');
  assert.equal(JSON.stringify(route.scenarios[0].roundOf32Slot), JSON.stringify({
    matchNum: 81,
    round: 'Round of 32',
    side: 'home',
    slot: '1D',
  }));
  assert.equal(route.scenarios[0].status, 'Mathematically locked');
}));

test('locked eliminated team has no knockout route', () => withApp((app) => {
  const route = app.fullRouteExplorerEngine('TUR');
  assert.equal(route.resolverStatus.eliminated, true);
  assert.equal(route.eliminated, true);
  assert.equal(route.scenarios.length, 0);
}));

test('team that can finish first second or third returns three valid scenario states', () => withApp((app) => {
  const candidate = Object.keys(app.GROUPS).flatMap((g) => app.GROUPS[g])
    .find((code) => [1, 2, 3].every((pos) => app.freScenarioPossible(app.tccTeamTournamentStatus(code), pos)));
  assert.ok(candidate, 'expected at least one team with 1st/2nd/3rd route scenarios');
  const route = app.fullRouteExplorerEngine(candidate);
  assert.equal(JSON.stringify(route.scenarios.map((s) => s.finishPositionNumber)), JSON.stringify([1, 2, 3]));
  route.scenarios.forEach((s) => assert.ok(s.roundOf32Slot || s.qualificationStatus === 'eliminated'));
}));

test('third-place route remains conditional while global ranking is unresolved', () => withApp((app) => {
  const route = app.fullRouteExplorerEngine('GER');
  const third = route.scenarios.find((s) => s.finishPositionNumber === 3);
  assert.ok(third, 'Germany should still have a third-place scenario in current data');
  assert.equal(third.qualificationStatus, 'conditional_best_third');
  assert.equal(third.status, 'Pending official final');
  assert.equal(third.bestThirdPlaceEligible, true);
  assert.equal(third.opponent.state, 'qualification slot pending');
}));

test('no route state invents a confirmed opponent', () => withApp((app) => {
  Object.keys(app.GROUPS).flatMap((g) => app.GROUPS[g]).forEach((code) => {
    const route = app.fullRouteExplorerEngine(code);
    route.scenarios.forEach((s) => {
      if (s.opponent.state === 'confirmed opponent') {
        assert.equal(s.status, 'Confirmed');
        assert.ok(s.opponent.confirmedOpponent);
      }
    });
  });
}));

test('bracket slot mapping matches existing round of 32 data', () => withApp((app) => {
  Object.keys(app.GROUPS).forEach((g) => {
    [1, 2].forEach((pos) => {
      const slot = app.freDirectSlot(g, pos);
      assert.ok(slot, `${pos}${g} slot should exist`);
      assert.equal(app.M[slot.matchNum][slot.side], `${pos}${g}`);
    });
  });
  app.freThirdCandidateSlots('D').forEach((slot) => {
    assert.equal(String(app.M[slot.matchNum][slot.side]).startsWith('3:'), true);
    assert.equal(app.M[slot.matchNum][slot.side].includes('D'), true);
  });
}));

test('route engine does not mutate settlement pickem leaderboard or live state containers', () => withApp((app) => {
  const before = JSON.stringify(app.getState());
  ['POR', 'COL', 'USA', 'BRA', 'GER', 'TUR'].forEach((code) => app.fullRouteExplorerEngine(code));
  assert.equal(JSON.stringify(app.getState()), before);
}));

test('Portugal and Colombia route opponents are mathematically valid by source slot', () => withApp((app) => {
  ['POR', 'COL'].forEach((code) => {
    const route = app.fullRouteExplorerEngine(code);
    route.scenarios.forEach((s) => {
      assert.ok(s.roundOf32Slot || s.qualificationStatus === 'eliminated');
      if (!s.opponent.sourceSlot) return;
      const valid = app.frePossibleTeamsForSlot(s.opponent.sourceSlot);
      s.opponent.possibleOpponents.forEach((opp) => {
        assert.ok(valid.includes(opp), `${code} ${s.finishPosition} included invalid opponent ${opp} for ${s.opponent.sourceSlot}`);
      });
      if (s.opponent.state === 'confirmed opponent') {
        assert.equal(s.status, 'Confirmed');
      }
    });
  });
}));

test('third-place allocation matrix changes by qualifying-group combination', () => withApp((app) => {
  const comboA = 'ABCDEFGH';
  const comboB = 'BCDEFGHI';
  assert.ok(app.TP3[comboA], 'expected Annex C mapping for ABCDEFGH');
  assert.ok(app.TP3[comboB], 'expected Annex C mapping for BCDEFGHI');
  assert.notEqual(app.TP3[comboA], app.TP3[comboB]);
  assert.equal(app.TP3[comboA].length, app.TP3C.length);
  assert.equal(app.TP3[comboB].length, app.TP3C.length);
}));

test('route explorer uses official tournament language only', () => withApp((app) => {
  const forbidden = /\b(Power|POWER RATING|likely opponent|likely against|match profile|Model win projection|live win probability|Form profile|Momentum|fatigue|estimated from match load|Supercomputer|title chances|upset|odds|probability)\b/i;
  ['POR', 'COL', 'USA', 'BRA', 'GER', 'TUR'].forEach((code) => {
    const html = [
      app.freExplorerHTML(code),
      app.routeExplorerLiteHTML(code),
      app.freMomentsHTML(code),
    ].join('\n');
    assert.equal(forbidden.test(html), false, `${code} route UI leaked invented language: ${html.match(forbidden)}`);
  });
}));

test('factual road sheet and match center do not show model signals', () => withApp((app) => {
  assert.equal(app.activeMode(), 'real');
  const doc = app.document;
  assert.ok(doc);
  const forbidden = /\b(Power|POWER RATING|Model win projection|live win probability|Form profile|Momentum|fatigue|estimated from match load|Supercomputer|title chances|match profile|lowest-rated|higher-rated|Group of Death|toughest group|model)\b/i;
  app.tccRoadSheet('USA');
  assert.equal(forbidden.test(doc.getElementById('sheet').textContent), false);
  app.sheet(1);
  assert.equal(forbidden.test(doc.getElementById('sheet').textContent), false);
  const stories = app.editorialItems().map((x) => `${x.h} ${x.t}`).join('\n');
  assert.equal(forbidden.test(stories), false);
}));

test('final group matchday model tracks two simultaneous deciders', () => withApp((app) => {
  const { deciders } = makeFinalMatchday(app, 'K');
  const model = app.finalMatchdayGroupModel('K');
  assert.equal(model.isFinalMatchday, true);
  assert.equal(model.fixtures.length, 2);
  assert.deepEqual(model.fixtures.map((f) => f.num), deciders.map((m) => m.num));
  assert.equal(model.asItStands, true);
  assert.equal(model.fixtures.every((f) => f.kind === 'live'), true);
}));

test('Home final matchday lead renders both simultaneous group deciders', () => withApp((app) => {
  const { deciders } = makeFinalMatchday(app, 'K');
  const html = app.phaseLeadHTML();
  assert.match(html, /Final Matchday/);
  assert.match(html, /Group K/);
  assert.equal((html.match(/class="phl-fixture live"/g) || []).length, 2);
  deciders.forEach((m) => {
    assert.ok(html.includes(app.nm(app.M[m.num].home)), `missing home team for fixture ${m.num}`);
    assert.ok(html.includes(app.nm(app.M[m.num].away)), `missing away team for fixture ${m.num}`);
  });
  assert.match(html, /simultaneous deciders/);
  assert.match(html, /LIVE · 63(&#39;|')/);
}));

test('live final-day scores produce projected standings without overwriting official table', () => withApp((app) => {
  makeFinalMatchday(app, 'K');
  const model = app.finalMatchdayGroupModel('K');
  const officialPlayed = model.officialTable.reduce((n, r) => n + r.Pl, 0);
  const projectedPlayed = model.projectedTable.reduce((n, r) => n + r.Pl, 0);
  assert.ok(projectedPlayed > officialPlayed, 'projected table should include live deciders');
  assert.notEqual(JSON.stringify(model.officialTable), JSON.stringify(model.projectedTable));
  assert.equal(model.stakes.some((s) => /Official final|have won|officially/i.test(s)), false);
}));

test('projected qualification copy stays conservative with live unresolved finals', () => withApp((app) => {
  makeFinalMatchday(app, 'K');
  const model = app.finalMatchdayGroupModel('K');
  assert.ok(model.stakes.length > 0);
  assert.equal(model.stakes.every((s) => !/\bofficially\b|\bconfirmed\b/i.test(s)), true);
  assert.ok(model.stakes.some((s) => /unresolved|provisional|would/i.test(s)));
}));

test('all official group finals complete group stage and populate round of 32 pairings', () => withApp((app) => {
  const state = resetOfficial(app);
  fillAllGroups(app, state);
  app.setState(state);
  const phase = app.tournamentPhaseState();
  assert.equal(phase.allGroupFixturesFinal, true);
  assert.equal(phase.roundOf32PairingsConfirmed, true);
  assert.equal(phase.phase, 'round_of_32');
  assert.equal(phase.roundOf32.every((x) => x.state === 'confirmed_pairing'), true);
}));

test('phase resolver switches to groups resolving when official tiebreaks remain pending', () => withApp((app) => {
  const state = resetOfficial(app);
  fillAllGroups(app, state, 'A');
  app.setState(state);
  const phase = app.tournamentPhaseState();
  assert.equal(phase.allGroupFixturesFinal, true);
  assert.equal(phase.allQualifyingTeamsResolved, false);
  assert.equal(phase.phase, 'groups_resolving');
}));

test('unresolved third-place slots remain pending before groups complete', () => withApp((app) => {
  makeFinalMatchday(app, 'K');
  const phase = app.tournamentPhaseState();
  assert.equal(phase.phase, 'final_matchday');
  assert.equal(phase.roundOf32.some((x) => x.pendingSlots.some((slot) => String(slot).startsWith('3:'))), true);
}));

test('route transition exposes knockout match only after qualifiers resolve', () => withApp((app) => {
  resetOfficial(app);
  let pending = app.knockoutRouteForTeam('POR');
  assert.notEqual(pending.state, 'confirmed_match');
  const state = resetOfficial(app);
  fillAllGroups(app, state);
  app.setState(state);
  const route = app.knockoutRouteForTeam(app.GROUPS.K[0]);
  assert.equal(route.state, 'confirmed_match');
  assert.ok(route.match.matchNum >= 73 && route.match.matchNum <= 88);
}));

test('extra-time and penalty payloads advance only from official winner rules', () => withApp((app) => {
  assert.equal(app.knockoutOfficialWinnerFromPayload({ status: 'AET', gh: 2, ga: 1 }, 'POR', 'COL'), 'POR');
  assert.equal(app.knockoutOfficialWinnerFromPayload({ status: 'PEN', gh: 1, ga: 1 }, 'POR', 'COL'), null);
  assert.equal(app.knockoutOfficialWinnerFromPayload({ status: 'PEN', gh: 1, ga: 1, winner: 'AWAY_TEAM' }, 'POR', 'COL'), 'COL');
}));

test('delayed final-day fixture does not falsely complete a group', () => withApp((app) => {
  const { state, deciders } = makeFinalMatchday(app, 'K');
  state.rwState[deciders[0].num] = { kind: 'hold', label: 'Play suspended', status: 'SUSP' };
  delete state._rwlive[deciders[0].num];
  app.setState(state);
  const model = app.finalMatchdayGroupModel('K');
  assert.equal(model.complete, false);
  assert.equal(model.fixtures.some((f) => f.kind === 'hold'), true);
}));

test('valid future fixtures drop completed groups and expose resolved knockout fixtures', () => withApp((app) => {
  const state = resetOfficial(app);
  fillAllGroups(app, state);
  app.setState(state);
  const nums = app.validFutureFixtureNums();
  assert.equal(nums.some((n) => app.M[n].stage === 'group'), false);
  assert.equal(nums.some((n) => n >= 73 && n <= 88), true);
}));
