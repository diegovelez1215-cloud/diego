'use strict';
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
  window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {}, fillRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillText() {},
    beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {}, stroke() {}, closePath() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    getImageData() { return { data: new Uint8ClampedArray(24 * 24 * 4) }; },
  });
  window.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
  window.requestAnimationFrame = (fn) => window.setTimeout(fn, 16);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  window.scrollTo = () => {};
  window.MutationObserver = class { observe() {} disconnect() {} };
  window.AudioContext = function AudioContext() {};
  window.webkitAudioContext = window.AudioContext;
  window.eval(`${script}
    window.__ticketActions = {
      getState:function(){return S;}, setState:function(v){S=v;}, blankState:blankState,
      GROUPS:GROUPS, MATCHES:MATCHES, M:M, REAL:REAL,
      renderBetting:renderBetting, myBetsHTML:myBetsHTML, openBetRow:openBetRow,
      virtualTicketTargets:virtualTicketTargets, virtualBetMatchNums:virtualBetMatchNums,
      ticketCanVirtualSim:ticketCanVirtualSim, betHasVirtualMatch:betHasVirtualMatch,
      nextOpenActionBet:nextOpenActionBet, canonicalBetState:canonicalBetState,
      tournamentTruthSnapshot:tournamentTruthSnapshot, matchCenterTruth:matchCenterTruth,
      matchDeskHTML:matchDeskHTML, playFeaturedMarketHTML:playFeaturedMarketHTML,
      standings:standings, koParts:koParts, nm:nm,
      ts2Ctx:function(){return _ts2;}, ts2Finalize:ts2Finalize,
      setBetHistory:function(){_betCat='history'; TAB='bet';},
      bettingText:function(){return document.getElementById('betting').textContent;},
      toastText:function(){return document.getElementById('toast').textContent;},
      stageText:function(){var el=document.getElementById('ts2');return el?el.textContent:'';}
    };`);
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  try {
    return fn(dom.window.__ticketActions, dom.window);
  } finally {
    dom.window.close();
  }
}

function reset(app) {
  Object.keys(app.REAL).forEach((k) => { delete app.REAL[k]; });
  const s = app.blankState();
  Object.keys(app.GROUPS).forEach((g) => { s.order[g] = app.GROUPS[g].slice(); });
  s.mode = 'sim';
  s.bank = 10000;
  s.bankHist = [10000];
  app.setState(s);
  return s;
}

function virtualBet(id, num, pick = 'h', stake = 10) {
  return { id, num, pick, stake, odds: 100, settled: false, state: 'pending', origin: 'my_sim', sourceMode: 'sim' };
}

function officialBet(id, num, pick = 'h', stake = 10) {
  return { id, num, pick, stake, odds: -110, settled: false, state: 'pending', origin: 'official', sourceMode: 'sim' };
}

function actionButtons(window) {
  return Array.from(window.document.querySelectorAll('#betting button'))
    .map((b) => ({ text: b.textContent.trim(), onclick: b.getAttribute('onclick') || '' }));
}

test('rendered ticket controls bind only for eligible virtual tickets and show a clear official-only state', () => withApp((app, window) => {
  const s = reset(app);
  s.bets = [officialBet('official-1', 1)];
  app.setState(s);
  app.setBetHistory();
  app.renderBetting();

  const buttons = actionButtons(window);
  assert.equal(buttons.some((b) => /Run next action/i.test(b.text)), false, 'official ticket row does not render a dead Run Next Action');
  assert.equal(buttons.some((b) => /Simulate all/i.test(b.text)), false, 'official-only history does not render a dead Simulate All button');
  assert.match(app.bettingText(), /No virtual match waiting/, 'official-only state explains that no virtual match is waiting');
  assert.equal(app.virtualTicketTargets().length, 0, 'official ticket is excluded from virtual targets');

  const before = JSON.stringify({
    bank: s.bank, bets: s.bets, sc: s.sc, ko: s.ko, real: s.real, realko: s.realko,
    truth: app.tournamentTruthSnapshot(), matchCenter: app.matchCenterTruth(1)
  });
  window.ts2Launch();
  assert.equal(!!window.document.getElementById('ts2'), false, 'no overlay opens when zero virtual tickets are eligible');
  assert.match(app.toastText(), /No virtual match waiting/, 'direct unavailable action reports the non-action state');
  const after = JSON.stringify({
    bank: app.getState().bank, bets: app.getState().bets, sc: app.getState().sc, ko: app.getState().ko,
    real: app.getState().real, realko: app.getState().realko,
    truth: app.tournamentTruthSnapshot(), matchCenter: app.matchCenterTruth(1)
  });
  assert.equal(after, before, 'official truth, ticket history, wallet, bracket, and Match Center are unchanged');
}));

test('Run Next Action launches the visible simulation surface before progression and repeated clicks do not reroll', () => withApp((app, window) => {
  const s = reset(app);
  s.bets = [virtualBet('virtual-1', 1, 'h', 25)];
  app.setState(s);
  app.setBetHistory();
  app.renderBetting();

  const buttons = actionButtons(window);
  const row = buttons.find((b) => /^Run next action$/i.test(b.text));
  assert.ok(row, 'Run Next Action is rendered for the eligible virtual ticket');
  assert.match(row.onclick, /ts2Launch\(0\)/, 'Run Next Action is bound to the real launch behavior');

  window.ts2Launch(0);
  const ctx = app.ts2Ctx();
  assert.ok(ctx, 'launch created the ticket simulation context');
  assert.equal(ctx.targets.length, 1);
  assert.equal(ctx.legs[0].num, 1);
  assert.match(app.stageText(), /SIMULATION/, 'launch surface is visibly marked as simulation');
  assert.match(app.stageText(), new RegExp(app.nm(app.M[1].home)), 'home team is visible at launch');
  assert.match(app.stageText(), new RegExp(app.nm(app.M[1].away)), 'away team is visible at launch');
  assert.match(app.stageText(), /0\s*[:–-]\s*0/, '0-0 is visible before meaningful live progression');
  assert.equal(app.getState().bets[0].settled, false, 'ticket is not settled on the launch frame');

  const score = JSON.stringify(app.getState().sc[1]);
  const nonce = app.getState().simNonce;
  const replayKey = ctx.replayKey;
  window.ts2Launch(0);
  assert.equal(JSON.stringify(app.getState().sc[1]), score, 'second tap does not change the captured outcome');
  assert.equal(app.getState().simNonce, nonce, 'second tap does not allocate another seed');
  assert.equal(app.ts2Ctx().replayKey, replayKey, 'second tap keeps the same replay identity');

  window.ts2Skip();
  const bankAfterSettle = app.getState().bank;
  assert.equal(app.getState().bets[0].settled, true, 'skip settles through the existing path');
  window.ts2Replay();
  window.ts2Skip();
  assert.equal(app.getState().bank, bankAfterSettle, 'replay cannot settle the same ticket twice');
}));

test('Simulate All processes virtual tickets once in order and leaves official tickets untouched', () => withApp((app, window) => {
  const s = reset(app);
  s.bets = [virtualBet('virtual-1', 1, 'h', 10), officialBet('official-1', 3, 'a', 40), virtualBet('virtual-2', 2, 'a', 20)];
  app.setState(s);
  app.setBetHistory();
  app.renderBetting();

  const all = actionButtons(window).find((b) => /Simulate all virtual bets/.test(b.text));
  assert.ok(all, 'Simulate All is rendered when virtual tickets are eligible');
  assert.equal(all.onclick, 'ts2Launch()', 'Simulate All is bound to the shared launch path');
  assert.equal(app.virtualTicketTargets().map((b) => b.id).join(','), 'virtual-1,virtual-2', 'eligible virtual tickets keep deterministic bet order');

  const officialBefore = JSON.stringify(app.getState().bets[1]);
  window.ts2Launch();
  const ctx = app.ts2Ctx();
  assert.equal(ctx.targets.map((b) => b.id).join(','), 'virtual-1,virtual-2', 'official ticket is not queued');
  assert.equal(ctx.legs.map((l) => l.num).join(','), '1,2', 'virtual matches are processed in deterministic order');
  assert.ok(app.getState().sc[1] && app.getState().sc[2], 'virtual match outcomes are captured');
  assert.equal(app.getState().sc[3], undefined, 'official-origin ticket match is not simulated');
  const nonce = app.getState().simNonce;
  const replayKey = ctx.replayKey;
  window.ts2Launch();
  assert.equal(app.getState().simNonce, nonce, 'repeat tap does not create another simulation loop');
  assert.equal(app.ts2Ctx().replayKey, replayKey, 'repeat tap keeps the active run identity');

  window.ts2Skip();
  assert.equal(app.getState().bets[0].settled, true, 'first virtual ticket settled');
  assert.equal(app.getState().bets[2].settled, true, 'second virtual ticket settled');
  assert.equal(JSON.stringify(app.getState().bets[1]), officialBefore, 'official ticket remains unchanged');
  const bank = app.getState().bank;
  app.ts2Finalize();
  assert.equal(app.getState().bank, bank, 'finalize remains idempotent after the all-run settlement');
}));

test('completed virtual results remain stable when reopened and existing truth-critical surfaces stay wired', () => withApp((app, window) => {
  const s = reset(app);
  s.bets = [virtualBet('virtual-1', 1, 'h', 10)];
  app.setState(s);
  app.M[1].date = '2099-06-12';
  app.M[1].time = '16:00';

  const beforeTruth = JSON.stringify(app.tournamentTruthSnapshot().official);
  const desk = app.matchDeskHTML(1, 'feature');
  assert.match(desk, /Run What-If/, 'Match Desk still exposes the existing What-If path');
  assert.match(app.playFeaturedMarketHTML(), /match-desk/, 'Play featured surface still renders the Match Desk');

  window.ts2Launch(0);
  window.ts2Skip();
  const storedScore = JSON.stringify(app.getState().sc[1]);
  const storedBetsim = JSON.stringify(app.getState().betsim);
  app.setBetHistory();
  app.renderBetting();
  assert.equal(JSON.stringify(app.getState().sc[1]), storedScore, 'reopening Play does not change the completed virtual score');
  assert.equal(JSON.stringify(app.getState().betsim), storedBetsim, 'reopening Play preserves the virtual-result marker');
  assert.equal(JSON.stringify(app.tournamentTruthSnapshot().official), beforeTruth, 'official truth remains separate from virtual ticket results');
  assert.equal(app.virtualTicketTargets().length, 0, 'settled completed result is not offered for another run');
}));
