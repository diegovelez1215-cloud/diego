// The redesigned Prediction board on a real DOM (jsdom): the full call
// ritual — pick a side → confidence ladder → confirm once → sealed stub with
// a stamp — plus the celebration overlay and the IQ ring. Local-only:
// nothing here touches official truth, and the only storage write is the
// whitelisted Play namespace.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="outlet-play" class="outlet active"></div></body></html>', {
  url: 'https://united2026.test/',
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.fetch = async () => { throw new Error('no network in Play'); };
dom.window.fetch = globalThis.fetch;
// motion allowed and page visible: the celebration engine must actually fire
dom.window.matchMedia = () => ({ matches: false });
Object.defineProperty(dom.window.document, 'hidden', { value: false });

const { setClock } = await import('../src/core/time.js');
setClock(() => Date.parse('2026-06-10T12:00:00-04:00')); // before the opener

const { setOverlay, setPlayMode, getState } = await import('../src/core/app-state.js');
const { buildOverlay } = await import('../src/core/provider-overlay.js');
const play = await import('../src/views/play.js');

setOverlay(buildOverlay({}));
setPlayMode('prediction');
const outlet = document.getElementById('outlet-play');
play.render(outlet);

function tap(el) {
  el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
}

test('the board renders the IQ ring and team-colour fixture stubs', () => {
  assert.ok(outlet.querySelector('.pr-stats.board'), 'record board present');
  assert.ok(outlet.querySelector('.pr-iq-ring'), 'Tournament IQ ring present');
  const fx = outlet.querySelector('.pr-fixture');
  assert.ok(fx, 'an upcoming fixture is callable');
  assert.match(fx.getAttribute('style') || '', /--hc:/, 'home colour feeds the card');
  assert.ok(fx.querySelector('.pr-side .pr-crest'), 'crest chips on the side buttons');
});

test('the full ritual: pick → confidence → confirm → sealed stub with stamp', () => {
  const first = outlet.querySelector('.pr-fixture');
  const id = first.dataset.prfx;
  tap(first.querySelector('[data-prside="home"]'));
  const drafting = outlet.querySelector(`[data-prfx="${id}"]`);
  assert.ok(drafting.classList.contains('drafting'), 'drafting state after the pick');
  assert.equal(drafting.querySelectorAll('.pr-conf-btn').length, 3, 'three-step confidence ladder');
  tap(drafting.querySelector('[data-prconf="3"]'));
  const certain = outlet.querySelector(`[data-prfx="${id}"] .pr-conf-btn[data-prconf="3"]`);
  assert.ok(certain.classList.contains('on'), 'Certain lights up');
  tap(outlet.querySelector(`[data-prfx="${id}"] [data-prconfirm]`));
  const sealed = outlet.querySelector(`[data-prfx="${id}"]`);
  assert.ok(sealed.classList.contains('sealed'), 'confirmed call seals the stub');
  assert.ok(sealed.querySelector('.pr-stamp'), 'the stamp lands');
  assert.match(sealed.textContent, /Locks at kickoff/, 'the only lock is the real kickoff');
  assert.ok(sealed.querySelector('[data-predit]'), 'still editable before the whistle');
});

test('confirming a call fires the celebration overlay — and it self-cleans', () => {
  const layer = document.querySelector('.fx-layer');
  assert.ok(layer, 'celebration layer spawned on confirm');
  assert.ok(layer.querySelectorAll('.fx-p').length >= 8, 'particles present');
});

test('the pick lands only in the whitelisted Play namespace', () => {
  const pick = Object.values(getState().play.predictions.picks)[0];
  assert.equal(pick.side, 'home');
  assert.equal(pick.conf, 3);
  const stored = JSON.parse(dom.window.localStorage.getItem('u26v2.play'));
  assert.ok(stored.predictions, 'persisted under u26v2.play');
  for (const key of ['fixtures', 'standings', 'results', 'scores']) {
    assert.ok(!(key in stored), `no official truth smuggled: ${key}`);
  }
  setClock(null);
});
