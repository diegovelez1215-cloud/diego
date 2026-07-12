// Match Center dialog accessibility under live truth:
//  • focus enters the sheet on open and the background goes inert;
//  • live provider repaints keep focus on the same logical control;
//  • identical truth repaints leave the DOM completely alone;
//  • when the focused control disappears, focus falls safely inside the dialog;
//  • Escape still closes after repaints and the opener gets focus back;
//  • an invalid or replaced match model closes cleanly — nothing stays inert,
//    focus is never lost on a removed element;
//  • a vanished opener falls back to the active dock tab.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="app">
    <nav><button class="dock-tab" data-tab="home" aria-selected="true">Home</button></nav>
    <button id="opener">Open Match Center</button>
  </div>
</body></html>`, { url: 'https://united2026.test/' });

globalThis.window = dom.window;
globalThis.document = dom.window.document;

const { setClock } = await import('../src/core/time.js');
setClock(() => Date.parse('2026-07-01T13:05:00-04:00'));

const { getState, openMatchCenter, closeMatchCenter, setOverlay } = await import('../src/core/app-state.js');
const { buildOverlay } = await import('../src/core/provider-overlay.js');
const { fullResultsPayload, livePayloadFor } = await import('./mock-provider.mjs');
const { renderMatchCenter } = await import('../src/views/match-center.js');

const RESULTS = fullResultsPayload();
const LIVE = 80;
const overlayAt = (min, gh = 1) => buildOverlay({ results: RESULTS, live: livePayloadFor(LIVE, { gh, ga: 0, min }) });

const opener = document.getElementById('opener');
const key = (el, k) => el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

test('opening moves focus to Close, traps Tab, and inerts the page', () => {
  setOverlay(overlayAt(63));
  opener.focus();
  openMatchCenter(LIVE);
  renderMatchCenter();
  const close = document.querySelector('.mc-close');
  assert.ok(close, 'the sheet rendered');
  assert.equal(document.activeElement, close, 'focus enters the dialog on Close');
  assert.equal(document.getElementById('app').hasAttribute('inert'), true, 'the background is inert');
  assert.equal(document.querySelector('.mc-sheet').getAttribute('aria-modal'), 'true');
  key(close, 'Tab');
  assert.equal(document.activeElement, close, 'the trap keeps focus inside the dialog');
});

test('live repaints preserve the focused logical control', () => {
  const closeBefore = document.querySelector('.mc-close');
  setOverlay(overlayAt(71, 2));
  renderMatchCenter();
  assert.match(document.querySelector('.mc-status').textContent, /71/, 'the sheet shows the new live minute');
  const closeAfter = document.querySelector('.mc-close');
  assert.notEqual(closeBefore, closeAfter, 'markup was rebuilt for the new truth');
  assert.equal(document.activeElement, closeAfter, 'focus stays on the same logical control');
  // an identical repaint must leave the DOM completely alone
  renderMatchCenter();
  assert.equal(document.querySelector('.mc-close'), closeAfter, 'no rebuild when truth is unchanged');
  assert.equal(document.activeElement, closeAfter, 'and focus never even flickers');
});

test('when the focused control disappears, focus falls safely inside the dialog', () => {
  const dialog = document.querySelector('.mc-sheet');
  dialog.focus(); // stands in for a control the new truth removed
  assert.equal(document.activeElement, dialog);
  setOverlay(overlayAt(74, 2));
  renderMatchCenter();
  assert.equal(document.activeElement, document.querySelector('.mc-close'),
    'focus lands on the safe in-dialog fallback, never the page or body');
});

test('Escape closes after repaints and the opener gets focus back', () => {
  key(document.querySelector('.mc-close'), 'Escape');
  renderMatchCenter(); // app.js schedules exactly this off the match-center tag
  assert.equal(getState().nav.matchCenterId, null);
  assert.equal(document.querySelectorAll('.mc-sheet').length, 0);
  assert.equal(document.getElementById('app').hasAttribute('inert'), false, 'the page is interactive again');
  assert.equal(document.activeElement, opener, 'the opener is restored');
});

test('an invalid or replaced match model closes cleanly with focus restored', () => {
  opener.focus();
  openMatchCenter(LIVE);
  renderMatchCenter();
  assert.equal(document.activeElement, document.querySelector('.mc-close'));
  openMatchCenter(999999); // resolves to no model
  renderMatchCenter();
  assert.equal(document.querySelectorAll('.mc-sheet').length, 0, 'the dead dialog is gone');
  assert.equal(document.getElementById('app').hasAttribute('inert'), false, 'nothing stays inert');
  assert.equal(document.activeElement, opener, 'focus is never lost on a removed element');
});

test('an opener replaced by a live repaint still gets focus back by identity', () => {
  // Live repaints rebuild views: the opener NODE dies but its logical control
  // survives. Close must find the equivalent control, not dump focus.
  const stage = document.createElement('div');
  stage.innerHTML = '<button class="ss-open" data-match="80">Match Center</button>';
  document.getElementById('app').appendChild(stage);
  stage.querySelector('.ss-open').focus();
  openMatchCenter(LIVE);
  renderMatchCenter();
  assert.equal(document.activeElement, document.querySelector('.mc-close'));
  // the home view repaints while the sheet is open — same control, new node
  stage.innerHTML = '<button class="ss-open" data-match="80">Match Center</button>';
  closeMatchCenter();
  renderMatchCenter();
  assert.equal(document.activeElement, stage.querySelector('.ss-open'),
    'focus returns to the logical opener, not the dock or the body');
  stage.remove();
});

test('a vanished opener falls back to the active dock tab', () => {
  const ghost = document.createElement('button');
  document.getElementById('app').appendChild(ghost);
  ghost.focus();
  openMatchCenter(LIVE);
  renderMatchCenter();
  ghost.remove();
  closeMatchCenter();
  renderMatchCenter();
  assert.equal(document.activeElement, document.querySelector('.dock-tab'),
    'keyboard users land on the dock, never on a removed element');
});
