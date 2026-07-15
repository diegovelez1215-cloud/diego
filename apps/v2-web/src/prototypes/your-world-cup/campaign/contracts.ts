export const CAMPAIGN_STORAGE_KEY = 'u26v2.your-world-cup.campaign';

export type Shape = '4-3-3-wide' | '4-2-3-1-control';
export type Press = 'patient' | 'balanced' | 'aggressive';
export type FinalThird = 'wings' | 'number-10' | 'direct-runners';
export type Tactics = Readonly<{ shape: Shape; press: Press; finalThird: FinalThird }>;
export type CampaignStage = 'campaign' | 'tactics' | 'match-story' | 'moment' | 'result';
export type MomentOutcome = 'goal' | 'save' | 'interception' | 'expired';

export type CompletedMatch = Readonly<{
  fixtureId: 'arg-nga';
  home: 'Argentina';
  away: 'Nigeria';
  homeGoals: number;
  awayGoals: number;
  outcome: 'win' | 'draw' | 'loss';
  decisiveMoment: MomentOutcome;
  tactics: Tactics;
  replay: Readonly<{ seed: number; eventInputs: readonly string[] }>;
}>;

export type CampaignStateV1 = Readonly<{
  version: 1;
  campaignId: string;
  seed: number;
  nation: 'Argentina';
  group: readonly ['Argentina', 'Nigeria', 'Poland', 'New Zealand'];
  stage: CampaignStage;
  tactics: Tactics | null;
  eventInputs: readonly string[];
  completedMatches: readonly CompletedMatch[];
}>;

export const DEFAULT_TACTICS: Tactics = Object.freeze({
  shape: '4-3-3-wide',
  press: 'balanced',
  finalThird: 'wings',
});

export function createCampaign(seed = 26062026): CampaignStateV1 {
  return Object.freeze({
    version: 1,
    campaignId: 'argentina-group-c-001',
    seed,
    nation: 'Argentina',
    group: ['Argentina', 'Nigeria', 'Poland', 'New Zealand'] as const,
    stage: 'campaign',
    tactics: null,
    eventInputs: [],
    completedMatches: [],
  });
}
