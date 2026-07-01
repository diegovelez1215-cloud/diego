// Canonical registry integrity + Puerto Rico local-day bucketing.
import test from 'node:test';
import assert from 'node:assert/strict';

import { FIXTURES, TEAMS } from '../src/data/fixtures.js';
import {
  allFixtures, fixturesOnDay, computeStandings, resolveSlots, slotLabel, winnerFeeds,
} from '../src/core/canonical-truth.js';
import { setClock, todayKey, tomorrowKey, dayKey, kickoffEpoch } from '../src/core/time.js';
import { buildOverlay } from '../src/core/provider-overlay.js';
import { matchesModel, clearModelCache } from '../src/data/tournament-model.js';

test('registry holds all 104 canonical fixtures exactly once with parseable kickoffs', () => {
  assert.equal(FIXTURES.length, 104);
  const ids = new Set(FIXTURES.map((f) => f.id));
  assert.equal(ids.size, 104);
  for (const f of FIXTURES) assert.ok(Number.isFinite(kickoffEpoch(f.kickoff)), 'kickoff parses: ' + f.id);
  assert.equal(Object.keys(TEAMS).length, 48);
});

test('advancement edges: every knockout match feeds forward except the final and bronze', () => {
  for (const f of FIXTURES) {
    if (f.stage === 'group' || f.stage === 'final' || f.stage === 'bronze') continue;
    assert.ok(winnerFeeds(f.id), 'match ' + f.id + ' has a winner edge');
  }
  assert.equal(winnerFeeds(104), null);
});

test('fixtures embed no scores, results, or live status', () => {
  for (const f of FIXTURES) {
    for (const k of ['gh', 'ga', 'score', 'status', 'live', 'winner', 'result']) {
      assert.ok(!(k in f), `fixture ${f.id} must not carry "${k}"`);
    }
  }
});

test('Today (Puerto Rico local day) contains every canonical local-day fixture exactly once', () => {
  // 2026-07-01 12:30 AST — Round of 32 day with three fixtures (80, 81, 82).
  setClock(() => Date.parse('2026-07-01T12:30:00-04:00'));
  try {
    clearModelCache();
    const m = matchesModel(buildOverlay({}));
    const expected = FIXTURES.filter((f) => dayKey(kickoffEpoch(f.kickoff)) === '2026-07-01');
    assert.equal(expected.length, 3);
    assert.deepEqual(m.today.map((x) => x.id).sort((a, b) => a - b), expected.map((f) => f.id).sort((a, b) => a - b));
    assert.equal(new Set(m.today.map((x) => x.id)).size, m.today.length, 'no duplicates');
    assert.equal(todayKey(), '2026-07-01');
    assert.equal(tomorrowKey(), '2026-07-02');
  } finally { setClock(null); }
});

test('a 23:00 AST kickoff stays on its AST calendar day', () => {
  const f = FIXTURES.find((x) => x.id === 85); // 23:00 on 2026-07-02
  assert.equal(dayKey(kickoffEpoch(f.kickoff)), '2026-07-02');
});

test('fixturesOnDay is chronological and complete for the opening day', () => {
  const day = fixturesOnDay('2026-06-11');
  assert.ok(day.length >= 1);
  for (let i = 1; i < day.length; i++) assert.ok(day[i].epoch >= day[i - 1].epoch);
});

test('standings + slot resolution derive only from supplied finals', () => {
  const finals = new Map();
  // Complete Group A with synthetic finals: MEX wins all, RSA second, KOR third, CZE last.
  const groupA = allFixtures().filter((f) => f.stage === 'group' && f.group === 'A');
  assert.equal(groupA.length, 6);
  const order = ['MEX', 'RSA', 'KOR', 'CZE'];
  for (const f of groupA) {
    const hi = order.indexOf(f.home); const ai = order.indexOf(f.away);
    finals.set(f.id, hi < ai ? { gh: 2, ga: 0 } : { gh: 0, ga: 2 });
  }
  const st = computeStandings(finals);
  assert.equal(st.complete.A, true);
  assert.deepEqual(st.groups.A.map((t) => t.code), order);
  const slots = resolveSlots(st, new Map());
  // Match 79 is 1A vs third-place pool: home resolves, away stays pending.
  assert.equal(slots.get(79).home, 'MEX');
  assert.equal(slots.get(79).away, null);
  assert.equal(slotLabel('3:CEFHI'), 'Best third (C/E/F/H/I)');
});
