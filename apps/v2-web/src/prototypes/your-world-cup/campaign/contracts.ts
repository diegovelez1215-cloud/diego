export const CAMPAIGN_STORAGE_KEY = 'u26v2.your-world-cup.campaign';

export type Shape = '4-3-3-wide' | '4-2-3-1-control';
export type Press = 'patient' | 'balanced' | 'aggressive';
export type FinalThird = 'wings' | 'number-10' | 'direct-runners';
export type Tactics = Readonly<{ shape: Shape; press: Press; finalThird: FinalThird }>;
export type CampaignStage = 'campaign' | 'tactics' | 'match' | 'result' | 'campaign-complete';
export type MatchPhase = 'first-half' | 'halftime' | 'second-half' | 'pivotal' | 'closing' | 'full-time';
export type MatchSpeed = 1 | 2 | 4;
export type MatchPresentationStep = 'simulation' | 'control-intro' | 'control-active' | 'control-outcome' | 'control-returning';
export type PersistedVarState = null | 'checking' | 'reviewing' | 'confirmed' | 'overturned';
export type MomentOutcome = 'goal' | 'save' | 'interception' | 'expired';
export type PlayerId = 'lw' | 'ten' | 'rw' | 'st';
export type ShotZone = 'left' | 'center' | 'right';
export type MomentReplayEvent = Readonly<{ tick: number; action: Readonly<{ type: 'pass'; target: PlayerId } | { type: 'shoot'; zone: ShotZone }> }>;
export type MomentProgress = Readonly<{ tick: number; events: readonly MomentReplayEvent[] }>;

export type MatchCheckpoint = Readonly<{
  planVersion: 1;
  fixtureId: string;
  tick: number;
  speed: MatchSpeed;
  phase: MatchPhase;
  moment: MomentProgress;
  momentOutcome: MomentOutcome | null;
  presentationStep: MatchPresentationStep;
  varState: PersistedVarState;
}>;

export type CompletedMatch = Readonly<{
  fixtureId: 'arg-nga';
  home: 'Argentina';
  away: 'Nigeria';
  homeGoals: number;
  awayGoals: number;
  outcome: 'win' | 'draw' | 'loss';
  decisiveMoment: MomentOutcome;
  tactics: Tactics;
  replay: Readonly<{ seed: number; progress: MomentProgress }>;
}>;

export type CampaignStateV2 = Readonly<{
  version: 3;
  campaignId: string;
  seed: number;
  nation: 'Argentina';
  group: readonly ['Argentina', 'Nigeria', 'Poland', 'New Zealand'];
  stage: CampaignStage;
  tactics: Tactics | null;
  match: MatchCheckpoint;
  completedMatches: readonly CompletedMatch[];
}>;

// Kept as an export alias while the package migrates its existing tests and callers.
export type CampaignStateV1 = CampaignStateV2;

export const DEFAULT_TACTICS: Tactics = Object.freeze({
  shape: '4-3-3-wide',
  press: 'balanced',
  finalThird: 'wings',
});

export const DEFAULT_MATCH_CHECKPOINT: MatchCheckpoint = Object.freeze({
  planVersion: 1,
  fixtureId: 'arg-nga',
  tick: 0,
  speed: 1,
  phase: 'first-half',
  moment: Object.freeze({ tick: 0, events: Object.freeze([]) }),
  momentOutcome: null,
  presentationStep: 'simulation',
  varState: null,
});

export function createCampaign(seed = 26062026): CampaignStateV2 {
  return Object.freeze({
    version: 3,
    campaignId: 'argentina-group-c-001',
    seed,
    nation: 'Argentina',
    group: ['Argentina', 'Nigeria', 'Poland', 'New Zealand'] as const,
    stage: 'campaign',
    tactics: null,
    match: DEFAULT_MATCH_CHECKPOINT,
    completedMatches: [],
  });
}
