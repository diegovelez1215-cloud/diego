import { describe, expect, it, vi } from 'vitest';
import { checkpointMatch, createCampaign, migrateCampaign, readCampaign, recordMatch, resetCampaign, sanitizeCampaign, writeCampaign } from './campaign-store';
import { CAMPAIGN_STORAGE_KEY, DEFAULT_TACTICS, type MomentProgress } from './contracts';
import { completeMatch, simulateMatch } from './simulation';
import { ARGENTINA_TEAM, NIGERIA_TEAM } from './match-data';
import { EVENT_CATALOG, buildPresentationFrames, createMatchPlan, deriveShotOutcome, injectPivotalOutcome, isGoalMouthCrossing, nextMeaningfulTick, type ShotOutcome } from '../match/engine';
import { formationForShape } from './formations';

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
    expect(direct.some((frame) => frame.action?.type === 'interception' || frame.action?.type === 'tackle' || frame.action?.type === 'offside')).toBe(true);
  });

  it('defines correct 4-3-3 Wide and 4-2-3-1 Control role counts and relative lines', () => {
    const wide = formationForShape('4-3-3-wide');
    expect(wide).toHaveLength(11);
    expect(wide.filter((slot) => slot.line === 'attack')).toHaveLength(3);
    expect(wide.filter((slot) => slot.line === 'midfield' || slot.line === 'pivot')).toHaveLength(3);
    expect(wide.filter((slot) => slot.line === 'defense')).toHaveLength(4);
    expect(wide.filter((slot) => slot.line === 'goalkeeper')).toHaveLength(1);
    expect(wide.find((slot) => slot.position === 'LW')!.x).toBeLessThan(wide.find((slot) => slot.position === 'ST')!.x);
    expect(wide.find((slot) => slot.position === 'RW')!.x).toBeGreaterThan(wide.find((slot) => slot.position === 'ST')!.x);
    expect(wide.find((slot) => slot.position === 'ST')!.y).toBeLessThan(wide.find((slot) => slot.position === 'DM')!.y);
    expect(wide.find((slot) => slot.position === 'DM')!.y).toBeLessThan(wide.find((slot) => slot.position === 'LB')!.y);

    const control = formationForShape('4-2-3-1-control');
    expect(control).toHaveLength(11);
    expect(control.filter((slot) => slot.line === 'attack')).toHaveLength(1);
    expect(control.filter((slot) => slot.line === 'attacking-midfield')).toHaveLength(3);
    expect(control.filter((slot) => slot.line === 'pivot')).toHaveLength(2);
    expect(control.filter((slot) => slot.line === 'defense')).toHaveLength(4);
    expect(control.find((slot) => slot.position === 'CAM')!.y).toBeLessThan(control.find((slot) => slot.position === 'LDM')!.y);
  });

  it('keeps possession, actors, score ledger, shots and frames coherent', () => {
    const plan = createMatchPlan(input(19)); const presentation = buildPresentationFrames(plan, input(19));
    const teams = new Map([[ARGENTINA_TEAM.id, ARGENTINA_TEAM], [NIGERIA_TEAM.id, NIGERIA_TEAM]]);
    for (const event of plan.events) {
      expect([plan.homeTeamId, plan.awayTeamId]).toContain(event.teamId);
      expect([plan.homeTeamId, plan.awayTeamId]).toContain(event.possessionAfter);
      const team = teams.get(event.teamId)!;
      const squad = [...team.lineup, ...(team.bench ?? [])];
      if (event.action.actor) expect(squad.some((player) => player.id === event.action.actor)).toBe(true);
      if (event.action.target) expect(squad.some((player) => player.id === event.action.target) || [ARGENTINA_TEAM, NIGERIA_TEAM].some((candidateTeam) => [...candidateTeam.lineup, ...(candidateTeam.bench ?? [])].some((player) => player.id === event.action.target))).toBe(true);
    }
    const goals = plan.events.filter((event) => event.action.type === 'goal');
    expect(plan.baselineResultWithoutMoment).toEqual({ home: goals.filter((event) => event.teamId === plan.homeTeamId).length, away: goals.filter((event) => event.teamId === plan.awayTeamId).length });
    for (let index = 1; index < presentation.length; index++) { const before = presentation[index - 1].score; const after = presentation[index].score; if (before.home !== after.home || before.away !== after.away) { expect(presentation[index].action?.type).toBe('goal'); expect(presentation[index].eventProgress).toBe(1); } }
    const pass = presentation.find((frame) => frame.action?.type === 'pass'); expect(pass).toBeTruthy(); expect(presentation.filter((frame) => frame.eventIndex === pass!.eventIndex).length).toBeGreaterThan(3);
    const turnover = plan.events.findIndex((event) => event.action.type === 'interception' || event.action.type === 'tackle');
    const turnoverFrames = presentation.filter((frame) => frame.eventIndex === turnover);
    if (turnoverFrames.length) { expect(turnoverFrames[0].possessionTeamId).not.toBe(plan.events[turnover].possessionAfter); expect(turnoverFrames.at(-1)?.possessionTeamId).toBe(plan.events[turnover].possessionAfter); }
    for (let index = 1; index < plan.events.length; index++) {
      const event = plan.events[index]; const previous = plan.events[index - 1];
      if (event.minute === previous.minute && previous.action.type === 'shot' && ['goal', ...EVENT_CATALOG.shot].includes(event.action.type as ShotOutcome)) expect(event.start).toEqual(previous.end);
    }
    const next = nextMeaningfulTick(presentation, 0); expect(presentation[next].meaningful).toBe(true);
  });

  it('transfers passes and interceptions only at reception and keeps the ball unique', () => {
    const presentation = frames(19);
    const pass = presentation.find((item) => item.action?.type === 'pass')!;
    const passFrames = presentation.filter((item) => item.eventIndex === pass.eventIndex);
    expect(passFrames[0].ballOwnerId).toBe(pass.action?.actor);
    expect(passFrames.slice(1, -1).every((item) => item.ballOwnerId === null)).toBe(true);
    expect(passFrames.at(-1)?.ballOwnerId).toBe(pass.action?.target);
    expect(passFrames.slice(0, -1).every((item) => item.possessionTeamId === passFrames[0].possessionTeamId)).toBe(true);
    const interception = presentation.find((item) => item.action?.type === 'interception');
    if (interception) {
      const sequence = presentation.filter((item) => item.eventIndex === interception.eventIndex);
      expect(sequence.slice(0, -1).every((item) => item.possessionTeamId === sequence[0].possessionTeamId)).toBe(true);
      expect(sequence.at(-1)?.possessionTeamId).not.toBe(sequence[0].possessionTeamId);
      expect(sequence.at(-1)?.eventProgress).toBe(1);
    }
  });

  it('derives varied shot outcomes from quality, pressure, keeper, tactics, fatigue, and seed', () => {
    const outcomes = new Set<ShotOutcome>();
    for (let seed = 1; seed <= 260; seed++) outcomes.add(deriveShotOutcome({ shooterQuality: 70 + (seed % 20), chanceQuality: 35 + (seed % 40), pressure: 20 + (seed % 65), defenders: 2 + (seed % 4), goalkeeperQuality: 68 + (seed % 22), goalkeeperPosition: seed % 24, tactics: seed % 3 === 0 ? { shape: '4-2-3-1-control', press: 'patient', finalThird: 'number-10' } : seed % 3 === 1 ? DEFAULT_TACTICS : { shape: '4-3-3-wide', press: 'aggressive', finalThird: 'direct-runners' }, fatigue: (seed % 10) / 10, seed }));
    expect([...outcomes]).toEqual(expect.arrayContaining(['goal', 'save', 'parried-save', 'blocked-shot', 'wide', 'over', 'post', 'crossbar', 'deflection', 'one-on-one-miss']));
  });

  it('scores only a geometric goal-mouth crossing and keeps misses outside the mouth', () => {
    expect(isGoalMouthCrossing({ x: 50, y: 18 }, { x: 50, y: .7 }, 'south', .1)).toBe(true);
    expect(isGoalMouthCrossing({ x: 50, y: 18 }, { x: 50, y: .7 }, 'south', 1.1)).toBe(false);
    expect(isGoalMouthCrossing({ x: 15, y: 18 }, { x: 1, y: .7 }, 'south', .1)).toBe(false);
    const plans = Array.from({ length: 90 }, (_, seed) => createMatchPlan(input(seed + 1)));
    for (const plan of plans) {
      for (let index = 1; index < plan.events.length; index++) {
        const event = plan.events[index]; const previous = plan.events[index - 1];
        if (event.action.type === 'goal') expect(isGoalMouthCrossing(previous.start, event.end, event.teamId === plan.homeTeamId ? ARGENTINA_TEAM.direction : NIGERIA_TEAM.direction)).toBe(true);
        if (event.action.type === 'wide' || event.action.type === 'over') expect(isGoalMouthCrossing(previous.start, event.end, event.teamId === plan.homeTeamId ? ARGENTINA_TEAM.direction : NIGERIA_TEAM.direction, event.action.type === 'over' ? 1.1 : 0)).toBe(false);
      }
    }
  });

  it('covers coherent fouls, cards, offsides, restarts, substitutions, added time, and rare VAR across deterministic seeds', () => {
    const plans = Array.from({ length: 180 }, (_, seed) => createMatchPlan(input(seed + 1)));
    const actions = new Set(plans.flatMap((plan) => plan.events.map((event) => event.action.type)));
    expect([...actions]).toEqual(expect.arrayContaining(['foul', 'advantage', 'yellow', 'straight-red', 'offside', 'throw-in', 'goal-kick', 'corner', 'direct-free-kick', 'indirect-free-kick', 'penalty', 'substitution', 'added-time', 'var-check', 'var-decision']));
    for (const plan of plans) {
      const scoreChanges = plan.events.filter((event, index) => index > 0 && (event.scoreAfter.home !== plan.events[index - 1].scoreAfter.home || event.scoreAfter.away !== plan.events[index - 1].scoreAfter.away));
      expect(scoreChanges.every((event) => event.action.type === 'goal')).toBe(true);
      for (const event of plan.events.filter((item) => item.action.type === 'var-check')) {
        const decision = plan.events.find((item) => item.minute === event.minute && item.second > event.second && item.action.type === 'var-decision');
        expect(decision).toBeTruthy();
        expect(event.scoreAfter).toEqual(plan.events[plan.events.indexOf(event) - 1]?.scoreAfter ?? { home: 0, away: 0 });
      }
    }
  });

  it('removes dismissed players from the shape and never lets them act again', () => {
    const plan = Array.from({ length: 220 }, (_, seed) => createMatchPlan(input(seed + 1))).find((candidatePlan) => candidatePlan.events.some((event) => event.action.type === 'straight-red' || event.action.type === 'second-yellow-red'))!;
    const redIndex = plan.events.findIndex((event) => event.action.type === 'straight-red' || event.action.type === 'second-yellow-red');
    const dismissed = plan.events[redIndex].action.actor!;
    const presentation = buildPresentationFrames(plan, input(plan.seed));
    const redFrames = presentation.filter((frame) => frame.eventIndex === redIndex);
    expect(redFrames[0].players.some((player) => player.id === dismissed)).toBe(true);
    expect(redFrames.at(-1)?.players.some((player) => player.id === dismissed)).toBe(false);
    expect(plan.events.slice(redIndex + 1).every((event) => event.action.actor !== dismissed)).toBe(true);
  });

  it('keeps VAR checks scoreless, applies only confirmed goals, and gives overturns the correct restart', () => {
    const plans = Array.from({ length: 300 }, (_, seed) => createMatchPlan(input(seed + 1)));
    const confirmed = plans.find((plan) => plan.events.some((event) => event.action.type === 'var-decision' && event.action.decision === 'confirmed'))!;
    const overturned = plans.find((plan) => plan.events.some((event) => event.action.type === 'var-decision' && event.action.decision === 'overturned'))!;
    for (const plan of [confirmed, overturned]) {
      const checkIndex = plan.events.findIndex((event) => event.action.type === 'var-check' && ['close-offside-goal', 'disputed-goal'].includes(event.action.review!));
      const decisionIndex = plan.events.findIndex((event, index) => index > checkIndex && event.action.type === 'var-decision');
      expect(plan.events[checkIndex].scoreAfter).toEqual(plan.events[checkIndex - 1].scoreAfter);
      expect(plan.events[decisionIndex].scoreAfter).toEqual(plan.events[checkIndex].scoreAfter);
      if (plan.events[decisionIndex].action.decision === 'confirmed') expect(plan.events[decisionIndex + 1].action.type).toBe('goal');
      if (plan.events[decisionIndex].action.decision === 'overturned') expect(plan.events[decisionIndex + 1].action.type).toBe('indirect-free-kick');
    }
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
    expect(new Set(outcomes.map(({ success }) => `${success.baselineResultWithoutMoment.home}-${success.baselineResultWithoutMoment.away}`)).size).toBeGreaterThan(1);
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
