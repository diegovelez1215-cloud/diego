// Navigation purity on a real DOM (jsdom):
//  • a normal tab tap triggers no fetch, no provider refresh, no storage
//    write, no view transition — and never activates an empty screen;
//  • rapid Home → Tournament → Play → You ends on the correct, non-empty tab.
// The rAF harness is truly queued: jobs run only when the test flushes them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
  url: 'https://united2026.test/',
});

// counters BEFORE any app module loads
const counters = { fetch: 0, storageWrites: 0, viewTransitions: 0, rafRan: 0 };
const rafQueue = [];

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.fetch = async () => { counters.fetch++; return { ok: false }; };
dom.window.fetch = globalThis.fetch;
dom.window.document.startViewTransition = () => { counters.viewTransitions++; return { finished: Promise.resolve() }; };
const realSetItem = dom.window.localStorage.setItem.bind(dom.window.localStorage);
dom.window.localStorage.setItem = (k, v) => { counters.storageWrites++; realSetItem(k, v); };

const { setClock } = await import('../src/core/time.js');
setClock(() => Date.parse('2026-07-01T13:00:00-04:00'));

const { setRaf } = await import('../src/navigation/render-scheduler.js');
setRaf((fn) => { rafQueue.push(fn); }); // queued, NEVER immediate

function flushRaf() {
  while (rafQueue.length) { const fn = rafQueue.shift(); counters.rafRan++; fn(); }
}

const router = await import('../src/navigation/router.js');
const { getState, setOverlay } = await import('../src/core/app-state.js');
const { buildOverlay } = await import('../src/core/provider-overlay.js');
const { todayKey } = await import('../src/core/time.js');
const home = await import('../src/views/home.js');
const tournament = await import('../src/views/tournament.js');
const play = await import('../src/views/play.js');
const you = await import('../src/views/you.js');

router.registerView('home', home);
router.registerView('tournament', tournament);
router.registerView('play', play);
router.registerView('you', you);
router.setVersionKey((id) => {
  const s = getState();
  if (id === 'home') return s.real.overlay.version + ':' + todayKey();
  if (id === 'tournament') return s.real.overlay.version + ':' + s.nav.tournamentView + ':' + s.nav.matchesDate;
  return id;
});
router.init(document.getElementById('app'));
flushRaf(); // initial paint only

test('boot leaves every outlet seeded — no blank screens exist at any point', () => {
  for (const id of ['home', 'tournament', 'play', 'you']) {
    assert.ok(router.outletFor(id).innerHTML.trim().length > 40, id + ' outlet is non-empty');
  }
});

test('a normal tab tap is pure: no fetch, no storage write, no view transition, no sync render', () => {
  setOverlay(buildOverlay({ results: { configured: true, sourceStatus: 'fresh', finished: [] } }));
  flushRaf(); // settle data-driven repaints outside the tap
  const f0 = counters.fetch; const s0 = counters.storageWrites; const v0 = counters.viewTransitions;
  const jobsBefore = rafQueue.length;

  router.activate('tournament');

  assert.equal(counters.fetch, f0, 'no fetch during tap');
  assert.equal(counters.storageWrites, s0, 'no localStorage write during tap');
  assert.equal(counters.viewTransitions, v0, 'no startViewTransition during tap');
  assert.equal(getState().nav.tab, 'tournament');
  const outlet = router.outletFor('tournament');
  assert.equal(outlet.classList.contains('active'), true, 'tab activates synchronously');
  assert.ok(outlet.innerHTML.trim().length > 40, 'prior/seed content visible — never blank');
  assert.ok(rafQueue.length >= jobsBefore, 'render work deferred to the queued rAF');
  flushRaf();
  assert.ok(outlet.innerHTML.includes('Tournament'), 'content lands after the frame');
  assert.equal(counters.fetch, f0, 'still no fetch after render');
  assert.equal(counters.storageWrites, s0, 'still no storage write after render');
});

test('warm revisit repaints nothing: cached version short-circuits', () => {
  router.activate('home'); flushRaf();
  const painted = router.outletFor('home').innerHTML;
  router.activate('tournament'); flushRaf();
  const jobs0 = rafQueue.length;
  router.activate('home'); // warm: same overlay version
  assert.equal(rafQueue.length, jobs0, 'no render job enqueued for a warm tab');
  assert.equal(router.outletFor('home').innerHTML, painted, 'cached DOM survives');
});

test('rapid Home → Tournament → Play → You ends on a correct, non-empty You', () => {
  const f0 = counters.fetch; const s0 = counters.storageWrites;
  router.activate('home');
  router.activate('tournament');
  router.activate('play');
  router.activate('you');
  // No frame has run yet — the last tap already owns the screen.
  assert.equal(getState().nav.tab, 'you');
  const active = [...document.querySelectorAll('.outlet.active')];
  assert.equal(active.length, 1, 'exactly one active outlet');
  assert.equal(active[0].dataset.tab, 'you');
  assert.ok(active[0].innerHTML.trim().length > 40, 'never blank mid-sequence');
  flushRaf();
  assert.ok(active[0].innerHTML.includes('Saved simulations'), 'You content renders');
  assert.equal(counters.fetch, f0, 'zero fetches across the whole sequence');
  assert.equal(counters.storageWrites, s0, 'zero storage writes across the whole sequence');
});

test('dock reflects the active tab for assistive tech', () => {
  const selected = [...document.querySelectorAll('.dock-tab[aria-selected="true"]')];
  assert.equal(selected.length, 1);
  assert.equal(selected[0].dataset.tab, 'you');
});
