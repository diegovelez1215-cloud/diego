import { CAMPAIGN_STORAGE_KEY, createCampaign, type CampaignStateV1, type CompletedMatch, type MomentProgress, type Tactics } from './contracts';
import { replayMoment, validMomentProgress } from './moment-engine';
import { completeMatch, simulateMatch } from './simulation';

const SHAPES = ['4-3-3-wide', '4-2-3-1-control']; const PRESSES = ['patient', 'balanced', 'aggressive']; const PLANS = ['wings', 'number-10', 'direct-runners'];
const STAGES = ['campaign', 'tactics', 'match-story', 'moment', 'result', 'campaign-complete']; const MOMENTS = ['goal', 'save', 'interception', 'expired'];

function tactics(value: unknown): Tactics | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  return SHAPES.includes(String(item.shape)) && PRESSES.includes(String(item.press)) && PLANS.includes(String(item.finalThird)) ? { shape: item.shape as Tactics['shape'], press: item.press as Tactics['press'], finalThird: item.finalThird as Tactics['finalThird'] } : null;
}

function progress(value: unknown): MomentProgress | null {
  if (!validMomentProgress(value)) return null;
  const next = value as MomentProgress;
  const ordered = next.events.every((event, index) => index === 0 || event.tick >= next.events[index - 1].tick);
  return ordered ? { tick: next.tick, events: next.events } : null;
}

function completed(value: unknown, seed: number): readonly CompletedMatch[] | null {
  if (!Array.isArray(value) || value.length > 1) return null;
  if (!value.length) return [];
  const item = value[0] as Record<string, unknown>; const plan = tactics(item.tactics); const replay = item.replay as Record<string, unknown> | undefined;
  const replayProgress = progress(replay?.progress);
  if (!plan || !replay || item.fixtureId !== 'arg-nga' || item.home !== 'Argentina' || item.away !== 'Nigeria' || !Number.isInteger(item.homeGoals) || !Number.isInteger(item.awayGoals) || (item.homeGoals as number) < 0 || (item.awayGoals as number) < 0 || (item.homeGoals as number) > 10 || (item.awayGoals as number) > 10 || !['win', 'draw', 'loss'].includes(String(item.outcome)) || !MOMENTS.includes(String(item.decisiveMoment)) || replay.seed !== seed || !replayProgress) return null;
  const moment = replayMoment(seed, plan, replayProgress);
  const expected = completeMatch(simulateMatch(seed, plan), moment.outcome ?? 'expired', plan, seed, replayProgress);
  if (moment.outcome !== item.decisiveMoment || expected.homeGoals !== item.homeGoals || expected.awayGoals !== item.awayGoals || expected.outcome !== item.outcome) return null;
  return [{ fixtureId: 'arg-nga', home: 'Argentina', away: 'Nigeria', homeGoals: item.homeGoals as number, awayGoals: item.awayGoals as number, outcome: item.outcome as CompletedMatch['outcome'], decisiveMoment: item.decisiveMoment as CompletedMatch['decisiveMoment'], tactics: plan, replay: { seed, progress: replayProgress } }];
}

export function sanitizeCampaign(value: unknown): CampaignStateV1 | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>; const plan = item.tactics === null ? null : tactics(item.tactics); const moment = progress(item.moment); const matches = completed(item.completedMatches, item.seed as number);
  if (item.version !== 1 || item.campaignId !== 'argentina-group-c-001' || !Number.isInteger(item.seed) || item.nation !== 'Argentina' || !Array.isArray(item.group) || item.group.join('|') !== 'Argentina|Nigeria|Poland|New Zealand' || !STAGES.includes(String(item.stage)) || !moment || !matches || (item.tactics !== null && !plan)) return null;
  const stage = item.stage as CampaignStateV1['stage']; const isFinished = stage === 'result' || stage === 'campaign-complete';
  if ((stage !== 'campaign' && !plan) || (isFinished && matches.length !== 1) || (!isFinished && matches.length !== 0) || (stage !== 'moment' && moment.events.length !== 0 && !isFinished)) return null;
  return { version: 1, campaignId: 'argentina-group-c-001', seed: item.seed as number, nation: 'Argentina', group: ['Argentina', 'Nigeria', 'Poland', 'New Zealand'], stage, tactics: plan, moment, completedMatches: matches };
}

export function readCampaign(storage: Pick<Storage, 'getItem'>): CampaignStateV1 | null {
  try { const raw = storage.getItem(CAMPAIGN_STORAGE_KEY); return raw ? sanitizeCampaign(JSON.parse(raw)) : null; } catch { return null; }
}
export function writeCampaign(storage: Pick<Storage, 'setItem'>, state: CampaignStateV1) { storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(state)); }
export function resetCampaign(storage: Pick<Storage, 'removeItem'>) { storage.removeItem(CAMPAIGN_STORAGE_KEY); }
export function recordMatch(state: CampaignStateV1, match: CompletedMatch): CampaignStateV1 { return state.completedMatches.length ? state : { ...state, stage: 'result', moment: match.replay.progress, completedMatches: [match] }; }
export { CAMPAIGN_STORAGE_KEY, createCampaign };
