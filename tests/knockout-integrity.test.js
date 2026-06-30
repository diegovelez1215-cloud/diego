/* Phase A focused proofs — cowork/knockout-integrity-play-arcade.
 *
 * Canonical official-fixture display integrity:
 *  1. a provider live fixture renders correct home name, away name and score on Home
 *     (never a raw bracket slot token like "2D"/"3:ABCDF")
 *  2. a provider/fallback duplicate with mismatched kickoff times collapses to one
 *  3. the same official tie is unique across the canonical display layer
 *  4. a TIMED fixture never shows Live
 *  5. knockout fixtures sort by official utcDate
 *  6. Home contains exactly one "View full bracket" shortcut
 *  7. final and live knockout cards retain full readable team names
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

function loadApp() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {}, fillRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillText() {},
    getImageData() { return { data: new Uint8ClampedArray(2304) }; },
  });
  window.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
  window.requestAnimationFrame = (fn) => window.setTimeout(fn, 16);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  window.MutationObserver = class { observe() {} disconnect() {} };
  window.AudioContext = function () {};
  window.webkitAudioContext = window.AudioContext;
  window.eval(`${script}
    window.__app = {
      getState:function(){return S;}, setState:function(v){S=v;}, blankState:blankState,
      MATCHES:MATCHES, GROUPS:GROUPS, REAL:REAL, M:M, RAT:RAT, T:T, gMatches:gMatches,
      koParts:koParts, slotLabel:slotLabel, nm:nm, rwResolve:rwResolve, rwKind:rwKind,
      ingestProviderKOFixtures:ingestProviderKOFixtures, ingestFinished:ingestFinished,
      truthRefreshStart:truthRefreshStart, tournamentTruthSnapshot:tournamentTruthSnapshot,
      truthProviderNamedKOFixture:truthProviderNamedKOFixture,
      truthCanonicalKOFixtures:truthCanonicalKOFixtures,
      koSlotSuppressed:koSlotSuppressed, koCanonicalDedupMap:koCanonicalDedupMap, koResetDedupCache:koResetDedupCache,
      officialDisplayTeams:officialDisplayTeams, liveDisplayTeams:liveDisplayTeams,
      koFixtureKickoffMs:koFixtureKickoffMs,
      homePrimaryContext:homePrimaryContext, homeLiveNowHTML:homeLiveNowHTML,
      knockoutModeHTML:knockoutModeHTML, r32FixtureStates:r32FixtureStates, komR32CardHTML:komR32CardHTML,
      matchLiveState:matchLiveState, fdSafePhase:fdSafePhase, matchCenterTruth:matchCenterTruth,
      mrow:mrow, homeFixtureCardHTML:homeFixtureCardHTML, dateNavHTML:dateNavHTML, schedJumpTomorrow:schedJumpTomorrow,
      renderHome:renderHome, renderSchedule:renderSchedule,
      homeHTML:function(){return document.getElementById('home').innerHTML;},
      scheduleHTML:function(){return document.getElementById('schedule').innerHTML;},
      mountText:function(h){var d=document.createElement('div');d.innerHTML=h||'';return d.textContent;}
    };`);
  return dom;
}
function withApp(fn) { const dom = loadApp(); try { return fn(dom.window.__app, dom.window); } finally { dom.window.close(); } }

function resetOfficial(app) {
  Object.keys(app.REAL).forEach((k) => delete app.REAL[k]);
  const s = app.blankState(); s.mode = 'real';
  Object.keys(app.GROUPS).forEach((g) => { s.order[g] = app.GROUPS[g].slice(); });
  app.setState(s); app.koResetDedupCache(); return s;
}
function finishAllGroups(app, s) {
  s.providerGroupOrder = {};
  Object.keys(app.GROUPS).forEach((g) => {
    s.providerGroupOrder[g] = app.GROUPS[g].slice();
    app.gMatches(g).forEach((m) => { app.REAL[m.num] = [0, 0]; s.sc[m.num] = { h: 0, a: 0 }; s.real[m.num] = 1; });
  });
  app.setState(s); app.koResetDedupCache();
}
function scheduledKO(matchNum, home, away, extra = {}) {
  return Object.assign({ matchNum, home, away, gh: null, ga: null, status: 'TIMED', kind: 'scheduled', stage: 'LAST_32' }, extra);
}
function finalKO(matchNum, home, away, gh, ga, winner, extra = {}) {
  return Object.assign({ matchNum, home, away, gh, ga, status: 'FINISHED', kind: 'final', stage: 'LAST_32', winner }, extra);
}
function pairKey(a, b) { return [a, b].sort().join('~'); }

// ---- 1. provider live fixture renders correct names + score on Home ----------
test('a provider live fixture renders correct home name, away name and score on Home', () => withApp((app) => {
  const s = resetOfficial(app);
  finishAllGroups(app, s);
  // Live knockout fixture: the static slot 88 is the token pair 2D/2G, but the provider
  // resolved the real teams (captured in rwState as homeCode/awayCode).
  s.rwState = { 88: { sh: 2, sa: 1, min: 67, status: 'IN_PLAY', label: 'Live', kind: 'live', at: Date.now(), homeCode: 'CIV', awayCode: 'NOR' } };
  app.setState(s); app.koResetDedupCache();

  const ctx = app.homePrimaryContext();
  assert.equal(ctx.kind, 'real_live', 'a live fixture is the Home hero');
  const html = app.homeLiveNowHTML();
  const text = app.mountText(html);
  assert.match(text, /Côte d'Ivoire/, 'real home name renders');
  assert.match(text, /Norway/, 'real away name renders');
  assert.match(html, /2–1/, 'provider score renders with correct home/away order');
  assert.doesNotMatch(text, /2D|2G|Winner Group|Qualification slot/, 'no raw slot token or placeholder leaks into the live card');
}));

// fallback safety: even without provider codes, a live card never shows a raw token
test('a live card without provider codes falls back to readable labels, never a raw token', () => withApp((app) => {
  const s = resetOfficial(app);
  s.rwState = { 88: { sh: 1, sa: 0, min: 30, status: 'IN_PLAY', label: 'Live', kind: 'live', at: Date.now() } };
  app.setState(s); app.koResetDedupCache();
  const text = app.mountText(app.homeLiveNowHTML());
  assert.doesNotMatch(text, /\b2D\b|\b2G\b|3:/, 'raw bracket tokens never appear');
}));

// ---- 2. provider/fallback duplicate with mismatched kickoff collapses --------
test('a provider/fallback duplicate with mismatched kickoff times collapses to one canonical fixture', () => withApp((app) => {
  resetOfficial(app);
  assert.equal(app.ingestProviderKOFixtures([
    scheduledKO(77, 'Ivory Coast', 'Norway', { utcDate: '2026-06-30T21:00:00Z' }),
    scheduledKO(78, 'Ivory Coast', 'Norway', { utcDate: '2026-06-30T17:00:00Z', source: 'verified_fixture' }),
  ], { authoritative: true }), true);
  app.koResetDedupCache();
  const canon = app.truthCanonicalKOFixtures();
  const slots = Object.keys(canon).filter((n) => canon[n].home === 'CIV' && canon[n].away === 'NOR');
  assert.equal(slots.length, 1, 'the tie survives in exactly one slot despite different kickoff times');
  assert.equal(canon[slots[0]].source, 'official_provider_fixture', 'provider beats the verified fallback');
  assert.equal(app.truthProviderNamedKOFixture(78), null, 'the duplicate fallback slot is dropped');
}));

// ---- 3. same official tie is unique across the canonical display layer -------
test('the same official tie is unique across Home, Knockout, Matches and Match Center', () => withApp((app) => {
  const s = resetOfficial(app);
  app.ingestProviderKOFixtures([
    scheduledKO(77, 'Ivory Coast', 'Norway', { utcDate: '2026-06-30T21:00:00Z' }),
    scheduledKO(78, 'Ivory Coast', 'Norway', { utcDate: '2026-06-30T17:00:00Z', source: 'verified_fixture' }),
  ], { authoritative: true });
  finishAllGroups(app, s);
  // count, across every R32 slot, how many render the exact CIV–NOR pair and are not suppressed
  let count = 0;
  for (let n = 73; n <= 88; n++) {
    if (app.koSlotSuppressed(n)) continue;
    const t = app.officialDisplayTeams(n);
    if (t.hCode && t.aCode && pairKey(t.hCode, t.aCode) === pairKey('CIV', 'NOR')) count++;
  }
  assert.equal(count, 1, 'the CIV–NOR tie renders exactly once across the canonical layer');
}));

// ---- 4. a TIMED fixture never shows Live ------------------------------------
test('a TIMED fixture never renders as Live', () => withApp((app) => {
  resetOfficial(app);
  assert.equal(app.rwKind({ status: 'TIMED' }), 'scheduled', 'TIMED maps to scheduled');
  app.ingestProviderKOFixtures([scheduledKO(88, 'Australia', 'Egypt')], { authoritative: true });
  assert.equal(app.matchLiveState(88), null, 'a TIMED knockout fixture has no live state');
}));

// ---- 5. knockout fixtures sort by utcDate -----------------------------------
test('knockout fixtures sort by official utcDate ascending', () => withApp((app) => {
  const s = resetOfficial(app);
  finishAllGroups(app, s);
  s.officialKOFixtures = {
    73: { home: 'BRA', away: 'JPN', stage: 'ROUND_OF_32', status: 'TIMED', utcDate: '2026-07-09T20:00:00Z', source: 'official_provider_fixture' },
    88: { home: 'AUS', away: 'EGY', stage: 'ROUND_OF_32', status: 'TIMED', utcDate: '2026-07-05T20:00:00Z', source: 'official_provider_fixture' },
  };
  app.setState(s); app.koResetDedupCache();
  assert.ok(app.koFixtureKickoffMs(88) < app.koFixtureKickoffMs(73), 'sanity: 88 kicks off before 73');
  const html = app.knockoutModeHTML();
  assert.ok(html.indexOf('#88') >= 0 && html.indexOf('#73') >= 0, 'both ties render');
  assert.ok(html.indexOf('#88') < html.indexOf('#73'), 'earlier kickoff (#88) appears before #73');
}));

// ---- 6. Home contains exactly one bracket shortcut --------------------------
test('Home contains exactly one View full bracket shortcut', () => withApp((app) => {
  const s = resetOfficial(app);
  finishAllGroups(app, s);
  s.rwState = { 88: { sh: 1, sa: 0, min: 20, status: 'IN_PLAY', label: 'Live', kind: 'live', at: Date.now(), homeCode: 'CIV', awayCode: 'NOR' } };
  app.setState(s); app.koResetDedupCache();
  app.renderHome();
  const html = app.homeHTML();
  const full = (html.match(/View full bracket/g) || []).length;
  const live = (html.match(/Open the full live bracket/g) || []).length;
  assert.equal(full, 1, 'exactly one "View full bracket" action on Home');
  assert.equal(live, 0, 'the duplicate "Open the full live bracket" action is gone');
}));

// ---- 7. final and live knockout cards retain full readable team names -------
test('final and live knockout cards retain full readable team names', () => withApp((app) => {
  const s = resetOfficial(app);
  app.ingestProviderKOFixtures([scheduledKO(78, 'Ivory Coast', 'Norway', { utcDate: '2026-06-30T17:00:00Z' })], { authoritative: true });
  finishAllGroups(app, s);
  // FINAL
  app.REAL[78] = [2, 1]; s.realko = s.realko || {}; s.realko[78] = 'CIV'; app.setState(s); app.koResetDedupCache();
  const states = app.r32FixtureStates();
  const fx = states.find((x) => x.matchNum === 78);
  assert.ok(fx && fx.home === 'CIV' && fx.away === 'NOR', 'the tie resolves to real team codes');
  const card = app.mountText(app.komR32CardHTML(fx));
  assert.match(card, /Côte d'Ivoire/, 'home name is readable');
  assert.match(card, /Norway/, 'away name is readable');
  assert.doesNotMatch(card, /\b2D\b|\b2G\b|3:/, 'no raw slot token in the final card');
}));

test('all sixteen Round of 32 provider ties coexist, including Argentina v Cape Verde', () => withApp((app) => {
  resetOfficial(app);
  const ties = [
    ['RSA', 'CAN'], ['GER', 'PAR'], ['ENG', 'COD'], ['BRA', 'JPN'],
    ['CIV', 'NOR'], ['AUS', 'EGY'], ['ESP', 'AUT'], ['MEX', 'SUI'],
    ['USA', 'BIH'], ['FRA', 'SWE'], ['POR', 'KOR'], ['NED', 'TUR'],
    ['BEL', 'MAR'], ['ARG', 'CPV'], ['CRO', 'COL'], ['URU', 'ECU'],
  ];
  app.ingestProviderKOFixtures(ties.map((p, i) => scheduledKO(73 + i, p[0], p[1], {
    utcDate: `2026-07-${String(1 + i).padStart(2, '0')}T20:00:00Z`,
  })), { authoritative: true });
  app.koResetDedupCache();

  const canon = app.truthCanonicalKOFixtures();
  assert.equal(Object.keys(canon).length, 16, 'every R32 provider tie survives exactly once');
  const argCape = Object.values(canon).find((f) => f.home === 'ARG' && f.away === 'CPV');
  assert.ok(argCape, 'Argentina v Cape Verde remains present');
}));

test('Tomorrow control targets the complete local-day canonical fixture set', () => withApp((app, window) => {
  const s = resetOfficial(app);
  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  app.M[73].date = iso(today); app.M[73].time = '10:00';
  app.M[74].date = iso(tomorrow); app.M[74].time = '11:00';
  app.M[75].date = iso(tomorrow); app.M[75].time = '15:00';
  app.ingestProviderKOFixtures([
    scheduledKO(73, 'Brazil', 'Japan'),
    scheduledKO(74, 'Germany', 'Paraguay'),
    scheduledKO(75, 'Argentina', 'Cape Verde'),
  ], { authoritative: true });
  app.REAL[73] = [2, 1]; s.real[73] = 1; s.sc[73] = { h: 2, a: 1 };
  app.setState(s); app.koResetDedupCache();

  const navText = app.mountText(app.dateNavHTML());
  assert.match(navText, /Tomorrow/, 'Tomorrow control is visible when tomorrow has fixtures');
  app.renderSchedule();
  const html = app.scheduleHTML();
  assert.match(html, /Germany/);
  assert.match(html, /Paraguay/);
  assert.match(html, /Argentina/);
  assert.match(html, /Cabo Verde/);

  let scrolled = false;
  window.scrollTo = function () { scrolled = true; };
  app.schedJumpTomorrow();
  assert.equal(scrolled, true, 'Tomorrow visibly switches to the first fixture on the local tomorrow slate');
  assert.equal(window.document.getElementById('fx-74').classList.contains('arrive-pulse'), true);
}));

test('live, timed, final and penalty knockout states render from the canonical record', () => withApp((app) => {
  resetOfficial(app);
  const receipt = app.truthRefreshStart('/api/results');
  app.ingestProviderKOFixtures([
    scheduledKO(73, 'Germany', 'Paraguay'),
    scheduledKO(74, 'Brazil', 'Japan'),
    scheduledKO(75, 'Argentina', 'Cape Verde'),
  ], { receipt, authoritative: true });
  app.ingestFinished([
    finalKO(74, 'Brazil', 'Japan', 2, 1, 'HOME_TEAM'),
    finalKO(75, 'Argentina', 'Cape Verde', 1, 1, 'HOME_TEAM', { penalties: { home: 4, away: 3 }, status: 'PEN' }),
  ], { receipt });
  const s = app.getState();
  s.rwState = { 73: { sh: 1, sa: 0, min: 64, status: 'IN_PLAY', label: 'Live', kind: 'live', at: Date.now(), homeCode: 'GER', awayCode: 'PAR' } };
  app.setState(s); app.koResetDedupCache();

  const liveText = app.mountText(app.homeLiveNowHTML());
  assert.match(liveText, /Germany/);
  assert.match(liveText, /Paraguay/);
  assert.match(liveText, /1–0/);
  assert.match(liveText, /Live|LIVE/);

  const timed = app.mountText(app.mrow(app.M[73], false));
  assert.doesNotMatch(timed, /TIMED|UPCOMING.*LIVE|LIVE.*UPCOMING/, 'TIMED scheduled records never render as live');

  const finalText = app.mountText(app.komR32CardHTML(app.r32FixtureStates().find((x) => x.matchNum === 74)));
  assert.match(finalText, /FINAL/);
  assert.match(finalText, /2–1/);
  assert.match(finalText, /Brazil advances/);
  assert.match(finalText, /Japan eliminated/);

  const penText = app.mountText(app.komR32CardHTML(app.r32FixtureStates().find((x) => x.matchNum === 75)));
  assert.match(penText, /FINAL · 1–1 · Argentina advances 4–3 on penalties/);
  assert.equal(app.matchCenterTruth(75).statusText, 'Final · penalties');
}));

test('Home, Knockout, Matches and Match Center read the same canonical provider final', () => withApp((app) => {
  const s = resetOfficial(app);
  finishAllGroups(app, s);
  const receipt = app.truthRefreshStart('/api/results');
  app.ingestProviderKOFixtures([scheduledKO(73, 'South Africa', 'Canada')], { receipt, authoritative: true });
  app.ingestFinished([finalKO(73, 'South Africa', 'Canada', 0, 1, 'AWAY_TEAM')], { receipt });
  app.koResetDedupCache();

  const snap = app.tournamentTruthSnapshot();
  assert.equal(snap.official.knockoutWinners[73], 'CAN');
  assert.equal(snap.official.confirmedKnockoutFixtures[73].home, 'RSA');
  assert.equal(snap.official.confirmedKnockoutFixtures[73].away, 'CAN');

  const home = app.mountText(app.homeFixtureCardHTML(app.M[73]));
  const knockout = app.mountText(app.knockoutModeHTML());
  const matches = app.mountText(app.mrow(app.M[73], false));
  const mc = app.matchCenterTruth(73);
  for (const text of [home, knockout, matches]) {
    assert.match(text, /South Africa/);
    assert.match(text, /Canada/);
  }
  assert.equal(mc.hCode, 'RSA');
  assert.equal(mc.aCode, 'CAN');
  assert.equal(mc.score.h, 0);
  assert.equal(mc.score.a, 1);
}));
