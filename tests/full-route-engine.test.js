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
