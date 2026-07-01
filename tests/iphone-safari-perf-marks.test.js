const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

function loadApp(url) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  let fetchCalls = 0;
  let storageWrites = 0;
  const marks = [];
  let rafId = 0;

  Object.defineProperty(window.performance, 'mark', { configurable: true, value: (name) => marks.push(String(name)) });
  Object.defineProperty(window.document, 'hidden', { configurable: true, value: false });
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {}, fillRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillText() {},
    getImageData() { return { data: new Uint8ClampedArray(24 * 24 * 4) }; },
  });
  window.fetch = () => {
    fetchCalls += 1;
    return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve({ configured: true, response: [], finished: [] }) });
  };
  const realSetItem = window.Storage.prototype.setItem;
  Object.defineProperty(window.Storage.prototype, 'setItem', {
    configurable: true,
    writable: true,
    value: function setItemSpy() {
      storageWrites += 1;
      return realSetItem.apply(this, arguments);
    },
  });
  window.scrollTo = () => {};
  window.requestAnimationFrame = (fn) => { rafId += 1; fn(window.performance.now()); return rafId; };
  window.cancelAnimationFrame = () => {};
  window.MutationObserver = class { observe() {} disconnect() {} };
  window.AudioContext = function () {};
  window.webkitAudioContext = window.AudioContext;
  window.document.execCommand = () => true;
  window.eval(script);

  return {
    dom,
    window,
    marks,
    fetchCalls: () => fetchCalls,
    storageWrites: () => storageWrites,
    record: (name) => window.eval(`wcPerfEvent(${JSON.stringify(name)}, { target: "manual" })`),
  };
}

test('perf mode is disabled by default', () => {
  const app = loadApp('http://localhost/');
  try {
    assert.equal(app.window.__wcPerf, undefined);
    assert.equal(app.window.document.getElementById('wcPerfOverlay'), null);
    assert.equal(app.marks.length, 0);
  } finally {
    app.dom.window.close();
  }
});

test('perf mode captures tab traces, caps at 150 events, and has no fetch/storage side effects', () => {
  const app = loadApp('http://localhost/?perf=1');
  try {
    assert.ok(Array.isArray(app.window.__wcPerf));

    const matches = app.window.document.querySelector('.tabbar button[data-screen="matches"]');
    matches.onclick();
    const names = app.window.__wcPerf.map((e) => e.name);
    assert.ok(names.includes('tap received'));
    assert.ok(names.includes('selected state painted'));
    assert.ok(names.includes('content-ready'));
    assert.ok(names.includes('second subsequent frame'));
    assert.ok(names.includes('generic render start'));
    assert.ok(names.includes('generic render end'));
    assert.ok(names.some((name) => name === 'activeViewRender start' || name === 'activeViewRender end'));
    assert.ok(names.some((name) => name === 'screen innerHTML replacement start' || name === 'screen innerHTML replacement end'));
    assert.ok(names.some((name) => name === 'requestAnimationFrame callback start' || name === 'requestAnimationFrame callback end'));
    assert.ok(app.window.__wcPerf.every((e) => typeof e.t === 'number' && typeof e.activeScreen === 'string' && typeof e.activeDomNodes === 'number'));
    assert.ok(app.marks.some((name) => name.startsWith('wc-perf:')));
    assert.ok(app.window.document.getElementById('wcPerfOverlay'));

    app.window.__wcPerf.length = 0;
    for (let i = 0; i < 180; i += 1) app.record(`cap-${i}`);
    assert.equal(app.window.__wcPerf.length, 150);
    assert.equal(app.window.__wcPerf[0].name, 'cap-30');
    assert.equal(app.window.__wcPerf[149].name, 'cap-179');

    const beforeFetch = app.fetchCalls();
    const beforeStorage = app.storageWrites();
    app.record('side-effect-check');
    app.window.document.querySelector('#wcPerfOverlay button').click();
    assert.equal(app.fetchCalls(), beforeFetch);
    assert.equal(app.storageWrites(), beforeStorage);
  } finally {
    app.dom.window.close();
  }
});
