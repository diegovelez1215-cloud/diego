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
    window.__matchupTest = {
      getState: function(){ return S; },
      setState: function(v){ S = v; },
      blankState: blankState,
      matchupIntelligence: matchupIntelligence,
      knockoutSlotStatus: knockoutSlotStatus,
      tccOfficialFinal: tccOfficialFinal,
      tccTeamTournamentStatus: tccTeamTournamentStatus,
      freValidThirdCombos: freValidThirdCombos,
      M: M,
      MATCHES: MATCHES,
      GROUPS: GROUPS,
      TG: TG,
      REAL: REAL,
      TP3: TP3,
      TP3C: TP3C
    };`);
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  try {
    return fn(dom.window.__matchupTest);
  } finally {
    dom.window.close();
  }
}

function allTeams(app) {
  return Object.keys(app.GROUPS).flatMap((g) => app.GROUPS[g]);
}

function unorderedPairs(teams) {
  const out = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) out.push([teams[i], teams[j]]);
  }
  return out;
}

function fixtureSet(result) {
  return (result.knockoutPossibilities || []).map((p) => `${p.round}#${p.matchNum}`).sort();
}

function userCopy(result) {
  const bits = [result.headline, result.impossibleReason];
  (result.knockoutPossibilities || []).forEach((p) => {
    bits.push(p.explanation, p.statusLabel);
    (p.requirements || []).forEach((r) => bits.push(r.text));
  });
  return bits.filter(Boolean).join('\n');
}

test('matchup engine covers every unordered pair without throwing', () => withApp((app) => {
  const pairs = unorderedPairs(allTeams(app));
  assert.equal(pairs.length, 1128);
  pairs.forEach(([a, b]) => {
    const result = app.matchupIntelligence(a, b);
    assert.equal(result.version, 'matchup-intel-v1');
    assert.equal(result.ok, true);
    assert.equal(result.teams.teamA.code, a);
    assert.equal(result.teams.teamB.code, b);
    assert.ok(Array.isArray(result.knockoutPossibilities));
  });
}));

test('matchup engine is symmetric and deterministic', () => withApp((app) => {
  unorderedPairs(allTeams(app)).forEach(([a, b]) => {
    const ab1 = app.matchupIntelligence(a, b);
    const ab2 = app.matchupIntelligence(a, b);
    const ba = app.matchupIntelligence(b, a);
    assert.deepEqual(ab1, ab2, `${a}/${b} must be deterministic`);
    assert.deepEqual(fixtureSet(ab1), fixtureSet(ba), `${a}/${b} must identify the same fixtures in reverse order`);
  });
}));

test('matchup analysis does not mutate official state, wallet, settlement, or storage containers', () => withApp((app) => {
  const beforeState = JSON.stringify(app.getState());
  const beforeReal = JSON.stringify(app.REAL);
  ['USA', 'BRA', 'GER', 'TUR', 'POR', 'COL'].forEach((a, i, arr) => {
    arr.forEach((b) => { if (a !== b) app.matchupIntelligence(a, b); });
  });
  assert.equal(JSON.stringify(app.getState()), beforeState);
  assert.equal(JSON.stringify(app.REAL), beforeReal);
}));

test('every referenced future knockout fixture exists and confirmed means both exact participants are official', () => withApp((app) => {
  unorderedPairs(allTeams(app)).forEach(([a, b]) => {
    const result = app.matchupIntelligence(a, b);
    result.knockoutPossibilities.forEach((p) => {
      assert.ok(app.M[p.matchNum], `missing fixture #${p.matchNum}`);
      assert.equal(app.M[p.matchNum].stage, 'ko');
      assert.equal(!!app.getState().realko[p.matchNum], false, `fixture #${p.matchNum} must be future`);
      if (p.certainty === 'confirmed') {
        const ks = app.knockoutSlotStatus(p.matchNum, false);
        assert.equal(ks.state, 'confirmed', `confirmed matchup #${p.matchNum} must come from official slot status`);
        const got = [ks.home, ks.away].sort().join('|');
        const want = [a, b].sort().join('|');
        assert.equal(got, want);
      }
    });
  });
}));

test('live or provisional state never upgrades a matchup to confirmed', () => withApp((app) => {
  const state = app.getState();
  const liveMatch = app.MATCHES.find((m) => m.stage === 'group' && !app.tccOfficialFinal(m.num));
  state.rwState[liveMatch.num] = { kind: 'live', sh: 2, sa: 0, min: 60, label: 'Live', status: '2H' };
  state._rwlive = {};
  state._rwlive[liveMatch.num] = { sh: 2, sa: 0, min: 60, label: 'Live', status: '2H' };
  app.setState(state);
  unorderedPairs(allTeams(app)).forEach(([a, b]) => {
    app.matchupIntelligence(a, b).knockoutPossibilities.forEach((p) => {
      if (p.certainty === 'confirmed') {
        const ks = app.knockoutSlotStatus(p.matchNum, false);
        assert.equal(ks.state, 'confirmed');
      }
    });
  });
}));

test('same-group teams expose their direct group fixture, completed fixture stays historical, and future analysis still runs', () => withApp((app) => {
  const scheduled = app.matchupIntelligence('MEX', 'RSA');
  assert.equal(scheduled.groupStageMeeting.exists, true);
  assert.equal(scheduled.groupStageMeeting.state, 'completed');
  assert.equal(scheduled.groupStageMeeting.matchNum, 1);
  assert.equal(scheduled.evidence.futureKnockoutPossibilitiesEvaluated, true);

  const groupD = app.matchupIntelligence('USA', 'PAR');
  assert.equal(groupD.groupStageMeeting.exists, true);
  assert.equal(groupD.groupStageMeeting.state, 'completed');
  assert.equal(groupD.groupStageMeeting.matchNum, 4);
}));

test('officially eliminated teams expose no false future knockout path', () => withApp((app) => {
  const tur = app.tccTeamTournamentStatus('TUR');
  assert.equal(tur.eliminated, true);
  allTeams(app).filter((c) => c !== 'TUR').forEach((other) => {
    const result = app.matchupIntelligence('TUR', other);
    assert.equal(result.knockoutPossibilities.length, 0);
  });
}));

test('third-place routes use allocation-matrix-compatible combinations only', () => withApp((app) => {
  unorderedPairs(allTeams(app)).forEach(([a, b]) => {
    app.matchupIntelligence(a, b).knockoutPossibilities.forEach((p) => {
      const slots = [p.teamA.requiredEntrySlot, p.teamB.requiredEntrySlot].filter((s) => String(s.slot).startsWith('3:'));
      slots.forEach((slot) => {
        const ki = app.TP3C.indexOf(slot.matchNum);
        assert.ok(ki >= 0, `third-place slot #${slot.matchNum} must be in TP3C`);
        const groups = [];
        app.freValidThirdCombos().forEach((combo) => {
          const routed = app.TP3[combo].charAt(ki);
          if (!groups.includes(routed)) groups.push(routed);
        });
        assert.ok(groups.some((g) => slot.slot.includes(g)), `slot ${slot.slot} must be matrix-routable`);
      });
      if (p.evidence.thirdPlaceAllocation.checked) {
        assert.ok(p.evidence.thirdPlaceAllocation.compatibleCombinationCount > 0);
      }
    });
  });
}));

test('final-only flag is emitted only when the Final is the sole future knockout fixture', () => withApp((app) => {
  unorderedPairs(allTeams(app)).forEach(([a, b]) => {
    const result = app.matchupIntelligence(a, b);
    if (result.finalOnlyFutureKnockoutMeeting) {
      assert.ok(result.knockoutPossibilities.length > 0);
      assert.ok(result.knockoutPossibilities.every((p) => p.matchNum === 104));
    } else if (result.knockoutPossibilities.length === 1 && result.knockoutPossibilities[0].matchNum === 104) {
      assert.equal(result.finalOnlyFutureKnockoutMeeting, true);
    }
  });
}));

test('invalid input fails safely with a structured result', () => withApp((app) => {
  [
    app.matchupIntelligence('XXX', 'USA'),
    app.matchupIntelligence('USA', 'USA'),
    app.matchupIntelligence('12?', 'BRA'),
  ].forEach((result) => {
    assert.equal(result.version, 'matchup-intel-v1');
    assert.equal(result.ok, false);
    assert.equal(result.verdict, 'invalid');
    assert.ok(result.errors.length >= 1);
  });
}));

test('user-facing copy does not leak raw internal enum labels', () => withApp((app) => {
  const forbidden = /\b(officially_confirmed|pending_official_final|mathematically_locked|still_alive|as_it_stands|conditional_best_third|qualified_best_third|qualificationStatus|sourceSlot)\b/;
  unorderedPairs(allTeams(app)).forEach(([a, b]) => {
    const copy = userCopy(app.matchupIntelligence(a, b));
    assert.equal(forbidden.test(copy), false, `${a}/${b} leaked raw enum copy: ${copy.match(forbidden)}`);
  });
}));
