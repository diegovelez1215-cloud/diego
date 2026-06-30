const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const RAW = /\b(?:IN_PLAY|PENDING|SETTLED|VOID|CASHED|GRP)\b/;

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
    window.__p10 = {
      getState:function(){return S;}, setState:function(v){S=v;}, blankState:blankState,
      MATCHES:MATCHES, GROUPS:GROUPS, REAL:REAL, M:M, gMatches:gMatches,
      renderGroups:renderGroups, renderBracket:renderBracket, renderLiveJump:renderLiveJump,
      knockoutSlotStatus:knockoutSlotStatus, knockoutPathCardHTML:knockoutPathCardHTML,
      thirdsTableHTML:thirdsTableHTML, renderThirds:renderThirds,
      kickoffWindowModel:kickoffWindowModel, kickoffWindowFixtureNums:kickoffWindowFixtureNums,
      todayRailHTML:todayRailHTML, homeSeen:homeSeen, curISO:curISO, nextISO:nextISO,
      styleText:function(){return document.querySelector('style').textContent;},
      mountText:function(html){var d=document.createElement('div');d.innerHTML=html||'';return d.textContent;},
      groupsHTML:function(){return document.getElementById('groups').innerHTML;},
      bracketHTML:function(){return document.getElementById('bracket').innerHTML;},
      setTab:function(v){TAB=v;}, liveJumpDisplay:function(){var el=document.getElementById('livejump');return el&&el.style.display;},
      withReal:function(fn){return withTour(liveTour(),fn);}
    };`);
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  const errors = [];
  dom.window.addEventListener('error', (e) => errors.push(e.message));
  try { return fn(dom.window.__p10, dom.window, dom.window.__ts2, errors); }
  finally { dom.window.close(); }
}

function resetOfficial(app) {
  Object.keys(app.REAL).forEach((k) => delete app.REAL[k]);
  const s = app.blankState();
  s.mode = 'real';
  Object.keys(app.GROUPS).forEach((g) => { s.order[g] = app.GROUPS[g].slice(); });
  app.setState(s);
  return s;
}

function setOfficial(app, state, num, h, a) {
  app.REAL[num] = [h, a];
  state.sc[num] = { h, a };
  state.real[num] = 1;
}

function fillGroup(app, state, group) {
  const order = app.GROUPS[group];
  app.gMatches(group).forEach((m) => {
    const hi = order.indexOf(m.home), ai = order.indexOf(m.away);
    setOfficial(app, state, m.num, hi < ai ? 2 : 0, hi < ai ? 0 : 2);
  });
}

function sampleLeg() {
  const events = [
    { minute: 12, type: 'goal', side: 'h', score: { h: 1, a: 0 }, headline: 'Goal' },
    { minute: 45, type: 'halftime', score: { h: 1, a: 0 }, headline: 'Half-time' },
    { minute: 63, type: 'red_card', side: 'a', score: { h: 1, a: 0 }, headline: 'Red card' },
    { minute: 88, type: 'goal', side: 'h', score: { h: 2, a: 0 }, headline: 'Goal' },
  ];
  return { num: 1, pick: 'h', simple: true, label: 'Brazil win', finalState: 'win',
    result: { teams: { h: 'BRA', a: 'CRO' }, seed: 4217, replayKey: 'sample-v4', score: { h: 2, a: 0 }, minute: 90, period: 'final', events } };
}

function penaltyLeg() {
  return { num: 73, pick: 'h', simple: true, label: 'Brazil advance', finalState: 'win',
    result: { teams: { h: 'BRA', a: 'CRO' }, seed: 9901, replayKey: 'pens-v4',
      score: { h: 1, a: 1 }, regulationScore: { h: 1, a: 1 }, extraTimeScore: { h: 1, a: 1 },
      minute: 121, period: 'penalties', shootout: { h: 5, a: 4 }, advancingTeam: 'BRA',
      events: [
        { minute: 20, type: 'goal', side: 'h', score: { h: 1, a: 0 }, headline: 'Goal' },
        { minute: 45, type: 'halftime', score: { h: 1, a: 0 }, headline: 'Half-time' },
        { minute: 81, type: 'goal', side: 'a', score: { h: 1, a: 1 }, headline: 'Goal' },
        { minute: 90, type: 'extra_time_start', period: 'extra time', score: { h: 1, a: 1 }, headline: 'Extra time begins' },
        { minute: 121, type: 'penalties', period: 'penalties', side: 'h', score: { h: 1, a: 1 }, shootout: { h: 5, a: 4 }, headline: 'Brazil advance on penalties' },
      ] } };
}

test('knockout matchup cannot be Confirmed unless both exact participants are officially final', () => withApp((app) => {
  const s = resetOfficial(app);
  fillGroup(app, s, 'A');
  app.setState(s);
  const firstR32 = [73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88].find((n) => {
    const st = app.withReal(() => app.knockoutSlotStatus(n, true));
    return st.home || st.away;
  });
  assert.ok(firstR32, 'test found an R32 slot with one projected/official side');
  const status = app.withReal(() => app.knockoutSlotStatus(firstR32, true));
  assert.notEqual(status.state, 'confirmed', 'partial group completion cannot produce a confirmed matchup');
  assert.ok(['one', 'projected', 'pending'].includes(status.state), `safe state ${status.state}`);
  const card = app.withReal(() => app.knockoutPathCardHTML(firstR32, new Set(), false, true));
  assert.ok(!/Both teams officially locked/.test(card), 'card does not imply official certainty');
}));

test('live/provisional paths render Projected As It Stands, never Confirmed', () => withApp((app) => {
  const s = resetOfficial(app);
  app.setState(s);
  const projected = app.withReal(() => app.knockoutPathCardHTML(73, new Set(), false, true));
  assert.ok(/Projected|Pending official final|One side confirmed|Awaiting result/.test(projected), 'uses conservative status language');
  assert.ok(!/Both teams officially locked/.test(projected), 'live projection is not styled as official confirmation');
}));

test('Home and Tournament share kickoff-window fixture sets and preserve simultaneous pairs', () => withApp((app) => {
  const s = resetOfficial(app);
  const today = app.curISO();
  app.MATCHES.forEach((m) => { m.date = '2099-12-31'; m.time = '12:00'; });
  const ms = app.MATCHES.filter((m) => m.stage === 'group').slice(0, 6);
  ms.forEach((m, i) => { m.date = today; m.time = i < 2 ? '16:00' : (i < 4 ? '19:00' : '22:00'); });
  app.setState(s);
  const heroSeen = app.homeSeen([ms[0].num, ms[1].num]);
  const homeHtml = app.todayRailHTML(heroSeen);
  const homeNums = Array.from(homeHtml.matchAll(/openSheet\((\d+)\)/g)).map((m) => +m[1]);
  const modelWins = app.kickoffWindowModel({ iso: today });
  const tournamentNums = Array.from(app.kickoffWindowFixtureNums(modelWins), Number);
  assert.equal(homeNums.join(','), tournamentNums.join(','), 'Home fixture rail keeps the full shared kickoff-window model');
  assert.equal(new Set(homeNums).size, homeNums.length, 'Home does not repeat fixtures');
  assert.equal(modelWins.map((w) => w.fixtures.length).join(','), '2,2,2', 'simultaneous fixtures stay paired in the lossless rail');
  assert.equal(modelWins.map((w) => w.time).join(','), '16:00,19:00,22:00', 'windows remain in kickoff order');
  assert.ok(!/Market odds/i.test(homeHtml), 'factual Home schedule does not render market odds');
}));

test('Home schedule row keeps group label inset and team text truncates before it', () => withApp((app) => {
  const css = app.styleText();
  assert.ok(/\.home-fixture\{[^}]*grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/.test(css), 'team columns can shrink around a fixed center');
  assert.ok(/\.home-fixture\{[^}]*padding:10px 4px/.test(css), 'row has safe insets');
  assert.ok(/\.home-fixture \.hf-tm\{[^}]*text-overflow:ellipsis/.test(css), 'team text truncates safely');
  assert.ok(/\.home-fixture \.hf-tm\.r\{[^}]*text-align:right/.test(css), 'the right-hand team aligns to the right edge');
}));

test('Tournament renders exactly one full best-third qualification module below the bracket', () => withApp((app) => {
  const s = resetOfficial(app);
  fillGroup(app, s, 'A');
  app.setState(s);
  app.renderGroups();
  assert.ok(!/Best third-place race/.test(app.mountText(app.groupsHTML())), 'old race card is not duplicated on standings');
  app.renderBracket();
  const html = app.bracketHTML();
  const text = app.mountText(html);
  assert.equal((text.match(/Best third-place qualification/g) || []).length, 1, 'one best-third module heading');
  assert.equal((text.match(/Best Third-Placed Teams/g) || []).length, 0, 'old duplicate heading is absent');
  assert.ok(!/View full third-place table/.test(text), 'no hidden full-table action remains');
  assert.equal((html.match(/third-qual-row/g) || []).length, 12, 'all 12 third-place teams render by default');
  assert.equal((text.match(/Qualification line — top 8 advance/g) || []).length, 1, 'single qualification line renders after rank 8');
  assert.ok(html.indexOf('id="knockoutPath"') < html.indexOf('id="bestThirdQualification"'), 'best-third table sits directly after the mobile bracket path');
}));

test('Tournament floating control hides on bracket, standings, and matches surfaces', () => withApp((app) => {
  const s = resetOfficial(app);
  s.rwState[1] = { kind: 'live', label: 'LIVE', sh: 1, sa: 0, min: 34 };
  app.setState(s);
  ['groups', 'bracket', 'matches'].forEach((tab) => {
    app.setTab(tab);
    app.renderLiveJump();
    assert.equal(app.liveJumpDisplay(), 'none', `live jump hidden on ${tab}`);
  });
}));

test('mobile bracket is vertical and text-safe at phone widths', () => withApp((app) => {
  resetOfficial(app);
  app.renderBracket();
  const html = app.bracketHTML();
  const css = app.styleText();
  assert.ok(/id="knockoutPath"/.test(html), 'mobile knockout path is rendered');
  assert.ok(/\.kpath\{[^}]*flex-direction:column/.test(css), 'bracket path is vertical');
  assert.ok(/\.kpath-round\{[^}]*overflow:hidden/.test(css), 'round sections clip safely');
  assert.ok(/\.kpath-team\{[^}]*text-overflow:ellipsis/.test(css), 'team labels cannot run into the edge');
  assert.ok(/\.kpath-meta span\{[^}]*text-overflow:ellipsis/.test(css), 'status/stakes labels cannot overflow');
}));

test('Matchboard V3 moves ball and markers deterministically without creating events', () => withApp((app, window, ts2) => {
  const leg = sampleLeg();
  const stops = ts2.ts2BuildStops(leg);
  const seqA = stops.map((ev) => ts2.ts2VisualEventState(leg, ev, ev.score || leg.result.score, ev.period || leg.result.period));
  const seqB = stops.map((ev) => ts2.ts2VisualEventState(leg, ev, ev.score || leg.result.score, ev.period || leg.result.period));
  assert.deepEqual(seqA, seqB, 'same event log gives same visual sequence');
  assert.deepEqual(seqA.map((x) => x.type), stops.map((x) => x.type), 'visual layer creates no new events');
  assert.ok(seqA.some((x) => x.cls === 'goal'), 'goal event gets goal visual state');
  assert.ok(seqA.some((x) => x.cls === 'card'), 'red card gets spotlight visual state');
  const goal = stops[0];
  const f0 = ts2.ts2VisualFrame(leg, goal, goal.score, 'first half', 0);
  const f7 = ts2.ts2VisualFrame(leg, goal, goal.score, 'first half', .78);
  const f9 = ts2.ts2VisualFrame(leg, goal, goal.score, 'first half', .9);
  assert.notDeepEqual(f0.ball, f7.ball, 'ball position changes over an attacking/goal sequence');
  assert.notDeepEqual(f0.markers.map((m) => [m.x, m.y]), f7.markers.map((m) => [m.x, m.y]), 'marker positions change over animation steps');
  assert.ok(f7.ball.x >= 88 || f7.ball.x <= 12, 'goal path reaches the goal area before score reveal');
  assert.equal(f7.scoreVisible, false, 'score is held until the ball reaches the goal');
  assert.equal(f9.scoreVisible, true, 'score reveal follows the goal-path moment');
  const card = stops.find((ev) => ev.type === 'red_card');
  assert.ok(ts2.ts2VisualFrame(leg, card, card.score, 'second half', .6).markers.some((m) => m.spot), 'card sequence changes visual spotlight state');
  const html = ts2.ts2MatchboardHTML(leg, stops[0], stops[0].score, 'first half');
  assert.ok(/ts2-mb-svg/.test(html) && /ts2-mb-band/.test(html) && /ts2-ball/.test(html), 'SVG trace, attack band, and ball render');
  assert.ok(!/player|xG|possession|official/i.test(html), 'no fake official stats or player claims');
}));

test('Matchcast V4 frame model is deterministic and reveals captured events only on schedule', () => withApp((app, window, ts2) => {
  const leg = penaltyLeg();
  const stops = ts2.ts2BuildStops(leg);
  const watch = ts2.ts2EstimatePlayback([sampleLeg()], 'cinematic');
  const fast = ts2.ts2EstimatePlayback([sampleLeg()], 'fast');
  assert.ok(watch >= 20000 && watch <= 24000, `Watch live regulation was ${watch}`);
  assert.ok(fast >= 7000 && fast <= 9000, `Speed Up regulation was ${fast}`);
  assert.ok(watch / fast >= 2.5, `Speed Up ratio was ${(watch / fast).toFixed(2)}x`);

  const seqA = [0, 2500, 9000, 16000, 26000, 36000, 46000].map((ms) => ts2.ts2FrameModel(leg, stops, ms, 'cinematic', 1));
  const seqB = [0, 2500, 9000, 16000, 26000, 36000, 46000].map((ms) => ts2.ts2FrameModel(leg, stops, ms, 'cinematic', 1));
  assert.deepEqual(seqA, seqB, 'same seed and event log give identical frame sequence');
  assert.ok(seqA.every((x) => stops.includes(x.event)), 'frame model never creates written events');

  const beforeGoal = ts2.ts2FrameModel(leg, stops, 5000, 'cinematic', 1);
  assert.notEqual(beforeGoal.event.type, 'penalties', 'penalties do not appear before their captured stop');
  const pen = ts2.ts2FrameModel(leg, stops, ts2.ts2EstimatePlayback([leg], 'cinematic') - 5000, 'cinematic', 1);
  assert.equal(pen.event.type, 'penalties', 'penalty shootout appears at captured penalty moment');
  assert.ok(pen.frame.penaltyReveal && pen.frame.penaltyReveal.shown >= 1, 'penalty kicks reveal progressively inside the captured penalty event');
}));

test('playback helper uses no randomness after capture and official match center cannot mount virtual matchcast', () => withApp((app, window, ts2) => {
  const leg = sampleLeg(), stops = ts2.ts2BuildStops(leg);
  const oldRandom = window.Math.random;
  window.Math.random = () => { throw new Error('Math.random called during playback'); };
  try {
    ts2.ts2FrameModel(leg, stops, 12000, 'cinematic', 1);
    ts2.ts2VisualFrame(leg, stops[0], stops[0].score, 'first half', .4);
    ts2.ts2EstimatePlayback([leg], 'fast');
  } finally {
    window.Math.random = oldRandom;
  }
  const s = resetOfficial(app);
  setOfficial(app, s, 1, 1, 0);
  app.setState(s);
  assert.equal(ts2.canOpenVirtualMatchcast(1, null), false, 'official match cannot open virtual matchcast');
}));

test('timing, speed-up, settlement safety, raw labels, and console stay clean', () => withApp((app, window, ts2, errors) => {
  const one = [sampleLeg()], four = [sampleLeg(), sampleLeg(), sampleLeg(), sampleLeg()];
  const oneWatch = ts2.ts2EstimatePlayback(one, 'cinematic');
  const fourWatch = ts2.ts2EstimatePlayback(four, 'cinematic');
  const oneFast = ts2.ts2EstimatePlayback(one, 'fast');
  assert.ok(oneWatch >= 20000 && oneWatch <= 24000, `one-leg Watch live was ${oneWatch}`);
  assert.ok(fourWatch >= 25000 && fourWatch <= 32000, `four-leg Watch live was ${fourWatch}`);
  assert.ok(oneFast >= 7000 && oneFast <= 9000, `one-leg Speed Up was ${oneFast}`);
  assert.ok(oneWatch / oneFast >= 2.5, `Speed up ratio was ${(oneWatch / oneFast).toFixed(2)}x`);
  assert.deepEqual(ts2.ts2BuildStops(sampleLeg()).map((s) => s.type), ['goal', 'halftime', 'red_card', 'goal', 'final_whistle']);

  const s = app.blankState();
  s.mode = 'sim';
  Object.keys(app.GROUPS).forEach((g) => { s.order[g] = app.GROUPS[g].slice(); });
  s.bank = 1000;
  s.bets = [{ id: 'p10-settle', num: 1, pick: 'h', stake: 20, odds: 120, settled: false, state: 'pending' }];
  app.setState(s);
  window.ts2Launch(0);
  assert.match(window.document.getElementById('ts2top').textContent, /SIMULATION/);
  assert.match(window.document.getElementById('ts2top').textContent, /Virtual match/);
  assert.match(window.document.getElementById('ts2top').textContent, /SIM \$|SIM \$/);
  assert.match(window.document.getElementById('ts2top').textContent, /No real money/);
  assert.match(window.document.getElementById('ts2top').textContent, /Does not affect official results/);
  window.ts2CashOut();
  const confirm = window.document.getElementById('ts2confirm');
  if (confirm) window.ts2CashCancel();
  window.ts2Skip();
  const bank = app.getState().bank;
  window.ts2Replay();
  window.ts2Skip();
  assert.equal(app.getState().bank, bank, 'replay/skip cannot duplicate settlement');
  const visible = window.document.getElementById('ts2').textContent;
  assert.ok(!RAW.test(visible), 'no raw enum leaks in the rendered simulation surface');
  window.ts2Replay();
  window.ts2Close();
  const runtime = ts2.runtimeState();
  assert.equal(runtime.timer, false, 'close clears timer handle');
  assert.equal(runtime.raf, false, 'close clears raf handle');
  assert.equal(runtime.runtime, false, 'close clears runtime marker');
  assert.equal(errors.length, 0, 'no console errors: ' + errors.join(' | '));
}));

/* ===== Phase 19 — Arcade Matchcast motion (visual-only restoration) ===== */

test('Arcade Matchcast: visual frame sequence is deterministic for the same seed + log + elapsed time', () => withApp((app, window, ts2) => {
  const leg = penaltyLeg(), stops = ts2.ts2BuildStops(leg);
  const sample = () => [0, 3000, 9000, 15000, 22000, 30000].map((ms) => JSON.stringify(ts2.ts2FrameModel(leg, stops, ms, 'cinematic', 1).frame));
  assert.deepEqual(sample(), sample(), 'same seed + event log + elapsed playback time give identical frames');
  const a = ts2.ts2VisualFrame(leg, stops[0], stops[0].score, 'first half', .4, { from: { x: 50, y: 50 } });
  const b = ts2.ts2VisualFrame(leg, stops[0], stops[0].score, 'first half', .4, { from: { x: 50, y: 50 } });
  assert.deepEqual(a.ball, b.ball, 'continuity-anchored arc is deterministic');
}));

test('Arcade Matchcast: attacking ball travel is non-linear (arcs/diagonals, not a straight lerp)', () => withApp((app, window, ts2) => {
  const leg = sampleLeg();
  const goal = ts2.ts2BuildStops(leg).find((e) => e.type === 'goal');
  const A = ts2.ts2VisualFrame(leg, goal, goal.score, 'first half', .3).ball;
  const B = ts2.ts2VisualFrame(leg, goal, goal.score, 'first half', .55).ball;
  const C = ts2.ts2VisualFrame(leg, goal, goal.score, 'first half', .8).ball;
  const cross = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
  assert.ok(Math.abs(cross) > 1, `ball path is curved, not collinear (cross ${cross.toFixed(2)})`);
  const fr = ts2.ts2VisualFrame(leg, goal, goal.score, 'first half', .78);
  assert.ok(fr.ball.x >= 88 || fr.ball.x <= 12, 'the arc still resolves at the goal area before the score reveal');
  assert.ok(fr.trail && fr.trail.on && /^M[\d.]+ [\d.]+ Q/.test(fr.trail.d), 'a meaningful attack draws a short curved (quadratic) trail/streak');
}));

test('Arcade Matchcast: never reveals score, future penalty kicks, or events ahead of schedule', () => withApp((app, window, ts2) => {
  const leg = penaltyLeg(), stops = ts2.ts2BuildStops(leg);
  const goal = stops.find((e) => e.type === 'goal');
  assert.equal(ts2.ts2VisualFrame(leg, goal, goal.score, 'first half', .5).scoreVisible, false, 'goal score stays hidden mid-flight');
  assert.equal(ts2.ts2VisualFrame(leg, goal, goal.score, 'first half', .9).scoreVisible, true, 'score reveals only after the ball arrives');
  const pen = stops.find((e) => e.type === 'penalties');
  const early = ts2.ts2VisualFrame(leg, pen, pen.score, 'penalties', .2);
  assert.ok(early.penaltyReveal.shown >= 1 && early.penaltyReveal.shown < early.penaltyReveal.total, 'only the current penalty kick shows; future kicks stay hidden');
  const before = ts2.ts2FrameModel(leg, stops, 4000, 'cinematic', 1);
  assert.notEqual(before.event.type, 'penalties', 'penalties never surface before their captured minute');
}));

test('Arcade Matchcast: replay and leave/re-enter never stack RAF or timer loops', () => withApp((app, window, ts2) => {
  const s = app.blankState(); s.mode = 'sim';
  Object.keys(app.GROUPS).forEach((g) => { s.order[g] = app.GROUPS[g].slice(); });
  s.bank = 1000; s.bets = [{ id: 'loop', num: 1, pick: 'h', stake: 20, odds: 120, settled: false, state: 'pending' }];
  app.setState(s);
  window.ts2Launch(0);
  window.ts2Replay(); window.ts2Replay();
  window.ts2Skip();
  window.ts2Close();
  const rt = ts2.runtimeState();
  assert.equal(rt.timer, false, 'no timer loop survives replay + close');
  assert.equal(rt.raf, false, 'no RAF loop survives replay + close');
  assert.equal(rt.runtime, false, 'runtime marker cleared');
}));

test('SIM VAR is post-event and visual-only: it never changes score, ticket, Cash Out, or settlement', () => withApp((app, window, ts2) => {
  const s = app.blankState(); s.mode = 'sim';
  Object.keys(app.GROUPS).forEach((g) => { s.order[g] = app.GROUPS[g].slice(); });
  s.bank = 1000; s.bets = [{ id: 'var-test', num: 1, pick: 'h', stake: 25, odds: 140, settled: false, state: 'pending' }];
  app.setState(s);
  window.ts2Launch(0);
  const ctx = ts2.getCtx(), leg = ctx.legs[0];
  const goal = ts2.ts2BuildStops(leg).find((e) => e.type === 'goal');
  const snap = () => JSON.stringify({ bank: app.getState().bank, score: ctx.liveScore || {}, targets: ctx.targets, cash: ctx.cashOutAmount || 0, settled: app.getState().bets.filter((b) => b.settled).length });
  const before = snap();
  const fired = ts2.ts2MaybeSimVar(leg, goal, ts2.ts2Speeds().cinematic);
  assert.equal(fired, true, 'SIM VAR shows for one eligible captured goal');
  assert.ok(window.document.querySelector('#ts2stage .ts2-varbox.show'), 'a SIM VAR overlay is shown on the pitch (no full-screen modal)');
  assert.equal(ts2.ts2MaybeSimVar(leg, goal, ts2.ts2Speeds().cinematic), false, 'at most one VAR check per match');
  assert.equal(snap(), before, 'VAR changed no score, ticket, Cash Out, or settlement state');
}));

test('Confetti fires once per settled full-win ticket — not on partial legs, replays, or re-renders', () => withApp((app, window, ts2) => {
  const ticket = { replayKey: 'tk-1', legs: [{ pick: 'h', result: { seed: 111, score: { h: 2, a: 0 } } }] };
  assert.equal(ts2.ts2ConfettiShouldFire(ticket), true, 'first full-win settlement fires the single burst');
  assert.equal(ts2.ts2ConfettiShouldFire(ticket), false, 'the same settled ticket never fires again (replay/re-render guard)');
  const same = { replayKey: 'tk-1', legs: [{ pick: 'h', result: { seed: 111, score: { h: 2, a: 0 } } }] };
  assert.equal(ts2.ts2TicketKey(ticket), ts2.ts2TicketKey(same), 'ticket identity is stable for the same captured outcome');
  assert.equal(ts2.ts2ConfettiShouldFire(same), false, 'a re-created context for the same outcome is still de-duplicated');
  const other = { replayKey: 'tk-2', legs: [{ pick: 'a', result: { seed: 222, score: { h: 1, a: 3 } } }] };
  assert.equal(ts2.ts2ConfettiShouldFire(other), true, 'a genuinely different ticket can fire its own single burst');
}));
