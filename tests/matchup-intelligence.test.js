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
      TP3C: TP3C,
      NEXTWIN: NEXTWIN,
      FEEDERS: FEEDERS
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

function matchupPairShard() {
  const index = Number(process.env.MATCHUP_PAIR_SHARD_INDEX || 1);
  const total = Number(process.env.MATCHUP_PAIR_SHARD_TOTAL || 1);
  assert.ok(Number.isInteger(index) && Number.isInteger(total) && total >= 1 && index >= 1 && index <= total, 'invalid matchup pair shard');
  return { index, total };
}

function planMatchupPairs(pairs, shard = matchupPairShard()) {
  return pairs.filter((_, i) => (i % shard.total) === (shard.index - 1));
}

function expectedShardSize(totalPairs, shard = matchupPairShard()) {
  let count = 0;
  for (let i = 0; i < totalPairs; i++) {
    if ((i % shard.total) === (shard.index - 1)) count += 1;
  }
  return count;
}

let pairCaseCache = null;
function allPairCases() {
  if (pairCaseCache) return pairCaseCache;
  const dom = loadApp();
  const app = dom.window.__matchupTest;
  const allPairs = unorderedPairs(allTeams(app));
  const shard = matchupPairShard();
  const pairs = planMatchupPairs(allPairs, shard);
  const beforeState = JSON.stringify(app.getState());
  const beforeReal = JSON.stringify(app.REAL);
  const cases = pairs.map(([a, b]) => ({
    a,
    b,
    ab: app.matchupIntelligence(a, b),
  }));
  const afterState = JSON.stringify(app.getState());
  const afterReal = JSON.stringify(app.REAL);
  pairCaseCache = {
    app: {
      M: app.M,
      REAL: app.REAL,
      GROUPS: app.GROUPS,
      TG: app.TG,
      TP3: app.TP3,
      TP3C: app.TP3C,
      NEXTWIN: app.NEXTWIN,
      FEEDERS: app.FEEDERS,
      getState: app.getState,
      knockoutSlotStatus: app.knockoutSlotStatus,
      freValidThirdCombos: app.freValidThirdCombos,
      matchupIntelligence: app.matchupIntelligence,
    },
    cases,
    beforeState,
    beforeReal,
    afterState,
    afterReal,
    shard,
    allPairCount: allPairs.length,
  };
  dom.window.close();
  return pairCaseCache;
}

function allRepeatPairCases() {
  const cached = allPairCases();
  cached.cases.forEach((c) => {
    if (!c.abRepeat) c.abRepeat = cached.app.matchupIntelligence(c.a, c.b);
    if (!c.ba) c.ba = cached.app.matchupIntelligence(c.b, c.a);
  });
  cached.afterState = JSON.stringify(cached.app.getState());
  cached.afterReal = JSON.stringify(cached.app.REAL);
  return cached;
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
  (result.scenarioRoutes || []).forEach((r) => {
    bits.push(r.headline, r.explanation, r.cannotMeetEarlierBecause);
    (r.dependencies || []).forEach((d) => bits.push(d));
    [r.teamA, r.teamB].forEach((team) => {
      bits.push(team.requiredFinish);
      (team.advancementPath || []).forEach((step) => bits.push(step.requirement));
    });
  });
  bits.push(result.noScenarioRouteReason);
  return bits.filter(Boolean).join('\n');
}

function routeTopology(route) {
  return {
    target: route.target.matchNum,
    round: route.target.round,
    stageOrder: route.target.stageOrder,
    entries: [route.teamA, route.teamB].map((team) => ({
      code: team.code,
      finish: team.requiredFinish,
      slot: team.requiredEntrySlot,
      path: team.advancementPath.map((step) => ({
        matchNum: step.matchNum,
        action: step.action,
        feedsMatchNum: step.feedsMatchNum,
      })),
    })).sort((a, b) => a.code.localeCompare(b.code)),
    third: route.thirdPlaceAllocation.compatibleCombinationCount,
  };
}

function assertPathFeedsTarget(app, route, team) {
  const path = team.advancementPath;
  if (!path.length) {
    assert.equal(team.requiredEntrySlot.matchNum, route.target.matchNum, `${route.id} empty path must start at target`);
    return;
  }
  path.forEach((step, i) => {
    assert.ok(app.M[step.matchNum], `${route.id} references missing path fixture #${step.matchNum}`);
    assert.equal(app.M[step.matchNum].stage, 'ko');
    const nextStep = path[i + 1];
    const expected = nextStep ? nextStep.matchNum : route.target.matchNum;
    assert.equal(step.feedsMatchNum, expected, `${route.id} path fixture #${step.matchNum} must feed #${expected}`);
    if (step.action === 'win' || step.action === 'already_advanced') {
      assert.equal(app.NEXTWIN[step.matchNum], step.feedsMatchNum, `${route.id} win path must use NEXTWIN`);
    } else if (step.action === 'lose' || step.action === 'not_advance_to_final') {
      assert.equal(route.target.matchNum, 103, `${route.id} non-advance step must feed the Third-place match`);
      assert.ok(app.FEEDERS[103].includes(step.matchNum), `${route.id} semifinal must feed Third-place match`);
    } else {
      assert.fail(`${route.id} has unknown path action ${step.action}`);
    }
  });
}

test('matchup engine covers every unordered pair without throwing', () => {
  const { cases, shard, allPairCount } = allPairCases();
  assert.equal(allPairCount, 1128);
  assert.equal(cases.length, expectedShardSize(allPairCount, shard));
  cases.forEach(({ a, b, ab: result }) => {
    assert.equal(result.version, 'matchup-intel-v1');
    assert.equal(result.ok, true);
    assert.equal(result.teams.teamA.code, a);
    assert.equal(result.teams.teamB.code, b);
    assert.ok(Array.isArray(result.knockoutPossibilities));
  });
});

test('matchup pair shards cover every unordered pair exactly once', () => withApp((app) => {
  const pairs = unorderedPairs(allTeams(app));
  assert.equal(pairs.length, 1128);
  const covered = [];
  for (let index = 1; index <= 8; index++) {
    planMatchupPairs(pairs, { index, total: 8 }).forEach(([a, b]) => covered.push(`${a}/${b}`));
  }
  assert.equal(new Set(covered).size, pairs.length);
  assert.deepEqual(covered.sort(), pairs.map(([a, b]) => `${a}/${b}`).sort());
}));

test('scenario route contract covers every unordered pair with route data or a clear no-route result', () => {
  const { cases } = allPairCases();
  cases.forEach(({ a, b, ab: result }) => {
    assert.ok(Array.isArray(result.scenarioRoutes), `${a}/${b} missing scenarioRoutes`);
    assert.equal(result.alternativeRouteCount, Math.max(0, result.scenarioRoutes.length - 1));
    if (result.knockoutPossibilities.length) {
      assert.ok(result.scenarioRoutes.length > 0, `${a}/${b} has possibilities but no scenario routes`);
      assert.equal(result.noScenarioRouteReason, null);
      const recommended = result.scenarioRoutes.filter((r) => r.recommendedPrimaryRoute);
      assert.equal(recommended.length, 1, `${a}/${b} should mark one primary route`);
      assert.equal(result.recommendedPrimaryRoute, recommended[0].id);
    } else {
      assert.equal(result.scenarioRoutes.length, 0);
      assert.ok(result.noScenarioRouteReason, `${a}/${b} needs a clear no-route reason`);
      assert.equal(result.recommendedPrimaryRoute, null);
    }
  });
});

test('scenario routes are compatible combined paths and every referenced fixture exists', () => {
  const { app, cases } = allPairCases();
  cases.forEach(({ a, b, ab: result }) => {
    result.scenarioRoutes.forEach((route) => {
      assert.ok(route.id, `${a}/${b} route needs a stable id`);
      assert.ok(app.M[route.target.matchNum], `${route.id} target fixture missing`);
      assert.equal(app.M[route.target.matchNum].stage, 'ko');
      assert.equal(route.target.fixtureId, `M${route.target.matchNum}`);
      assert.equal(typeof route.target.stageOrder, 'number', `${route.id} target needs machine-readable stageOrder`);
      assert.ok(['confirmed', 'scheduled', 'conditional', 'projected', 'pending'].includes(route.target.certainty));
      assert.equal(route.teamA.code, a);
      assert.equal(route.teamB.code, b);
      assert.ok(route.teamA.requiredFinish.includes(`Group ${app.TG[a]}`));
      assert.ok(route.teamB.requiredFinish.includes(`Group ${app.TG[b]}`));
      assertPathFeedsTarget(app, route, route.teamA);
      assertPathFeedsTarget(app, route, route.teamB);
      assert.ok(route.explanation);
      assert.ok(route.cannotMeetEarlierBecause);
      assert.ok(route.evidence);
    });
  });
});

test('scenario route sorting chooses the earliest least-complex official route first', () => {
  const { cases } = allPairCases();
  cases.forEach(({ a, b, ab }) => {
    const routes = ab.scenarioRoutes;
    routes.forEach((route, i) => {
      if (i === 0) return;
      const prev = routes[i - 1];
      const prevRound = prev.target.stageOrder;
      const round = route.target.stageOrder;
      assert.ok(prevRound <= round, `${a}/${b} route order regressed by canonical stageOrder`);
      if (prevRound === round) {
        assert.ok(prev.dependencies.length <= route.dependencies.length || prev.target.matchNum <= route.target.matchNum);
      }
    });
    if (routes.length) {
      const earliest = routes[0].target.stageOrder;
      routes.forEach((route) => assert.equal(route.isEarliestRoute, route.target.stageOrder === earliest));
    }
  });
});

test('recommended primary route always has the minimum canonical stageOrder', () => {
  const { cases } = allPairCases();
  cases.forEach(({ a, b, ab }) => {
    if (!ab.scenarioRoutes.length) return;
    const minStage = Math.min(...ab.scenarioRoutes.map((route) => route.target.stageOrder));
    const primary = ab.scenarioRoutes.find((route) => route.id === ab.recommendedPrimaryRoute);
    assert.ok(primary, `${a}/${b} missing recommended primary route object`);
    assert.equal(primary.target.stageOrder, minStage, `${a}/${b} primary route must be the earliest canonical stage`);
    assert.equal(ab.earliestPossibleRound, primary.target.round, `${a}/${b} earliestPossibleRound must match primary stage`);
  });
});

test('third-place routes never outrank earlier quarter-final or semi-final routes', () => {
  const { cases } = allPairCases();
  cases.forEach(({ a, b, ab }) => {
    const hasThird = ab.scenarioRoutes.some((route) => route.target.round === 'Third-place match');
    const hasEarlier = ab.scenarioRoutes.some((route) => route.target.stageOrder < 5);
    if (!hasThird || !hasEarlier) return;
    const primary = ab.scenarioRoutes.find((route) => route.id === ab.recommendedPrimaryRoute);
    assert.notEqual(primary.target.round, 'Third-place match', `${a}/${b} Third-place route outranked an earlier route`);
  });
});

test('Portugal Argentina regression keeps Quarter-final ahead of Third-place when both exist', () => withApp((app) => {
  const result = app.matchupIntelligence('POR', 'ARG');
  assert.ok(result.scenarioRoutes.some((route) => route.target.round === 'Quarter-final'), 'expected a Quarter-final route');
  assert.ok(result.scenarioRoutes.some((route) => route.target.round === 'Third-place match'), 'expected a Third-place route');
  const primary = result.scenarioRoutes.find((route) => route.id === result.recommendedPrimaryRoute);
  assert.notEqual(primary.target.round, 'Third-place match');
  assert.ok(primary.target.stageOrder < 5);
  assert.equal(result.earliestPossibleRound, primary.target.round);
}));

test('route ordering uses canonical stageOrder rather than fixture number or display text', () => {
  const { cases } = allPairCases();
  cases.forEach(({ a, b, ab }) => {
    const routes = ab.scenarioRoutes;
    for (let i = 1; i < routes.length; i++) {
      assert.ok(routes[i - 1].target.stageOrder <= routes[i].target.stageOrder, `${a}/${b} route order must follow stageOrder`);
    }
    routes.forEach((route) => {
      if (route.target.round === 'Quarter-final') assert.equal(route.target.stageOrder, 3);
      if (route.target.round === 'Semi-final') assert.equal(route.target.stageOrder, 4);
      if (route.target.round === 'Third-place match') assert.equal(route.target.stageOrder, 5);
      if (route.target.round === 'Final') assert.equal(route.target.stageOrder, 6);
    });
  });
});

test('third-place advancement path carries an explicit semifinal-loss requirement', () => {
  const { cases } = allPairCases();
  let checked = 0;
  cases.forEach(({ ab }) => {
    ab.scenarioRoutes.filter((route) => route.target.round === 'Third-place match').forEach((route) => {
      [route.teamA, route.teamB].forEach((team) => {
        const lossStep = team.advancementPath.find((step) => step.feedsMatchNum === 103);
        assert.ok(lossStep, `${route.id} needs a Third-place feeder step`);
        assert.equal(lossStep.round, 'Semi-final');
        assert.equal(lossStep.outcome, 'loss');
        assert.equal(lossStep.action, 'lose');
        assert.match(lossStep.displayLabel, /^Lose the Semi-final$/);
        assert.match(lossStep.requirement, /must lose Match #/);
      });
      checked += 1;
    });
  });
  assert.ok(checked > 0, 'expected at least one Third-place scenario route');
});

test('same-group pairs preserve group fixture and still expose future scenario routes when possible', () => withApp((app) => {
  let sameGroupFutureRoutes = 0;
  Object.keys(app.GROUPS).forEach((group) => {
    unorderedPairs(app.GROUPS[group]).forEach(([a, b]) => {
      const result = app.matchupIntelligence(a, b);
      assert.equal(result.groupStageMeeting.exists, true, `${a}/${b} should preserve group-stage meeting`);
      assert.equal(result.groupStageMeeting.group, group);
      assert.equal(result.evidence.futureKnockoutPossibilitiesEvaluated, true);
      if (result.knockoutPossibilities.length) {
        assert.ok(result.scenarioRoutes.length > 0, `${a}/${b} should derive routes from future possibilities`);
        sameGroupFutureRoutes += 1;
      }
    });
  });
  assert.ok(sameGroupFutureRoutes > 0, 'expected at least one same-group pair with future knockout scenarios');
}));

test('scenario third-place routes only use shared allocation-matrix-valid combinations', () => {
  const { app, cases } = allPairCases();
  cases.forEach(({ ab }) => {
    ab.scenarioRoutes.forEach((route) => {
      const thirdTeams = [route.teamA, route.teamB].filter((team) => String(team.requiredEntrySlot.slot).startsWith('3:'));
      if (!thirdTeams.length) {
        assert.equal(route.thirdPlaceAllocation.checked, false);
        return;
      }
      assert.equal(route.thirdPlaceAllocation.checked, true);
      assert.ok(route.thirdPlaceAllocation.compatibleCombinationCount > 0, `${route.id} needs at least one shared allocation combo`);
      assert.equal(route.thirdPlaceAllocation.compatibleCombinations.length, route.thirdPlaceAllocation.compatibleCombinationCount);
      route.thirdPlaceAllocation.compatibleCombinations.forEach((combo) => {
        thirdTeams.forEach((team) => {
          const ki = app.TP3C.indexOf(team.requiredEntrySlot.matchNum);
          assert.ok(ki >= 0, `${route.id} third-place fixture must be in TP3C`);
          assert.equal(app.TP3[combo].charAt(ki), app.TG[team.code], `${route.id} combo ${combo} must route ${team.code}`);
        });
      });
    });
  });
});

test('scenario routes never mark confirmed unless both exact teams are officially assigned', () => {
  const { app, cases } = allPairCases();
  cases.forEach(({ a, b, ab }) => {
    ab.scenarioRoutes.forEach((route) => {
      if (route.target.certainty !== 'confirmed') return;
      const ks = app.knockoutSlotStatus(route.target.matchNum, false);
      assert.equal(ks.state, 'confirmed', `${route.id} confirmed route must have confirmed fixture slots`);
      assert.equal([ks.home, ks.away].sort().join('|'), [a, b].sort().join('|'));
    });
  });
});

test('reversing teams preserves scenario route topology', () => {
  const { cases } = allRepeatPairCases();
  cases.forEach(({ a, b, ab, ba }) => {
    const abTop = ab.scenarioRoutes.map(routeTopology)
      .sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
    const baTop = ba.scenarioRoutes.map(routeTopology)
      .sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
    assert.deepEqual(abTop, baTop, `${a}/${b} route topology changed when reversed`);
  });
});

test('scenario output is deterministic and does not mutate tournament state', () => {
  const { cases, beforeState, beforeReal, afterState, afterReal } = allRepeatPairCases();
  cases.forEach(({ a, b, ab, abRepeat }) => {
    assert.deepEqual(ab.scenarioRoutes, abRepeat.scenarioRoutes, `${a}/${b} scenario routes must be deterministic`);
  });
  assert.equal(afterState, beforeState);
  assert.equal(afterReal, beforeReal);
});

test('matchup engine is symmetric and deterministic', () => {
  const { cases } = allRepeatPairCases();
  cases.forEach(({ a, b, ab, abRepeat, ba }) => {
    assert.deepEqual(ab, abRepeat, `${a}/${b} must be deterministic`);
    assert.deepEqual(fixtureSet(ab), fixtureSet(ba), `${a}/${b} must identify the same fixtures in reverse order`);
  });
});

test('matchup analysis does not mutate official state, wallet, settlement, or storage containers', () => withApp((app) => {
  const beforeState = JSON.stringify(app.getState());
  const beforeReal = JSON.stringify(app.REAL);
  ['USA', 'BRA', 'GER', 'TUR', 'POR', 'COL'].forEach((a, i, arr) => {
    arr.forEach((b) => { if (a !== b) app.matchupIntelligence(a, b); });
  });
  assert.equal(JSON.stringify(app.getState()), beforeState);
  assert.equal(JSON.stringify(app.REAL), beforeReal);
}));

test('every referenced future knockout fixture exists and confirmed means both exact participants are official', () => {
  const { app, cases } = allPairCases();
  cases.forEach(({ a, b, ab: result }) => {
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
});

test('live or provisional state never upgrades a matchup to confirmed', () => withApp((app) => {
  const state = app.getState();
  const liveMatch = app.MATCHES.find((m) => m.stage === 'group' && !app.tccOfficialFinal(m.num));
  state.rwState[liveMatch.num] = { kind: 'live', sh: 2, sa: 0, min: 60, label: 'Live', status: '2H' };
  state._rwlive = {};
  state._rwlive[liveMatch.num] = { sh: 2, sa: 0, min: 60, label: 'Live', status: '2H' };
  app.setState(state);
  planMatchupPairs(unorderedPairs(allTeams(app))).forEach(([a, b]) => {
    const result = app.matchupIntelligence(a, b);
    result.knockoutPossibilities.forEach((p) => {
      if (p.certainty === 'confirmed') {
        const ks = app.knockoutSlotStatus(p.matchNum, false);
        assert.equal(ks.state, 'confirmed');
      }
    });
    result.scenarioRoutes.forEach((route) => {
      if (route.target.certainty === 'confirmed') {
        const ks = app.knockoutSlotStatus(route.target.matchNum, false);
        assert.equal(ks.state, 'confirmed');
      }
    });
  });
}));

test('official result changes produce a fresh source-state identity on next analysis', () => withApp((app) => {
  const before = app.matchupIntelligence('POR', 'ARG');
  const openGroupMatch = app.MATCHES.find((m) => m.stage === 'group' && !app.tccOfficialFinal(m.num));
  assert.ok(openGroupMatch, 'expected an unfinished group match for freshness test');
  app.REAL[openGroupMatch.num] = [1, 0];
  const state = app.getState();
  state.sc[openGroupMatch.num] = { h: 1, a: 0 };
  state.real[openGroupMatch.num] = 1;
  app.setState(state);
  const after = app.matchupIntelligence('POR', 'ARG');
  assert.notEqual(after.sourceState.officialStateFingerprint, before.sourceState.officialStateFingerprint);
  assert.ok(after.sourceState.officialUpdateState.officialResultFixtures.includes(openGroupMatch.num));
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

test('third-place routes use allocation-matrix-compatible combinations only', () => {
  const { app, cases } = allPairCases();
  cases.forEach(({ ab }) => {
    ab.knockoutPossibilities.forEach((p) => {
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
});

test('final-only flag is emitted only when the Final is the sole future knockout fixture', () => {
  const { cases } = allPairCases();
  cases.forEach(({ ab: result }) => {
    if (result.finalOnlyFutureKnockoutMeeting) {
      assert.ok(result.knockoutPossibilities.length > 0);
      assert.ok(result.knockoutPossibilities.every((p) => p.matchNum === 104));
    } else if (result.knockoutPossibilities.length === 1 && result.knockoutPossibilities[0].matchNum === 104) {
      assert.equal(result.finalOnlyFutureKnockoutMeeting, true);
    }
  });
});

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

test('user-facing copy does not leak raw internal enum labels', () => {
  const forbidden = /\b(officially_confirmed|pending_official_final|mathematically_locked|still_alive|as_it_stands|conditional_best_third|qualified_best_third|qualificationStatus|sourceSlot)\b/;
  const { cases } = allPairCases();
  cases.forEach(({ a, b, ab }) => {
    const copy = userCopy(ab);
    assert.equal(forbidden.test(copy), false, `${a}/${b} leaked raw enum copy: ${copy.match(forbidden)}`);
  });
});
