import type { FixtureSummary } from '../domain/contracts';

export const PREDICTION_STORAGE_KEY = 'u26v2.predictions.local';
export const PREDICTION_SCHEMA_VERSION = 1;

export type PredictionOutcome = 'home' | 'away' | 'draw';
export type PredictionConfidence = 1 | 2 | 3;

/** The only local prediction payload. Official truth is always projected, never stored. */
export type LocalPrediction = Readonly<{
  fixtureId: number;
  outcome: PredictionOutcome;
  confidence?: PredictionConfidence;
  confirmedAt: string;
  kickoffEpoch: number;
}>;

export type PredictionStore = Readonly<{
  version: typeof PREDICTION_SCHEMA_VERSION;
  records: readonly LocalPrediction[];
}>;

export type PredictionGrade = Readonly<{
  state: 'pending' | 'correct' | 'incorrect';
  officialWinner: PredictionOutcome | null;
}>;

export type PredictionFixtureState =
  | 'scheduled'
  | 'confirmed'
  | 'locked'
  | 'pending'
  | 'correct'
  | 'incorrect';

export function hasResolvedParticipants(fixture: FixtureSummary): boolean {
  return fixture.home.kind === 'team' && fixture.away.kind === 'team';
}

export function drawAllowed(fixture: FixtureSummary): boolean {
  return fixture.stage === 'group';
}
