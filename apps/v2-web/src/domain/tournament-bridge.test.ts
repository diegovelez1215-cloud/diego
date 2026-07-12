import { describe, expect, it } from 'vitest';
import {
  applyOfficialOverlay,
  canonicalFixtures,
  canonicalTournamentSnapshot,
  fixtureById,
  fixturesOnTournamentDay,
  groupStandingsFromFinals,
  knockoutSlotsFromFinals,
  normalizeOfficialOverlayInput,
} from './tournament-bridge';
import type { FixtureSummary, OfficialScore } from './contracts';

// @ts-expect-error The tests characterize the existing JavaScript authority.
import { allFixtures, computeStandings, fixturesOnDay as v1FixturesOnDay, resolveSlots, winnerFeeds } from '../../../../src/core/canonical-truth.js';
// @ts-expect-error The tests characterize the existing JavaScript authority.
import { fixture as v1Fixture } from '../../../../src/core/canonical-truth.js';

const providerOk = { configured: true, sourceStatus: 'fresh', isStale: false };

function groupAFinals(): Map<number, OfficialScore> {
  const order = ['MEX', 'RSA', 'KOR', 'CZE'];
  return new Map((allFixtures() as Array<{ id: number; stage: string; group?: string; home: string; away: string }>)
    .filter((fixture) => fixture.stage === 'group' && fixture.group === 'A')
    .map((fixture) => {
      const homeRank = order.indexOf(fixture.home);
      const awayRank = order.indexOf(fixture.away);
      return [fixture.id, homeRank < awayRank ? { home: 2, away: 0 } : { home: 0, away: 2 }] as const;
    }));
}

describe('typed tournament-domain bridge', () => {
  it('exposes all 104 canonical fixtures exactly once', () => {
    const fixtures = canonicalFixtures();
    expect(fixtures).toHaveLength(104);
    expect(new Set(fixtures.map((fixture) => fixture.id)).size).toBe(104);
  });

  it('preserves V1 fixture identity and kickoff values', () => {
    const bridge = fixtureById(1);
    const v1 = v1Fixture(1) as { id: number; kickoff: string; epoch: number };
    expect(bridge).toMatchObject({ id: v1.id, kickoff: v1.kickoff, kickoffEpoch: v1.epoch });
  });

  it('keeps fixtures-by-day in V1 chronological order', () => {
    const bridge = fixturesOnTournamentDay('2026-07-01');
    expect(bridge.map((fixture) => fixture.id)).toEqual((v1FixturesOnDay('2026-07-01') as Array<{ id: number }>).map((fixture) => fixture.id));
    expect(bridge.every((fixture, index) => index === 0 || fixture.kickoffEpoch >= bridge[index - 1].kickoffEpoch)).toBe(true);
  });

  it('keeps untouched groups explicitly not started', () => {
    const groupA = groupStandingsFromFinals(new Map()).find((group) => group.group === 'A');
    expect(groupA?.state).toBe('not-started');
    expect(groupA?.rows.every((row) => row.played === 0)).toBe(true);
  });

  it('derives supplied official finals with the same standings as V1', () => {
    const finals = groupAFinals();
    const bridge = groupStandingsFromFinals(finals).find((group) => group.group === 'A');
    const v1 = computeStandings(new Map([...finals].map(([id, result]) => [id, { gh: result.home, ga: result.away }])));
    expect(bridge?.rows.map((row) => row.team.code)).toEqual(v1.groups.A.map((row: { code: string }) => row.code));
    expect(bridge?.rows.map((row) => row.points)).toEqual(v1.groups.A.map((row: { pts: number }) => row.pts));
  });

  it('marks a partially played group provisional', () => {
    const first = (allFixtures() as Array<{ id: number; stage: string; group?: string }>).find((fixture) => fixture.stage === 'group' && fixture.group === 'A');
    const groupA = groupStandingsFromFinals(new Map([[first!.id, { home: 2, away: 0 }]])).find((group) => group.group === 'A');
    expect(groupA?.state).toBe('provisional');
    expect(groupA?.rows.reduce((total, row) => total + row.played, 0)).toBe(2);
  });

  it('resolves completed-group qualification identically to V1', () => {
    const finals = groupAFinals();
    const bridge = knockoutSlotsFromFinals(finals).get(79);
    const v1Standings = computeStandings(new Map([...finals].map(([id, result]) => [id, { gh: result.home, ga: result.away }])));
    const v1Slots = resolveSlots(v1Standings, new Map());
    expect(bridge?.home?.code).toBe(v1Slots.get(79).home);
    expect(bridge?.home?.code).toBe('MEX');
    expect(bridge?.away).toBeNull();
  });

  it('keeps unresolved knockout participants and scores absent', () => {
    const fixture = fixtureById(80)!;
    expect(fixture.home.kind).toBe('unresolved');
    expect(fixture.away.kind).toBe('unresolved');
    expect(fixture.status).toEqual({ kind: 'scheduled', score: null });
  });

  it('preserves V1 bracket rounds and advancement relationships', () => {
    const snapshot = canonicalTournamentSnapshot();
    const r32 = snapshot.bracket.find((round) => round.stage === 'r32');
    const match80 = r32?.matches.find((match) => match.fixture.id === 80);
    expect(snapshot.bracket.map((round) => round.stage)).toEqual(['r32', 'r16', 'qf', 'sf', 'bronze', 'final']);
    const v1Feed = winnerFeeds(80) as { id: number; side: 'home' | 'away' };
    expect(match80?.winnerFeeds).toEqual({ fixtureId: v1Feed.id, side: v1Feed.side });
  });

  it('rejects a provider final with mismatched canonical identity', () => {
    const applied = applyOfficialOverlay({
      source: 'official-provider',
      results: {
        ...providerOk,
        finished: [{ home: 'Atlantis', away: 'El Dorado', gh: 9, ga: 9, status: 'FINISHED', utcDate: '2026-06-11T19:00:00Z' }],
      },
    });
    expect(applied.accepted).toBe(true);
    if (applied.accepted) {
      expect(applied.snapshot.rejectedProviderEntries).toBeGreaterThan(0);
      expect(applied.snapshot.fixtures).toHaveLength(104);
      expect(applied.snapshot.fixtures.find((fixture) => fixture.id === 1)?.status.kind).toBe('scheduled');
    }
  });

  it('normalizes flipped provider orientation through the V1 authority pipeline', () => {
    const applied = applyOfficialOverlay({
      source: 'official-provider',
      results: {
        ...providerOk,
        finished: [{ home: 'South Africa', away: 'Mexico', gh: 0, ga: 2, winner: 'AWAY_TEAM', status: 'FINISHED', utcDate: '2026-06-11T19:00:00Z' }],
      },
    });
    expect(applied.accepted).toBe(true);
    if (applied.accepted) {
      const fixture = applied.snapshot.fixtures.find((candidate) => candidate.id === 1)!;
      expect(fixture.status).toEqual({ kind: 'final', score: { home: 2, away: 0 } });
      expect(fixture.winner).toBe('home');
    }
  });

  it('allows a live unresolved knockout status while suppressing its score', () => {
    const applied = applyOfficialOverlay({
      source: 'official-provider',
      live: {
        ...providerOk,
        response: [{ home: 'England', away: 'DR Congo', gh: 1, ga: 0, min: 63, status: '2H', kind: 'live', date: '2026-07-01T16:00:00Z' }],
      },
    });
    expect(applied.accepted).toBe(true);
    if (applied.accepted) {
      const fixture = applied.snapshot.fixtures.find((candidate) => candidate.id === 80)!;
      expect(fixture.status).toEqual({ kind: 'live', minute: 63, score: null, scoreState: 'pending' });
      expect(fixture.home.kind).toBe('unresolved');
    }
  });

  it('rejects simulation and Play-shaped objects from the official overlay contract', () => {
    expect(normalizeOfficialOverlayInput({ source: 'official-provider', finals: {} })).toMatchObject({ accepted: false, reason: 'simulation-or-play-state' });
    expect(normalizeOfficialOverlayInput({ source: 'play', results: {} })).toMatchObject({ accepted: false, reason: 'wrong-source' });
  });

  it('returns frozen projections that cannot mutate V1 canonical fixture data', () => {
    const projected = fixtureById(1)! as FixtureSummary & { venue: string };
    const before = (v1Fixture(1) as { venue: string }).venue;
    expect(() => { projected.venue = 'Invented venue'; }).toThrow();
    expect((v1Fixture(1) as { venue: string }).venue).toBe(before);
  });
});
