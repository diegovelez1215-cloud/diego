// United 2026 — verified assist flow, end to end on the real app boot.
// Boots src/app.js (real refresh loop, real router, real Stats view) in jsdom
// and walks one browser session through the provider sequence a fan actually
// hits: error at boot, verified payload, refreshed verified payload, then a
// stale fallback and an error fallback. Proves:
//   • verified assist values reach the Assists card unchanged;
//   • a refreshed verified payload rerenders the card;
//   • G+A stays a correct merge of the two verified lists;
//   • degraded payloads never erase verified leaders and never masquerade
//     as fresh — the unavailable state appears only when nothing verified
//     has ever arrived.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
  url: 'https://united2026.test/',
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
Object.defineProperty(globalThis, 'location', { value: dom.window.location, configurable: true });
globalThis.localStorage = dom.window.localStorage;
dom.window.matchMedia = dom.window.matchMedia || (() => ({ matches: false, addEventListener() {} }));
globalThis.matchMedia = dom.window.matchMedia;

// Controllable wall clock — app.js reads Date.now() for its refresh policy.
const BASE = Date.parse('2026-07-01T17:05:00Z');
let offset = 0;
Date.now = () => BASE + offset;

// The app's poll timers must not keep the test process alive.
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => { const t = realSetTimeout(fn, ms, ...a); if (t && t.unref) t.unref(); return t; };

const GOALS = [
  { player: 'A Player', team: 'Mexico', n: 4 },
  { player: 'B Player', team: 'France', n: 3 },
];
const ASSISTS_V1 = [
  { player: 'C Creator', team: 'Argentina', n: 5 },
  { player: 'D Distributor', team: 'Japan', n: 3 },
];
const ASSISTS_V2 = [
  { player: 'E Engine', team: 'Brazil', n: 6 },
  { player: 'C Creator', team: 'Argentina', n: 5 },
];

let scorersPayload = null; // set per phase
globalThis.fetch = async (url) => {
  const u = String(url);
  const ok = (json) => ({ ok: true, json: async () => json });
  if (u.includes('/api/scorers')) return ok(scorersPayload);
  if (u.includes('/api/results')) return ok({ configured: true, sourceStatus: 'fresh', isStale: false, finished: [], live: [], hold: [], scheduled: [] });
  if (u.includes('/api/live')) return ok({ configured: true, sourceStatus: 'fresh', isStale: false, response: [], finished: [], hold: [], scheduled: [] });
  return ok({});
};
dom.window.fetch = globalThis.fetch;

const { setRaf } = await import('../src/navigation/render-scheduler.js');
const rafQueue = [];
setRaf((fn) => rafQueue.push(fn));
const flush = () => { while (rafQueue.length) rafQueue.shift()(); };

const { setClock } = await import('../src/core/time.js');
setClock(() => Date.now());

// Phase 0 payload must be in place before boot (app.js fetches on import).
scorersPayload = { configured: true, error: true, errorCategory: 'provider_error', fetchedAt: '2026-07-01T17:05:00Z', sourceStatus: 'error', goals: [], assists: [] };
await import('../src/app.js');
await new Promise((r) => realSetTimeout(r, 30));
flush();

const { getState, setTournamentView } = await import('../src/core/app-state.js');
const router = await import('../src/navigation/router.js');

router.activate('tournament');
flush();
setTournamentView('stats');
flush();

function card(name) {
  const cards = [...router.outletFor('tournament').querySelectorAll('.stats-card')];
  const el = cards.find((c) => c.querySelector('h3') && c.querySelector('h3').textContent === name);
  assert.ok(el, name + ' card exists');
  return el.textContent.replace(/\s+/g, ' ').trim();
}

/** Advance past every refresh clock and trigger the visibility-return refresh. */
async function refreshWith(payload) {
  scorersPayload = payload;
  offset += 16 * 60 * 1000;
  document.dispatchEvent(new dom.window.Event('visibilitychange'));
  await new Promise((r) => realSetTimeout(r, 30));
  flush();
}

test('error payload at boot: honest unavailable, nothing invented, no fresh stamp', () => {
  const s = getState().real.stats;
  assert.equal(s.providerState, 'unavailable');
  assert.equal(s.fetchedAt, null, 'a wiped screen is never stamped as updated');
  assert.deepEqual(s.goals, []);
  assert.deepEqual(s.assists, []);
  assert.match(card('Assists'), /Official assist data is unavailable/);
  assert.match(card('Goals + assists'), /one of the two is unavailable/);
});

test('verified payload: assist values reach the Assists card unchanged', async () => {
  await refreshWith({ configured: true, sourceStatus: 'fresh', isStale: false, fetchedAt: '2026-07-01T17:21:00Z', goals: GOALS, assists: ASSISTS_V1 });
  assert.deepEqual(getState().real.stats.assists, ASSISTS_V1, 'state holds provider values verbatim');
  const html = card('Assists');
  assert.match(html, /1 C Creator .*Argentina 5/);
  assert.match(html, /2 D Distributor .*Japan 3/);
});

test('verified payload: G+A is the exact merge of verified goals and assists', () => {
  const ga = card('Goals + assists');
  assert.match(ga, /1 C Creator 0g · 5a/);
  assert.match(ga, /2 A Player 4g · 0a/);
  assert.match(ga, /Combined from the verified goal and assist leader lists/);
});

test('refreshed verified payload rerenders the Assists card', async () => {
  await refreshWith({ configured: true, sourceStatus: 'fresh', isStale: false, fetchedAt: '2026-07-01T17:37:00Z', goals: GOALS, assists: ASSISTS_V2 });
  const html = card('Assists');
  assert.match(html, /1 E Engine .*Brazil 6/);
  assert.match(html, /2 C Creator .*Argentina 5/);
  assert.doesNotMatch(html, /D Distributor/, 'old assist rows do not linger');
  assert.equal(getState().real.stats.fetchedAt, '2026-07-01T17:37:00Z');
});

test('stale fallback never erases verified leaders and keeps the honest stamp', async () => {
  await refreshWith({ configured: true, sourceStatus: 'stale-fallback', isStale: true, error: true, fetchedAt: '2026-07-01T17:37:00Z', goals: [], assists: [] });
  const s = getState().real.stats;
  assert.equal(s.providerState, 'stale');
  assert.equal(s.fetchedAt, '2026-07-01T17:37:00Z', 'stamp still belongs to the data on screen');
  assert.deepEqual(s.assists, ASSISTS_V2, 'verified assists survive a degraded refresh');
  assert.match(card('Assists'), /E Engine/);
});

test('error fallback never erases verified leaders and never claims freshness', async () => {
  await refreshWith({ configured: true, error: true, errorCategory: 'provider_error', fetchedAt: '2026-07-01T18:09:00Z', sourceStatus: 'error', goals: [], assists: [] });
  const s = getState().real.stats;
  assert.equal(s.providerState, 'stale');
  assert.equal(s.fetchedAt, '2026-07-01T17:37:00Z', 'error time never becomes the update stamp');
  assert.deepEqual(s.assists, ASSISTS_V2);
  assert.match(card('Assists'), /E Engine/);
  assert.match(card('Top scorers'), /A Player/);
});

test('next verified payload recovers normally after a degraded stretch', async () => {
  await refreshWith({ configured: true, sourceStatus: 'fresh', isStale: false, fetchedAt: '2026-07-01T18:25:00Z', goals: GOALS, assists: ASSISTS_V1 });
  assert.deepEqual(getState().real.stats.assists, ASSISTS_V1);
  assert.equal(getState().real.stats.providerState, 'fresh');
  assert.match(card('Assists'), /C Creator/);
});
