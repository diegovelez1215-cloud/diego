/* Phase 20 — Virtual Matchcast Director Rebuild.
   Focused proofs for the deterministic Director Plan that drives the SIM$ Matchcast
   presentation. These exercise ONLY the presentation layer (window.__ts2): pacing,
   determinism, no-dead-time, captured-order safety, SIM VAR / confetti / mount safety.
   They never touch the outcome engine, odds, wallet, ticket rules, Cash Out, or
   settlement, beyond asserting that the presentation cannot change them. */
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
  window.HTMLCanvasElement.prototype.getContext = () => ({ clearRect(){}, fillRect(){}, save(){}, restore(){}, translate(){}, rotate(){}, fillText(){}, beginPath(){}, arc(){}, fill(){}, moveTo(){}, lineTo(){}, stroke(){}, closePath(){}, createLinearGradient(){return{addColorStop(){}}}, createRadialGradient(){return{addColorStop(){}}}, getImageData(){return{data:new Uint8ClampedArray(24*24*4)}} });
  window.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
  window.requestAnimationFrame = (fn) => window.setTimeout(fn, 16);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  window.MutationObserver = class MutationObserver { observe() {} disconnect() {} };
  window.AudioContext = function AudioContext() {};
  window.webkitAudioContext = window.AudioContext;
  window.eval(`${script}
    window.__p20 = {
      getState:function(){return S;}, setState:function(v){S=v;}, blankState:blankState, GROUPS:GROUPS, REAL:REAL
    };`);
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  const errors = [];
  dom.window.addEventListener('error', (e) => errors.push(e.message));
  try { return fn(dom.window.__p20, dom.window.__ts2, dom.window, errors); }
  finally { dom.window.close(); }
}

/* A dense regulation match: an early goal, half-time, a card, then a late goal. */
function regulationLeg() {
  return { num: 1, pick: 'h', simple: true, label: 'Brazil win', finalState: 'win',
    result: { teams: { h: 'BRA', a: 'CRO' }, seed: 4217, replayKey: 'reg-v20', score: { h: 2, a: 0 }, minute: 90, period: 'final',
      events: [
        { minute: 12, type: 'goal', side: 'h', score: { h: 1, a: 0 }, headline: 'Goal' },
        { minute: 45, type: 'halftime', score: { h: 1, a: 0 }, headline: 'Half-time' },
        { minute: 63, type: 'red_card', side: 'a', score: { h: 1, a: 0 }, headline: 'Red card' },
        { minute: 88, type: 'goal', side: 'h', score: { h: 2, a: 0 }, headline: 'Goal' } ] } };
}
/* Worst case for the old minute-as-wall-clock bug: the ONLY goal is very late. */
function lateGoalLeg() {
  return { num: 5, pick: 'h', simple: true, label: 'Late winner', finalState: 'win',
    result: { teams: { h: 'BRA', a: 'CRO' }, seed: 777, replayKey: 'late-v20', score: { h: 1, a: 0 }, minute: 90, period: 'final',
      events: [ { minute: 84, type: 'goal', side: 'h', score: { h: 1, a: 0 }, headline: 'Late winner' } ] } };
}
/* Knockout: extra time + penalty shootout add-ons. */
function penaltyLeg() {
  return { num: 73, pick: 'h', simple: true, label: 'Brazil advance', finalState: 'win',
    result: { teams: { h: 'BRA', a: 'CRO' }, seed: 9901, replayKey: 'pens-v20', score: { h: 1, a: 1 },
      regulationScore: { h: 1, a: 1 }, extraTimeScore: { h: 1, a: 1 }, minute: 121, period: 'penalties',
      shootout: { h: 5, a: 4 }, advancingTeam: 'BRA',
      events: [
        { minute: 20, type: 'goal', side: 'h', score: { h: 1, a: 0 }, headline: 'Goal' },
        { minute: 45, type: 'halftime', score: { h: 1, a: 0 }, headline: 'Half-time' },
        { minute: 81, type: 'goal', side: 'a', score: { h: 1, a: 1 }, headline: 'Goal' },
        { minute: 90, type: 'extra_time_start', period: 'extra time', score: { h: 1, a: 1 }, headline: 'Extra time begins' },
        { minute: 121, type: 'penalties', period: 'penalties', side: 'h', score: { h: 1, a: 1 }, shootout: { h: 5, a: 4 }, headline: 'Brazil advance on penalties' } ] } };
}
const goalSeg = (plan) => plan.segments.find((s) => { const ev = plan.stops[s.stopIndex]; return ev.type === 'goal' || ev.type === 'own_goal'; });

// 1 — determinism
test('Director Plan is deterministic for the same seed, log, and elapsed time', () => withApp((app, ts2, window) => {
  const a = ts2.ts2BuildDirectorPlan(regulationLeg(), 'cinematic', 1);
  const b = ts2.ts2BuildDirectorPlan(regulationLeg(), 'cinematic', 1);
  assert.deepEqual(a, b, 'identical inputs build an identical plan');
  const sample = () => [0, 300, 1200, 4500, 9000, 16000, 24000, 30000, 41000]
    .map((ms) => JSON.stringify(ts2.ts2DirectorFrame(a, regulationLeg(), ms)));
  assert.deepEqual(sample(), sample(), 'frames are identical for the same elapsed time');
  const old = window.Math.random; window.Math.random = () => { throw new Error('Math.random during playback'); };
  try { ts2.ts2DirectorFrame(a, regulationLeg(), 12000); ts2.ts2BuildDirectorPlan(penaltyLeg(), 'fast', 1); }
  finally { window.Math.random = old; }
}));

// 2 — first ball movement within 250ms
test('First ball movement begins within 250ms', () => withApp((app, ts2) => {
  ['cinematic', 'fast'].forEach((spd) => {
    const plan = ts2.ts2BuildDirectorPlan(regulationLeg(), spd, 1);
    const b0 = ts2.ts2DirectorFrame(plan, regulationLeg(), 0).frame.ball;
    const b250 = ts2.ts2DirectorFrame(plan, regulationLeg(), 250).frame.ball;
    const moved = Math.hypot(b250.x - b0.x, b250.y - b0.y);
    assert.ok(moved > 0.5, `${spd}: ball has moved by 250ms (delta ${moved.toFixed(2)})`);
  });
}));

// 3 — no visual gap longer than the budget
test('No visual beat exceeds 650ms in Watch Live or 300ms in Speed Up', () => withApp((app, ts2) => {
  [regulationLeg(), penaltyLeg(), lateGoalLeg()].forEach((leg) => {
    const watchMax = Math.max(...ts2.ts2BuildDirectorPlan(leg, 'cinematic', 1).beats.map((b) => b.dur));
    const fastMax = Math.max(...ts2.ts2BuildDirectorPlan(leg, 'fast', 1).beats.map((b) => b.dur));
    assert.ok(watchMax <= 650, `Watch Live max beat ${watchMax}ms`);
    assert.ok(fastMax <= 300, `Speed Up max beat ${fastMax}ms`);
  });
}));

// 4 — a captured late goal is presented on the presentation budget, not after a literal-minute wait
test('A captured late-minute goal appears within the presentation budget', () => withApp((app, ts2) => {
  const watch = ts2.ts2BuildDirectorPlan(lateGoalLeg(), 'cinematic', 1);
  const fast = ts2.ts2BuildDirectorPlan(lateGoalLeg(), 'fast', 1);
  assert.ok(goalSeg(watch).revealAt <= 9000, `Watch Live first goal at ${goalSeg(watch).revealAt}ms (<=9000)`);
  assert.ok(goalSeg(fast).revealAt <= 3500, `Speed Up first goal at ${goalSeg(fast).revealAt}ms (<=3500)`);
  // The 84' goal must NOT cost ~26s of minute-driven wall clock.
  assert.ok(goalSeg(watch).revealAt < 12000, 'late minute is decoupled from wall-clock pacing');
}));

// 5 — captured events / score never surface ahead of their planned beat, and stay in order
test('Goals, scores, and events never appear before their planned captured beat', () => withApp((app, ts2) => {
  const leg = penaltyLeg(), plan = ts2.ts2BuildDirectorPlan(leg, 'cinematic', 1);
  // reveal order matches captured order
  const order = plan.segments.map((s) => s.stopIndex);
  assert.deepEqual(order, order.slice().sort((x, y) => x - y), 'segments present captured events in captured order');
  // for every segment, the post-event score is hidden until its revealAt
  plan.segments.forEach((seg) => {
    const ev = plan.stops[seg.stopIndex];
    if (!ev.score) return;
    if (seg.revealAt > 0) {
      const pre = ts2.ts2DirectorFrame(plan, leg, Math.max(0, seg.revealAt - 1));
      assert.deepEqual(pre.score, seg.preScore, `score for stop ${seg.stopIndex} stays pre-event until its beat`);
    }
    const at = ts2.ts2DirectorFrame(plan, leg, seg.revealAt + 1);
    assert.deepEqual(at.score, ev.score, `score for stop ${seg.stopIndex} reveals at its captured beat`);
  });
  // penalties never surface before their captured beat
  assert.notEqual(ts2.ts2DirectorFrame(plan, leg, 4000).event.type, 'penalties', 'penalties never appear early');
}));

// 6 — ball travel is deterministically non-linear
test('Ball travel includes deterministic non-linear attack paths', () => withApp((app, ts2) => {
  const leg = regulationLeg();
  const goal = ts2.ts2BuildStops(leg).find((e) => e.type === 'goal');
  const A = ts2.ts2VisualFrame(leg, goal, goal.score, 'first half', 0.3).ball;
  const B = ts2.ts2VisualFrame(leg, goal, goal.score, 'first half', 0.55).ball;
  const C = ts2.ts2VisualFrame(leg, goal, goal.score, 'first half', 0.8).ball;
  const cross = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
  assert.ok(Math.abs(cross) > 1, `attack path is curved, not a straight lerp (cross ${cross.toFixed(2)})`);
  const fr = ts2.ts2VisualFrame(leg, goal, goal.score, 'first half', 0.78);
  assert.ok(fr.trail && fr.trail.on && /^M[\d.]+ [\d.]+ Q/.test(fr.trail.d), 'a meaningful attack draws a short curved trail');
}));

// 7 — replay and leave/re-enter never stack RAF or timer loops
test('Replay and leave/re-enter never stack runtime loops', () => withApp((app, ts2, window) => {
  const s = app.blankState(); s.mode = 'sim';
  Object.keys(app.GROUPS).forEach((g) => { s.order[g] = app.GROUPS[g].slice(); });
  s.bank = 1000; s.bets = [{ id: 'loop', num: 1, pick: 'h', stake: 20, odds: 120, settled: false, state: 'pending' }];
  app.setState(s);
  window.ts2Launch(0);
  window.ts2Replay(); window.ts2Replay(); window.ts2SetSpeed('fast'); window.ts2Replay();
  window.ts2Skip(); window.ts2Close();
  const rt = ts2.runtimeState();
  assert.equal(rt.timer, false, 'no timer loop survives replay/speed/close');
  assert.equal(rt.raf, false, 'no RAF loop survives replay/speed/close');
  assert.equal(rt.runtime, false, 'runtime marker cleared');
}));

// 8 — Speed Up changes wall-clock only
test('Speed Up changes wall-clock duration only — never order, result, ticket state, or settlement', () => withApp((app, ts2) => {
  [regulationLeg(), penaltyLeg()].forEach((leg) => {
    const watch = ts2.ts2BuildDirectorPlan(leg, 'cinematic', 1);
    const fast = ts2.ts2BuildDirectorPlan(leg, 'fast', 1);
    assert.deepEqual(watch.segments.map((s) => s.stopIndex), fast.segments.map((s) => s.stopIndex), 'identical event order');
    assert.deepEqual(watch.stops.map((s) => s.type), fast.stops.map((s) => s.type), 'identical captured event set');
    assert.ok(watch.total / fast.total >= 2.5, `Speed Up >= 2.5x faster (${(watch.total / fast.total).toFixed(2)}x)`);
    // final settled frame resolves to the same captured score in both speeds
    const wEnd = ts2.ts2DirectorFrame(watch, leg, watch.total + 1).score;
    const fEnd = ts2.ts2DirectorFrame(fast, leg, fast.total + 1).score;
    assert.deepEqual(wEnd, fEnd, 'both speeds settle on the same captured score');
  });
}));

// 9 — SIM VAR is visual-only
test('SIM VAR never changes any underlying result or state', () => withApp((app, ts2, window) => {
  const s = app.blankState(); s.mode = 'sim';
  Object.keys(app.GROUPS).forEach((g) => { s.order[g] = app.GROUPS[g].slice(); });
  s.bank = 1000; s.bets = [{ id: 'var', num: 1, pick: 'h', stake: 25, odds: 140, settled: false, state: 'pending' }];
  app.setState(s);
  window.ts2Launch(0);
  const ctx = ts2.getCtx(), leg = ctx.legs[0];
  const goal = ts2.ts2BuildStops(leg).find((e) => e.type === 'goal');
  const snap = () => JSON.stringify({ bank: app.getState().bank, score: ctx.liveScore || {}, cash: ctx.cashOutAmount || 0,
    settled: app.getState().bets.filter((b) => b.settled).length });
  const before = snap();
  assert.equal(ts2.ts2MaybeSimVar(leg, goal, ts2.ts2Speeds().cinematic), true, 'SIM VAR shows once for an eligible goal');
  assert.ok(window.document.querySelector('#ts2stage .ts2-varbox.show'), 'SIM VAR is a compact pitch overlay, not a modal');
  assert.equal(ts2.ts2MaybeSimVar(leg, goal, ts2.ts2Speeds().cinematic), false, 'at most once per match');
  assert.equal(snap(), before, 'SIM VAR changed no score, Cash Out, or settlement');
}));

// 10 — confetti fires once
test('Confetti fires once only after a complete ticket win', () => withApp((app, ts2) => {
  const ticket = { replayKey: 'tk-1', legs: [{ pick: 'h', result: { seed: 111, score: { h: 2, a: 0 } } }] };
  assert.equal(ts2.ts2ConfettiShouldFire(ticket), true, 'first full win fires the single burst');
  assert.equal(ts2.ts2ConfettiShouldFire(ticket), false, 'never fires again for the same settled ticket');
  const same = { replayKey: 'tk-1', legs: [{ pick: 'h', result: { seed: 111, score: { h: 2, a: 0 } } }] };
  assert.equal(ts2.ts2ConfettiShouldFire(same), false, 'a re-created identical context stays de-duplicated');
}));

// 11 — official match center cannot mount the virtual matchcast
test('Official Match Center cannot mount this system', () => withApp((app, ts2) => {
  const s = app.blankState(); s.mode = 'real';
  Object.keys(app.GROUPS).forEach((g) => { s.order[g] = app.GROUPS[g].slice(); });
  app.REAL[1] = [1, 0]; s.sc[1] = { h: 1, a: 0 }; s.real[1] = 1;
  app.setState(s);
  assert.equal(ts2.canOpenVirtualMatchcast(1, null), false, 'an official, real result cannot open the virtual Matchcast');
}));
