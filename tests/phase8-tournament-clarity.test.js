const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

process.env.TZ = 'America/Puerto_Rico';

// Phase 8 — Tournament Clarity & Play Matchday Experience.
// Loads the real app and surfaces the actual functions/data this release touches.
function loadApp() {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const RealDate = window.Date;
  const fixedNow = new RealDate('2026-06-30T12:00:00-04:00').getTime();
  window.Date = class extends RealDate {
    constructor(...args) { return args.length ? new RealDate(...args) : new RealDate(fixedNow); }
    static now() { return fixedNow; }
    static parse(v) { return RealDate.parse(v); }
    static UTC(...args) { return RealDate.UTC(...args); }
  };
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
    window.__p8 = {
      getState: function(){ return S; },
      setState: function(v){ S = v; },
      blankState: blankState,
      GROUPS: GROUPS, REAL: REAL, MATCHES: MATCHES, M: M, T: T,
      gMatches: gMatches, curISO: curISO, nextISO: nextISO, matchDay: matchDay,
      homePrimaryContext: homePrimaryContext, homeSeen: homeSeen,
      todayRailHTML: todayRailHTML, tournamentPulseHomeHTML: tournamentPulseHomeHTML, renderHome: renderHome,
      pickemList: pickemList, pickemHTML: pickemHTML,
      pickemOpenTodayCount: pickemOpenTodayCount, pickemTomorrowCount: pickemTomorrowCount,
      freMomentsHTML: freMomentsHTML, freExplorerHTML: freExplorerHTML,
      matchNightActive: matchNightActive, matchNightModel: matchNightModel, matchNightHTML: matchNightHTML,
      functionText: function(name){ return String(window[name] || ''); },
      styleText: function(){ return document.querySelector('style').textContent; },
      homeHTML: function(){ return document.getElementById('home').innerHTML; }
    };`);
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  const errors = [];
  dom.window.addEventListener('error', (e) => errors.push(e.message));
  try { return fn(dom.window.__p8, dom.window, dom.window.__ts2, errors); }
  finally { dom.window.close(); }
}

function freshSim(app) {
  const s = app.blankState();
  s.mode = 'sim';
  Object.keys(app.GROUPS).forEach((g) => { s.order[g] = app.GROUPS[g].slice(); });
  s.bank = 1000;
  app.setState(s);
  return s;
}

// move every fixture out of the way so date-based home/pickem logic is deterministic
function parkAllFixtures(app, iso = '2099-12-01') {
  app.MATCHES.forEach((m, i) => { m.date = iso; m.time = '12:00'; });
}

// ---- shared final-matchday scaffolding (ported from the release-polish suite) ----
function resetOfficial(app) {
  Object.keys(app.REAL).forEach((k) => delete app.REAL[k]);
  const state = app.blankState();
  state.mode = 'real';
  Object.keys(app.GROUPS).forEach((g) => { state.order[g] = app.GROUPS[g].slice(); });
  app.setState(state);
  return state;
}
function setOfficial(app, state, num, h, a) { app.REAL[num] = [h, a]; state.sc[num] = { h, a }; state.real[num] = 1; }
function fillGroupOfficial(app, state, group) {
  const order = app.GROUPS[group];
  app.gMatches(group).forEach((m) => {
    const hi = order.indexOf(m.home); const ai = order.indexOf(m.away);
    setOfficial(app, state, m.num, hi < ai ? 2 : 0, hi < ai ? 0 : 2);
  });
}
function prepareScheduledFinalMatchday(app, group = 'K') {
  const state = resetOfficial(app);
  Object.keys(app.GROUPS).forEach((g) => { if (g !== group) fillGroupOfficial(app, state, g); });
  const deciders = app.gMatches(group).slice()
    .sort((a, b) => (a.date === b.date ? a.num - b.num : a.date < b.date ? -1 : 1)).slice(-2);
  const set = new Set(deciders.map((m) => m.num));
  app.gMatches(group).forEach((m) => { if (!set.has(m.num)) setOfficial(app, state, m.num, 1, 0); });
  app.setState(state);
  return { state, deciders };
}

/* ===================== 1 · Route Explorer cleanup ===================== */

test('Route Explorer shows no implied ticket / payout state even with a settled winning bet', () => withApp((app) => {
  const s = freshSim(app);
  s.bets = [{ id: 'w', num: 1, pick: 'h', stake: 100, odds: 150, settled: true, win: true, net: 150, state: 'won' }];
  app.setState(s);
  const moments = app.freMomentsHTML('BRA');
  assert.ok(!/Ticket won/.test(moments), 'no implied "Ticket won" moment');
  assert.ok(!/\+\$/.test(moments), 'no virtual payout figure leaks into Route Explorer');
  const sheet = app.freExplorerHTML('BRA');
  assert.ok(!/Ticket won/.test(sheet) && !/Virtual payout/.test(sheet), 'explorer body free of ticket/payout state');
  assert.ok(!/active-ticket/.test(sheet), 'explorer never uses active-ticket styling');
}));

test('Route Explorer exposes exactly one quiet optional Play hand-off', () => withApp((app, window, ts2, errors) => {
  const s = freshSim(app);
  app.setState(s);
  const sheet = app.freExplorerHTML('BRA');
  assert.ok(/Build a virtual slip from this route/.test(sheet), 'quiet optional action present');
  const matches = sheet.match(/Build a virtual slip from this route/g) || [];
  assert.equal(matches.length, 1, 'exactly one virtual-slip action');
  assert.equal(errors.length, 0, 'no console errors building the explorer: ' + errors.join(' | '));
}));

test('Route action opens Play deliberately and never auto-creates a ticket', () => withApp((app, window, ts2, errors) => {
  const s = freshSim(app);
  s.bets = [];
  s.slip = [];
  app.setState(s);
  window.freBuildSlip('BRA');
  assert.equal(app.getState().bets.length, 0, 'no bet created by the route action');
  assert.equal((app.getState().slip || []).length, 0, 'no slip leg created by the route action');
  assert.equal(errors.length, 0, 'no console errors from the hand-off: ' + errors.join(' | '));
}));

/* ===================== 2 · Home hierarchy & dynamic language ===================== */

test('Home uses "Later today" when unfinished fixtures remain today', () => withApp((app) => {
  const s = freshSim(app);
  app.setState(s);
  parkAllFixtures(app);
  const today = app.curISO();
  app.MATCHES.filter((m) => m.stage === 'group').slice(0, 2).forEach((m, i) => { m.date = today; m.time = `${15 + i}:00`; });
  const html = app.todayRailHTML({});
  assert.ok(/Later today/.test(html), 'labels the section "Later today"');
  assert.ok(!/Tomorrow/.test(html), 'no Tomorrow section when none scheduled tomorrow');
}));

test('Home uses "Tomorrow" when nothing remains today but fixtures exist tomorrow', () => withApp((app) => {
  const s = freshSim(app);
  app.setState(s);
  parkAllFixtures(app);
  const tomorrow = app.nextISO(app.curISO());
  app.MATCHES.filter((m) => m.stage === 'group').slice(0, 2).forEach((m, i) => { m.date = tomorrow; m.time = `${15 + i}:00`; });
  const html = app.todayRailHTML({});
  assert.ok(/Tomorrow/.test(html), 'labels the section "Tomorrow"');
  assert.ok(!/Later today/.test(html), 'never shows an empty "Later today"');
}));

test('Home shows separate Later today and Tomorrow sections when both exist', () => withApp((app) => {
  const s = freshSim(app);
  app.setState(s);
  parkAllFixtures(app);
  const today = app.curISO(); const tomorrow = app.nextISO(today);
  const grp = app.MATCHES.filter((m) => m.stage === 'group');
  grp.slice(0, 2).forEach((m, i) => { m.date = today; m.time = `${15 + i}:00`; });
  grp.slice(2, 4).forEach((m, i) => { m.date = tomorrow; m.time = `${15 + i}:00`; });
  const html = app.todayRailHTML({});
  assert.ok(/Later today/.test(html), 'has a Later today section');
  assert.ok(/Tomorrow/.test(html), 'has a separate Tomorrow section');
}));

test('Completed fixtures never appear as next/upcoming', () => withApp((app) => {
  const s = freshSim(app);
  const today = app.curISO();
  parkAllFixtures(app);
  const fx = app.MATCHES.filter((m) => m.stage === 'group').slice(0, 3);
  fx.forEach((m, i) => { m.date = today; m.time = `${14 + i}:00`; });
  // first one is officially complete
  s.sc[fx[0].num] = { h: 2, a: 0 }; s.real[fx[0].num] = 1; app.REAL[fx[0].num] = [2, 0];
  app.setState(s);
  const html = app.todayRailHTML({});
  assert.ok(!html.includes(`openSheet(${fx[0].num})`), 'completed fixture excluded from upcoming');
  assert.ok(html.includes(`openSheet(${fx[1].num})`), 'earliest unfinished fixture remains reachable');
}));

test('No duplicate primary fixture appears across Home surfaces', () => withApp((app) => {
  const s = freshSim(app);
  app.setState(s);
  const ctx = app.homePrimaryContext();
  assert.ok(ctx.nums && ctx.nums.length, 'a primary fixture exists');
  const num = ctx.nums[0];
  const seen = app.homeSeen(ctx.nums);
  assert.ok(!app.todayRailHTML(seen).includes(`openSheet(${num})`), 'rail does not repeat the hero fixture');
  assert.ok(!app.tournamentPulseHomeHTML(seen).includes(`openSheet(${num})`), 'pulse does not repeat the hero fixture');
  app.renderHome();
  const occ = (app.homeHTML().match(new RegExp(`openSheet\\(${num}\\)`, 'g')) || []).length;
  assert.ok(occ <= 1, `hero fixture appears at most once across Home (saw ${occ})`);
}));

test('Final Matchday uses the shared model and never falls back to stale Group A', () => withApp((app) => {
  const { deciders } = prepareScheduledFinalMatchday(app, 'K');
  const ctx = app.homePrimaryContext();
  assert.equal(ctx.kind, 'final_matchday');
  assert.ok(/Group K/.test(ctx.html), 'uses the real next final-matchday group');
  assert.ok(!/Group A · simultaneous deciders/.test(ctx.html), 'no stale Group A fallback');
  assert.deepEqual(ctx.nums.slice().sort((a, b) => a - b), deciders.map((m) => m.num).sort((a, b) => a - b));
}));

/* ===================== 3 · Daily Pick'em clarity ===================== */

test('Daily Pick\'em contains only unfinished local-day fixtures', () => withApp((app) => {
  const s = freshSim(app);
  const today = app.curISO(); const tomorrow = app.nextISO(today);
  parkAllFixtures(app);
  const grp = app.MATCHES.filter((m) => m.stage === 'group');
  const openToday = grp[0]; const doneToday = grp[1]; const tomo = grp[2];
  openToday.date = today; openToday.time = '15:00';
  doneToday.date = today; doneToday.time = '12:00';
  tomo.date = tomorrow; tomo.time = '15:00';
  s.sc[doneToday.num] = { h: 1, a: 0 }; s.real[doneToday.num] = 1; app.REAL[doneToday.num] = [1, 0];
  app.setState(s);
  const list = app.pickemList();
  list.forEach((m) => assert.equal(app.matchDay(m), today, 'every Pick\'em fixture is today'));
  assert.ok(!list.some((m) => m.num === tomo.num), 'tomorrow fixture excluded from the list');
  const html = app.pickemHTML();
  assert.ok(html.includes(`pickem(${openToday.num},`), 'open today fixture is playable');
  assert.ok(!html.includes(`pickem(${doneToday.num},`), 'completed today fixture is not playable');
  assert.ok(!html.includes(`pickem(${tomo.num},`), 'tomorrow fixture is never playable');
}));

test('Tomorrow stays a preview only, even when nothing remains today', () => withApp((app) => {
  const s = freshSim(app);
  const today = app.curISO(); const tomorrow = app.nextISO(today);
  parkAllFixtures(app);
  const grp = app.MATCHES.filter((m) => m.stage === 'group');
  const tomo1 = grp[0]; const tomo2 = grp[1];
  [tomo1, tomo2].forEach((m, i) => { m.date = tomorrow; m.time = `${15 + i}:00`; });
  app.setState(s);
  assert.equal(app.pickemOpenTodayCount(), 0, 'no open fixtures today');
  assert.ok(app.pickemTomorrowCount() >= 2, 'tomorrow fixtures counted');
  const html = app.pickemHTML();
  assert.ok(/Tomorrow’s picks open after today’s final match/.test(html), 'shows the tomorrow preview line');
  assert.ok(!html.includes(`pickem(${tomo1.num},`) && !html.includes(`pickem(${tomo2.num},`), 'tomorrow fixtures are preview-only');
}));

/* ===================== 4 · Matchday pacing ===================== */

function sampleLeg(window) {
  const res = {
    teams: { h: 'BRA', a: 'CRO' }, score: { h: 2, a: 0 }, minute: 90, period: 'final', shootout: null, advancingTeam: null,
    events: [
      { minute: 22, type: 'goal', side: 'h', score: { h: 1, a: 0 }, headline: 'Goal' },
      { minute: 61, type: 'red_card', side: 'a', score: { h: 1, a: 0 }, headline: 'Red card' },
      { minute: 84, type: 'goal', side: 'h', score: { h: 2, a: 0 }, headline: 'Goal' },
    ],
  };
  return { num: 1, pick: 'h', simple: true, label: 'Pick · #1', result: res, finalState: 'win' };
}

test('Speed up is at least 2.5x faster real playback than Watch live', () => withApp((app, window, ts2) => {
  const legs = [sampleLeg(window)];
  const cine = ts2.ts2EstimatePlayback(legs, 'cinematic');
  const fast = ts2.ts2EstimatePlayback(legs, 'fast');
  assert.ok(cine > 0 && fast > 0, 'both modes produce a positive duration');
  assert.ok(cine / fast >= 2.5, `Speed up must be >=2.5x faster (got ${(cine / fast).toFixed(2)}x)`);
}));

test('Speed up preserves event order and the full event set', () => withApp((app, window, ts2) => {
  const lg = sampleLeg(window);
  const stops = ts2.ts2BuildStops(lg);
  const mins = stops.map((s) => s.minute);
  assert.deepEqual(mins, mins.slice().sort((a, b) => a - b), 'stops are minute-ordered');
  assert.equal(stops[stops.length - 1].type, 'final_whistle', 'closing whistle is last');
  // speed never changes which events play (no skipped goals/cards/whistle)
  const fastSteps = ts2.ts2StepDurations(stops, ts2.ts2Speeds().fast);
  const cineSteps = ts2.ts2StepDurations(stops, ts2.ts2Speeds().cinematic);
  assert.equal(fastSteps.length, cineSteps.length, 'same number of scheduled steps at both speeds');
  assert.equal(fastSteps.length, stops.length + 1, 'every event plus the settle pause is scheduled');
}));

test('Speed up still settles the wallet exactly once', () => withApp((app, window, ts2, errors) => {
  const s = freshSim(app);
  s.bets = [{ id: 'f1', num: 1, pick: 'h', stake: 20, odds: 120, settled: false, state: 'pending' }];
  app.setState(s);
  window.ts2Launch(0);
  ts2.ts2SetSpeed('fast');
  window.ts2Skip();
  assert.equal(app.getState().bets[0].settled, true, 'bet settled after fast skip');
  const bank = app.getState().bank;
  window.ts2Replay();
  window.ts2Skip();
  assert.equal(app.getState().bank, bank, 'replay never re-settles the wallet');
  assert.equal(errors.length, 0, 'no console errors during fast playback: ' + errors.join(' | '));
}));

/* ===================== 5 · Rail & Cash Out ===================== */

test('Ticket rail never scrolls continuously and only nudges the active leg into view', () => withApp((app) => {
  const ensure = app.functionText('ts2EnsureActiveLegVisible');
  assert.ok(/railTouchedAt/.test(ensure), 'respects manual scrolling');
  assert.ok(/scrollBy/.test(ensure), 'uses a bounded scrollBy');
  assert.ok(/\.left|\.right/.test(ensure), 'aligns the active card edges so it is fully visible');
  const renderRail = app.functionText('ts2RenderRail');
  assert.ok(!/scrollIntoView/.test(renderRail), 'rail render never force-centers via scrollIntoView');
  assert.ok(!/setInterval/.test(renderRail) && !/setInterval/.test(ensure), 'no interval-driven auto-scroll');
}));

test('Only the ticket rail is a horizontal scroller and the stage blocks page overflow', () => withApp((app) => {
  const css = app.styleText();
  assert.ok(/\.ts2\{[^}]*overflow:hidden/.test(css), 'simulation stage blocks page-level overflow');
  assert.ok(/\.ts2\{[^}]*max-width:100%/.test(css), 'simulation stage cannot overflow horizontally');
  assert.ok(/\.ts2-rail\{[^}]*overflow-x:auto/.test(css), 'the rail is the horizontal scroll region');
}));

test('Cash Out sits in the lower thumb zone, above the rail, and stays reachable', () => withApp((app) => {
  const css = app.styleText();
  assert.ok(/\.ts2-cashwrap\{[^}]*flex:0 0 auto/.test(css), 'cash-out wrap is always laid out (never collapsed away)');
  assert.ok(/\.ts2-confirm\{[^}]*bottom:calc\(142px/.test(css), 'confirm clears the lower cash-out + rail controls at 390/430px');
  const stageMarkup = app.functionText('ts2OpenStage');
  const iCash = stageMarkup.indexOf('ts2cash');
  const iRail = stageMarkup.indexOf('ts2rail');
  const iStage = stageMarkup.indexOf('ts2stage');
  assert.ok(iStage < iCash && iCash < iRail, 'cash-out is mounted below the stage and above the rail');
}));

/* ===================== 6 · Post-simulation navigation ===================== */

test('Completed simulation offers source-aware return actions and hides the old completed actions', () => withApp((app, window, ts2, errors) => {
  const s = freshSim(app);
  s.bets = [{ id: 'r1', num: 1, pick: 'h', stake: 25, odds: 130, settled: false, state: 'pending' }];
  app.setState(s);
  window.ts2Launch(0);
  window.ts2Skip();
  const recap = window.document.getElementById('ts2recap');
  assert.ok(recap, 'recap shown after completion');
  const txt = recap.textContent;
  assert.ok(/Back to Play/.test(txt), 'Back to Play primary action present');
  assert.ok(/Return to What-If Match selection\./.test(txt), 'supporting copy present');
  assert.ok(/New slip/.test(txt) && /World Cup Home/.test(txt) && /Replay/.test(txt), 'New slip, World Cup Home and Replay present');
  assert.ok(!/Run it back/.test(txt), 'Run it back removed');
  assert.ok(!/Edit slip/.test(txt) && !/Edit ticket/.test(txt), 'Edit slip removed');
  assert.ok(!/Reset to live/.test(txt), 'Reset to live removed');
  assert.equal(errors.length, 0, 'no console errors through completion: ' + errors.join(' | '));
}));

/* ===================== 8 · Knockout Night foundation ===================== */

test('Match Night activates only for real, undecided knockout fixtures', () => withApp((app) => {
  const s = freshSim(app);
  app.setState(s);
  assert.equal(app.matchNightModel(1), null, 'group fixtures are not a Match Night');
  assert.ok(app.matchNightModel(73), 'an upcoming knockout fixture is a Match Night');
  const s2 = app.getState();
  s2.realko[73] = 'BRA';
  app.setState(s2);
  assert.equal(app.matchNightModel(73), null, 'a decided knockout fixture is no longer a Match Night');
}));

test('Match Night never invents official score, opponent, stats, or commentary', () => withApp((app) => {
  const s = freshSim(app);
  app.setState(s);
  const mn = app.matchNightModel(73);
  assert.equal(mn.score, null, 'no score before an official live feed');
  assert.equal(mn.live, false, 'not live without a live feed');
  assert.equal(mn.nextOpponentState, 'pending', 'no confirmed opponent until the sibling tie is official');
  assert.ok(/Winner reaches the Round of 16\./.test(mn.stakes), 'plain-English stakes line from bracket math');
  const html = app.matchNightHTML(73);
  assert.ok(!/mn-sc/.test(html), 'no score element rendered without a feed');
  assert.ok(!/mn-ticket/.test(html), 'no ticket-like UI when the user holds no ticket');
  const forbidden = /\b(xG|possession|momentum|win probability|commentator|odds)\b/i;
  assert.ok(!forbidden.test(html), 'no fake stats / momentum / commentary leak');
}));

test('Match Night reflects only official live data and a confirmed sibling opponent', () => withApp((app) => {
  const s = freshSim(app);
  s.realko[75] = 'ARG'; // sibling feeder of QF #90 decided -> confirmed next opponent
  s.rwState = { 73: { kind: 'live', sh: 1, sa: 0, label: "LIVE 57'" } };
  app.setState(s);
  const mn = app.matchNightModel(73);
  assert.equal(mn.live, true, 'reads the official live feed');
  assert.ok(mn.score && mn.score.h === 1 && mn.score.a === 0, 'score mirrors the feed exactly');
  assert.equal(mn.nextOpponentState, 'confirmed', 'confirmed opponent only from the decided sibling tie');
  assert.equal(mn.nextOpponent, 'ARG');
  const html = app.matchNightHTML(73);
  assert.ok(/Winner meets Argentina/.test(html), 'renders the confirmed opponent');
}));

test('Match Night surfaces a Play ticket summary only when the user truly holds one', () => withApp((app) => {
  const s = freshSim(app);
  app.setState(s);
  assert.ok(!/mn-ticket/.test(app.matchNightHTML(73)), 'no ticket summary without an active ticket');
  const s2 = app.getState();
  s2.bets = [{ id: 't1', num: 73, pick: 'h', stake: 50, odds: 140, settled: false, state: 'pending' }];
  app.setState(s2);
  const mn = app.matchNightModel(73);
  assert.ok(mn.ticket && mn.ticket.legs === 1, 'ticket summary appears for an active relevant ticket');
  assert.ok(/mn-ticket/.test(app.matchNightHTML(73)), 'ticket-aware UI only with a real ticket');
}));
