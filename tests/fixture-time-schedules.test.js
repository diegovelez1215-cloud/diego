const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

process.env.TZ = 'America/Puerto_Rico';

function loadApp(now = '2026-06-29T12:00:00-04:00') {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const RealDate = window.Date;
  const fixedNow = new RealDate(now).getTime();
  window.Date = class extends RealDate {
    constructor(...args) { return args.length ? new RealDate(...args) : new RealDate(fixedNow); }
    static now() { return fixedNow; }
    static parse(v) { return RealDate.parse(v); }
    static UTC(...args) { return RealDate.UTC(...args); }
  };
  window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {}, fillRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillText() {},
    getImageData() { return { data: new Uint8ClampedArray(24 * 24 * 4) }; },
  });
  window.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
  window.requestAnimationFrame = (fn) => window.setTimeout(fn, 0);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  window.MutationObserver = class { observe() {} disconnect() {} };
  window.AudioContext = function () {};
  window.webkitAudioContext = window.AudioContext;
  window.eval(`${script}
    window.__fx = {
      blankState:blankState, setState:function(v){S=v;}, getState:function(){return S;},
      MATCHES:MATCHES, M:M, GROUPS:GROUPS, REAL:REAL,
      matchDay:matchDay, officialFixtureLocalTime:officialFixtureLocalTime, officialFixtureDisplayTime:officialFixtureDisplayTime,
      homeFixtureCardHTML:homeFixtureCardHTML, todayRailHTML:todayRailHTML,
      renderSchedule:renderSchedule, schedJumpTomorrow:schedJumpTomorrow,
      mrow:mrow, sheet:sheet, komR32CardHTML:komR32CardHTML, r32FixtureStates:r32FixtureStates,
      ingestProviderOfficialFixtures:ingestProviderOfficialFixtures, ingestProviderKOFixtures:ingestProviderKOFixtures,
      truthRefreshStart:truthRefreshStart, truthCanonicalKOFixtures:truthCanonicalKOFixtures, matchCenterTruth:matchCenterTruth,
      kickoffWindowModel:kickoffWindowModel, kickoffWindowFixtureNums:kickoffWindowFixtureNums,
      koSlotSuppressed:koSlotSuppressed, truthCanonicalKORegistry:truthCanonicalKORegistry,
      doc:document
    };`);
  return dom;
}

function withApp(fn, now) {
  const dom = loadApp(now);
  try { return fn(dom.window.__fx, dom.window); }
  finally { dom.window.close(); }
}

function reset(app) {
  const s = app.blankState();
  s.mode = 'real';
  Object.keys(app.GROUPS).forEach((g) => { s.order[g] = app.GROUPS[g].slice(); });
  app.setState(s);
  return s;
}

function setFixture(app, num, home, away, utcDate, providerId = `p${num}`) {
  const s = app.getState();
  s.officialFixtures[num] = { num, utcDate, status: 'TIMED', providerId, source: 'official_provider_fixture' };
  s.officialKOFixtures[num] = { num, home, away, utcDate, status: 'TIMED', stage: 'ROUND_OF_32', providerId, source: 'official_provider_fixture' };
  app.setState(s);
}

function countNeedles(haystack, needle) {
  return (String(haystack).match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
}

test('one provider UTC kickoff renders the same local time across Home, Knockout, Matches, and Match Center', () => withApp((app) => {
  reset(app);
  setFixture(app, 74, 'GER', 'PAR', '2026-06-30T21:30:00Z');
  const row = app.r32FixtureStates().find((x) => x.matchNum === 74);
  const expected = '5:30 PM';

  assert.equal(app.matchDay(app.M[74]), '2026-06-30');
  assert.equal(app.officialFixtureDisplayTime(app.M[74]), expected);
  assert.match(app.homeFixtureCardHTML(app.M[74]), /5:30[\s\S]*PM/);
  assert.match(app.komR32CardHTML(row), /5:30 PM/);
  assert.match(app.mrow(app.M[74], false), /5:30[\s\S]*PM/);
  app.sheet(74);
  assert.match(app.doc.getElementById('sheet').textContent, /5:30 PM/);
}));

test('a three-fixture local-tomorrow set renders all three in Home and Matches', () => withApp((app) => {
  reset(app);
  setFixture(app, 74, 'GER', 'PAR', '2026-06-30T21:30:00Z');
  setFixture(app, 75, 'NED', 'MAR', '2026-06-30T23:00:00Z');
  setFixture(app, 76, 'BRA', 'JPN', '2026-06-30T17:00:00Z');

  const home = app.todayRailHTML({});
  [74, 75, 76].forEach((n) => assert.match(home, new RegExp(`openSheet\\(${n}\\)`), `Home missed #${n}`));

  const s = app.getState();
  s._schedDay = '2026-06-30';
  app.setState(s);
  app.renderSchedule();
  const schedule = app.doc.getElementById('schedule').innerHTML;
  [74, 75, 76].forEach((n) => assert.match(schedule, new RegExp(`id="fx-${n}"`), `Matches missed #${n}`));
}));

test('Matches date selection shows only the selected local day complete fixture set', () => withApp((app) => {
  reset(app);
  setFixture(app, 74, 'GER', 'PAR', '2026-06-30T21:30:00Z');
  setFixture(app, 75, 'NED', 'MAR', '2026-06-30T23:00:00Z');
  setFixture(app, 76, 'BRA', 'JPN', '2026-06-30T17:00:00Z');
  setFixture(app, 77, 'FRA', 'SWE', '2026-07-01T21:00:00Z');

  const s = app.getState();
  s._schedDay = '2026-06-30';
  app.setState(s);
  app.renderSchedule();
  const schedule = app.doc.getElementById('schedule').innerHTML;
  [74, 75, 76].forEach((n) => assert.match(schedule, new RegExp(`id="fx-${n}"`)));
  assert.doesNotMatch(schedule, /id="fx-77"/);
}));

test('a legitimate Home fixture cannot disappear because another section already referenced it', () => withApp((app) => {
  reset(app);
  setFixture(app, 74, 'GER', 'PAR', '2026-06-30T21:30:00Z');
  const html = app.todayRailHTML({ 74: 1 });
  assert.match(html, /openSheet\(74\)/);
}));

test('duplicate records collapse without removing a distinct legitimate fixture', () => withApp((app) => {
  reset(app);
  setFixture(app, 74, 'GER', 'PAR', '2026-06-30T21:30:00Z', 'dup');
  setFixture(app, 77, 'PAR', 'GER', '2026-06-30T21:30:00Z', 'dup');
  setFixture(app, 75, 'NED', 'MAR', '2026-06-30T23:00:00Z', 'distinct');

  const reg = app.truthCanonicalKORegistry();
  assert.equal(reg.suppressed[77], 74);
  assert.equal(app.koSlotSuppressed(77), true);

  const nums = app.kickoffWindowFixtureNums(app.kickoffWindowModel({ iso: '2026-06-30', includeCompleted: true, allowPending: true }));
  assert.equal(countNeedles(nums.join(','), '74'), 1);
  assert.equal(nums.includes(75), true, 'distinct fixture survives duplicate collapse');
  assert.equal(nums.includes(77), false, 'duplicate tie is suppressed once');
}));

test('provider scheduled fixtures are authoritative across canonical schedule surfaces', () => withApp((app) => {
  reset(app);
  app.MATCHES.forEach((m) => { m.date = '2099-12-31'; m.time = '09:00'; });
  [73, 74, 75, 76, 86].forEach((n) => { app.M[n].date = '2026-07-05'; app.M[n].time = '09:00'; });
  const provider = [
    { providerId: 'fd-bra-jpn', home: 'Brazil', away: 'Japan', gh: null, ga: null, status: 'TIMED', kind: 'scheduled', stage: 'LAST_32', utcDate: '2026-06-30T17:00:00Z' },
    { providerId: 'fd-ger-par', home: 'Germany', away: 'Paraguay', gh: null, ga: null, status: 'TIMED', kind: 'scheduled', stage: 'LAST_32', utcDate: '2026-06-30T21:30:00Z' },
    { providerId: 'fd-ned-mar', home: 'Netherlands', away: 'Morocco', gh: null, ga: null, status: 'TIMED', kind: 'scheduled', stage: 'LAST_32', utcDate: '2026-06-30T23:00:00Z' },
    { providerId: 'fd-arg-cpv', home: 'Argentina', away: 'Cape Verde', gh: null, ga: null, status: 'TIMED', kind: 'scheduled', stage: 'LAST_32', utcDate: '2026-07-01T02:00:00Z' },
  ];
  const fallback = [
    { num: 74, home: 'Germany', away: 'Paraguay', gh: null, ga: null, status: 'TIMED', kind: 'scheduled', stage: 'ROUND_OF_32', utcDate: '2026-07-02T12:00:00Z', source: 'verified_fixture' },
    { num: 75, home: 'Netherlands', away: 'Morocco', gh: null, ga: null, status: 'TIMED', kind: 'scheduled', stage: 'ROUND_OF_32', utcDate: '2026-07-02T16:00:00Z', source: 'verified_fixture' },
    { num: 86, home: 'Argentina', away: 'Cape Verde', gh: null, ga: null, status: 'TIMED', kind: 'scheduled', stage: 'ROUND_OF_32', utcDate: '2026-07-03T20:00:00Z', source: 'verified_fixture' },
  ];
  const rows = provider.concat(fallback);
  const receipt = app.truthRefreshStart('/api/results');
  app.ingestProviderOfficialFixtures(rows, { receipt, authoritative: true });
  app.ingestProviderKOFixtures(rows, { receipt, authoritative: true });

  const canon = app.truthCanonicalKOFixtures();
  const providerIds = new Set(provider.map((f) => f.providerId));
  const providerNums = Object.keys(canon).map(Number).filter((n) => providerIds.has(canon[n].providerId)).sort((a, b) => a - b);
  assert.equal(providerNums.length, provider.length, 'every provider fixture with utcDate survives once');
  assert.equal(Object.values(canon).filter((f) => ['GER', 'PAR'].includes(f.home) && ['GER', 'PAR'].includes(f.away)).length, 1, 'fallback/static conflict does not duplicate Germany v Paraguay');

  const providerDayNums = providerNums.filter((n) => app.matchDay(app.M[n]) === '2026-06-30');
  assert.equal(providerDayNums.length, provider.length, 'provider UTC controls the local day for every fixture');
  const gerParNum = providerNums.find((n) => canon[n].providerId === 'fd-ger-par');
  assert.ok(gerParNum, 'provider Germany v Paraguay fixture is canonical');
  assert.equal(app.matchDay(app.M[gerParNum]), '2026-06-30');
  assert.equal(app.officialFixtureDisplayTime(app.M[gerParNum]), '5:30 PM');
  assert.equal(app.matchCenterTruth(gerParNum).phase, 'scheduled');

  const heroSeen = {};
  heroSeen[gerParNum] = 1;
  const home = app.todayRailHTML(heroSeen);
  providerDayNums.forEach((n) => assert.match(home, new RegExp(`openSheet\\(${n}\\)`), `Home missed provider fixture #${n}`));
  assert.match(home, /5:30[\s\S]*PM/, 'Home uses provider display time');
  assert.equal((home.match(/class="home-fixture/g) || []).length, providerDayNums.length, 'Home count matches canonical provider-day count');

  const s = app.getState();
  s._schedDay = '2026-06-30';
  app.setState(s);
  app.renderSchedule();
  const schedule = app.doc.getElementById('schedule').innerHTML;
  providerDayNums.forEach((n) => assert.match(schedule, new RegExp(`id="fx-${n}"`), `Matches missed provider fixture #${n}`));
  assert.match(schedule, /5:30[\s\S]*PM/, 'Matches uses provider display time');
  assert.equal((schedule.match(/id="fx-\d+"/g) || []).length, providerDayNums.length, 'Matches count matches canonical provider-day count');
  assert.match(app.komR32CardHTML(app.r32FixtureStates().find((x) => x.matchNum === gerParNum)), /5:30 PM/, 'Knockout uses provider display time');
  app.sheet(gerParNum);
  assert.match(app.doc.getElementById('sheet').textContent, /5:30 PM/, 'Match Center uses provider display time');
}));
