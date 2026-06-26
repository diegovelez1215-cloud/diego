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
    getImageData() { return { data: new Uint8ClampedArray(24 * 24 * 4) }; },
  });
  window.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
  window.requestAnimationFrame = (fn) => window.setTimeout(fn, 16);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  window.MutationObserver = class MutationObserver { observe() {} disconnect() {} };
  window.AudioContext = function AudioContext() {};
  window.webkitAudioContext = window.AudioContext;
  window.eval(`${script}
    window.__leadersTest = {
      blankState: blankState,
      getState: function(){ return S; },
      setState: function(v){ S = v; },
      premiumSimMatch: premiumSimMatch,
      officialPlayerLeaders: officialPlayerLeaders,
      officialPlayerLeadersHTML: officialPlayerLeadersHTML
    };`);
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  try { return fn(dom.window.__leadersTest, dom.window); }
  finally { dom.window.close(); }
}

test('official player leaders aggregate goals assists and G+A by provider player ID', () => withApp((app) => {
  const data = app.officialPlayerLeaders(
    [
      { player: 'Alex One', team: 'USA', n: 1, playerId: 'p1', eventId: 'g1' },
      { player: 'A. One', team: 'USA', n: 1, playerId: 'p1', eventId: 'g2' },
    ],
    [{ player: 'Alex One', team: 'USA', n: 1, playerId: 'p1', eventId: 'a1' }]
  );
  assert.equal(data.rows[0].goals, 2);
  assert.equal(data.rows[0].assists, 1);
  assert.equal(data.rows[0].ga, 3);
}));

test('duplicate contributor rows do not inflate totals', () => withApp((app) => {
  const data = app.officialPlayerLeaders(
    [
      { player: 'Duplicate Goal', team: 'CAN', n: 1, playerId: 'p2', eventId: 'same-goal' },
      { player: 'Duplicate Goal', team: 'CAN', n: 1, playerId: 'p2', eventId: 'same-goal' },
    ],
    [
      { player: 'Duplicate Goal', team: 'CAN', n: 1, playerId: 'p2', eventId: 'same-assist' },
      { player: 'Duplicate Goal', team: 'CAN', n: 1, playerId: 'p2', eventId: 'same-assist' },
    ]
  );
  assert.equal(data.rows[0].goals, 1);
  assert.equal(data.rows[0].assists, 1);
}));

test('missing assists never create invented assists', () => withApp((app) => {
  const data = app.officialPlayerLeaders(
    [{ player: 'Goal Only', team: 'MEX', n: 2, matchId: 'm1' }],
    []
  );
  assert.equal(data.rows[0].goals, 2);
  assert.equal(data.rows[0].assists, 0);
  assert.equal(data.rows[0].ga, 2);
}));

test('virtual simulations never affect official leaders', () => withApp((app) => {
  const state = app.blankState();
  state.mode = 'sim';
  app.setState(state);
  app.premiumSimMatch(1, { seed: 44 });
  const data = app.officialPlayerLeaders(
    [{ player: 'Official Goal', team: 'USA', n: 1, eventId: 'official-1' }],
    []
  );
  assert.equal(data.rows.length, 1);
  assert.equal(data.rows[0].player, 'Official Goal');
  assert.equal(data.rows[0].goals, 1);
}));

test('stable player-leader sort order works for ties', () => withApp((app) => {
  const data = app.officialPlayerLeaders(
    [
      { player: 'Bravo', team: 'USA', n: 1, eventId: 'b1' },
      { player: 'Alpha', team: 'USA', n: 1, eventId: 'a1' },
    ],
    [
      { player: 'Bravo', team: 'USA', n: 1, eventId: 'b2' },
      { player: 'Alpha', team: 'USA', n: 1, eventId: 'a2' },
    ]
  );
  assert.equal(data.rows.map((r) => r.player).join(','), 'Alpha,Bravo');
}));

test('unavailable contributor source renders honest unavailable state and excludes provisional live rows', () => withApp((app) => {
  const html = app.officialPlayerLeadersHTML([], []);
  assert.match(html, /Official player leaders/);
  assert.match(html, /contributor data is unavailable/);
  const data = app.officialPlayerLeaders(
    [{ player: 'Live Player', team: 'USA', n: 1, provisional: true }],
    []
  );
  assert.equal(data.available, false);
  assert.equal(data.excludedLive, true);
}));
