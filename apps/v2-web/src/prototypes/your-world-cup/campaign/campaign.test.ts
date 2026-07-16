import { describe, expect, it, vi } from 'vitest';
import { checkpointMatch, createCampaign, migrateCampaign, readCampaign, recordMatch, resetCampaign, sanitizeCampaign, writeCampaign } from './campaign-store';
import { CAMPAIGN_STORAGE_KEY, DEFAULT_TACTICS, type MomentProgress } from './contracts';
import { completeMatch, simulateMatch } from './simulation';
import { ARGENTINA_TEAM, NIGERIA_TEAM } from './match-data';
import { buildPresentationFrames, createMatchPlan, injectPivotalOutcome, nextMeaningfulTick } from '../match/engine';

const input = (seed = 26062026, tactics = DEFAULT_TACTICS, home = ARGENTINA_TEAM, away = NIGERIA_TEAM) => ({ fixtureId: `${home.id}-${away.id}`, campaignSeed: seed, home, away, tactics });
const progress = (events: MomentProgress['events'] = [], tick = 0): MomentProgress => ({ tick, events });
const frames = (seed = 26062026, tactics = DEFAULT_TACTICS, outcome: 'goal' | 'save' | 'interception' | 'expired' | null = null) => { const value = input(seed, tactics); return buildPresentationFrames(injectPivotalOutcome(createMatchPlan(value), value, outcome), value); };

describe('Your World Cup deterministic match planner', () => {
  it('accepts arbitrary valid teams with no Argentina/Nigeria branch in the engine', () => {
    const home = { ...ARGENTINA_TEAM, id: 'pol', name: 'Poland', shortName: 'POL', lineup: ARGENTINA_TEAM.lineup.map((player) => ({ ...player, id: player.id.replace('arg-', 'pol-') })) };
    const away = { ...NIGERIA_TEAM, id: 'nzl', name: 'New Zealand', shortName: 'NZL', lineup: NIGERIA_TEAM.lineup.map((player) => ({ ...player, id: player.id.replace('nga-', 'nzl-') })) };
    const plan = createMatchPlan(input(9, DEFAULT_TACTICS, home, away));
    expect(plan.homeTeamId).toBe('pol'); expect(plan.awayTeamId).toBe('nzl');
    expect(plan.events.every((event) => ['pol', 'nzl'].includes(event.teamId))).toBe(true);
  });

  it('is deterministic, chronological, and materially changes across seeds', () => {
    const first = createMatchPlan(input(8)); const same = createMatchPlan(input(8)); const different = createMatchPlan(input(9));
    expect(first).toEqual(same); expect(first.events.map((event) => `${event.minute}:${event.action.type}:${event.teamId}`)).not.toEqual(different.events.map((event) => `${event.minute}:${event.action.type}:${event.teamId}`));
    expect(first.events.every((event, index) => index === 0 || event.minute >= first.events[index - 1].minute)).toBe(true);
  });

  it('makes tactics alter both event ledgers and visible player paths', () => {
    const wide = frames(44, DEFAULT_TACTICS); const control = frames(44, { shape: '4-2-3-1-control', press: 'patient', finalThird: 'number-10' }); const direct = frames(44, { ...DEFAULT_TACTICS, press: 'aggressive', finalThird: 'direct-runners' });
    expect(wide.map((frame) => frame.action?.type)).not.toEqual(control.map((frame) => frame.action?.type));
    expect(wide[4].players.find((player) => player.id === 'arg-lw')?.position.x).not.toBe(control[4].players.find((player) => player.id === 'arg-lw')?.position.x);
    expect(direct.some((frame) => frame.action?.type === 'turnover')).toBe(true);
  });

  it('keeps possession, actors, score ledger, shots and frames coherent', () => {
    const plan = createMatchPlan(input(19)); const presentation = buildPresentationFrames(plan, input(19));
    const teams = new Map([[ARGENTINA_TEAM.id, ARGENTINA_TEAM], [NIGERIA_TEAM.id, NIGERIA_TEAM]]);
    for (const event of plan.events) {
      expect([plan.homeTeamId, plan.awayTeamId]).toContain(event.teamId);
      expect([plan.homeTeamId, plan.awayTeamId]).toContain(event.possessionAfter);
      const team = teams.get(event.teamId)!;
      if (event.action.actor) expect(team.lineup.some((player) => player.id === event.action.actor)).toBe(true);
      if (event.action.target) expect(team.lineup.some((player) => player.id === event.action.target)).toBe(true);
    }
    const goals = plan.events.filter((event) => event.action.type === 'goal');
    expect(plan.baselineResultWithoutMoment).toEqual({ home: goals.filter((event) => event.teamId === plan.homeTeamId).length, away: goals.filter((event) => event.teamId === plan.awayTeamId).length });
    for (let index = 1; index < presentation.length; index++) { const before = presentation[index - 1].score; const after = presentation[index].score; if (before.home !== after.home || before.away !== after.away) { expect(presentation[index].action?.type).toBe('goal'); expect(presentation[index].eventProgress).toBe(1); } }
    const pass = presentation.find((frame) => frame.action?.type === 'pass'); expect(pass).toBeTruthy(); expect(presentation.filter((frame) => frame.eventIndex === pass!.eventIndex).length).toBeGreaterThan(3);
    const turnover = plan.events.findIndex((event) => event.action.type === 'turnover' || event.action.type === 'tackle');
    const turnoverFrames = presentation.filter((frame) => frame.eventIndex === turnover);
    if (turnoverFrames.length) { expect(turnoverFrames[0].possessionTeamId).not.toBe(plan.events[turnover].possessionAfter); expect(turnoverFrames.at(-1)?.possessionTeamId).toBe(plan.events[turnover].possessionAfter); }
    for (let index = 1; index < plan.events.length; index++) {
      const event = plan.events[index]; const previous = plan.events[index - 1];
      if (event.minute === previous.minute && previous.action.type === 'shot' && (event.action.type === 'goal' || event.action.type === 'save')) expect(event.start).toEqual(previous.end);
    }
    const next = nextMeaningfulTick(presentation, 0); expect(presentation[next].meaningful).toBe(true);
  });

  it('uses team strengths as well as tactics and keeps bounded pivotal outcomes non-scripted', () => {
    const stronger = { ...ARGENTINA_TEAM, strengths: { ...ARGENTINA_TEAM.strengths, attack: 99, midfield: 99, pace: 99 } };
    const weaker = { ...ARGENTINA_TEAM, strengths: { ...ARGENTINA_TEAM.strengths, attack: 55, midfield: 55, pace: 55 } };
    const strongPlan = createMatchPlan(input(31, DEFAULT_TACTICS, stronger, NIGERIA_TEAM));
    const weakPlan = createMatchPlan(input(31, DEFAULT_TACTICS, weaker, NIGERIA_TEAM));
    expect(strongPlan.events.map((event) => `${event.minute}:${event.action.type}:${event.teamId}`)).not.toEqual(weakPlan.events.map((event) => `${event.minute}:${event.action.type}:${event.teamId}`));

    const fixedSeeds = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
    const outcomes = fixedSeeds.map((seed) => {
      const base = createMatchPlan(input(seed));
      return {
        base,
        success: injectPivotalOutcome(base, input(seed), 'goal'),
        failure: injectPivotalOutcome(base, input(seed), 'interception'),
      };
    });
    expect(outcomes.some(({ success }) => success.baselineResultWithoutMoment.home <= success.baselineResultWithoutMoment.away)).toBe(true);
    expect(outcomes.some(({ base, failure }) => {
      const pivotal = base.events.find((event) => event.action.type === 'pivotal-entry')!;
      const opponent = base.pivotalTeamId === base.homeTeamId ? 'away' : 'home';
      return failure.baselineResultWithoutMoment[opponent] === pivotal.scoreAfter[opponent];
    })).toBe(true);
  });

  it('varies pivotal setup and lets the injected outcome affect only the future', () => {
    const plans = [1, 2, 3, 4, 5, 6].map((seed) => createMatchPlan(input(seed))); expect(new Set(plans.map((plan) => plan.pivotalMinute)).size).toBeGreaterThan(1);
    const base = createMatchPlan(input(3)); const goal = injectPivotalOutcome(base, input(3), 'goal'); const miss = injectPivotalOutcome(base, input(3), 'save'); const pivotal = base.events.findIndex((event) => event.action.type === 'pivotal-entry');
    expect(goal.events.slice(0, pivotal + 1)).toEqual(miss.events.slice(0, pivotal + 1)); expect(goal.baselineResultWithoutMoment).not.toEqual(miss.baselineResultWithoutMoment);
    const results = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => { const value = input(seed); return injectPivotalOutcome(createMatchPlan(value), value, 'save').baselineResultWithoutMoment; });
    expect(new Set(results.map((value) => `${value.home}-${value.away}`)).size).toBeGreaterThan(1);
  });

  it('migrates v1 and v2 explicitly, restores checkpoint data, and rejects malformed state', () => {
    const legacy = { version: 1, campaignId: 'argentina-group-c-001', seed: 91, nation: 'Argentina', group: ['Argentina', 'Nigeria', 'Poland', 'New Zealand'], stage: 'moment', tactics: DEFAULT_TACTICS, moment: progress([{ tick: 0, action: { type: 'pass', target: 'lw' } }], 1), completedMatches: [] };
    const migrated = migrateCampaign(legacy); expect(migrated).toMatchObject({ version: 3, stage: 'match', match: { planVersion: 1, fixtureId: 'arg-nga', phase: 'pivotal' } }); expect(readCampaign({ getItem: () => JSON.stringify(legacy) })).toEqual(migrated);
    const v2 = { ...migrated!, version: 2, match: { ...migrated!.match, planVersion: undefined, fixtureId: undefined } }; expect(sanitizeCampaign(v2)).toMatchObject({ version: 3, match: { planVersion: 1, fixtureId: 'arg-nga' } }); expect(sanitizeCampaign({ ...migrated, match: { ...migrated!.match, tick: 999 } })).toBeNull(); expect(readCampaign({ getItem: () => '{broken' })).toBeNull();
  });

  it('persists only its isolated key and records full time once', () => {
    const setItem = vi.fn(); const removeItem = vi.fn(); const campaign = { ...createCampaign(26062026), stage: 'match' as const, tactics: DEFAULT_TACTICS }; const checked = checkpointMatch(campaign, { ...campaign.match, tick: 36 }); writeCampaign({ setItem }, checked); resetCampaign({ removeItem }); expect(setItem).toHaveBeenCalledWith(CAMPAIGN_STORAGE_KEY, expect.any(String)); expect(removeItem).toHaveBeenCalledWith(CAMPAIGN_STORAGE_KEY);
    const match = completeMatch(simulateMatch(campaign.seed, DEFAULT_TACTICS), 'expired', DEFAULT_TACTICS, campaign.seed, progress([], 15)); const recorded = recordMatch(campaign, match); expect(recordMatch(recorded, match)).toBe(recorded);
  });
});
