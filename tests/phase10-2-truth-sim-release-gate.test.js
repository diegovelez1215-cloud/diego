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
    window.__gate = {
      getState:function(){return S;}, setState:function(v){S=v;}, blankState:blankState,
      MATCHES:MATCHES, GROUPS:GROUPS, REAL:REAL, M:M, gMatches:gMatches,
      standings:standings, withTour:withTour, liveTour:liveTour,
      tccOffTable:tccOffTable, tccRealTable:tccRealTable, tccTeamTournamentStatus:tccTeamTournamentStatus,
      knockoutSlotStatus:knockoutSlotStatus, kickoffWindowModel:kickoffWindowModel, kickoffWindowFixtureNums:kickoffWindowFixtureNums,
      todayRailHTML:todayRailHTML, homeSeen:homeSeen, curISO:curISO,
      premiumSimMatch:premiumSimMatch, instantSimMatch:instantSimMatch, matchOddsFor:matchOddsFor,
      ts2VisualFrame:ts2VisualFrame, ts2BuildStops:ts2BuildStops, ts2EstimatePlayback:ts2EstimatePlayback,
      mountText:function(html){var d=document.createElement('div');d.innerHTML=html||'';return d.textContent;},
      styleText:function(){return document.querySelector('style').textContent;}
    };`);
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  const errors = [];
  dom.window.addEventListener('error', (e) => errors.push(e.message));
  try { return fn(dom.window.__gate, dom.window.__ts2, dom.window, errors); }
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

function independentGroup(app, group, scores) {
  const rows = {};
  app.GROUPS[group].forEach((code) => { rows[code] = { code, Pl: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0 }; });
  app.gMatches(group).forEach((m) => {
    const s = scores[m.num];
    if (!s) return;
    const H = rows[m.home], A = rows[m.away];
    H.Pl += 1; A.Pl += 1; H.GF += s.h; H.GA += s.a; A.GF += s.a; A.GA += s.h;
    if (s.h > s.a) { H.W += 1; A.L += 1; H.Pts += 3; }
    else if (s.a > s.h) { A.W += 1; H.L += 1; A.Pts += 3; }
    else { H.D += 1; A.D += 1; H.Pts += 1; A.Pts += 1; }
  });
  Object.values(rows).forEach((r) => { r.GD = r.GF - r.GA; });
  return rows;
}

function sampleLeg() {
  const events = [
    { minute: 10, type: 'goal', side: 'h', score: { h: 1, a: 0 }, headline: 'Goal' },
    { minute: 45, type: 'halftime', score: { h: 1, a: 0 }, headline: 'Half-time' },
    { minute: 67, type: 'red_card', side: 'a', score: { h: 1, a: 0 }, headline: 'Red card' },
  ];
  return { num: 55, pick: 'a', simple: true, label: 'Côte d’Ivoire win',
    result: { teams: { h: 'CUW', a: 'CIV' }, score: { h: 1, a: 0 }, minute: 90, period: 'final', events } };
}

test('official standings use final results only while live tables remain provisional', () => withApp((app) => {
  const s = resetOfficial(app);
  const [m1, m2] = app.gMatches('E');
  setOfficial(app, s, m1.num, 1, 0);
  s.rwState[m2.num] = { kind: 'live', sh: 0, sa: 3, min: 65, label: 'Live', status: '2H' };
  s._rwlive = { [m2.num]: { sh: 0, sa: 3, min: 65 } };
  app.setState(s);
  const official = app.tccOffTable('E');
  const projected = app.tccRealTable('E');
  const civOfficial = official.find((r) => r.code === m2.away);
  const civProjected = projected.find((r) => r.code === m2.away);
  assert.equal(civOfficial.Pl, 0, 'official table ignores live-only score');
  assert.equal(civProjected.Pl, 1, 'as-it-stands table may include live score');
  assert.ok(app.tccTeamTournamentStatus(m2.away).type !== 'officially_confirmed', 'live-only state cannot confirm qualification');
}));

test('points GF GA GD invariants recompute from official source results', () => withApp((app) => {
  const s = resetOfficial(app);
  const ms = app.gMatches('A');
  const scores = {};
  [[2, 1], [0, 0], [1, 3], [4, 2], [2, 2], [0, 1]].forEach(([h, a], i) => {
    scores[ms[i].num] = { h, a };
    setOfficial(app, s, ms[i].num, h, a);
  });
  app.setState(s);
  const expected = independentGroup(app, 'A', scores);
  app.tccOffTable('A').forEach((row) => {
    const e = expected[row.code];
    ['Pl', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'].forEach((k) => assert.equal(row[k], e[k], `${row.code} ${k}`));
  });
}));

test('unresolved tiebreaks and dependencies never produce false Confirmed labels', () => withApp((app) => {
  const s = resetOfficial(app);
  app.gMatches('A').forEach((m) => setOfficial(app, s, m.num, 0, 0));
  app.setState(s);
  app.GROUPS.A.forEach((code) => {
    const st = app.tccTeamTournamentStatus(code);
    assert.equal(st.provisionalByTiebreaker, true, `${code} should remain tiebreak-pending`);
    assert.notEqual(st.type, 'officially_confirmed', `${code} must not be officially confirmed from unresolved tiebreak`);
  });
  const ks = app.knockoutSlotStatus(79, true);
  assert.notEqual(ks.state, 'confirmed', 'bracket slot cannot be confirmed while source group tiebreak is pending');
}));

test('best-third and knockout slots stay pending/projected until global dependencies lock', () => withApp((app) => {
  const s = resetOfficial(app);
  ['A', 'B', 'C'].forEach((g) => {
    app.gMatches(g).forEach((m) => setOfficial(app, s, m.num, 1, 0));
  });
  app.setState(s);
  const status = app.knockoutSlotStatus(74, true);
  assert.ok(['pending', 'projected', 'one'].includes(status.state), `safe best-third dependent state: ${status.state}`);
  assert.notEqual(status.state, 'confirmed', 'partial global third-place race cannot confirm matchup');
}));

test('Home/Tournament remaining fixture IDs match by kickoff window and labels stay inset', () => withApp((app) => {
  const s = resetOfficial(app);
  const today = app.curISO();
  app.MATCHES.forEach((m) => { m.date = '2099-12-31'; m.time = '12:00'; });
  const ms = app.MATCHES.filter((m) => m.stage === 'group').slice(0, 6);
  ms.forEach((m, i) => { m.date = today; m.time = i < 2 ? '16:00' : (i < 4 ? '19:00' : '22:00'); });
  app.setState(s);
  const seen = app.homeSeen([ms[0].num, ms[1].num]);
  const html = app.todayRailHTML(seen);
  const homeIds = Array.from(html.matchAll(/openSheet\((\d+)\)/g)).map((m) => +m[1]);
  const modelIds = Array.from(app.kickoffWindowFixtureNums(app.kickoffWindowModel({ iso: today })), Number);
  assert.equal(homeIds.join(','), modelIds.join(','), 'Home fixture IDs match the full shared kickoff-window model');
  assert.equal(new Set(homeIds).size, homeIds.length, 'Home has no duplicated fixtures');
  assert.ok(!/Market odds/i.test(html), 'Home factual schedule has no odds');
  const css = app.styleText();
  assert.ok(/\.home-timeline\{[^}]*gap:14px/.test(css), 'kickoff windows have stronger separation');
  assert.ok(/\.home-fixture\{[^}]*grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/.test(css), 'teams use a left/center/right layout in flexible truncating columns');
  assert.ok(/\.home-fixture \.hf-tm\{[^}]*text-overflow:ellipsis/.test(css), 'team names truncate safely before colliding with the center');
}));

test('fresh simulations get fresh seeds while Replay can reproduce the same captured result', () => withApp((app) => {
  const s = resetOfficial(app);
  s.mode = 'sim';
  s.bets = [{ id: 'fresh-seed', num: 55, pick: 'a', stake: 10, odds: -250, settled: false, state: 'pending' }];
  app.setState(s);
  assert.equal(app.instantSimMatch(55), true);
  const first = app.getState()._lastTicketSim;
  delete app.getState().sc[55];
  delete app.getState().betsim[55];
  assert.equal(app.instantSimMatch(55), true);
  const second = app.getState()._lastTicketSim;
  assert.notEqual(first.seed, second.seed, 'fresh instant simulation uses a fresh seed');
  const replay = app.premiumSimMatch(55, { home: 'CUW', away: 'CIV', seed: first.seed });
  assert.deepEqual(replay.score, first.score, 'replay seed reproduces result');
  assert.deepEqual(replay.events, first.events, 'replay seed reproduces event log');
}));

test('Curaçao underdog sample is many fresh seeds and broadly matches virtual market direction', () => withApp((app) => {
  const N = 900;
  let cuw = 0, draw = 0, civ = 0;
  const seeds = new Set();
  for (let i = 1; i <= N; i++) {
    const res = app.premiumSimMatch(55, { home: 'CUW', away: 'CIV', seed: 100000 + i, disableRandomCards: true });
    seeds.add(res.seed);
    if (res.score.h > res.score.a) cuw += 1;
    else if (res.score.h < res.score.a) civ += 1;
    else draw += 1;
  }
  assert.equal(seeds.size, N, 'audit uses many fresh seeds');
  assert.ok(civ > cuw, `favorite should win more often than underdog: CUW ${cuw}, CIV ${civ}`);
  assert.ok(cuw > 0, 'underdog remains capable of winning');
  const odds = app.matchOddsFor(55, 'CUW', 'CIV', false);
  assert.ok(odds.pA > odds.pH, 'displayed virtual market also rates Côte d’Ivoire above Curaçao');
  const samplePA = civ / N;
  assert.ok(Math.abs(samplePA - odds.pA) < 0.20, `sample ${samplePA.toFixed(3)} close enough to market ${odds.pA.toFixed(3)}`);
}));

test('Matchboard runtime frames visibly move and Speed Up preserves outcome safety', () => withApp((app, ts2, window, errors) => {
  const leg = sampleLeg();
  const goal = leg.result.events[0];
  const f0 = app.ts2VisualFrame(leg, goal, goal.score, 'first half', 0);
  const f5 = app.ts2VisualFrame(leg, goal, goal.score, 'first half', .5);
  const f8 = app.ts2VisualFrame(leg, goal, goal.score, 'first half', .82);
  assert.notDeepEqual(f0.ball, f5.ball, 'ball position changes over animation frames');
  assert.notDeepEqual(f0.markers.map((m) => [m.x, m.y]), f5.markers.map((m) => [m.x, m.y]), 'marker positions change over animation frames');
  assert.ok(f8.ball.x >= 88 || f8.ball.x <= 12, 'goal reaches endpoint before score reveal');
  assert.equal(f5.scoreVisible, false, 'score reveal waits during buildup');
  assert.equal(f8.scoreVisible, true, 'score reveals after endpoint');
  const oneWatch = app.ts2EstimatePlayback([leg], 'cinematic');
  const oneFast = app.ts2EstimatePlayback([leg], 'fast');
  assert.ok(oneWatch >= 20000 && oneWatch <= 24000, `Watch Live timing ${oneWatch}`);
  assert.ok(oneFast >= 7000 && oneFast <= 9000, `Speed Up timing ${oneFast}`);
  assert.ok(oneWatch / oneFast >= 2.5, `Speed Up ratio ${(oneWatch / oneFast).toFixed(2)}x`);
  assert.deepEqual(app.ts2BuildStops(leg).map((ev) => ev.type), ['goal', 'halftime', 'red_card', 'final_whistle']);
  window.document.querySelectorAll('script').forEach((el) => el.remove());
  const body = window.document.body.textContent || '';
  assert.ok(!RAW.test(body), 'no raw enum leaks in rendered body');
  assert.equal(errors.length, 0, 'no console errors: ' + errors.join(' | '));
}));
