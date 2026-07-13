import type { FixtureSummary, TournamentSnapshot } from '../domain/contracts';
import {
  drawAllowed,
  hasResolvedParticipants,
  type LocalPrediction,
  type PredictionFixtureState,
  type PredictionGrade,
  type PredictionOutcome,
} from './contracts';


function isOutcome(value: unknown): value is PredictionOutcome {
  return value === 'home' || value === 'away' || value === 'draw';
}

/** Localhost-only deterministic clock for browser verification. */
export function predictionNow(): number {
  if (typeof window === 'undefined' || window.location.hostname !== '127.0.0.1' || (window.localStorage.getItem('__u26v2_prediction_test') !== '1' && !new URLSearchParams(window.location.search).has('__v2e2e'))) return Date.now();
  const configured = Number(window.localStorage.getItem('__u26v2_prediction_now'));
  return Number.isFinite(configured) ? configured : Date.now();
}

/** V1's settled-pick contract: only a validated final winner can grade a call. */
export function gradePrediction(record: LocalPrediction, fixture: FixtureSummary): PredictionGrade {
  if (fixture.status.kind !== 'final' || !fixture.winner || !isOutcome(fixture.winner)) {
    return Object.freeze({ state: 'pending', officialWinner: null });
  }
  return Object.freeze({
    state: fixture.winner === record.outcome ? 'correct' : 'incorrect',
    officialWinner: fixture.winner,
  });
}

export function fixtureByCanonicalId(snapshot: TournamentSnapshot, fixtureId: number): FixtureSummary | null {
  return snapshot.fixtures.find((fixture) => fixture.id === fixtureId) || null;
}

/** V1's Prediction Run eligibility: a canonical, resolved, pre-kickoff fixture. */
export function isEligibleFixture(fixture: FixtureSummary, now = predictionNow()): boolean {
  return hasResolvedParticipants(fixture)
    && fixture.status.kind === 'scheduled'
    && fixture.kickoffEpoch > now;
}

export function canChooseOutcome(fixture: FixtureSummary, outcome: PredictionOutcome): boolean {
  if (!hasResolvedParticipants(fixture)) return false;
  return outcome !== 'draw' || drawAllowed(fixture);
}

export function isLockedAtKickoff(fixture: FixtureSummary, now = predictionNow()): boolean {
  return now >= fixture.kickoffEpoch;
}

export function predictionState(fixture: FixtureSummary, record: LocalPrediction | undefined, now = predictionNow()): PredictionFixtureState {
  if (!record) return isLockedAtKickoff(fixture, now) ? 'locked' : 'scheduled';
  const grade = gradePrediction(record, fixture);
  if (grade.state !== 'pending') return grade.state;
  return isLockedAtKickoff(fixture, now) ? 'pending' : 'confirmed';
}

/** Eligible fixtures plus saved canonical records, never provider-created rows. */
export function predictionFixtures(snapshot: TournamentSnapshot, records: readonly LocalPrediction[], now = predictionNow()): readonly FixtureSummary[] {
  const recordedIds = new Set(records.map((record) => record.fixtureId));
  return Object.freeze(snapshot.fixtures.filter((fixture) => isEligibleFixture(fixture, now) || recordedIds.has(fixture.id)));
}

export function predictionCounts(snapshot: TournamentSnapshot, records: readonly LocalPrediction[], now = predictionNow()) {
  let pending = 0;
  let graded = 0;
  let correct = 0;
  for (const record of records) {
    const fixture = fixtureByCanonicalId(snapshot, record.fixtureId);
    if (!fixture) continue;
    const grade = gradePrediction(record, fixture);
    if (grade.state === 'pending') pending++;
    else {
      graded++;
      if (grade.state === 'correct') correct++;
    }
  }
  return Object.freeze({
    eligible: snapshot.fixtures.filter((fixture) => isEligibleFixture(fixture, now)).length,
    pending,
    graded,
    correct,
  });
}
