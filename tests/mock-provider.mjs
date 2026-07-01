// Shared deterministic provider mocks for tests and e2e.
// Builds a COMPLETE, internally consistent group stage: the higher-rated team
// wins 2–0, equal ratings draw 1–1. Every group completes, thirds decide, and
// Round-of-32 identities resolve through the same derivation the app uses.
import { FIXTURES, RATINGS } from '../src/data/fixtures.js';
import { teamName, computeStandings, resolveSlots } from '../src/core/canonical-truth.js';

export const OK = { configured: true, sourceStatus: 'fresh', isStale: false };

export function groupResultFor(f) {
  const rh = RATINGS[f.home] || 70; const ra = RATINGS[f.away] || 70;
  if (rh > ra) return { gh: 2, ga: 0, winner: 'HOME_TEAM' };
  if (rh < ra) return { gh: 0, ga: 2, winner: 'AWAY_TEAM' };
  return { gh: 1, ga: 1, winner: 'DRAW' };
}

/** All 72 group finals as slim provider entries (football-data shape). */
export function fullGroupFinished() {
  return FIXTURES.filter((f) => f.stage === 'group').map((f) => {
    const r = groupResultFor(f);
    return {
      providerId: 90000 + f.id,
      home: teamName(f.home), away: teamName(f.away),
      gh: r.gh, ga: r.ga, winner: r.winner,
      status: 'FINISHED', stage: 'GROUP_STAGE', utcDate: f.kickoff,
    };
  });
}

export function fullResultsPayload() {
  return { ...OK, finished: fullGroupFinished(), live: [], hold: [], scheduled: [] };
}

/** The derived slots for the mock world — lets tests/e2e reference real names. */
export function mockSlots() {
  const finals = new Map();
  for (const f of FIXTURES.filter((x) => x.stage === 'group')) {
    const r = groupResultFor(f);
    finals.set(f.id, { gh: r.gh, ga: r.ga });
  }
  return resolveSlots(computeStandings(finals), new Map());
}

/** A live payload for a given knockout fixture using its resolved mock identity. */
export function livePayloadFor(fixtureId, { gh = 1, ga = 0, min = 63 } = {}) {
  const slots = mockSlots();
  const s = slots.get(fixtureId);
  const fx = FIXTURES.find((f) => f.id === fixtureId);
  if (!s || !s.home || !s.away) throw new Error('mock slots unresolved for ' + fixtureId);
  return {
    ...OK,
    response: [{
      id: 91000 + fixtureId,
      home: teamName(s.home), away: teamName(s.away),
      gh, ga, min, status: '2H', statusLong: 'Second Half', kind: 'live', date: fx.kickoff,
    }],
    finished: [],
  };
}
