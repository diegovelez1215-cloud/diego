// Arcade Cup + Coach's Call — the Play run layer. These tests pin its truth
// model: runs are deterministic and local-only, stops settle strictly in road
// order from games that actually finished, trophies are derived game prizes,
// and none of it can read from or write to official tournament truth.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOverlay } from '../src/core/provider-overlay.js';
import { getState, setOverlay, setPlay } from '../src/core/app-state.js';
import {
  CC_SITUATIONS,
  CC_STEPS,
  CC_STYLE_BEATS,
  CUP_STOPS,
  ccRecordAfter,
  coachCallDecide,
  coachPlanFit,
  createArcadeCup,
  createCoachCall,
  cupNextStop,
  cupRecordStop,
  cupResultFromRush,
  cupRivals,
  cupRunStory,
  cupSeasonSummary,
  cupTrophy,
  cupWins,
  dailyCoachSeed,
  dailyCupSeed,
  labChanceFlavor,
  labResultTags,
  labRivalryCount,
  labSaveLine,
  LAB_CHANCE_FLAVORS,
  simulateLabForSeed,
  styleMatchup,
  teamSimStyle,
  teamSimDNA,
  withCupProgress,
} from '../src/views/play.js';
import { TEAMS } from '../src/data/fixtures.js';
import { fullResultsPayload } from './mock-provider.mjs';

/* ---------------- seeds and rivals ---------------- */

test('cup seeds are stable per date+side and distinct per attempt, side, and date', () => {
  assert.equal(dailyCupSeed('2026-07-09', 'USA', 0), dailyCupSeed('2026-07-09', 'USA', 0));
  assert.notEqual(dailyCupSeed('2026-07-09', 'USA', 0), dailyCupSeed('2026-07-09', 'USA', 1));
  assert.notEqual(dailyCupSeed('2026-07-09', 'USA', 0), dailyCupSeed('2026-07-09', 'BRA', 0));
  assert.notEqual(dailyCupSeed('2026-07-09', 'USA', 0), dailyCupSeed('2026-07-10', 'USA', 0));
});

test('cup rivals are four distinct real teams that never include your own side', () => {
  for (const side of ['USA', 'BRA', 'FRA', 'JPN']) {
    const rivals = cupRivals(dailyCupSeed('2026-07-09', side, 0), side);
    assert.equal(rivals.length, 4);
    assert.equal(new Set(rivals).size, 4, 'rivals are distinct');
    assert.ok(!rivals.includes(side), 'your side never plays itself');
    for (const r of rivals) assert.ok(TEAMS[r], `${r} is a real registered team`);
  }
});

test('createArcadeCup is deterministic and refuses unknown sides', () => {
  const a = createArcadeCup('USA', '2026-07-09', 0);
  const b = createArcadeCup('USA', '2026-07-09', 0);
  assert.deepEqual(a.rivals, b.rivals);
  assert.equal(a.seed, b.seed);
  assert.deepEqual(a.stops, { call: null, rush: null, clutch: null, showdown: null });
  assert.equal(a.done, false);
  assert.equal(createArcadeCup('NOT-A-TEAM'), null);
  assert.equal(createArcadeCup(null), null);
});

/* ---------------- road order and trophies ---------------- */

test('stops resolve strictly in road order; out-of-order and invalid results are refused', () => {
  let cup = createArcadeCup('USA', '2026-07-09', 0);
  assert.equal(cupNextStop(cup), 'call');
  assert.equal(cupRecordStop(cup, 'rush', 'W'), cup, 'skipping ahead changes nothing');
  assert.equal(cupRecordStop(cup, 'call', 'X'), cup, 'invalid results change nothing');
  const after = cupRecordStop(cup, 'call', 'W');
  assert.notEqual(after, cup, 'a legal stop returns a new cup');
  assert.equal(cup.stops.call, null, 'the original cup is never mutated');
  assert.equal(after.stops.call, 'W');
  assert.equal(cupNextStop(after), 'rush');
});

test('a full run finishes with a trophy tier derived only from stop wins', () => {
  const play = (results) => {
    let cup = createArcadeCup('USA', '2026-07-09', 0);
    for (let i = 0; i < CUP_STOPS.length; i++) cup = cupRecordStop(cup, CUP_STOPS[i].id, results[i]);
    return cup;
  };
  const gold = play(['W', 'W', 'W', 'W']);
  assert.equal(gold.done, true);
  assert.equal(gold.trophy.tier, 'gold');
  assert.equal(cupWins(gold), 4);
  assert.equal(play(['W', 'W', 'W', 'L']).trophy.tier, 'silver');
  assert.equal(play(['W', 'L', 'W', 'D']).trophy.tier, 'bronze');
  assert.equal(play(['L', 'D', 'L', 'W']).trophy.tier, 'finisher');
  const done = play(['W', 'W', 'W', 'W']);
  assert.equal(cupRecordStop(done, 'call', 'W'), done, 'a finished run takes no more results');
  assert.equal(cupNextStop(done), null);
});

test('finished roads create an honest local season summary and memory line', () => {
  const run = (side, results, at) => {
    let cup = createArcadeCup(side, '2026-07-09', 0);
    for (let i = 0; i < CUP_STOPS.length; i++) cup = cupRecordStop(cup, CUP_STOPS[i].id, results[i]);
    return { ...cup, at, wins: cupWins(cup) };
  };
  const gold = run('USA', ['W', 'W', 'W', 'W'], '2026-07-09T12:00:00Z');
  const heartbreak = run('USA', ['W', 'W', 'W', 'L'], '2026-07-08T12:00:00Z');
  const other = run('BRA', ['L', 'W', 'D', 'W'], '2026-07-07T12:00:00Z');
  const all = cupSeasonSummary([gold, heartbreak, other]);
  assert.deepEqual(all.form, [4, 3, 2]);
  assert.equal(all.runs, 3);
  assert.equal(all.perfect, 1);
  assert.equal(all.bestWins, 4);
  assert.deepEqual([all.stopWins, all.stopLosses, all.stopDraws], [9, 2, 1]);
  const usa = cupSeasonSummary([gold, heartbreak, other], 'USA');
  assert.deepEqual([usa.runs, usa.stopWins, usa.stopLosses, usa.stopDraws], [2, 7, 1, 0]);
  assert.equal(cupRunStory(gold), 'Perfect road — four stops, four wins.');
  assert.equal(cupRunStory(heartbreak), 'Gold slipped away at the final stop.');
  assert.equal(cupRunStory(createArcadeCup('USA')), 'Road still in progress.');
});

test('the Penalty Rush stop verdict maps goals honestly', () => {
  assert.equal(cupResultFromRush(5), 'W');
  assert.equal(cupResultFromRush(4), 'W');
  assert.equal(cupResultFromRush(3), 'D');
  assert.equal(cupResultFromRush(2), 'L');
  assert.equal(cupResultFromRush(0), 'L');
});

/* ---------------- withCupProgress: the only door into the run ---------------- */

function playWithCup(overrides = {}) {
  const cup = createArcadeCup('USA', '2026-07-09', 0);
  return { side: { code: 'USA', since: '2026-07-09T00:00:00Z' }, arcadeCup: cup, ...overrides };
}

test('withCupProgress advances only the current stop for the side that started the run', () => {
  const play = playWithCup();
  const wrongStop = withCupProgress(play, 'rush', 'W');
  assert.equal(wrongStop.advanced, false);
  assert.equal(wrongStop.play, play, 'wrong stop passes through untouched');
  const noCup = withCupProgress({ side: { code: 'USA' } }, 'call', 'W');
  assert.equal(noCup.advanced, false);
  const wrongSide = withCupProgress({ ...play, side: { code: 'BRA' } }, 'call', 'W');
  assert.equal(wrongSide.advanced, false, 'switching sides freezes the old run');
  const ok = withCupProgress(play, 'call', 'W');
  assert.equal(ok.advanced, true);
  assert.equal(ok.done, false);
  assert.equal(ok.play.arcadeCup.stops.call, 'W');
  assert.equal(play.arcadeCup.stops.call, null, 'pure: the input play object is untouched');
});

test('completing the last stop archives the run into cupHistory with its trophy', () => {
  let play = playWithCup();
  for (const stop of ['call', 'rush', 'clutch']) {
    play = withCupProgress(play, stop, 'W').play;
  }
  const finale = withCupProgress(play, 'showdown', 'W');
  assert.equal(finale.advanced, true);
  assert.equal(finale.done, true);
  assert.equal(finale.trophy.tier, 'gold');
  assert.equal(finale.play.arcadeCup.done, true);
  assert.equal(finale.play.cupHistory.length, 1);
  const archived = finale.play.cupHistory[0];
  assert.equal(archived.side, 'USA');
  assert.equal(archived.wins, 4);
  assert.equal(archived.trophy.tier, 'gold');
  assert.equal(archived.rivals.length, 4);
  assert.equal(archived.attempt, 0);
  assert.deepEqual(archived.stops, { call: 'W', rush: 'W', clutch: 'W', showdown: 'W' });
  // a finished run takes no more results through the door either
  assert.equal(withCupProgress(finale.play, 'call', 'W').advanced, false);
});

test('cup progress never touches official truth', () => {
  const overlay = buildOverlay({ results: fullResultsPayload() });
  setOverlay(overlay);
  const version = getState().real.overlay.version;
  const size = getState().real.overlay.byFixture.size;
  let play = playWithCup();
  for (const stop of ['call', 'rush', 'clutch', 'showdown']) {
    play = withCupProgress(play, stop, 'W').play;
  }
  assert.equal(getState().real.overlay.version, version, 'overlay version untouched');
  assert.equal(getState().real.overlay.byFixture.size, size, 'no fixtures added');
});

/* ---------------- Coach's Call ---------------- */

const SAFE = ['control', 'lock'];
const BOLD = ['press', 'chaos'];

function playCc(seed, choices, teams = ['USA', 'BRA']) {
  const run = createCoachCall(seed, teams[0], teams[1]);
  for (const c of choices) coachCallDecide(run, c);
  return run;
}

test("Coach's Call is deterministic: same seed and calls replay identically", () => {
  const a = playCc(17, SAFE);
  const b = playCc(17, SAFE);
  assert.deepEqual(a.events, b.events);
  assert.equal(a.result, b.result);
  assert.equal(a.gYou, b.gYou);
});

test("Coach's Call resolves in exactly two calls with an honest verdict", () => {
  for (let seed = 1; seed <= 80; seed++) {
    const run = playCc(seed, BOLD);
    assert.equal(run.over, true, `seed ${seed}: two calls end the night`);
    assert.equal(run.step, CC_STEPS.length);
    assert.ok(['W', 'L', 'D'].includes(run.result));
    const expected = run.gYou > run.gThem ? 'W' : run.gYou < run.gThem ? 'L' : 'D';
    assert.equal(run.result, expected, `seed ${seed}: verdict matches the scoreline`);
    const situation = CC_SITUATIONS[run.seed % CC_SITUATIONS.length];
    const goalsYou = run.events.filter((e) => e.type === 'goal' && e.side === 'you').length;
    const goalsThem = run.events.filter((e) => e.type === 'goal' && e.side === 'them').length;
    assert.equal(run.gYou, situation.gYou + goalsYou, 'your goals equal situation start plus scored events');
    assert.equal(run.gThem, situation.gThem + goalsThem, 'their goals equal situation start plus scored events');
    assert.equal(coachCallDecide(run, 'lock'), null, 'no calls after full time');
  }
});

test("Coach's Call choices genuinely matter: safe and bold diverge across seeds", () => {
  let diverged = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const safe = playCc(seed, SAFE);
    const bold = playCc(seed, BOLD);
    if (safe.result !== bold.result || safe.gYou + safe.gThem !== bold.gYou + bold.gThem) diverged++;
  }
  assert.ok(diverged >= 30, `tactics changed the night in ${diverged}/120 seeds`);
});

test("invalid Coach's Call options are refused without burning the step", () => {
  const run = createCoachCall(5, 'USA', 'BRA');
  assert.equal(coachCallDecide(run, 'nonsense'), null);
  assert.equal(run.step, 0);
  assert.ok(coachCallDecide(run, 'counter'));
  assert.equal(run.step, 1);
});

test('sim style matchups form a closed cycle — every style reads exactly one and is read by one', () => {
  const styles = Object.keys(CC_STYLE_BEATS);
  assert.equal(styles.length, 8);
  const beaten = Object.values(CC_STYLE_BEATS);
  assert.equal(new Set(beaten).size, 8, 'every style is read by exactly one other');
  for (const s of styles) assert.ok(styles.includes(CC_STYLE_BEATS[s]), 'the cycle stays inside the style set');
  // edges are symmetric and bounded
  const a = styleMatchup('high press', 'possession weave');
  const b = styleMatchup('possession weave', 'high press');
  assert.equal(a.edge, 0.06);
  assert.equal(b.edge, -0.06);
  assert.equal(styleMatchup('high press', 'direct running').edge, 0);
  // the matchup used in a run comes from the deterministic team styles
  const run = createCoachCall(9, 'USA', 'BRA');
  assert.deepEqual(run.matchup, styleMatchup(teamSimStyle('USA'), teamSimStyle('BRA')));
});

test("Coach's Call rewards plans that fit the side's deterministic Play identity", () => {
  const style = teamSimStyle('USA');
  const fits = ['press', 'counter', 'control', 'chaos', 'setpiece', 'lock']
    .map((id) => coachPlanFit('USA', id));
  assert.ok(fits.some((plan) => plan.fit));
  assert.ok(fits.some((plan) => !plan.fit));
  assert.ok(fits.filter((plan) => plan.fit).every((plan) => plan.style === style && plan.edge > 0));
  assert.ok(fits.filter((plan) => !plan.fit).every((plan) => plan.edge < 0));
  const dna = teamSimDNA('USA');
  assert.deepEqual(dna, teamSimDNA('USA'));
  for (const value of Object.values(dna)) assert.ok(value >= 52 && value <= 96);
});

test("the Coach's Call record keeps only derived play facts and resets day attempts honestly", () => {
  const d1 = ccRecordAfter(null, { dateKey: '2026-07-09', result: 'W' });
  assert.deepEqual(d1, { dateKey: '2026-07-09', attemptsToday: 1, w: 1, l: 0, d: 0, played: 1, lastResult: 'W' });
  const d2 = ccRecordAfter(d1, { dateKey: '2026-07-09', result: 'L' });
  assert.equal(d2.attemptsToday, 2);
  const d3 = ccRecordAfter(d2, { dateKey: '2026-07-10', result: 'D' });
  assert.equal(d3.attemptsToday, 1, 'a new day restarts attempts');
  assert.deepEqual([d3.w, d3.l, d3.d, d3.played], [1, 1, 1, 3]);
  assert.equal(dailyCoachSeed('2026-07-09', 0), dailyCoachSeed('2026-07-09', 0));
  assert.notEqual(dailyCoachSeed('2026-07-09', 0), dailyCoachSeed('2026-07-09', 1));
});

/* ---------------- Match Lab flavour and honours ---------------- */

test('chance flavour is deterministic, valid, and never consumes the match rng', () => {
  const a = labChanceFlavor(260626, 34, 'h', 'BRA', 3);
  const b = labChanceFlavor(260626, 34, 'h', 'BRA', 3);
  assert.deepEqual(a, b);
  assert.ok(LAB_CHANCE_FLAVORS.includes(a), 'flavour comes from the fixed football vocabulary');
  assert.equal(labSaveLine(260626, 41, 'a'), labSaveLine(260626, 41, 'a'));
  // the rng-stream canary: flavour must not shift the deterministic engine.
  // seed 2 is pinned by play-arcade tests as a shootout night — it must stay one.
  setPlay({});
  const r = simulateLabForSeed('USA', 'ARG', { seed: 2, approach: 'balanced' });
  assert.ok(r.pens, 'pinned seed 2 still reaches penalties — the rng stream is untouched');
});

test('a simulated night tells the flavoured story: shaped shots, keeper save types, tired legs at 76', () => {
  setPlay({});
  const r = simulateLabForSeed('USA', 'ARG', { seed: 260626, approach: 'press' });
  const shots = r.events.filter((e) => e.type === 'shot');
  assert.ok(shots.length >= 1, 'the night has shots');
  const vocab = LAB_CHANCE_FLAVORS.map((f) => f.shot);
  assert.ok(shots.every((e) => vocab.some((v) => e.text.includes(v))), 'every shot carries a chance-quality shape');
  const note = r.events.find((e) => e.type === 'note');
  assert.ok(note, 'the broadcast names the fatigue window once');
  assert.equal(note.min, 76);
  assert.ok(/legs are heavy/i.test(note.text));
  const again = simulateLabForSeed('USA', 'ARG', { seed: 260626, approach: 'press' });
  assert.deepEqual(r.events.map((e) => e.text), again.events.map((e) => e.text), 'flavoured text replays identically');
});

test('result tags are derived facts from committed events only', () => {
  const goal = (side, min, extra = {}) => ({ type: 'goal', side, min, ...extra });
  const base = { home: 'USA', away: 'ARG', pens: null };
  // clutch: the winner strikes at 85+ in a one-goal game
  const clutch = labResultTags({ ...base, gh: 2, ga: 1, events: [goal('h', 12), goal('a', 40), goal('h', 88)] });
  assert.ok(clutch.includes('clutch'));
  assert.ok(clutch.includes('comeback') === false, 'never trailed, no comeback');
  // comeback: the winner overturned a deficit
  const comeback = labResultTags({ ...base, gh: 2, ga: 1, events: [goal('a', 10), goal('h', 30), goal('h', 60)] });
  assert.ok(comeback.includes('comeback'));
  // shutout: the winner conceded nothing
  const shutout = labResultTags({ ...base, gh: 1, ga: 0, events: [goal('h', 50)] });
  assert.ok(shutout.includes('shutout'));
  // shootout nights carry nerve for the winner and heartbreak for the loser
  const pens = labResultTags({ ...base, gh: 1, ga: 1, pens: { ph: 4, pa: 3 }, events: [goal('h', 20), goal('a', 70)] });
  assert.ok(pens.includes('nerve'));
  assert.ok(pens.includes('heartbreak'));
  // a goal rush is a goal rush
  const fest = labResultTags({ ...base, gh: 3, ga: 2, events: [goal('h', 5), goal('a', 20), goal('h', 40), goal('a', 60), goal('h', 70)] });
  assert.ok(fest.includes('goalfest'));
  // goals under review commit nothing
  const review = labResultTags({ ...base, gh: 1, ga: 0, events: [goal('a', 10, { underReview: true }), goal('h', 50)] });
  assert.ok(!review.includes('comeback'), 'a goal under review never counts toward the story');
  // a drawn night (no winner) carries no honours
  assert.deepEqual(labResultTags({ ...base, gh: 0, ga: 0, events: [] }), []);
});

test('rivalry chapters count only this exact pairing, in either orientation', () => {
  const hist = [
    { home: 'USA', away: 'ARG' }, { home: 'ARG', away: 'USA' },
    { home: 'USA', away: 'BRA' }, { home: 'FRA', away: 'ARG' },
  ];
  assert.equal(labRivalryCount(hist, 'USA', 'ARG'), 2);
  assert.equal(labRivalryCount(hist, 'BRA', 'USA'), 1);
  assert.equal(labRivalryCount(hist, 'GER', 'JPN'), 0);
  assert.equal(labRivalryCount(null, 'USA', 'ARG'), 0);
});

/* ---------------- persistence safety ---------------- */

test('cup, trophies, and dugout records persist in the Play namespace and survive sanitize', async () => {
  const map = new Map();
  globalThis.window = {
    localStorage: {
      get length() { return map.size; },
      key: (i) => [...map.keys()][i] ?? null,
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
    },
  };
  const { savePlay, loadPlay } = await import('../src/core/persistence.js');
  const cup = createArcadeCup('USA', '2026-07-09', 0);
  savePlay({
    side: { code: 'USA', since: '2026-07-09T00:00:00Z' },
    arcadeCup: cup,
    cupHistory: [{ side: 'USA', wins: 4, trophy: { tier: 'gold', icon: '🏆', label: 'Gold Cup — perfect run' }, stops: { call: 'W', rush: 'W', clutch: 'W', showdown: 'W' } }],
    coachCall: { dateKey: '2026-07-09', attemptsToday: 1, w: 1, l: 0, d: 0, played: 1, lastResult: 'W' },
    ccHistory: [{ result: 'W', situation: 'response', you: 'USA', opp: 'BRA', gYou: 2, gThem: 1 }],
    overlay: { smuggled: true },
    standings: { smuggled: true },
    results: { smuggled: true },
  });
  const loaded = loadPlay();
  assert.equal(loaded.arcadeCup.side, 'USA');
  assert.deepEqual(loaded.arcadeCup.rivals, cup.rivals);
  assert.equal(loaded.cupHistory[0].trophy.tier, 'gold');
  assert.equal(loaded.coachCall.w, 1);
  assert.equal(loaded.ccHistory.length, 1);
  assert.ok(!('overlay' in loaded), 'official overlay can never ride along');
  assert.ok(!('standings' in loaded), 'standings can never ride along');
  assert.ok(!('results' in loaded), 'results can never ride along');
  // only the whitelisted Play key was written
  assert.deepEqual([...map.keys()], ['u26v2.play']);
  delete globalThis.window;
});
