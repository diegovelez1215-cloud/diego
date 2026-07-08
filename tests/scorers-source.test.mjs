// United 2026 — assist leaderboard source semantics.
// Football-Data's scorer table is ranked by GOALS and cut at `limit`; assists
// only exist as fields on those rows (proved against docs + the live preview
// payload on 2026-07-08, where limit=30 bottomed out at 2 goals and capped
// the "assist leaderboard" at 2). These tests pin the corrected behavior:
// a large verified row window, assists ranked by assists, honest scope flags,
// and zero fabrication.
import test from 'node:test';
import assert from 'node:assert/strict';

import scorersHandler, { SCORER_LIMIT, normalizeScorers } from '../api/scorers.js';
import { renderStats } from '../src/views/stats.js';
import { buildOverlay } from '../src/core/provider-overlay.js';

const row = (name, team, goals, assists) => ({
  player: { name }, team: { name: team }, goals, assists,
});

test('the old limit=30 failure case is caught: request uses the enlarged verified window', async () => {
  assert.ok(SCORER_LIMIT >= 100, 'row window must cover every realistic WC goal scorer, not a top-30 slice');
  const realFetch = globalThis.fetch;
  let requestedUrl = null;
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return { ok: true, status: 200, json: async () => ({ scorers: [row('A', 'X', 2, 0)] }) };
  };
  const previousKey = process.env.FOOTBALL_DATA_KEY;
  process.env.FOOTBALL_DATA_KEY = 'test-key-never-logged';
  try {
    let body = null;
    const res = { setHeader() {}, status() { return this; }, json(x) { body = x; return this; } };
    await scorersHandler({ headers: {}, socket: { remoteAddress: '10.0.0.9' } }, res);
    assert.ok(requestedUrl, 'provider was called');
    assert.match(requestedUrl, new RegExp('limit=' + SCORER_LIMIT + '$'));
    assert.doesNotMatch(requestedUrl, /limit=30\b/, 'the proven-bad top-30 slice is gone');
    assert.equal(body.configured, true);
  } finally {
    globalThis.fetch = realFetch;
    if (previousKey == null) delete process.env.FOOTBALL_DATA_KEY;
    else process.env.FOOTBALL_DATA_KEY = previousKey;
  }
});

test('a pure assist leader outside the goal top-30 ranks first when provider rows include them', () => {
  const rows = [];
  for (let i = 0; i < 34; i++) rows.push(row('Scorer ' + String(i).padStart(2, '0'), 'Team', 5 - Math.floor(i / 10), 1));
  // Row 35: one goal only — below any top-30 goal slice — but the tournament's
  // real assist leader. The old limit=30 request would never have seen them.
  rows.push(row('Pure Playmaker', 'Creativia', 1, 6));
  const out = normalizeScorers(rows);
  assert.equal(out.assists[0].player, 'Pure Playmaker');
  assert.equal(out.assists[0].n, 6, 'verified assist value reaches the list unchanged');
});

test('assists sort by verified assist count, never by goal rank', () => {
  const out = normalizeScorers([
    row('Goal Machine', 'A', 9, 1),
    row('Quiet Creator', 'B', 1, 4),
    row('Second Striker', 'C', 6, 2),
  ]);
  assert.deepEqual(out.assists.map((a) => a.player), ['Quiet Creator', 'Second Striker', 'Goal Machine']);
  assert.deepEqual(out.assists.map((a) => a.n), [4, 2, 1]);
  // stable tiebreak: equal assists -> more goals first, then name
  const tie = normalizeScorers([row('Zed', 'A', 1, 3), row('Abe', 'A', 4, 3), row('Mid', 'A', 4, 3)]);
  assert.deepEqual(tie.assists.map((a) => a.player), ['Abe', 'Mid', 'Zed']);
});

test('no assists are invented: null/zero assist rows are excluded, values pass through verbatim', () => {
  const out = normalizeScorers([
    row('Null Assist', 'A', 3, null),
    row('Zero Assist', 'B', 2, 0),
    row('Real Assist', 'C', 2, 2),
  ]);
  assert.deepEqual(out.assists.map((a) => [a.player, a.n]), [['Real Assist', 2]]);
  assert.deepEqual(out.goals.map((g) => g.player), ['Null Assist', 'Real Assist', 'Zero Assist']);
});

test('a row set that hits the cap is flagged truncated; an uncapped one is not', () => {
  const capped = normalizeScorers(Array.from({ length: SCORER_LIMIT }, (_, i) => row('P' + i, 'T', 2, 1)));
  assert.equal(capped.truncated, true);
  const open = normalizeScorers([row('A', 'T', 2, 1)]);
  assert.equal(open.truncated, false);
  assert.equal(open.assistScope, 'scorer-rows');
});

test('Stats view states assist scope honestly and G+A never claims completeness', () => {
  const overlay = buildOverlay({ results: { configured: true, sourceStatus: 'fresh', isStale: false, finished: [] } });
  const base = {
    providerState: 'fresh', fetchedAt: '2026-07-08T15:11:36Z',
    goals: [{ player: 'A Player', team: 'Mexico', n: 4 }],
    assists: [{ player: 'B Creator', team: 'Japan', n: 3 }],
  };
  const open = renderStats(overlay, { ...base, truncated: false });
  assert.match(open, /Verified from the official scorer feed\. Players without a goal are not ranked by this provider\./);
  assert.match(open, /Combined from the verified provider rows — not a complete tournament leaderboard\./);

  const capped = renderStats(overlay, { ...base, truncated: true });
  assert.match(capped, /capped scorer feed — players outside it, including assist-only leaders, are not ranked here/);

  const empty = renderStats(overlay, { ...base, assists: [] });
  assert.match(empty, /Official assist data is unavailable from the current feed\./);
  assert.doesNotMatch(empty, /Verified from the official scorer feed/, 'no scope note without assist rows');
});
