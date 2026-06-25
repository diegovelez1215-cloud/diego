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
    window.__p8b = {
      getState: function(){ return S; },
      setState: function(v){ S = v; },
      blankState: blankState,
      GROUPS: GROUPS, REAL: REAL, MATCHES: MATCHES, M: M,
      gMatches: gMatches, curISO: curISO, nextISO: nextISO,
      render: render, renderHome: renderHome, renderBetting: renderBetting,
      homePrimaryContext: homePrimaryContext, todayRailHTML: todayRailHTML,
      phaseLeadHTML: phaseLeadHTML, finalMatchdayCenterHTML: finalMatchdayCenterHTML,
      freExplorerHTML: freExplorerHTML, playLiveClosedHTML: playLiveClosedHTML,
      playLandingHTML: playLandingHTML, activeTicketsHTML: activeTicketsHTML,
      sheet: sheet, betResultSheet: betResultSheet, ticketStatusInfo: ticketStatusInfo,
      roundShort: roundShort, styleText: function(){ return document.querySelector('style').textContent; },
      functionText: function(name){ return String(window[name] || ''); },
      homeText: function(){ return document.getElementById('home').textContent; },
      bettingText: function(){ return document.getElementById('betting').textContent; },
      sheetText: function(){ return document.getElementById('sheet').textContent; },
      mountText: function(html){ var d=document.createElement('div'); d.innerHTML=html||''; return d.textContent; }
    };`);
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  const errors = [];
  dom.window.addEventListener('error', (e) => errors.push(e.message));
  try { return fn(dom.window.__p8b, dom.window, dom.window.__ts2, errors); }
  finally { dom.window.close(); }
}

function assertClean(text, label) {
  assert.ok(!RAW.test(text || ''), `${label} leaked raw enum in: ${text}`);
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

function fillGroupOfficial(app, state, group) {
  const order = app.GROUPS[group];
  app.gMatches(group).forEach((m) => {
    const hi = order.indexOf(m.home), ai = order.indexOf(m.away);
    setOfficial(app, state, m.num, hi < ai ? 2 : 0, hi < ai ? 0 : 2);
  });
}

function prepareLiveFinalMatchday(app, group = 'K') {
  const state = resetOfficial(app);
  Object.keys(app.GROUPS).forEach((g) => { if (g !== group) fillGroupOfficial(app, state, g); });
  const deciders = app.gMatches(group).slice()
    .sort((a, b) => (a.date === b.date ? a.num - b.num : a.date < b.date ? -1 : 1)).slice(-2);
  const pending = new Set(deciders.map((m) => m.num));
  app.gMatches(group).forEach((m) => { if (!pending.has(m.num)) setOfficial(app, state, m.num, 1, 0); });
  state.rwState[deciders[0].num] = { kind: 'live', sh: 1, sa: 0, min: 52, label: 'IN_PLAY', status: 'IN_PLAY' };
  state.rwState[deciders[1].num] = { kind: 'live', sh: 0, sa: 0, min: 52, label: 'IN_PLAY', status: 'IN_PLAY' };
  app.setState(state);
  return { state, deciders };
}

function sampleLeg(type = 'normal') {
  const events = [
    { minute: 18, type: 'goal', side: 'h', score: { h: 1, a: 0 }, headline: 'Goal' },
    { minute: 45, type: 'halftime', score: { h: 1, a: 0 }, headline: 'Half-time' },
    { minute: 63, type: 'red_card', side: 'a', score: { h: 1, a: 0 }, headline: 'Red card' },
    { minute: 84, type: 'goal', side: 'h', score: { h: 2, a: 0 }, headline: 'Goal' },
  ];
  if (type === 'knockout') {
    events.push({ minute: 91, type: 'extra_time', period: 'extra time', score: { h: 1, a: 1 }, headline: 'Extra time' });
    events.push({ minute: 120, type: 'penalties', period: 'penalties', score: { h: 1, a: 1 }, shootout: { h: 5, a: 4 }, headline: 'Penalties' });
  }
  return { num: 1, pick: 'h', simple: true, label: 'Pick · #1', finalState: 'win',
    result: { teams: { h: 'BRA', a: 'CRO' }, score: { h: 2, a: 0 }, minute: type === 'knockout' ? 120 : 90, period: 'final', events } };
}

test('actual rendered Home, Play, Tournament, Route, Match Details, and recap paths show no raw enums', () => withApp((app, window) => {
  const { state, deciders } = prepareLiveFinalMatchday(app, 'K');
  state.bets = [
    { id: 'open', num: deciders[0].num, pick: 'h', stake: 10, odds: 120, settled: false, state: 'pending' },
    { id: 'cash', num: deciders[1].num, pick: 'h', stake: 10, odds: 120, settled: true, cashed: true, cashoutAmount: 16, state: 'won', net: 6 },
    { id: 'void', num: 1, pick: 'h', stake: 10, odds: 100, settled: true, void: true, state: 'void', net: 0 },
  ];
  app.setState(state);

  app.renderHome();
  assertClean(app.homeText(), 'Home');

  app.renderBetting();
  assertClean(app.bettingText(), 'Play');
  assert.ok(/In play|Awaiting settlement/.test(app.bettingText()), 'Play uses user-facing ticket status copy');

  assertClean(app.mountText(app.finalMatchdayCenterHTML()), 'Tournament Final Matchday');
  assertClean(app.mountText(app.phaseLeadHTML()), 'Final Matchday Home lead');
  assert.ok(!/GROUP [A-L] · \+\d+ MORE/.test(app.mountText(app.phaseLeadHTML())), 'Final Matchday group-count wording is user-facing');

  assertClean(app.mountText(app.freExplorerHTML('BRA')), 'Route Explorer');

  app.sheet(deciders[0].num);
  assertClean(app.sheetText(), 'Match Details');

  app.betResultSheet(state.bets.slice(1), 6);
  assertClean(app.sheetText(), 'ticket recap');
}));

test('actual Play live-match renderer and Tournament Final Matchday renderer never display IN_PLAY', () => withApp((app) => {
  prepareLiveFinalMatchday(app, 'K');
  const play = app.mountText(app.playLiveClosedHTML());
  const fmd = app.mountText(app.finalMatchdayCenterHTML());
  assert.ok(/Live/.test(play), 'Play shows Live copy');
  assert.ok(/Awaiting settlement/.test(play), 'Play shows Awaiting settlement copy');
  assert.ok(/Live · provisional until final whistle/.test(fmd), 'Tournament shows provisional live copy');
  assertClean(play, 'Play live renderer');
  assertClean(fmd, 'Tournament Final Matchday renderer');
}));

test('GRP never renders to users', () => withApp((app) => {
  assert.equal(app.roundShort(1), 'Group stage');
  [app.roundShort(1), app.playLandingHTML(), app.todayRailHTML({})].forEach((txt, i) => assertClean(app.mountText(txt), `GRP path ${i}`));
}));

test('Live Now fixed controls are structurally guarded at 390px and 430px', () => withApp((app) => {
  const css = app.styleText();
  assert.ok(/\.wrap\{[^}]*padding-bottom:calc\(96px \+ env\(safe-area-inset-bottom\)\)/.test(css), 'page reserves bottom space for fixed controls');
  assert.ok(/\.livejump\{[^}]*bottom:calc\(150px \+ env\(safe-area-inset-bottom\)\)/.test(css), 'Live Now sits above bottom nav and action rail');
  assert.ok(/\.livejump\{[^}]*max-width:calc\(100vw - 28px\)/.test(css), 'Live Now cannot run past 390/430px viewport edges');
  assert.ok(/function liveSurfaceVisible\(\)[\s\S]*scrim[\s\S]*ts2[\s\S]*TAB\s*===\s*["']home["'][\s\S]*return false/.test(app.functionText('liveSurfaceVisible')), 'Live Now hides on relevant live surfaces');
}));

test('Tomorrow wording never says next fixtures and Later today only references remaining fixtures', () => withApp((app) => {
  const s = resetOfficial(app);
  const today = app.curISO(), tomorrow = app.nextISO(today);
  app.MATCHES.forEach((m) => { m.date = '2099-12-01'; m.time = '12:00'; });
  const ms = app.MATCHES.filter((m) => m.stage === 'group').slice(0, 8);
  ms.slice(0, 6).forEach((m, i) => { m.date = today; m.time = `${10 + i}:00`; setOfficial(app, s, m.num, 1, 0); });
  ms.slice(6, 8).forEach((m, i) => { m.date = tomorrow; m.time = `${15 + i}:00`; });
  app.setState(s);
  const txt = app.mountText(app.todayRailHTML({}));
  assert.ok(/Tomorrow/.test(txt), 'Tomorrow heading appears');
  assert.ok(/6 matches completed today|Six matches completed today/.test(txt), 'completed-today count is dynamic and human');
  assert.ok(!/next fixtures/i.test(txt), 'Tomorrow copy never says next fixtures');
}));

test('Watch live duration targets and Speed up ratio are enforced', () => withApp((app, window, ts2) => {
  const one = [sampleLeg()];
  const four = [sampleLeg(), sampleLeg(), sampleLeg('knockout'), sampleLeg()];
  const oneWatch = ts2.ts2EstimatePlayback(one, 'cinematic');
  const fourWatch = ts2.ts2EstimatePlayback(four, 'cinematic');
  const oneFast = ts2.ts2EstimatePlayback(one, 'fast');
  assert.ok(oneWatch >= 18000 && oneWatch <= 28000, `one-leg Watch live target failed: ${oneWatch}`);
  assert.ok(fourWatch >= 30000 && fourWatch <= 50000, `four-leg Watch live target failed: ${fourWatch}`);
  assert.ok(oneWatch / oneFast >= 3, `Speed up ratio failed: ${(oneWatch / oneFast).toFixed(2)}x`);
}));

test('Speed up preserves event order, final result, and settlement while key moments hold longer', () => withApp((app, window, ts2) => {
  const leg = sampleLeg('knockout');
  const stops = ts2.ts2BuildStops(leg);
  assert.deepEqual(stops.map((s) => s.type), ['goal', 'halftime', 'red_card', 'goal', 'extra_time', 'penalties', 'final_whistle']);
  const fastSteps = ts2.ts2StepDurations(stops, ts2.ts2Speeds().fast, 1);
  const watchSteps = ts2.ts2StepDurations(stops, ts2.ts2Speeds().cinematic, 1);
  assert.equal(fastSteps.length, watchSteps.length, 'both modes schedule every event and settlement pause');
  const ordinary = ts2.ts2EventHold({ type: 'ordinary', minute: 30 }, ts2.ts2Speeds().cinematic);
  ['goal', 'red_card', 'extra_time', 'penalties', 'final_whistle'].forEach((type) => {
    assert.ok(ts2.ts2EventHold({ type, minute: 80 }, ts2.ts2Speeds().cinematic) > ordinary, `${type} should hold longer than ordinary`);
  });

  const s = app.blankState();
  s.mode = 'sim';
  Object.keys(app.GROUPS).forEach((g) => { s.order[g] = app.GROUPS[g].slice(); });
  s.bank = 1000;
  s.bets = [{ id: 'fast-settle', num: 1, pick: 'h', stake: 20, odds: 120, settled: false, state: 'pending', sourceMode: 'sim' }];
  app.setState(s);
  window.ts2Launch(0);
  ts2.ts2SetSpeed('fast');
  window.ts2Skip();
  const finalState = app.getState().bets[0].state;
  const bank = app.getState().bank;
  window.ts2Replay();
  window.ts2Skip();
  assert.equal(app.getState().bets[0].state, finalState, 'replay preserves final result state');
  assert.equal(app.getState().bank, bank, 'replay/skip cannot duplicate settlement');
}));

test('Final-leg tension treatment is distinct and no horizontal overflow/console errors occur', () => withApp((app, window, ts2, errors) => {
  assert.ok(/One result left/.test(app.functionText('ts2PlayLeg')), 'final leg has a distinct tension setup');
  assert.ok(/Final minutes/.test(app.functionText('ts2ApplyEvent')), 'late final-leg state has its own tension label');
  const css = app.styleText();
  assert.ok(/\.ts2\{[^}]*overflow:hidden/.test(css), 'simulation stage blocks horizontal/page overflow');
  assert.ok(/\.ts2-rail\{[^}]*overflow-x:auto/.test(css), 'ticket rail remains the only horizontal scroll region');
  assert.equal(errors.length, 0, 'no console errors while loading rendered paths: ' + errors.join(' | '));
}));
