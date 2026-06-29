/* Focused truth test for the verified R32 backfill manifest.
 *
 * Drives the REAL client ingestion path (index.html, loaded in JSDOM) with the
 * REAL server manifest (api/officialR32Fixtures.js). Proves the manifest fills
 * only blank provider R32 slots, by stable slot number, as a display-only fallback
 * that never overrides provider data, never creates finals/advancement, and never
 * touches standings, qualification, Player Leaders, or virtual/SIM state.
 *
 * index.html and the manifest module both use syntax that node's CommonJS loader
 * won't import directly, so the manifest is copied to a temp .mjs (no relative
 * imports) and the app script is evaluated inside a JSDOM window.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import jsdom from 'jsdom';
const { JSDOM } = jsdom;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

async function loadManifest() {
  const src = fs.readFileSync(path.join(ROOT, 'api', 'officialR32Fixtures.js'), 'utf8');
  const tmp = path.join(os.tmpdir(), `r32man_${Date.now()}_${Math.random().toString(36).slice(2)}.mjs`);
  fs.writeFileSync(tmp, src);
  return import(pathToFileURL(tmp).href);
}

function loadApp() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
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
  window.MutationObserver = class { observe() {} disconnect() {} };
  window.AudioContext = function () {};
  window.webkitAudioContext = window.AudioContext;
  window.eval(`${script}
    window.__t = {
      getState:function(){return S;}, setState:function(v){S=v;}, blankState:blankState,
      MATCHES:MATCHES, GROUPS:GROUPS, REAL:REAL, M:M,
      tournamentTruthSnapshot:tournamentTruthSnapshot,
      truthRefreshStart:truthRefreshStart,
      ingestProviderKOFixtures:ingestProviderKOFixtures, ingestFinished:ingestFinished,
      knockoutSlotStatus:knockoutSlotStatus, koParts:koParts,
      tournamentPhaseState:tournamentPhaseState, knockoutPathCardHTML:knockoutPathCardHTML,
      komR32CardHTML:komR32CardHTML, r32FixtureStates:r32FixtureStates,
      mrow:mrow, homeFixtureCardHTML:homeFixtureCardHTML, matchCenterTruth:matchCenterTruth
    };`);
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  try { return fn(dom.window.__t, dom.window); }
  finally { dom.window.close(); }
}

function resetOfficial(app) {
  const s = app.blankState();
  s.mode = 'real';
  Object.keys(app.GROUPS).forEach((g) => { s.order[g] = app.GROUPS[g].slice(); });
  app.setState(s);
  return s;
}

function providerBlank(num) {
  return { num, home: '', away: '', gh: null, ga: null, stage: 'ROUND_OF_32', status: 'TIMED', kind: 'scheduled' };
}
function providerNamed(num, home, away) {
  return { num, home, away, gh: null, ga: null, stage: 'ROUND_OF_32', status: 'TIMED', kind: 'scheduled' };
}
function providerFinal(num, home, away, gh, ga, winner) {
  return { num, home, away, gh, ga, winner, stage: 'ROUND_OF_32', status: 'FINISHED', kind: 'final' };
}

const manifestMod = await loadManifest();
const MANIFEST = manifestMod.verifiedR32ScheduledFixtures();

test('1. blank provider R32 slots are backfilled with confirmed pairings', () => withApp((app) => {
  resetOfficial(app);
  const receipt = app.truthRefreshStart('/api/results');
  // Provider has these R32 matches scheduled but with blank participant names.
  const scheduled = [providerBlank(74), providerBlank(77), providerBlank(81), providerBlank(86)].concat(MANIFEST);
  app.ingestProviderKOFixtures(scheduled, { receipt, authoritative: true });
  const ko = app.tournamentTruthSnapshot().official.confirmedKnockoutFixtures;
  assert.deepEqual([ko[74].home, ko[74].away], ['GER', 'PAR']);
  assert.deepEqual([ko[77].home, ko[77].away], ['FRA', 'SWE']);
  assert.deepEqual([ko[81].home, ko[81].away], ['USA', 'BIH']);
  assert.deepEqual([ko[86].home, ko[86].away], ['ARG', 'CPV']);
  // distinguishable from provider data, and the slot reads confirmed in the bracket
  assert.equal(ko[74].source, 'verified_fixture');
  assert.equal(app.knockoutSlotStatus(74, true).state, 'confirmed');
}));

test('2. an R32 slot absent from the manifest stays pending/projected', () => withApp((app) => {
  resetOfficial(app);
  const receipt = app.truthRefreshStart('/api/results');
  // 80 is a real R32 slot but not in the verified manifest; provider leaves it blank.
  app.ingestProviderKOFixtures([providerBlank(80)].concat(MANIFEST), { receipt, authoritative: true });
  assert.equal(app.tournamentTruthSnapshot().official.confirmedKnockoutFixtures[80], undefined);
  assert.notEqual(app.knockoutSlotStatus(80, true).state, 'confirmed');
}));

test('3. a provider-named scheduled fixture takes precedence over the manifest', () => withApp((app) => {
  resetOfficial(app);
  const receipt = app.truthRefreshStart('/api/results');
  // Provider names slot 74 itself; manifest also covers 74. Provider must win.
  app.ingestProviderKOFixtures([providerNamed(74, 'Germany', 'Paraguay')].concat(MANIFEST), { receipt, authoritative: true });
  const f = app.tournamentTruthSnapshot().official.confirmedKnockoutFixtures[74];
  assert.deepEqual([f.home, f.away], ['GER', 'PAR']);
  assert.equal(f.source, 'official_provider_fixture');
}));

test('4. a provider final result is not overwritten and the manifest never advances', () => withApp((app) => {
  const s = resetOfficial(app);
  // Existing official final for an R32 slot (as if a provider final was ingested).
  app.REAL[74] = [2, 1];
  s.real[74] = 1; s.sc[74] = { h: 2, a: 1 };
  app.setState(s);
  const receipt = app.truthRefreshStart('/api/results');
  app.ingestProviderKOFixtures([providerBlank(74)].concat(MANIFEST), { receipt, authoritative: true });
  const snap = app.tournamentTruthSnapshot();
  // Realm-safe: compare extracted primitives (cross-realm objects never strict-match).
  const score = snap.official.finalResults[74].score;
  assert.equal(score.h, 2);
  assert.equal(score.a, 1);
  assert.equal(app.REAL[74][0], 2);
  assert.equal(app.REAL[74][1], 1);
  assert.equal(snap.official.knockoutWinners[74], undefined); // not advanced by manifest
  assert.equal(app.getState().ko[74], undefined);
}));

test('5. standings, qualifiers, Player Leaders and virtual state are untouched', () => withApp((app) => {
  const s = resetOfficial(app);
  app.REAL[1] = [1, 0]; s.real[1] = 1; s.sc[1] = { h: 1, a: 0 };
  s.providerGroupOrder = { A: app.GROUPS.A.slice() };
  s.betsim = { 5: 1 };
  s.bank = 12345;
  s.bets = [{ id: 'x', settled: false }];
  app.setState(s);
  const before = JSON.stringify({
    sc: s.sc, real: s.real, providerGroupOrder: s.providerGroupOrder, betsim: s.betsim, bank: s.bank, bets: s.bets
  });
  const virtualBefore = JSON.stringify(app.tournamentTruthSnapshot().virtual);
  const finalsBefore = JSON.stringify(app.tournamentTruthSnapshot().official.finalResults);

  const receipt = app.truthRefreshStart('/api/results');
  app.ingestProviderKOFixtures([providerBlank(74), providerBlank(77)].concat(MANIFEST), { receipt, authoritative: true });

  const after = app.getState();
  assert.equal(JSON.stringify({
    sc: after.sc, real: after.real, providerGroupOrder: after.providerGroupOrder, betsim: after.betsim, bank: after.bank, bets: after.bets
  }), before);
  assert.equal(JSON.stringify(app.tournamentTruthSnapshot().virtual), virtualBefore);
  assert.equal(JSON.stringify(app.tournamentTruthSnapshot().official.finalResults), finalsBefore);
}));

test('6. provider knockout finals beat verified fallback everywhere', () => withApp((app) => {
  resetOfficial(app);
  const receipt = app.truthRefreshStart('/api/results');
  app.ingestProviderKOFixtures([providerNamed(74, 'Germany', 'Paraguay')].concat(MANIFEST), { receipt, authoritative: true });
  app.ingestFinished([
    providerFinal(73, 'South Africa', 'Canada', 0, 1, 'AWAY_TEAM'),
    providerFinal(76, 'Brazil', 'Japan', 2, 1, 'HOME_TEAM')
  ], { receipt });

  const snap = app.tournamentTruthSnapshot();
  assert.equal(snap.official.finalResults[73].score.h, 0);
  assert.equal(snap.official.finalResults[73].score.a, 1);
  assert.equal(snap.official.knockoutWinners[73], 'CAN');
  assert.equal(snap.official.finalResults[76].score.h, 2);
  assert.equal(snap.official.finalResults[76].score.a, 1);
  assert.equal(snap.official.knockoutWinners[76], 'BRA');

  const ko = snap.official.confirmedKnockoutFixtures;
  assert.equal(ko[73].source, 'official_provider_fixture');
  assert.equal(ko[76].source, 'official_provider_fixture');
  assert.equal(new Set(Object.keys(ko)).size, Object.keys(ko).length, 'no duplicate KO fixture keys survive');

  const card73 = app.knockoutPathCardHTML(73, new Set(), false, true);
  assert.match(card73, /Final 0-1/);
  assert.match(card73, /Canada/);
  assert.match(card73, /Advances/);
  assert.match(card73, /South Africa/);
  assert.match(card73, /Eliminated/);
  assert.doesNotMatch(card73, /Up next|Projected|Win or go home/i);

  const card76 = app.knockoutPathCardHTML(76, new Set(), false, true);
  assert.match(card76, /Final 2-1/);
  assert.match(card76, /Brazil/);
  assert.match(card76, /Advances/);
  assert.match(card76, /Japan/);
  assert.match(card76, /Eliminated/);
  assert.doesNotMatch(card76, /Up next|Projected|Win or go home/i);

  const phaseRows = app.tournamentPhaseState().roundOf32;
  const sa = phaseRows.find((x) => x.matchNum === 73);
  const kom = app.komR32CardHTML(sa);
  assert.match(kom, /0–1/);
  assert.match(kom, /Canada advances/);
  assert.match(kom, /South Africa eliminated/);
  assert.doesNotMatch(kom, /Win or go home/i);

  const row = app.mrow(app.M[73], false);
  assert.match(row, /0/);
  assert.match(row, /1/);
  assert.match(row, /FT/);
  assert.doesNotMatch(row, /SIM|UPCOMING/);

  const home = app.homeFixtureCardHTML(app.M[76]);
  assert.match(home, /2–1/);
  assert.match(home, /Final/);

  const mc = app.matchCenterTruth(73);
  assert.equal(mc.phase, 'final');
  // Compare fields (the score object is created in the JSDOM realm, so a cross-realm
  // deepStrictEqual on the object itself fails on prototype identity, not on value).
  assert.equal(mc.score.h, 0);
  assert.equal(mc.score.a, 1);

  const unresolved = app.knockoutPathCardHTML(74, new Set(), false, true);
  assert.match(unresolved, /Germany/);
  assert.match(unresolved, /Paraguay/);
  assert.match(unresolved, /Up next|Awaiting result/);
  assert.doesNotMatch(unresolved, /Final|Advances|Eliminated/);
}));
