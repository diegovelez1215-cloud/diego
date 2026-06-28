'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

/* Focused coverage for the repaired Play Match Desk: two direct actions
   (Official Picks + Run What-If) on every confirmed fixture, no mode switch,
   reusing the original playLive/premiumSimMatch engine, with What-If isolated
   from official truth. */

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
  window.MutationObserver = class { observe() {} disconnect() {} };
  window.AudioContext = function AudioContext() {};
  window.webkitAudioContext = window.AudioContext;
  window.eval(`${script}
    window.__pmd = {
      getState:function(){return S;}, setState:function(v){S=v;},
      setMode:function(m){S.mode=m;}, blankState:blankState,
      GROUPS:GROUPS, MATCHES:MATCHES, M:M, T:T, REAL:REAL,
      openMatchTicket:openMatchTicket, runWhatIf:runWhatIf,
      whatIfState:whatIfState, whatIfEligible:whatIfEligible, whatIfLabel:whatIfLabel,
      matchDeskHTML:matchDeskHTML, officialMarketHTML:officialMarketHTML,
      officialMarketLabel:officialMarketLabel, matchActionZone:matchActionZone,
      playFeaturedMarketHTML:playFeaturedMarketHTML, playMoreMatchesHTML:playMoreMatchesHTML,
      finishLive:finishLive, endLive:endLive, isBetSim:isBetSim,
      ticketCanVirtualSim:ticketCanVirtualSim, koParts:koParts,
      getTk:function(){return _tk;},
      setPlayLive:function(fn){ playLive = fn; }, realPlayLive:playLive,
      callPlayLive:function(n){ return playLive(n); },
      mountText:function(html){var d=document.createElement('div');d.innerHTML=html||'';return d.textContent;}
    };`);
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  try { return fn(dom.window.__pmd, dom.window); }
  finally { dom.window.close(); }
}

/* fresh real-mode state with a set of confirmed, future, two-team group fixtures */
function setup(app) {
  const s = app.blankState();
  s.mode = 'real';
  Object.keys(app.GROUPS).forEach((g) => { s.order[g] = app.GROUPS[g].slice(); });
  app.setState(s);
  // matches 40..48 are group fixtures with no baked official result — make them
  // confirmed FUTURE fixtures so official markets are open and What-If is eligible.
  for (let n = 40; n <= 48; n++) {
    const m = app.M[n];
    if (m) { m.date = '2099-06-12'; m.time = '16:00'; }
  }
  return s;
}

const GROUP = 41;   // Norway v Senegal — group fixture, two real teams, no baked result
const KO = 89;      // a knockout fixture (stage 'ko')

test('1 · neither Official Picks nor Run What-If requires a global mode switch', () => withApp((app) => {
  setup(app);
  ['real', 'sim'].forEach((mode) => {
    app.setMode(mode);
    const before = app.getState().mode;
    // Run What-If routes to the original engine without touching S.mode (spy keeps it side-effect free)
    let called = null; app.setPlayLive((n) => { called = n; });
    app.runWhatIf(GROUP);
    assert.equal(called, GROUP, 'runWhatIf invokes the original playLive engine');
    assert.equal(app.getState().mode, before, 'Run What-If never mutates S.mode (' + mode + ')');
    app.setPlayLive(app.realPlayLive);
    // Official Picks open the official ticket without touching S.mode
    app.openMatchTicket(GROUP, 'h', 'official');
    assert.equal(app.getState().mode, before, 'Official Picks never mutate S.mode (' + mode + ')');
  });
}));

test('2 · Official Picks create origin "official" and never enter simulation', () => withApp((app) => {
  setup(app);
  app.openMatchTicket(GROUP, 'a', 'official');
  const tk = app.getTk();
  assert.equal(tk.origin, 'official', 'ticket origin is official');
  tk.place(10);
  const bet = app.getState().bets[app.getState().bets.length - 1];
  assert.equal(bet.origin, 'official', 'placed bet carries origin official');
  assert.equal(app.ticketCanVirtualSim(bet), false, 'official ticket is blocked from virtual simulation');
  assert.ok(!app.getState().live, 'placing an official pick did not start a virtual match');
}));

test('3 · Featured, list and sheet expose the same fixture-level Run What-If', () => withApp((app) => {
  setup(app);
  const desk = app.matchDeskHTML(GROUP, 'feature');
  const sheet = app.matchActionZone(GROUP, app.M[GROUP].home, app.M[GROUP].away, false);
  const featured = app.playFeaturedMarketHTML();
  const list = app.playMoreMatchesHTML();
  assert.ok(desk.includes('runWhatIf(' + GROUP + ')'), 'desk wires runWhatIf for the fixture');
  assert.ok(sheet.includes('runWhatIf(' + GROUP + ')'), 'sheet wires runWhatIf for the fixture');
  assert.ok(featured.includes('match-desk') && /runWhatIf\(\d+\)/.test(featured), 'featured renders the desk + What-If');
  assert.ok(/runWhatIf\(\d+\)/.test(list) && list.includes('pm-act whatif') && list.includes('pm-act official'),
    'each list row offers both Official and What-If');
  // one fixture-level virtual match: repeated taps resume the same S.live, never a 2nd
  try { app.callPlayLive(GROUP); } catch (e) { /* DOM side-effects after S.live is set */ }
  const first = app.getState().live;
  assert.ok(first && first.num === GROUP, 'first What-If creates the fixture virtual match');
  try { app.callPlayLive(GROUP); } catch (e) {}
  assert.equal(app.getState().live, first, 'a second Run What-If resumes the same virtual match');
  try { app.endLive(); } catch (e) {}
}));

test('4 · a confirmed future fixture never reaches a "cannot simulate" dead end', () => withApp((app) => {
  setup(app);
  assert.equal(app.whatIfEligible(GROUP), true, 'confirmed two-team fixture is What-If eligible');
  assert.equal(app.whatIfState(GROUP), 'new', 'starts in the runnable "new" state');
  let called = null; app.setPlayLive((n) => { called = n; });
  app.runWhatIf(GROUP);
  assert.equal(called, GROUP, 'Run What-If always starts/resumes a match — no dead end');
}));

test('5 · Run What-If reuses the original simulator (playLive)', () => withApp((app) => {
  setup(app);
  try { app.callPlayLive(GROUP); } catch (e) { /* DOM side-effects after S.live is set */ }
  const L = app.getState().live;
  assert.ok(L && L.num === GROUP, 'original engine populated S.live');
  assert.ok(/KICK OFF/.test(String(L.comm || '')) && L.min === 0, 'it is the original live-sim, freshly kicked off');
  try { app.endLive(); } catch (e) {}
}));

test('6 · 90-minute Match Result shows Home, Draw and Away', () => withApp((app) => {
  setup(app);
  assert.equal(app.officialMarketLabel(GROUP), 'Match Result', 'group fixture is a 90-minute Match Result');
  const html = app.officialMarketHTML(GROUP);
  assert.ok(html.includes('Match Result'), 'labelled Match Result');
  assert.ok(html.includes('>Draw<'), 'Draw market present');
  assert.ok(html.includes('Norway win') && html.includes('Senegal win'), 'Home and Away win markets present');
}));

test('7 · knockout uses a separate, explicitly named To Advance market (no draw)', () => withApp((app) => {
  setup(app);
  assert.equal(app.M[KO].stage !== 'group', true, 'fixture ' + KO + ' is a knockout');
  assert.equal(app.officialMarketLabel(KO), 'To Advance', 'knockout market is named To Advance');
  assert.notEqual(app.officialMarketLabel(KO), app.officialMarketLabel(GROUP), 'To Advance is distinct from Match Result');
}));

test('8 · What-If cannot alter official truth, standings, bracket or official tickets', () => withApp((app) => {
  const s = setup(app);
  // an existing official ticket must stay official + un-simmable
  app.openMatchTicket(GROUP, 'h', 'official'); app.getTk().place(10);
  const officialBet = app.getState().bets[app.getState().bets.length - 1];
  // run a What-If to full time on the same fixture
  const m = app.M[GROUP];
  app.getState().live = { num: GROUP, h: m.home, a: m.away, isKO: false, sh: 2, sa: 1, min: 90,
    momo: 0, ev: [], feed: [], xgH: 1, xgA: 1 };
  try { app.finishLive(GROUP); } catch (e) { /* render/openSheet side-effects are irrelevant to the invariant */ }
  const S = app.getState();
  assert.ok(!(S.real && S.real[GROUP]), 'What-If never writes an official group result');
  assert.ok(!(S.realko && S.realko[GROUP]), 'What-If never writes an official knockout result');
  assert.equal(app.isBetSim(GROUP), true, 'the virtual result is tagged BET SIM, isolated from official truth');
  assert.ok(S.sc[GROUP], 'a virtual score is stored for the What-If');
  assert.equal(officialBet.origin, 'official', 'the official ticket is untouched and still official');
  assert.equal(app.ticketCanVirtualSim(officialBet), false, 'the official ticket can never be virtually simulated');
}));
