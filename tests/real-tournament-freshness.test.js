/* Focused proofs for cowork/real-tournament-freshness.
 *
 * Covers the real-tournament knockout/freshness fixes:
 *  1. provider/fallback duplicate ties (Australia v Egypt style) collapse to one fixture
 *  2. a provider live score reaches the Home model with the correct home/away score,
 *     even in the knockout phase (live must outrank the static "next fixture" lead)
 *  3. a TIMED fixture is never treated as live
 *  4. the knockout timeline sorts by official kickoff time, not slot number
 *  5. a stale cold-start Home snapshot cannot present yesterday's relative-day labels
 *     or Upset Alert as current facts before the controlled refresh confirms
 *  6. the Upset Alert is derived from current official finals (and disappears when no
 *     longer the latest relevant upset) — never a persisted stale copy
 *  7. Group Stage stays accessible but Knockout is the default surface in knockout phase
 */
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
    window.__app = {
      getState:function(){return S;}, setState:function(v){S=v;}, blankState:blankState,
      MATCHES:MATCHES, GROUPS:GROUPS, REAL:REAL, M:M, RAT:RAT, T:T, gMatches:gMatches,
      koParts:koParts, koDateTime:koDateTime, isBetSim:isBetSim,
      ingestProviderKOFixtures:ingestProviderKOFixtures, ingestMatchStates:ingestMatchStates,
      truthProviderNamedKOFixture:truthProviderNamedKOFixture,
      truthCanonicalKOFixtures:truthCanonicalKOFixtures, koFixtureKickoffMs:koFixtureKickoffMs,
      r32FixtureStates:r32FixtureStates, knockoutModeHTML:knockoutModeHTML,
      fdSafePhase:fdSafePhase, defaultTournamentTab:defaultTournamentTab,
      homePrimaryContext:homePrimaryContext, homeLiveNowHTML:homeLiveNowHTML,
      recentUpset:recentUpset, officialFinalsForUpset:officialFinalsForUpset, hypeHTML:hypeHTML,
      matchLiveState:matchLiveState, rwKind:rwKind, persistKeys:persistKeys,
      renderGroups:renderGroups, tournamentTruthSnapshot:tournamentTruthSnapshot,
      homeDataCached:homeDataCached, markOfficialRefreshConfirmed:markOfficialRefreshConfirmed,
      setHadRestoredOfficial:function(v){_hadRestoredOfficial=v;},
      setFirstRefreshDone:function(v){_firstOfficialRefreshDone=v;},
      groupsHTML:function(){return document.getElementById('groups').innerHTML;},
      mountText:function(h){var d=document.createElement('div');d.innerHTML=h||'';return d.textContent;}
    };`);
  return dom;
}

function withApp(fn) {
  const dom = loadApp();
  try { return fn(dom.window.__app, dom.window); }
  finally { dom.window.close(); }
}

function resetOfficial(app) {
  Object.keys(app.REAL).forEach((k) => delete app.REAL[k]);
  const s = app.blankState();
  s.mode = 'real';
  Object.keys(app.GROUPS).forEach((g) => { s.order[g] = app.GROUPS[g].slice(); });
  app.setState(s);
  return s;
}

function setOfficialGroup(app, state, num, h, a) {
  app.REAL[num] = [h, a];
  state.sc[num] = { h, a };
  state.real[num] = 1;
}

function finishAllGroups(app, state) {
  state.providerGroupOrder = {};
  Object.keys(app.GROUPS).forEach((g) => {
    state.providerGroupOrder[g] = app.GROUPS[g].slice();
    app.gMatches(g).forEach((m) => setOfficialGroup(app, state, m.num, 0, 0));
  });
  app.setState(state);
}

function scheduledKO(matchNum, home, away, extra = {}) {
  return Object.assign({ matchNum, home, away, gh: null, ga: null, status: 'TIMED', kind: 'scheduled', stage: 'LAST_32' }, extra);
}

// ---- 1. provider/fallback duplicate ties collapse to one fixture ------------
test('provider/fallback duplicate ties (AUS v EGY style) collapse to a single fixture', () => withApp((app) => {
  const s = resetOfficial(app);
  // Same official tie reaches two different slots: a provider fixture (slot 86) and the
  // verified fallback (slot 88). The canonical merge must keep the provider and drop
  // the redundant fallback so the pairing never renders twice.
  assert.equal(app.ingestProviderKOFixtures([
    scheduledKO(86, 'Australia', 'Egypt'),
    scheduledKO(88, 'Australia', 'Egypt', { source: 'verified_fixture' }),
  ], { authoritative: true }), true);

  const canon = app.truthCanonicalKOFixtures();
  const slots = Object.keys(canon).filter((n) => {
    const f = canon[n]; return f && f.home === 'AUS' && f.away === 'EGY';
  });
  assert.equal(slots.length, 1, 'AUS v EGY survives in exactly one slot after dedup');
  assert.equal(canon[slots[0]].source, 'official_provider_fixture', 'provider beats verified fallback');
  assert.equal(app.truthProviderNamedKOFixture(88), null, 'the duplicate fallback slot is dropped');

  // and the rendered knockout fixture states show the pairing only once
  const named = app.r32FixtureStates().filter((x) => x.home === 'AUS' && x.away === 'EGY');
  assert.equal(named.length, 1, 'only one AUS v EGY card across the Round of 32');
}));

// ---- 2. provider live score reaches the Home model (and outranks the lead) ---
test('provider live score appears in the Home model with correct home/away score, even in knockout phase', () => withApp((app) => {
  const s = resetOfficial(app);
  finishAllGroups(app, s);                      // forces prioritizeBracket = true
  assert.equal(app.fdSafePhase().prioritizeBracket, true, 'sanity: app is in the knockout phase');

  // A real knockout fixture is live with a provider score 2–1.
  s.rwState = { 88: { sh: 2, sa: 1, min: 67, status: 'IN_PLAY', label: 'Live', kind: 'live', at: Date.now() } };
  app.setState(s);

  const ctx = app.homePrimaryContext();
  assert.equal(ctx.kind, 'real_live', 'a live fixture outranks the static knockout lead');
  assert.ok(ctx.nums.indexOf(88) >= 0, 'the live fixture is the Home hero');

  const html = app.homeLiveNowHTML();
  assert.match(html, /2–1/, 'the provider live score renders with the correct home/away order');
}));

// ---- 3. a TIMED fixture is never live ---------------------------------------
test('a TIMED fixture is never treated as live', () => withApp((app) => {
  const s = resetOfficial(app);
  assert.equal(app.rwKind({ status: 'TIMED' }), 'scheduled', 'TIMED maps to scheduled');
  app.ingestProviderKOFixtures([scheduledKO(88, 'Australia', 'Egypt')], { authoritative: true });
  assert.equal(app.matchLiveState(88), null, 'a scheduled/TIMED knockout fixture has no live state');
}));

// ---- 4. knockout timeline sorts by official kickoff time --------------------
test('the knockout timeline sorts ties by official kickoff time, not slot number', () => withApp((app) => {
  const s = resetOfficial(app);
  finishAllGroups(app, s);
  // Slot 88 kicks off earlier than slot 73 by official utcDate, so it must render first
  // despite its higher slot number.
  s.officialKOFixtures = {
    73: { home: 'BRA', away: 'JPN', stage: 'ROUND_OF_32', status: 'TIMED', utcDate: '2026-07-09T20:00:00Z', source: 'official_provider_fixture' },
    88: { home: 'AUS', away: 'EGY', stage: 'ROUND_OF_32', status: 'TIMED', utcDate: '2026-07-05T20:00:00Z', source: 'official_provider_fixture' },
  };
  app.setState(s);
  assert.ok(app.koFixtureKickoffMs(88) < app.koFixtureKickoffMs(73), 'sanity: 88 kicks off before 73');
  const html = app.knockoutModeHTML();
  assert.ok(html.indexOf('#88') >= 0 && html.indexOf('#73') >= 0, 'both ties render');
  assert.ok(html.indexOf('#88') < html.indexOf('#73'), 'the earlier kickoff (#88) appears before #73');
}));

// ---- 5. cold-start snapshot is treated as cached, not current fact ----------
test('a stale cold-start Home snapshot cannot present yesterday labels or an Upset Alert as current', () => withApp((app) => {
  const s = resetOfficial(app);
  // an upset official final exists in the restored snapshot
  const upset = pickUpsetMatch(app);
  setUnderdogWin(app, s, upset);
  app.setState(s);

  // cold start: restored official data, no controlled refresh has confirmed yet
  app.setHadRestoredOfficial(true);
  app.setFirstRefreshDone(false);
  assert.equal(app.homeDataCached(), true, 'cold-start data is flagged as cached');
  assert.equal(app.hypeHTML(), '', 'the Upset Alert is withheld while data is only cached');

  // the controlled refresh resolves → data is now current, alert may derive again
  app.markOfficialRefreshConfirmed();
  assert.equal(app.homeDataCached(), false, 'after the controlled refresh data is current');
  assert.match(app.hypeHTML(), /Upset alert/, 'the alert is derived from the current snapshot, not persisted');

  // no derived label / alert payload is ever persisted
  const keys = Object.keys(app.persistKeys());
  ['upset', 'today', 'tomorrow', 'live', 'upnext', 'hype'].forEach((bad) => {
    assert.equal(keys.indexOf(bad), -1, 'no derived "' + bad + '" label is persisted');
  });
}));

// ---- 6. Upset Alert derived from current finals, disappears when superseded --
test('the Upset Alert derives from current official finals and disappears when no longer latest', () => withApp((app) => {
  const s = resetOfficial(app);
  const upset = pickUpsetMatch(app);
  setUnderdogWin(app, s, upset);
  app.setState(s);

  let up = app.recentUpset();
  assert.ok(up && up.n === upset.num, 'the upset is derived directly from the official final');

  // four later, non-upset finals land after it → the older upset is no longer "latest"
  const upsetTs = app.koDateTime(upset).getTime();
  const later = app.MATCHES
    .filter((m) => m.stage === 'group' && m.num !== upset.num)
    .map((m) => ({ m, ts: (app.koDateTime(m) || { getTime: () => 0 }).getTime() }))
    .filter((x) => x.ts > upsetTs)
    .sort((a, b) => a.ts - b.ts)
    .slice(0, 4);
  assert.equal(later.length, 4, 'sanity: four strictly-later group fixtures are available');
  later.forEach(({ m }) => setFavouriteWin(app, s, m));
  app.setState(s);

  assert.equal(app.recentUpset(), null, 'once four newer finals land, the stale upset disappears');

  // and clearing the finals proves the alert is recomputed, never stored
  const cleared = resetOfficial(app);
  app.setState(cleared);
  assert.equal(app.recentUpset(), null, 'with no official finals there is no upset to recall');
}));

// ---- 7. Group Stage stays accessible, Knockout is the default ---------------
test('Group Stage stays accessible but Knockout is the default surface in knockout phase', () => withApp((app) => {
  const s = resetOfficial(app);
  finishAllGroups(app, s);
  assert.equal(app.defaultTournamentTab(), 'bracket', 'Knockout is the default tournament tab');
  app.renderGroups();
  const text = app.mountText(app.groupsHTML());
  assert.match(text, /GROUP A/, 'group tables are still present as history');
  assert.match(text, /Group stage complete/, 'group stage carries a calmer history treatment');
}));

// ---- helpers ---------------------------------------------------------------
function ratGap(app, winner, loser) { return (app.RAT[loser] || 70) - (app.RAT[winner] || 70); }

// pick the group match with the clearest rating upset potential (underdog can win by >=8)
function pickUpsetMatch(app) {
  let best = null, bestGap = -1;
  app.MATCHES.forEach((m) => {
    if (m.stage !== 'group') return;
    const gap = Math.abs((app.RAT[m.home] || 70) - (app.RAT[m.away] || 70));
    if (gap > bestGap) { bestGap = gap; best = m; }
  });
  assert.ok(best && bestGap >= 8, 'a sufficiently lopsided group fixture exists for an upset');
  return best;
}

function setUnderdogWin(app, state, m) {
  const homeFav = (app.RAT[m.home] || 70) >= (app.RAT[m.away] || 70);
  // underdog wins → home wins if away is favoured, away wins if home is favoured
  if (homeFav) setOfficialGroup(app, state, m.num, 0, 2); else setOfficialGroup(app, state, m.num, 2, 0);
}

function setFavouriteWin(app, state, m) {
  const homeFav = (app.RAT[m.home] || 70) >= (app.RAT[m.away] || 70);
  if (homeFav) setOfficialGroup(app, state, m.num, 2, 0); else setOfficialGroup(app, state, m.num, 0, 2);
}
