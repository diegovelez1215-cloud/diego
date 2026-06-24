/* Focused regression tests for matrix-based Round-of-32 third-place opponent
   resolution (replaces the old loose group-label shortcut). Proves the route
   engine derives possible opponents for "1st Group X vs 3:..." slots from the
   official FIFA third-place allocation matrix (TP3 / TP3C) and the current
   standings — never inventing a confirmed opponent, never hiding a computable
   possible-opponent set behind "Qualification slot pending". */
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
      getState: function(){ return S; },
      fullRouteExplorerEngine: fullRouteExplorerEngine,
      freDirectSlot: freDirectSlot,
      freThirdCandidateSlots: freThirdCandidateSlots,
      frePossibleTeamsForSlot: frePossibleTeamsForSlot,
      freValidThirdCombos: freValidThirdCombos,
      freSlotMatchNum: freSlotMatchNum,
      freOpponentState: freOpponentState,
      FRE_STATUS: FRE_STATUS,
      standingsLive: function(g){ return withTour(liveTour(), function(){ return standings(g); }); },
      allDoneLive: function(){ return withTour(liveTour(), function(){ return allDone(); }); },
      nm: nm,
      M: M,
      GROUPS: GROUPS,
      TG: TG,
      TP3: TP3,
      TP3C: TP3C
    };`);
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  try { return fn(dom.window.__routeTest); } finally { dom.window.close(); }
}

// Independent reference implementation of the matrix routing for a 3:... slot,
// built straight from TP3/TP3C + current standings. If the engine matches this
// it is provably using the allocation matrix, not the raw group-label slice.
function matrixExpectedTeams(app, raw) {
  const n = app.freSlotMatchNum(raw);
  const ki = app.TP3C.indexOf(n);
  if (ki < 0) return [];
  const combos = app.freValidThirdCombos();
  const groups = {};
  combos.forEach((c) => { groups[app.TP3[c].charAt(ki)] = 1; });
  const teams = [];
  Object.keys(groups).forEach((g) => {
    const row = app.standingsLive(g)[2];
    if (row && row.code && teams.indexOf(row.code) < 0) teams.push(row.code);
  });
  return teams;
}

function firstPlaceThirdSlotScenario(app, code) {
  const route = app.fullRouteExplorerEngine(code);
  return (route.scenarios || []).find((s) =>
    s.finishPositionNumber === 1 && s.opponent && typeof s.opponent.sourceSlot === 'string'
    && s.opponent.sourceSlot.indexOf('3:') === 0);
}

// 1. Portugal 1st uses matrix-based logic, not a static group list.
test('Portugal 1st derives third-place opponents from the allocation matrix, not the raw label list', () => withApp((app) => {
  assert.equal(app.allDoneLive(), false, 'fixture should still have the global third-place ranking unresolved');
  const scenario = firstPlaceThirdSlotScenario(app, 'POR');
  assert.ok(scenario, 'Portugal should have a 1st-place scenario whose opponent is a 3:... slot');
  const raw = scenario.opponent.sourceSlot;

  const engineSet = app.frePossibleTeamsForSlot(raw).slice().sort().join('|');
  const matrixSet = matrixExpectedTeams(app, raw).slice().sort().join('|');
  assert.equal(engineSet, matrixSet, 'engine opponent set must equal the matrix-routed set for the slot');
  assert.ok(matrixSet.length > 0, 'matrix-routed set should not be empty');

  // Anti-static guard: the matrix routes this single slot to a SUBSET of the
  // groups named in the label, chosen per qualifying-group combination. A naive
  // static "every group in the label" slice ignores TP3 entirely.
  const ki = app.TP3C.indexOf(app.freSlotMatchNum(raw));
  assert.ok(ki >= 0, 'slot must map to a TP3C bracket index');
  const labelGroups = raw.slice(2).split('');
  const routedGroups = {};
  app.freValidThirdCombos().forEach((c) => { routedGroups[app.TP3[c].charAt(ki)] = 1; });
  Object.keys(routedGroups).forEach((g) => assert.ok(labelGroups.indexOf(g) >= 0,
    `matrix-routed group ${g} must lie within the slot label ${raw}`));
  // The matrix maps DIFFERENT combinations to DIFFERENT groups for this slot,
  // which is the behaviour a static label list cannot express.
  const distinctRouted = new Set(app.freValidThirdCombos().map((c) => app.TP3[c].charAt(ki)));
  assert.ok(distinctRouted.size >= 2, 'matrix must route this slot to more than one group across combinations');
}));

// 2. Portugal 1st shows Possible opponents when valid candidates exist.
test('Portugal 1st shows Possible opponents (not Qualification slot pending) when the matrix set is computable', () => withApp((app) => {
  const scenario = firstPlaceThirdSlotScenario(app, 'POR');
  assert.ok(scenario, 'Portugal 1st scenario expected');
  assert.ok(scenario.opponent.possibleOpponents.length > 0, 'a computable possible-opponent set is expected');
  assert.equal(scenario.opponent.state, 'possible opponents');
  assert.notEqual(scenario.opponent.state, 'qualification slot pending');
  assert.equal(scenario.opponent.confirmedOpponent, null);
}));

// 3. Only matrix-valid third-place teams appear — checked for EVERY "1st vs 3:..." slot.
test('every 1st-place vs 3:... Round of 32 slot only surfaces matrix-valid third-place teams', () => withApp((app) => {
  let checked = 0;
  // Walk all teams; for any 1st-place scenario facing a 3:... opponent slot,
  // every surfaced opponent must be a matrix-valid third for that exact slot.
  Object.keys(app.TG).forEach((code) => {
    const route = app.fullRouteExplorerEngine(code);
    if (!route) return;
    (route.scenarios || []).forEach((s) => {
      const raw = s.opponent && s.opponent.sourceSlot;
      if (s.finishPositionNumber !== 1 || typeof raw !== 'string' || raw.indexOf('3:') !== 0) return;
      checked++;
      const valid = matrixExpectedTeams(app, raw);
      s.opponent.possibleOpponents.forEach((opp) => {
        assert.ok(valid.includes(opp),
          `${code} 1st vs ${raw} surfaced ${opp}, not in matrix-valid set ${JSON.stringify(valid)}`);
      });
      assert.equal(app.frePossibleTeamsForSlot(raw).slice().sort().join('|'), valid.slice().sort().join('|'));
    });
  });
  assert.ok(checked >= 1, 'expected at least one 1st-vs-3:... slot in the bracket');
}));

// 4. A pending slot stays pending when no valid candidate set exists.
test('a third-place opponent slot stays Qualification slot pending when no candidate set can be derived', () => withApp((app) => {
  const M = app.M;
  const FAKE = 9991; // synthetic R32-shaped match whose 3:... label maps to no TP3C bracket index
  M[FAKE] = { num: FAKE, home: '1A', away: '3:ZZZZ', date: '2099-12-31', time: '23:59', stage: 'ko', group: null };
  try {
    // No derivable candidates: the matrix cannot route this label.
    assert.equal(app.frePossibleTeamsForSlot('3:ZZZZ').length, 0);
    const opp = app.freOpponentState({ matchNum: FAKE, side: 'home' }, app.FRE_STATUS.pending);
    assert.equal(opp.possibleOpponents.length, 0);
    assert.equal(opp.state, 'qualification slot pending');
    assert.equal(opp.confirmedOpponent, null);
  } finally {
    delete M[FAKE];
  }
}));

// 5. A confirmed opponent only appears after official resolution.
test('third-place opponents never read as Confirmed while the global ranking is unresolved', () => withApp((app) => {
  assert.equal(app.allDoneLive(), false);
  let sawPossible = false;
  Object.keys(app.TG).forEach((code) => {
    const route = app.fullRouteExplorerEngine(code);
    if (!route) return;
    (route.scenarios || []).forEach((s) => {
      const raw = s.opponent && s.opponent.sourceSlot;
      if (typeof raw !== 'string' || raw.indexOf('3:') !== 0) return;
      assert.notEqual(s.opponent.state, 'confirmed opponent',
        `${code} ${s.finishPosition} must not confirm a third-place opponent before official resolution`);
      assert.equal(s.opponent.confirmedOpponent, null);
      if (s.opponent.state === 'possible opponents') sawPossible = true;
    });
  });
  assert.ok(sawPossible, 'expected at least one computable possible-opponent set in the unresolved fixture');

  // The confirmed gate: even with a single derivable team, freOpponentState only
  // confirms when the scenario status is Confirmed (i.e. officially resolved).
  const scenario = firstPlaceThirdSlotScenario(app, 'POR');
  if (scenario) {
    const unresolved = app.freOpponentState(scenario.roundOf32Slot, app.FRE_STATUS.pending);
    assert.notEqual(unresolved.state, 'confirmed opponent');
  }
}));
