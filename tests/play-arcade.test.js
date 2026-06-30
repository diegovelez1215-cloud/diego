/* Phase C focused proofs — Play arcade loop.
 *
 *  1. virtual cash-out is available throughout an active simulation after kickoff,
 *     locked only during event resolution, and gone before kickoff / after settle
 *  2. Matchcast pace: Broadcast breathes, Quick fast-forwards, speed is settable
 *  3. My World Cup is a working private mode that never mutates official truth
 *  4. starting My World Cup enters My-Sim and marks the run started
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

function loadApp() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {}, fillRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillText() {},
    getImageData() { return { data: new Uint8ClampedArray(2304) }; },
  });
  window.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
  window.requestAnimationFrame = (fn) => window.setTimeout(fn, 16);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  window.MutationObserver = class { observe() {} disconnect() {} };
  window.AudioContext = function () {};
  window.webkitAudioContext = window.AudioContext;
  window.eval(`${script}
    window.__app = {
      getState:function(){return S;}, setState:function(v){S=v;}, blankState:blankState,
      MATCHES:MATCHES, GROUPS:GROUPS, REAL:REAL, M:M, T:T, gMatches:gMatches, koParts:koParts,
      simSpeed:simSpeed, liveTickMs:liveTickMs, setSimSpeed:setSimSpeed,
      lvCashAvailable:lvCashAvailable, lvCashLocked:lvCashLocked, lvOpenCashTickets:lvOpenCashTickets, liveCashVal:liveCashVal,
      myCupStart:myCupStart, myCupReset:myCupReset, myCupClearSandbox:myCupClearSandbox, myCupStarted:myCupStarted,
      playRankStats:playRankStats, winner:winner
    };`);
  return dom;
}
function withApp(fn) { const dom = loadApp(); try { return fn(dom.window.__app, dom.window); } finally { dom.window.close(); } }
function reset(app) {
  Object.keys(app.REAL).forEach((k) => delete app.REAL[k]);
  const s = app.blankState(); s.mode = 'sim';
  Object.keys(app.GROUPS).forEach((g) => { s.order[g] = app.GROUPS[g].slice(); });
  app.setState(s); return s;
}

// ---- 1. cash-out availability throughout an active simulation ---------------
test('virtual cash-out is available after kickoff, locked during events, gone before kickoff and after settle', () => withApp((app) => {
  const s = reset(app);
  // an open What-If ticket on match 5, simulation running at minute 30
  s.bets = [{ id: 1, num: 5, pick: 'h', stake: 100, odds: 150, settled: false, state: 'pending', sourceMode: 'sim', virtualChallenge: true }];
  s.live = { num: 5, h: 'BRA', a: 'JPN', min: 30, sh: 0, sa: 0, isKO: false };
  app.setState(s);
  assert.equal(app.lvCashAvailable(5), true, 'cash-out is available mid-match even at 0–0 (not only after goals)');
  assert.equal(app.lvCashLocked(), false, 'not locked during normal play');
  assert.ok(app.liveCashVal(s.bets[0]) >= 0, 'a cash-out value is computed every tick');

  // during an event-resolution lock (VAR), the button is present but locked
  s.live.varReview = 3; app.setState(s);
  assert.equal(app.lvCashLocked(), true, 'cash-out locks briefly while an event resolves');

  // before kickoff (no live sim) → unavailable
  s.live = null; app.setState(s);
  assert.equal(app.lvCashAvailable(5), false, 'no cash-out before kickoff');

  // after settlement → unavailable
  s.live = { num: 5, min: 30 }; s.bets[0].settled = true; app.setState(s);
  assert.equal(app.lvCashAvailable(5), false, 'no cash-out once the ticket is settled');
}));

// ---- 2. Matchcast pace controls --------------------------------------------
test('Matchcast pace: Broadcast breathes, Quick fast-forwards, and speed is settable', () => withApp((app) => {
  const s = reset(app); app.setState(s);
  app.setSimSpeed('broadcast');
  assert.equal(app.simSpeed(), 'broadcast');
  const broadcast = app.liveTickMs({ min: 20 });
  app.setSimSpeed('quick');
  assert.equal(app.simSpeed(), 'quick');
  const quick = app.liveTickMs({ min: 20 });
  assert.ok(broadcast > quick, 'Broadcast is slower per simulated minute than Quick');
  // a normal Broadcast match lands in a satisfying window (~35–50s over 90 minutes)
  app.setSimSpeed('broadcast');
  const perMin = app.liveTickMs({ min: 20 });
  const approxSeconds = (perMin * 90) / 1000;
  assert.ok(approxSeconds >= 30 && approxSeconds <= 55, 'a full Broadcast match is roughly 35–50s, got ' + approxSeconds.toFixed(1) + 's');
  // half-time gets a longer beat
  assert.ok(app.liveTickMs({ min: 45 }) > app.liveTickMs({ min: 20 }), 'half-time pauses longer');
}));

// ---- 3. My World Cup never mutates official truth --------------------------
test('My World Cup clears only the private sandbox and never mutates official truth', () => withApp((app) => {
  const s = reset(app);
  // official truth
  app.REAL[88] = [2, 1];
  app.REAL[5] = [1, 0];
  s.real = { 5: 1 }; s.sc = { 5: { h: 1, a: 0 } };
  s.realko = { 88: 'AUS' };
  s.officialKOFixtures = { 78: { home: 'CIV', away: 'NOR', source: 'official_provider_fixture' } };
  // private sim picks
  s.ko = { 90: 'GER' }; s.sc[6] = { h: 3, a: 1 }; s.betsim = { 6: 1 };
  app.setState(s);

  app.myCupClearSandbox();
  const st = app.getState();
  assert.deepEqual(app.REAL[88], [2, 1], 'official REAL knockout score untouched');
  assert.deepEqual(app.REAL[5], [1, 0], 'official REAL group score untouched');
  assert.equal(st.real[5], 1, 'official result flag preserved');
  assert.deepEqual(st.sc[5], { h: 1, a: 0 }, 'official group result preserved in the sandbox');
  assert.equal(st.realko[88], 'AUS', 'official knockout winner untouched');
  assert.ok(st.officialKOFixtures[78], 'official provider fixture untouched');
  // private sim picks are gone
  assert.equal(st.ko[90], undefined, 'private knockout picks cleared');
  assert.equal(st.sc[6], undefined, 'private group sim cleared');
}));

// ---- 4. starting My World Cup is a working mode ----------------------------
test('starting My World Cup enters My-Sim and marks the run started, official intact', () => withApp((app) => {
  const s = reset(app);
  app.REAL[88] = [2, 1]; s.realko = { 88: 'AUS' };
  app.setState(s);
  app.myCupStart();
  const st = app.getState();
  assert.equal(st.mode, 'sim', 'My World Cup runs in My-Sim mode');
  assert.equal(app.myCupStarted(), true, 'the private run is marked started');
  assert.deepEqual(app.REAL[88], [2, 1], 'official truth still intact after starting a private run');
  assert.equal(st.realko[88], 'AUS', 'official knockout winner still intact');
}));
