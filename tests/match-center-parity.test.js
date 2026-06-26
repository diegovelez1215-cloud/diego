const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

// Focused tests for the Official Match Center score-parity fix (Phase 17).
// The Match Center must render from the SAME existing official/live truth the
// fixture cards read — never an invented score, and updating in place on a
// truth refresh without closing the sheet or resetting scroll.

function loadApp() {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {}, fillRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillText() {},
    getImageData() { return { data: new Uint8ClampedArray(24 * 24 * 4) }; },
  });
  window.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
  window.requestAnimationFrame = (fn) => fn();
  window.cancelAnimationFrame = () => {};
  window.MutationObserver = class { observe() {} disconnect() {} };
  window.AudioContext = function () {};
  window.webkitAudioContext = window.AudioContext;
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  window.eval(`${script}
    window.__mc = {
      S:function(){return S;}, setState:function(v){S=v;}, blankState:blankState,
      REAL:REAL, M:M, MATCHES:MATCHES, sheet:sheet, render:render,
      activeMode:activeMode, matchCenterTruth:matchCenterTruth,
      refreshMatchCenterTruth:refreshMatchCenterTruth,
      openSheetNum:function(){return _openSheetNum;},
      sheetText:function(){return document.getElementById('sheet').textContent||'';},
      scoreText:function(){var e=document.getElementById('mcScoreVal');return e?(e.textContent||''):null;},
      scrimOn:function(){return document.getElementById('scrim').classList.contains('on');},
      doc:document
    };`);
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  try { return fn(dom.window.__mc, dom.window); } finally { dom.window.close(); }
}

// Fresh factual (real-mode) state with all official containers cleared.
function freshReal(app) {
  Object.keys(app.REAL).forEach((k) => delete app.REAL[k]);
  const s = app.blankState();
  s.mode = 'real';
  app.setState(s);
  return s;
}

// First group-stage fixture (num <= 72).
function groupNum(app) {
  return app.MATCHES.find((m) => m.stage === 'group').num;
}

const FAKE = /\bsimulat|\bpossession\b|\bdanger\b|player position|player tracking|ball movement|heat ?map|\bvirtual\b/i;

test('a live source-derived score renders the SAME score inside Match Center', () => withApp((app) => {
  const s = freshReal(app);
  const n = groupNum(app);
  s.rwState = { [n]: { kind: 'live', sh: 1, sa: 0, min: 52, label: 'IN_PLAY', status: 'IN_PLAY' } };
  app.setState(s);
  app.sheet(n);
  // The fixture-card source for this match is sh:1 sa:0 → Match Center must match.
  assert.equal(app.scoreText(), '1–0');
  assert.match(app.sheetText(), /Live · provisional/);
}));

test('a factual final renders its final score and "Final" inside Match Center', () => withApp((app) => {
  const s = freshReal(app);
  const n = groupNum(app);
  app.REAL[n] = [2, 1];
  s.sc[n] = { h: 2, a: 1 };
  s.real[n] = 1;
  app.setState(s);
  app.sheet(n);
  assert.equal(app.scoreText(), '2–1');
  assert.equal(app.matchCenterTruth(n).statusText, 'Final');
  assert.match(app.sheetText(), /Final/);
}));

test('a scheduled fixture invents no score (no 0–0)', () => withApp((app) => {
  const s = freshReal(app);
  const n = groupNum(app);
  app.setState(s);
  app.sheet(n);
  const sc = app.scoreText();
  assert.notEqual(sc, '0–0');
  assert.equal(/\d–\d/.test(sc), false, `scheduled score should be a placeholder, got "${sc}"`);
  const t = app.matchCenterTruth(n);
  assert.equal(t.phase, 'scheduled');
  assert.equal(t.score, null);
}));

test('an unavailable/hold fixture with no source score invents no score', () => withApp((app) => {
  const s = freshReal(app);
  const n = groupNum(app);
  s.rwState = { [n]: { kind: 'hold', label: 'Postponed', status: 'PST' } };
  app.setState(s);
  app.sheet(n);
  const sc = app.scoreText();
  assert.equal(/\d–\d/.test(sc), false, `hold with no score must not show digits, got "${sc}"`);
  assert.equal(app.matchCenterTruth(n).score, null);
}));

test('a live truth refresh updates the score IN PLACE without closing the sheet or rebuilding it', () => withApp((app) => {
  const s = freshReal(app);
  const n = groupNum(app);
  app.setState(s);
  app.sheet(n);                         // open as scheduled
  assert.equal(app.scrimOn(), true);
  assert.equal(app.openSheetNum(), n);
  // Mark the sheet container; if refresh rebuilt the whole sheet the mark is lost.
  app.doc.getElementById('sheet').dataset.keepmark = 'kept';

  // New official live truth arrives, then the standard render path runs.
  const cur = app.S();
  cur.rwState = { [n]: { kind: 'live', sh: 0, sa: 2, min: 70, label: 'IN_PLAY', status: 'IN_PLAY' } };
  app.setState(cur);
  app.refreshMatchCenterTruth();

  assert.equal(app.scoreText(), '0–2');                 // updated in place
  assert.equal(app.scrimOn(), true);                    // sheet stayed open
  assert.equal(app.openSheetNum(), n);                  // same surface
  assert.equal(app.doc.getElementById('sheet').dataset.keepmark, 'kept'); // not rebuilt
}));

test('the Official Match Center never shows virtual/simulation/possession/danger/tracking language', () => withApp((app) => {
  const s = freshReal(app);
  const n = groupNum(app);
  // live
  s.rwState = { [n]: { kind: 'live', sh: 1, sa: 1, min: 30, label: 'IN_PLAY', status: 'IN_PLAY' } };
  app.setState(s);
  app.sheet(n);
  assert.equal(FAKE.test(app.sheetText()), false, 'live Match Center leaked fake-data language');
  // final
  const s2 = app.S();
  delete s2.rwState[n];
  app.REAL[n] = [3, 0];
  s2.sc[n] = { h: 3, a: 0 };
  s2.real[n] = 1;
  app.setState(s2);
  app.sheet(n);
  assert.equal(FAKE.test(app.sheetText()), false, 'final Match Center leaked fake-data language');
}));
