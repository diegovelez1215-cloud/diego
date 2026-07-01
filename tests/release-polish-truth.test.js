const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

process.env.TZ = 'America/Puerto_Rico';

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
    window.__releasePolish = {
      getState: function(){ return S; },
      setState: function(v){ S = v; },
      blankState: blankState,
      MATCHES: MATCHES,
      GROUPS: GROUPS,
      REAL: REAL,
      M: M,
      gMatches: gMatches,
      homePrimaryContext: homePrimaryContext,
      homeSeen: homeSeen,
      todayRailHTML: todayRailHTML,
      tournamentPulseHomeHTML: tournamentPulseHomeHTML,
      renderHome: renderHome,
      roundShort: roundShort,
      curISO: curISO,
      betTicket: betTicket,
      tkDefaultStake: tkDefaultStake,
      tkUpd: tkUpd,
      sheetEl: function(){ return document.getElementById('sheet'); },
      styleText: function(){ return document.querySelector('style').textContent; },
      functionText: function(name){ return String(window[name] || ''); }
    };`);
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  try { return fn(dom.window.__releasePolish, dom.window); }
  finally { dom.window.close(); }
}

function resetOfficial(app) {
  Object.keys(app.REAL).forEach((k) => delete app.REAL[k]);
  const state = app.blankState();
  state.mode = 'real';
  Object.keys(app.GROUPS).forEach((g) => { state.order[g] = app.GROUPS[g].slice(); });
  app.setState(state);
  return state;
}

function setOfficial(app, state, num, h, a) {
  app.REAL[num] = [h, a];
  state.sc[num] = { h, a };
  state.real[num] = 1;
}

function fillGroupOfficial(app, state, group) {
  const order = app.GROUPS[group];
  app.gMatches(group).forEach((m) => {
    const hi = order.indexOf(m.home);
    const ai = order.indexOf(m.away);
    setOfficial(app, state, m.num, hi < ai ? 2 : 0, hi < ai ? 0 : 2);
  });
}

function prepareScheduledFinalMatchday(app, group = 'K') {
  const state = resetOfficial(app);
  Object.keys(app.GROUPS).forEach((g) => { if (g !== group) fillGroupOfficial(app, state, g); });
  const deciders = app.gMatches(group)
    .slice()
    .sort((a, b) => (a.date === b.date ? a.num - b.num : a.date < b.date ? -1 : 1))
    .slice(-2);
  const deciderNums = new Set(deciders.map((m) => m.num));
  app.gMatches(group).forEach((m) => {
    if (!deciderNums.has(m.num)) setOfficial(app, state, m.num, 1, 0);
  });
  app.setState(state);
  return { state, deciders };
}

test('Home primary final-matchday unit owns both paired fixtures and lower surfaces exclude them', () => withApp((app) => {
  const { deciders } = prepareScheduledFinalMatchday(app, 'K');
  const ctx = app.homePrimaryContext();
  assert.equal(ctx.kind, 'final_matchday');
  assert.deepEqual(ctx.nums.slice().sort((a, b) => a - b), deciders.map((m) => m.num).sort((a, b) => a - b));
  const seen = app.homeSeen(ctx.nums);
  const rail = app.todayRailHTML(seen);
  const pulse = app.tournamentPulseHomeHTML(seen);
  deciders.forEach((m) => {
    assert.ok(!rail.includes(`openSheet(${m.num})`), `rail repeated primary fixture #${m.num}`);
    assert.ok(!pulse.includes(`#${m.num}`), `pulse repeated primary fixture #${m.num}`);
  });
}));

test('Today rail counts all current-day fixtures and never calls a completed match next', () => withApp((app) => {
  const state = resetOfficial(app);
  const today = app.curISO();
  const fixtures = app.MATCHES.slice(0, 4);
  app.MATCHES.forEach((m, i) => { if (!fixtures.includes(m)) m.date = '2099-12-' + String((i % 20) + 1).padStart(2, '0'); });
  fixtures.forEach((m, i) => { m.date = today; m.time = `${12 + i}:00`; });
  setOfficial(app, state, fixtures[0].num, 2, 0);
  app.setState(state);
  const html = app.todayRailHTML({});
  // Daily copy names the full local-day slate, then separately names the remaining
  // fixtures still to play.
  assert.ok(/Later today/.test(html), 'uses the Later today heading while fixtures remain');
  assert.ok(html.includes('4 fixtures today'), 'supporting copy references the full day slate');
  assert.ok(html.includes('3 still to play'), 'supporting copy references only the remaining fixtures');
  assert.ok(!/next fixtures/i.test(html), 'never uses the "next fixtures" phrasing');
  assert.ok(!html.includes(`openSheet(${fixtures[0].num})`), 'completed match excluded from next/upcoming rail');
  assert.ok(html.includes(`openSheet(${fixtures[1].num})`), 'earliest unfinished match remains reachable');
}));

test('Final Matchday fallback uses shared model, never a Group A hardcode', () => withApp((app) => {
  const { deciders } = prepareScheduledFinalMatchday(app, 'K');
  const ctx = app.homePrimaryContext();
  assert.equal(ctx.kind, 'final_matchday');
  assert.ok(ctx.html.includes('Group K'), 'uses the actual next unresolved final-matchday group');
  assert.deepEqual(ctx.nums.slice().sort((a, b) => a - b), deciders.map((m) => m.num).sort((a, b) => a - b));
  assert.ok(!/Group A · simultaneous deciders/.test(ctx.html), 'does not fall back to stale Group A');
}));

test('GRP never renders through the round display helper', () => withApp((app) => {
  assert.equal(app.roundShort(1), 'Group stage');
  assert.ok(!/\bGRP\b/.test(app.roundShort(1)));
}));

test('Ticket rail no longer force-centers with scrollIntoView every render', () => withApp((app) => {
  assert.ok(!/scrollIntoView/.test(app.functionText('ts2RenderRail')), 'rail render does not call scrollIntoView');
  assert.ok(/scrollBy/.test(app.functionText('ts2EnsureActiveLegVisible')), 'active-leg visibility uses bounded scrollBy');
}));

test('Cash Out styles are thumb-zone safe and the stage forbids horizontal overflow', () => withApp((app) => {
  const css = app.styleText();
  assert.ok(/\.ts2-confirm\{[^}]*bottom:calc\(142px/.test(css), 'confirm sheet clears lower cash-out and rail controls');
  assert.ok(/\.ts2\{[^}]*overflow:hidden/.test(css), 'simulation stage blocks page-level overflow');
}));

test('Confetti is not triggered by placement or cash out, only by full ticket wins', () => withApp((app) => {
  assert.ok(!/burst\(/.test(app.functionText('tkPlace')), 'placing a ticket does not trigger confetti');
  assert.ok(!/burst\(/.test(app.functionText('ts2CashConfirm')), 'cash-out confirm does not trigger confetti');
  assert.ok(!/burst\(/.test(app.functionText('ts2RecapCashed')), 'cash-out recap does not trigger confetti');
  assert.ok(/allWon[\s\S]*?ts2ConfettiShouldFire\(t\)\)\{burst\(\)/.test(app.functionText('ts2Recap')), 'full win recap may still celebrate');
}));

test('Stake display separates bankroll, selected stake, and payout, and blocks over-bankroll stake', () => withApp((app, window) => {
  const state = resetOfficial(app);
  state.mode = 'sim';
  state.bank = 15;
  app.setState(state);
  window._lastStake = 1989;
  app.betTicket({
    num: null, line: 'Brazil win', title: 'Brazil v Croatia', odds: 120,
    place() {},
  });
  assert.equal(app.tkDefaultStake(), 15, 'default stake is capped by available bankroll');
  const sheet = app.sheetEl();
  assert.ok(/Available bankroll/.test(sheet.innerHTML));
  assert.ok(/Selected stake/.test(sheet.innerHTML));
  assert.ok(/Potential return/.test(sheet.innerHTML));
  const input = window.document.getElementById('tkStake');
  input.value = '16';
  app.tkUpd();
  assert.ok(/Insufficient simulated balance/.test(window.document.getElementById('tkAlert').textContent));
}));

test('Zero-bankroll slip clearly disables placement', () => withApp((app, window) => {
  const state = resetOfficial(app);
  state.mode = 'sim';
  state.bank = 0;
  app.setState(state);
  app.betTicket({ num: null, line: 'Draw', title: 'Brazil v Croatia', odds: 210, place() {} });
  const input = window.document.getElementById('tkStake');
  const place = window.document.getElementById('tkPlace');
  assert.equal(input.disabled, true, 'stake input disabled when no bankroll is available');
  assert.ok(/No available virtual bankroll/.test(window.document.getElementById('tkAlert').textContent));
  assert.ok(place.classList.contains('dis'), 'place button visibly disabled');
}));
