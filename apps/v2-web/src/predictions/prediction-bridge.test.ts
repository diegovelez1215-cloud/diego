import { describe, expect, it } from 'vitest';
import { canonicalTournamentSnapshot } from '../domain/tournament-bridge';
import type { FixtureSummary, TournamentSnapshot } from '../domain/contracts';
import type { LocalPrediction } from './contracts';
import { canChooseOutcome, gradePrediction, isEligibleFixture, isLockedAtKickoff, predictionFixtures } from './prediction-bridge';

const snapshot = canonicalTournamentSnapshot();
const opener = snapshot.fixtures.find((fixture) => fixture.id === 1)!;
const unresolved = snapshot.fixtures.find((fixture) => fixture.id === 73)!;
const call: LocalPrediction = Object.freeze({ fixtureId: 1, outcome: 'home', confidence: 2, confirmedAt: '2026-06-10T12:00:00.000Z', kickoffEpoch: opener.kickoffEpoch });

function withFixture(fixture: FixtureSummary): TournamentSnapshot {
  return Object.freeze({ ...snapshot, fixtures: Object.freeze(snapshot.fixtures.map((candidate) => candidate.id === fixture.id ? fixture : candidate)) });
}

describe('V2 prediction bridge', () => {
  it('offers only resolved canonical scheduled fixtures before kickoff', () => {
    const fixtures = predictionFixtures(snapshot, [], opener.kickoffEpoch - 1);
    expect(fixtures).toContainEqual(opener);
    expect(fixtures.some((fixture) => fixture.id === unresolved.id)).toBe(false);
    expect(fixtures.every((fixture) => snapshot.fixtures.includes(fixture))).toBe(true);
    expect(isEligibleFixture(opener, opener.kickoffEpoch - 1)).toBe(true);
  });

  it('rejects impossible unresolved-team choices and permits draws only in group fixtures', () => {
    expect(canChooseOutcome(unresolved, 'home')).toBe(false);
    expect(canChooseOutcome(unresolved, 'away')).toBe(false);
    expect(canChooseOutcome(unresolved, 'draw')).toBe(false);
    expect(canChooseOutcome(opener, 'draw')).toBe(true);
    const knockout = { ...opener, stage: 'r32' as const };
    expect(canChooseOutcome(knockout, 'draw')).toBe(false);
  });

  it('locks precisely at canonical kickoff', () => {
    expect(isLockedAtKickoff(opener, opener.kickoffEpoch - 1)).toBe(false);
    expect(isLockedAtKickoff(opener, opener.kickoffEpoch)).toBe(true);
    expect(isLockedAtKickoff(opener, opener.kickoffEpoch + 1)).toBe(true);
  });

  it('keeps picks pending without a validated final and never grades a simulated shape', () => {
    expect(gradePrediction(call, opener)).toEqual({ state: 'pending', officialWinner: null });
    expect('simulation' in (opener.status as object)).toBe(false);
  });

  it('grades correct and incorrect calls from only the typed validated final, idempotently', () => {
    const finalFixture = Object.freeze({ ...opener, status: Object.freeze({ kind: 'final' as const, score: Object.freeze({ home: 2, away: 0 }) }), winner: 'home' as const });
    expect(gradePrediction(call, finalFixture)).toEqual({ state: 'correct', officialWinner: 'home' });
    expect(gradePrediction({ ...call, outcome: 'away' }, finalFixture)).toEqual({ state: 'incorrect', officialWinner: 'home' });
    expect(gradePrediction(call, finalFixture)).toEqual(gradePrediction(call, finalFixture));
    expect(withFixture(finalFixture).fixtures.find((fixture) => fixture.id === 1)?.status.kind).toBe('final');
  });

  it('reprojects a corrected validated final deterministically without mutating the stored call', () => {
    const homeFinal = Object.freeze({ ...opener, status: Object.freeze({ kind: 'final' as const, score: Object.freeze({ home: 1, away: 0 }) }), winner: 'home' as const });
    const awayFinal = Object.freeze({ ...homeFinal, status: Object.freeze({ kind: 'final' as const, score: Object.freeze({ home: 0, away: 1 }) }), winner: 'away' as const });
    expect(gradePrediction(call, homeFinal).state).toBe('correct');
    expect(gradePrediction(call, awayFinal).state).toBe('incorrect');
    expect(call).toEqual({ fixtureId: 1, outcome: 'home', confidence: 2, confirmedAt: '2026-06-10T12:00:00.000Z', kickoffEpoch: opener.kickoffEpoch });
  });
});
