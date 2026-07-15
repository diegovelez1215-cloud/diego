import { CAMPAIGN_STORAGE_KEY, createCampaign, type CampaignStateV1, type CompletedMatch, type Tactics } from './contracts';

const SHAPES = ['4-3-3-wide', '4-2-3-1-control'];
const PRESSES = ['patient', 'balanced', 'aggressive'];
const PLANS = ['wings', 'number-10', 'direct-runners'];
const STAGES = ['campaign', 'tactics', 'match-story', 'moment', 'result'];
const MOMENTS = ['goal', 'save', 'interception', 'expired'];

function tactics(value: unknown): Tactics | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  return SHAPES.includes(String(item.shape)) && PRESSES.includes(String(item.press)) && PLANS.includes(String(item.finalThird))
    ? { shape: item.shape as Tactics['shape'], press: item.press as Tactics['press'], finalThird: item.finalThird as Tactics['finalThird'] }
    : null;
}

function completed(value: unknown): readonly CompletedMatch[] | null {
  if (!Array.isArray(value) || value.length > 1) return null;
  if (!value.length) return [];
  const item = value[0] as Record<string, unknown>;
  const plan = tactics(item.tactics);
  const replay = item.replay as Record<string, unknown> | undefined;
  if (!plan || !replay || item.fixtureId !== 'arg-nga' || item.home !== 'Argentina' || item.away !== 'Nigeria'
    || !Number.isInteger(item.homeGoals) || !Number.isInteger(item.awayGoals)
    || !['win', 'draw', 'loss'].includes(String(item.outcome)) || !MOMENTS.includes(String(item.decisiveMoment))
    || !Number.isInteger(replay.seed) || !Array.isArray(replay.eventInputs) || !replay.eventInputs.every((event) => typeof event === 'string')) return null;
  return [{ fixtureId: 'arg-nga', home: 'Argentina', away: 'Nigeria', homeGoals: item.homeGoals as number, awayGoals: item.awayGoals as number, outcome: item.outcome as CompletedMatch['outcome'], decisiveMoment: item.decisiveMoment as CompletedMatch['decisiveMoment'], tactics: plan, replay: { seed: replay.seed as number, eventInputs: replay.eventInputs as string[] } }];
}

export function sanitizeCampaign(value: unknown): CampaignStateV1 | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const plan = item.tactics === null ? null : tactics(item.tactics);
  const matches = completed(item.completedMatches);
  if (item.version !== 1 || item.campaignId !== 'argentina-group-c-001' || !Number.isInteger(item.seed) || item.nation !== 'Argentina'
    || !Array.isArray(item.group) || item.group.join('|') !== 'Argentina|Nigeria|Poland|New Zealand'
    || !STAGES.includes(String(item.stage)) || (item.tactics !== null && !plan) || !matches
    || !Array.isArray(item.eventInputs) || !item.eventInputs.every((event) => typeof event === 'string')) return null;
  return { version: 1, campaignId: 'argentina-group-c-001', seed: item.seed as number, nation: 'Argentina', group: ['Argentina', 'Nigeria', 'Poland', 'New Zealand'], stage: item.stage as CampaignStateV1['stage'], tactics: plan, eventInputs: item.eventInputs as string[], completedMatches: matches };
}

export function readCampaign(storage: Pick<Storage, 'getItem'>): CampaignStateV1 | null {
  try { const raw = storage.getItem(CAMPAIGN_STORAGE_KEY); return raw ? sanitizeCampaign(JSON.parse(raw)) : null; } catch { return null; }
}

export function writeCampaign(storage: Pick<Storage, 'setItem'>, state: CampaignStateV1) {
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(state));
}

export function resetCampaign(storage: Pick<Storage, 'removeItem'>) { storage.removeItem(CAMPAIGN_STORAGE_KEY); }

export function recordMatch(state: CampaignStateV1, match: CompletedMatch): CampaignStateV1 {
  if (state.completedMatches.some((existing) => existing.fixtureId === match.fixtureId)) return state;
  return { ...state, stage: 'result', eventInputs: match.replay.eventInputs, completedMatches: [match] };
}

export { CAMPAIGN_STORAGE_KEY, createCampaign };
