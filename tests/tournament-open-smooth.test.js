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
  window.__offsetReads = 0;
  Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get() {
      window.__offsetReads += 1;
      return 390;
    },
  });
  window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {}, fillRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillText() {},
    getImageData() { return { data: new Uint8ClampedArray(24 * 24 * 4) }; },
  });
  window.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
  window.requestAnimationFrame = (fn) => { fn(); return 1; };
  window.cancelAnimationFrame = () => {};
  window.MutationObserver = class MutationObserver { observe() {} disconnect() {} };
  window.AudioContext = function AudioContext() {};
  window.webkitAudioContext = window.AudioContext;
  window.scrollTo = () => {};
  window.eval(`${script}
    window.__tournamentSmoothTest = {
      switchTo:function(tab){TAB=tab;switchTab(true);render();},
      resetOffsetReads:function(){window.__offsetReads=0;},
      offsetReads:function(){return window.__offsetReads;},
      scheduleText:function(){return document.getElementById('schedule').textContent;},
      isMatchesOn:function(){return document.getElementById('scr-matches').classList.contains('on');}
    };`);
  return dom;
}

test('Tournament tab activation avoids forced layout while rendering Matches content', () => {
  const dom = loadApp();
  try {
    const app = dom.window.__tournamentSmoothTest;
    app.resetOffsetReads();
    app.switchTo('schedule');
    assert.equal(app.isMatchesOn(), true);
    assert.equal(app.offsetReads(), 0);
    assert.match(app.scheduleText(), /All matches/);
    assert.match(app.scheduleText(), /Mexico|World Cup|Group/i);
  } finally {
    dom.window.close();
  }
});
