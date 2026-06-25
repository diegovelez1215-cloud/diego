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
    beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {}, stroke() {}, closePath() {},
    createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; },
    getImageData() { return { data: new Uint8ClampedArray(24 * 24 * 4) }; },
  });
  window.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
  window.requestAnimationFrame = (fn) => window.setTimeout(fn, 16);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  window.MutationObserver = class MutationObserver { observe() {} disconnect() {} };
  window.AudioContext = function AudioContext() {};
  window.webkitAudioContext = window.AudioContext;
  window.eval(`${script}
    window.__p9 = {
      getState: function(){ return S; },
      setState: function(v){ S = v; },
      blankState: blankState,
      MATCHES: MATCHES, GROUPS: GROUPS, REAL: REAL, M: M,
      gMatches: gMatches, curISO: curISO, nextISO: nextISO, matchDay: matchDay,
      homePrimaryContext: homePrimaryContext, homeSeen: homeSeen, todayRailHTML: todayRailHTML,
      finalMatchdayCenterHTML: finalMatchdayCenterHTML, phaseLeadHTML: phaseLeadHTML,
      tournamentPulseHomeHTML: tournamentPulseHomeHTML, homeTimelineHTML: homeTimelineHTML,
      renderBracket: renderBracket, freBuildSlip: freBuildSlip,
      functionText: function(name){ return String(window[name] || ''); },
      styleText: function(){ return document.querySelector('style').textContent; },
      mountText: function(html){ var d=document.createElement('div'); d.innerHTML=html||''; return d.textContent; },
      bracketHTML: function(){ return document.getElementById('bracket').innerHTML; },
      setTab: function(v){ TAB=v; },
      setBetCat: function(v){ _betCat=v; },
      getBetCat: function(){ return _betCat; }
    };`);
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  const errors = [];
  dom.window.addEventListener('error', (e) => errors.push(e.message));
  try { return fn(dom.window.__p9, dom.window, dom.window.__ts2, errors); }
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

function prepareFinalGroups(app, groups) {
  const state = resetOfficial(app);
  Object.keys(app.GROUPS).forEach((g) => {
    const pair = groups[g];
    const matches = app.gMatches(g).slice().sort((a, b) => a.num - b.num);
    const deciders = new Set(matches.slice(-2).map((m) => m.num));
    if (!pair) return fillGroup(app, state, g);
    matches.forEach((m) => {
      if (!deciders.has(m.num)) setOfficial(app, state, m.num, 1, 0);
      else { m.date = pair.date; m.time = pair.time; }
    });
  });
  app.setState(state);
  return state;
}

function sampleLeg() {
  const events = [
    { minute: 14, type: 'goal', side: 'h', score: { h: 1, a: 0 }, headline: 'Goal' },
    { minute: 45, type: 'halftime', score: { h: 1, a: 0 }, headline: 'Half-time' },
    { minute: 70, type: 'red_card', side: 'a', score: { h: 1, a: 0 }, headline: 'Red card' },
    { minute: 88, type: 'goal', side: 'h', score: { h: 2, a: 0 }, headline: 'Goal' },
  ];
  return { num: 1, pick: 'h', simple: true, label: 'Brazil win', finalState: 'win',
    result: { teams: { h: 'BRA', a: 'CRO' }, score: { h: 2, a: 0 }, minute: 90, period: 'final', events } };
}

test('Home tournament intelligence avoids hardcoded final-matchday fallbacks and orders groups by kickoff', () => withApp((app) => {
  prepareFinalGroups(app, { K: { date: '2026-06-25', time: '22:00' }, D: { date: '2026-06-25', time: '16:00' } });
  const ctx = app.homePrimaryContext();
  assert.equal(ctx.kind, 'final_matchday');
  assert.ok(ctx.html.includes('Group D'), 'earliest unresolved final-matchday group owns Home priority');
  assert.ok(!/Group A/.test(ctx.html), 'Home does not fall back to Group A');
  const txt = app.mountText(app.finalMatchdayCenterHTML());
  assert.ok(txt.indexOf('Group D') >= 0 && txt.indexOf('Group K') > txt.indexOf('Group D'), 'all final-matchday groups sort by kickoff order');
}));

test('completed fixtures never appear as next and factual Home timeline has no carousel or Market Odds', () => withApp((app) => {
  const s = resetOfficial(app);
  const today = app.curISO();
  const fixtures = app.MATCHES.filter((m) => m.stage === 'group').slice(0, 4);
  app.MATCHES.forEach((m) => { m.date = '2099-12-01'; m.time = '12:00'; });
  fixtures.forEach((m, i) => { m.date = today; m.time = `${13 + i}:00`; });
  setOfficial(app, s, fixtures[0].num, 3, 0);
  app.setState(s);
  const html = app.todayRailHTML({});
  assert.ok(/home-timeline/.test(html), 'Home schedule uses the compact timeline');
  assert.ok(!/home-upcoming/.test(html), 'Home schedule is not a horizontal upcoming carousel');
  assert.ok(!/Market Odds|MARKET ODDS|fmtAmer/.test(html), 'factual Home schedule contains no odds clutter');
  assert.ok(!html.includes(`openSheet(${fixtures[0].num})`), 'completed fixture excluded from next surfaces');
  assert.ok(html.includes(`openSheet(${fixtures[1].num})`), 'earliest unfinished fixture remains reachable');
}));

test('mobile knockout path renders honest confirmed/projected/pending states without horizontal overflow hooks', () => withApp((app) => {
  const s = resetOfficial(app);
  app.setState(s);
  app.renderBracket();
  const html = app.bracketHTML();
  assert.ok(/id="knockoutPath"/.test(html), 'mobile knockout path is rendered');
  assert.ok(/Pending official final|Projected · As it stands|Confirmed/.test(html), 'path labels distinguish route state honestly');
  assert.ok(!/likely opponent|easier route|harder route|preferred side/i.test(app.mountText(html)), 'path does not invent route-quality claims');
  const css = app.styleText();
  assert.ok(/\.kpath\{[^}]*flex-direction:column/.test(css), 'mobile path is vertical, not a desktop-style horizontal bracket');
  assert.ok(/\.kpath-team\{[^}]*text-overflow:ellipsis/.test(css), 'long labels truncate inside cards');
}));

test('simulation return action restores Play by default and Route when that was the source', () => withApp((app, window) => {
  const s = app.blankState();
  s.mode = 'sim';
  Object.keys(app.GROUPS).forEach((g) => { s.order[g] = app.GROUPS[g].slice(); });
  s.bank = 1000;
  s.bets = [{ id: 'p9-play', num: 1, pick: 'h', stake: 20, odds: 120, settled: false, state: 'pending' }];
  app.setState(s);
  app.setTab('bet');
  app.setBetCat('matches');
  window.ts2Launch(0);
  window.ts2Skip();
  assert.ok(/Back to Play/.test(window.document.getElementById('ts2recap').textContent), 'Play-origin recap returns to Play');
  window.ts2BackToWorldCup();
  assert.equal(app.getBetCat(), 'matches', 'Play return keeps the sensible Play context');

  const s2 = app.blankState();
  s2.mode = 'sim';
  Object.keys(app.GROUPS).forEach((g) => { s2.order[g] = app.GROUPS[g].slice(); });
  s2.bank = 1000;
  s2.ts2Return = { type: 'route', code: 'POR', scroll: 123, when: Date.now() };
  s2.bets = [{ id: 'p9-route', num: 1, pick: 'h', stake: 20, odds: 120, settled: false, state: 'pending' }];
  app.setState(s2);
  window.ts2Launch(0);
  window.ts2Skip();
  assert.ok(/Back to Route/.test(window.document.getElementById('ts2recap').textContent), 'Route-origin recap returns to Route');
}));

test('virtual matchboard is a deterministic visualization of the existing event log only', () => withApp((app, window, ts2) => {
  const leg = sampleLeg();
  const stops = ts2.ts2BuildStops(leg);
  const seqA = stops.map((ev) => ts2.ts2VisualEventState(leg, ev, ev.score || leg.result.score, ev.period || leg.result.period));
  const seqB = stops.map((ev) => ts2.ts2VisualEventState(leg, ev, ev.score || leg.result.score, ev.period || leg.result.period));
  assert.deepEqual(seqA, seqB, 'same event log produces the same visual sequence');
  assert.deepEqual(stops.map((ev) => ev.type), seqA.map((v) => v.type), 'matchboard does not create or remove events');
  const html = ts2.ts2MatchboardHTML(leg, stops[0], stops[0].score, 'first half');
  assert.ok(/ts2-matchboard/.test(html) && /ts2-ball/.test(html), 'matchboard includes a pitch and ball');
  assert.ok(!/player|xG|possession|official/i.test(html), 'matchboard does not invent real-world stats or official claims');
}));

test('Phase 9 cinematic timing, event order, cash-out safety, and mobile stage contract hold', () => withApp((app, window, ts2, errors) => {
  const one = [sampleLeg()];
  const four = [sampleLeg(), sampleLeg(), sampleLeg(), sampleLeg()];
  const oneWatch = ts2.ts2EstimatePlayback(one, 'cinematic');
  const fourWatch = ts2.ts2EstimatePlayback(four, 'cinematic');
  const oneFast = ts2.ts2EstimatePlayback(one, 'fast');
  assert.ok(oneWatch >= 22000 && oneWatch <= 32000, `one-leg Watch live was ${oneWatch}`);
  assert.ok(fourWatch >= 35000 && fourWatch <= 60000, `four-leg Watch live was ${fourWatch}`);
  assert.ok(oneWatch / oneFast >= 3, `Speed up ratio was ${(oneWatch / oneFast).toFixed(2)}x`);
  assert.deepEqual(ts2.ts2BuildStops(sampleLeg()).map((s) => s.type), ['goal', 'halftime', 'red_card', 'goal', 'final_whistle']);

  const s = app.blankState();
  s.mode = 'sim';
  Object.keys(app.GROUPS).forEach((g) => { s.order[g] = app.GROUPS[g].slice(); });
  s.bank = 1000;
  s.bets = [{ id: 'p9-settle', num: 1, pick: 'h', stake: 20, odds: 120, settled: false, state: 'pending' }];
  app.setState(s);
  window.ts2Launch(0);
  assert.ok(window.document.querySelector('#ts2stage .ts2-matchboard'), 'matchboard renders inside the stage');
  assert.ok(window.document.querySelector('#ts2stage .ts2-ball'), 'ball renders inside the stage');
  window.ts2CashOut();
  const confirm = window.document.getElementById('ts2confirm');
  if (confirm) window.ts2CashCancel();
  window.ts2Skip();
  const bank = app.getState().bank;
  window.ts2Replay();
  window.ts2Skip();
  assert.equal(app.getState().bank, bank, 'replay/skip cannot duplicate settlement');
  const css = app.styleText();
  assert.ok(/\.ts2\{[^}]*overflow:hidden/.test(css), 'simulation stage prevents page-level scroll/overflow');
  assert.ok(/\.ts2-matchboard\{[^}]*max-width:370px/.test(css), 'matchboard fits 390px and 430px viewports');
  assert.equal(errors.length, 0, 'no console errors: ' + errors.join(' | '));
}));

test('no raw enums leak through the Phase 9 rendered surfaces', () => withApp((app, window) => {
  prepareFinalGroups(app, { K: { date: '2026-06-25', time: '22:00' } });
  const parts = [
    app.mountText(app.homePrimaryContext().html),
    app.mountText(app.todayRailHTML({})),
    app.mountText(app.finalMatchdayCenterHTML()),
  ];
  app.renderBracket();
  parts.push(app.mountText(app.bracketHTML()));
  parts.forEach((txt, i) => assert.ok(!RAW.test(txt), `raw enum leaked in surface ${i}: ${txt}`));
}));
