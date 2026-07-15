import {
  CAMPAIGN_STORAGE_KEY,
  createCampaign,
  DEFAULT_MATCH_CHECKPOINT,
  type CampaignStateV2,
  type CompletedMatch,
  type MatchCheckpoint,
  type MatchPhase,
  type MatchSpeed,
  type MomentProgress,
  type Tactics,
} from './contracts';

const SHAPES = ['4-3-3-wide', '4-2-3-1-control'];
const PRESSES = ['patient', 'balanced', 'aggressive'];
const PLANS = ['wings', 'number-10', 'direct-runners'];
const STAGES = ['campaign', 'tactics', 'match', 'result', 'campaign-complete'];
const LEGACY_STAGES = ['campaign', 'tactics', 'match-story', 'moment', 'result', 'campaign-complete'];
const PHASES: readonly MatchPhase[] = ['first-half', 'halftime', 'second-half', 'pivotal', 'closing', 'full-time'];
const SPEEDS: readonly MatchSpeed[] = [1, 2, 4];
const MOMENTS = ['goal', 'save', 'interception', 'expired'];

function tactics(value: unknown): Tactics | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  return SHAPES.includes(String(item.shape)) && PRESSES.includes(String(item.press)) && PLANS.includes(String(item.finalThird))
    ? { shape: item.shape as Tactics['shape'], press: item.press as Tactics['press'], finalThird: item.finalThird as Tactics['finalThird'] }
    : null;
}

function progress(value: unknown): MomentProgress | null {
  if (!value || typeof value !== 'object') return null;
  const next = value as MomentProgress;
  if (!Number.isInteger(next.tick) || next.tick < 0 || next.tick > 20 || !Array.isArray(next.events) || next.events.length > 24 || !next.events.every((event) => Number.isInteger(event?.tick) && event.tick >= 0 && event.tick <= next.tick && (event.action?.type === 'pass' ? ['lw', 'ten', 'rw', 'st'].includes(event.action.target) : event.action?.type === 'shoot' && ['left', 'center', 'right'].includes(event.action.zone)))) return null;
  return next.events.every((event, index) => index === 0 || event.tick >= next.events[index - 1].tick)
    ? { tick: next.tick, events: next.events }
    : null;
}

function checkpoint(value: unknown): MatchCheckpoint | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const moment = progress(item.moment);
  if (!Number.isInteger(item.tick) || Number(item.tick) < 0 || Number(item.tick) > 90 || !SPEEDS.includes(item.speed as MatchSpeed) || !PHASES.includes(item.phase as MatchPhase) || !moment || (item.momentOutcome !== null && !MOMENTS.includes(String(item.momentOutcome)))) return null;
  return { tick: item.tick as number, speed: item.speed as MatchSpeed, phase: item.phase as MatchPhase, moment, momentOutcome: item.momentOutcome as MatchCheckpoint['momentOutcome'] };
}

function completed(value: unknown, seed: number): readonly CompletedMatch[] | null {
  if (!Array.isArray(value) || value.length > 1) return null;
  if (!value.length) return [];
  const item = value[0] as Record<string, unknown>;
  const plan = tactics(item.tactics);
  const replay = item.replay as Record<string, unknown> | undefined;
  const replayProgress = progress(replay?.progress);
  if (!plan || !replay || item.fixtureId !== 'arg-nga' || item.home !== 'Argentina' || item.away !== 'Nigeria' || !Number.isInteger(item.homeGoals) || !Number.isInteger(item.awayGoals) || Number(item.homeGoals) < 0 || Number(item.awayGoals) < 0 || Number(item.homeGoals) > 10 || Number(item.awayGoals) > 10 || !['win', 'draw', 'loss'].includes(String(item.outcome)) || !MOMENTS.includes(String(item.decisiveMoment)) || replay.seed !== seed || !replayProgress) return null;
  const expectedOutcome = Number(item.homeGoals) > Number(item.awayGoals) ? 'win' : Number(item.homeGoals) === Number(item.awayGoals) ? 'draw' : 'loss';
  if (expectedOutcome !== item.outcome) return null;
  return [{
    fixtureId: 'arg-nga', home: 'Argentina', away: 'Nigeria',
    homeGoals: item.homeGoals as number, awayGoals: item.awayGoals as number,
    outcome: item.outcome as CompletedMatch['outcome'], decisiveMoment: item.decisiveMoment as CompletedMatch['decisiveMoment'],
    tactics: plan, replay: { seed, progress: replayProgress },
  }];
}

function common(value: Record<string, unknown>) {
  return value.campaignId === 'argentina-group-c-001'
    && Number.isInteger(value.seed)
    && value.nation === 'Argentina'
    && Array.isArray(value.group)
    && value.group.join('|') === 'Argentina|Nigeria|Poland|New Zealand';
}

export function migrateCampaign(value: unknown): CampaignStateV2 | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (!common(item) || item.version !== 1 || !LEGACY_STAGES.includes(String(item.stage))) return null;
  const plan = item.tactics === null ? null : tactics(item.tactics);
  const legacyMoment = progress(item.moment);
  const matches = completed(item.completedMatches, item.seed as number);
  if (!legacyMoment || !matches || (item.tactics !== null && !plan)) return null;
  const legacyStage = String(item.stage);
  const stage: CampaignStateV2['stage'] = legacyStage === 'match-story' || legacyStage === 'moment' ? 'match' : legacyStage as CampaignStateV2['stage'];
  const match: MatchCheckpoint = legacyStage === 'moment'
    ? { tick: 68, speed: 1, phase: 'pivotal', moment: legacyMoment, momentOutcome: matches[0]?.decisiveMoment ?? null }
    : legacyStage === 'result' || legacyStage === 'campaign-complete'
      ? { tick: 90, speed: 1, phase: 'full-time', moment: legacyMoment, momentOutcome: matches[0]?.decisiveMoment ?? 'expired' }
      : DEFAULT_MATCH_CHECKPOINT;
  return { ...createCampaign(item.seed as number), stage, tactics: plan, match, completedMatches: matches };
}

export function sanitizeCampaign(value: unknown): CampaignStateV2 | null {
  const migrated = migrateCampaign(value);
  if (migrated) return migrated;
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (!common(item) || item.version !== 2 || !STAGES.includes(String(item.stage))) return null;
  const plan = item.tactics === null ? null : tactics(item.tactics);
  const match = checkpoint(item.match);
  const matches = completed(item.completedMatches, item.seed as number);
  if (!match || !matches || (item.tactics !== null && !plan)) return null;
  const stage = item.stage as CampaignStateV2['stage'];
  const finished = stage === 'result' || stage === 'campaign-complete';
  if ((stage !== 'campaign' && !plan) || (finished && matches.length !== 1) || (!finished && matches.length !== 0)) return null;
  return { version: 2, campaignId: 'argentina-group-c-001', seed: item.seed as number, nation: 'Argentina', group: ['Argentina', 'Nigeria', 'Poland', 'New Zealand'], stage, tactics: plan, match, completedMatches: matches };
}

export function readCampaign(storage: Pick<Storage, 'getItem'>): CampaignStateV2 | null {
  try { const raw = storage.getItem(CAMPAIGN_STORAGE_KEY); return raw ? sanitizeCampaign(JSON.parse(raw)) : null; } catch { return null; }
}

export function writeCampaign(storage: Pick<Storage, 'setItem'>, state: CampaignStateV2) { storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(state)); }
export function resetCampaign(storage: Pick<Storage, 'removeItem'>) { storage.removeItem(CAMPAIGN_STORAGE_KEY); }
export function recordMatch(state: CampaignStateV2, match: CompletedMatch): CampaignStateV2 { return state.completedMatches.length ? state : { ...state, stage: 'result', match: { ...state.match, tick: 90, phase: 'full-time', momentOutcome: match.decisiveMoment }, completedMatches: [match] }; }
export function checkpointMatch(state: CampaignStateV2, match: MatchCheckpoint): CampaignStateV2 { return state.stage === 'match' && !state.completedMatches.length ? { ...state, match } : state; }
export { CAMPAIGN_STORAGE_KEY, createCampaign };
