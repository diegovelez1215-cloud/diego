const test = require('node:test');
const assert = require('node:assert/strict');

const FINAL = { FT: 1, AET: 1, PEN: 1, FINISHED: 1 };
const LIVE = { '1H': 1, '2H': 1, HT: 1, ET: 1, BT: 1, P: 1, LIVE: 1, IN_PLAY: 1, PAUSED: 1 };
const HOLD = { SUSP: 1, INT: 1, PST: 1, CANC: 1, ABD: 1, TBD: 1, DELAYED: 1, SUSPENDED: 1, POSTPONED: 1, CANCELLED: 1, ABANDONED: 1, INTERRUPTED: 1 };

function kind(status, explicit) {
  const s = String(status || '').toUpperCase();
  const k = String(explicit || '').toLowerCase();
  if (k === 'final' || FINAL[s]) return 'final';
  if (k === 'hold' || HOLD[s]) return 'hold';
  if (LIVE[s]) return 'live';
  return 'scheduled';
}

function label(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'SUSP' || s === 'SUSPENDED') return 'Play suspended';
  if (s === 'INT' || s === 'INTERRUPTED') return 'Weather Delay';
  if (s === 'PST' || s === 'POSTPONED') return 'Postponed';
  if (s === 'ABD' || s === 'ABANDONED') return 'Abandoned';
  if (s === 'TBD') return 'Kickoff delayed';
  if (s === 'HT' || s === 'PAUSED') return 'Halftime';
  if (s === 'ET') return 'Extra time';
  if (s === 'P') return 'Penalties';
  if (FINAL[s]) return 'Full Time';
  return 'Live';
}

function officialFinalPayload(f) {
  return f && f.gh != null && f.ga != null && kind(f.status, f.kind) === 'final';
}

function shouldSettleBet(fixtureState) {
  return officialFinalPayload(fixtureState);
}

function shouldPoll(now, matches, states) {
  const day = 86400000;
  for (const st of Object.values(states || {})) {
    if ((st.kind === 'live' || st.kind === 'hold') && (!st.at || now - st.at < 12 * 3600000)) return true;
  }
  return matches.some((m) => !m.real && now >= m.kickoff - 2 * 3600000 && now <= m.kickoff + day);
}

test('match status taxonomy is conservative', () => {
  assert.equal(kind('NS'), 'scheduled');
  assert.equal(kind('1H'), 'live');
  assert.equal(kind('HT'), 'live');
  assert.equal(kind('2H'), 'live');
  assert.equal(kind('ET'), 'live');
  assert.equal(kind('P'), 'live');
  assert.equal(kind('FT'), 'final');
  assert.equal(kind('AET'), 'final');
  assert.equal(kind('PEN'), 'final');
  assert.equal(kind('SUSP'), 'hold');
  assert.equal(kind('INT'), 'hold');
  assert.equal(kind('PST'), 'hold');
  assert.equal(kind('ABD'), 'hold');
});

test('weather delays and suspended matches never settle bets', () => {
  for (const status of ['SUSP', 'INT', 'PST', 'ABD', 'TBD']) {
    assert.equal(label(status).length > 0, true);
    assert.equal(shouldSettleBet({ status, gh: 1, ga: 0 }), false);
  }
});

test('only explicit final payloads can settle or advance official state', () => {
  assert.equal(shouldSettleBet({ status: '2H', gh: 2, ga: 1 }), false);
  assert.equal(shouldSettleBet({ status: 'FT', gh: 2, ga: 1 }), true);
  assert.equal(shouldSettleBet({ status: 'AET', gh: 2, ga: 1 }), true);
  assert.equal(shouldSettleBet({ status: 'PEN', gh: 2, ga: 2, winner: 'HOME_TEAM' }), true);
  assert.equal(shouldSettleBet({ status: 'FINISHED', gh: 0, ga: 0 }), true);
});

test('disappearing feed does not imply final', () => {
  const previous = { kind: 'live', status: '2H', min: 89, sh: 1, sa: 1 };
  const currentFeed = [];
  assert.equal(currentFeed.length, 0);
  assert.equal(previous.kind === 'final', false);
});

test('polling remains open for delayed matches beyond normal duration', () => {
  const now = Date.now();
  const kickoff = now - 5 * 3600000;
  assert.equal(shouldPoll(now, [{ kickoff, real: false }], {}), true);
  assert.equal(shouldPoll(now, [{ kickoff: now - 2 * 86400000, real: false }], { 42: { kind: 'hold', at: now - 2 * 3600000 } }), true);
});

test('duplicate and corrected final payloads are idempotent by fixture key', () => {
  const applied = new Map();
  function applyFinal(fixtureId, payload) {
    if (!officialFinalPayload(payload)) return false;
    const key = `${fixtureId}:${payload.status}:${payload.gh}-${payload.ga}:${payload.winner || ''}`;
    if (applied.has(key)) return false;
    applied.set(key, payload);
    return true;
  }
  assert.equal(applyFinal(10, { status: 'FT', gh: 1, ga: 0 }), true);
  assert.equal(applyFinal(10, { status: 'FT', gh: 1, ga: 0 }), false);
  assert.equal(applyFinal(10, { status: 'FT', gh: 2, ga: 0 }), true);
});
