import { describe, expect, it, vi } from 'vitest';
import { checkpointMatch, createCampaign, migrateCampaign, readCampaign, recordMatch, resetCampaign, sanitizeCampaign, writeCampaign } from './campaign-store';
import { CAMPAIGN_STORAGE_KEY, DEFAULT_TACTICS, type MomentProgress } from './contracts';
import { advanceMoment, initialMoment, passMoment, replayMoment, shootMoment } from './moment-engine';
import { completeMatch, simulateMatch } from './simulation';
import { buildMatchFrames, nextMeaningfulTick } from '../match/engine';

const progress = (events: MomentProgress['events'] = [], tick = 0): MomentProgress => ({ tick, events });

describe('Your World Cup deterministic match contract', () => {
  it('produces the same complete frame sequence for the same seed and tactics', () => {
    expect(buildMatchFrames(26062026, DEFAULT_TACTICS, 'goal')).toEqual(buildMatchFrames(26062026, DEFAULT_TACTICS, 'goal'));
  });

  it('makes tactics observably alter formation, pressure and event language', () => {
    const wide = buildMatchFrames(44, DEFAULT_TACTICS, null);
    const control = buildMatchFrames(44, { shape: '4-2-3-1-control', press: 'patient', finalThird: 'number-10' }, null);
    const direct = buildMatchFrames(44, { ...DEFAULT_TACTICS, press: 'aggressive', finalThird: 'direct-runners' }, null);
    expect(wide[10].players.find((player) => player.id === 'arg-lw')?.position.x).not.toBe(control[10].players.find((player) => player.id === 'arg-lw')?.position.x);
    expect(control[45].momentumContext).toMatch(/compact/i);
    expect(direct[68].momentumContext).toMatch(/direct runners/i);
  });

  it('changes score only on a coherent goal frame', () => {
    const frames = buildMatchFrames(26062026, DEFAULT_TACTICS, 'goal');
    for (let index = 1; index < frames.length; index++) {
      const changed = frames[index].score.home !== frames[index - 1].score.home || frames[index].score.away !== frames[index - 1].score.away;
      if (changed) {
        expect(frames[index].action?.type).toBe('goal');
        expect(frames[index].ballOwnerId).toBeNull();
        expect(frames[index].ball.y === 3 || frames[index].ball.y === 97).toBe(true);
      }
    }
  });

  it('keeps ball ownership and possession coherent without duplicate carriers', () => {
    for (const frame of buildMatchFrames(17, DEFAULT_TACTICS, 'save')) {
      const active = frame.players.filter((player) => player.active);
      expect(active.length).toBeLessThanOrEqual(1);
      if (frame.ballOwnerId) {
        expect(active).toHaveLength(1);
        expect(active[0].id).toBe(frame.ballOwnerId);
        expect(active[0].teamId).toBe(frame.possessionTeamId);
        expect(frame.ball).toEqual(active[0].position);
      }
    }
  });

  it('keeps fast-forward and quiet-phase skips presentation-only', () => {
    const frames = buildMatchFrames(26062026, DEFAULT_TACTICS, 'goal');
    expect(frames[90].score).toEqual(buildMatchFrames(26062026, DEFAULT_TACTICS, 'goal')[90].score);
    const next = nextMeaningfulTick(frames, 26);
    expect(frames[next].meaningful).toBe(true);
    expect(frames[next]).toEqual(buildMatchFrames(26062026, DEFAULT_TACTICS, 'goal')[next]);
  });

  it('enters the pivotal moment deterministically and reintegrates its consequence', () => {
    const before = buildMatchFrames(26062026, DEFAULT_TACTICS, null)[68];
    const goal = buildMatchFrames(26062026, DEFAULT_TACTICS, 'goal');
    const failure = buildMatchFrames(26062026, DEFAULT_TACTICS, 'interception');
    expect(before.players).toEqual(buildMatchFrames(26062026, DEFAULT_TACTICS, null)[68].players);
    expect(goal[69].score.home).toBe(before.score.home + 1);
    expect(goal[90].score).toEqual({ home: 2, away: 1 });
    expect(failure[90].score).toEqual({ home: 1, away: 2 });
  });

  it('preserves the corrected geometric pressure engine and exact replay', () => {
    const start = initialMoment(26062026, DEFAULT_TACTICS);
    const ticked = advanceMoment(26062026, DEFAULT_TACTICS, start);
    expect(ticked.defenders).not.toEqual(start.defenders);
    expect(start.availablePasses).toEqual(expect.arrayContaining(['lw', 'rw']));
    const left = passMoment(26062026, DEFAULT_TACTICS, start, 'lw');
    const striker = passMoment(26062026, DEFAULT_TACTICS, left, 'st');
    expect(striker.shotAvailable).toBe(true);
    const replay = progress([{ tick: 0, action: { type: 'pass', target: 'lw' } }, { tick: 1, action: { type: 'pass', target: 'st' } }, { tick: 2, action: { type: 'shoot', zone: 'right' } }], 2);
    expect(replayMoment(26062026, DEFAULT_TACTICS, replay)).toEqual(replayMoment(26062026, DEFAULT_TACTICS, replay));
    const outcomes = (['left', 'center', 'right'] as const).map((zone) => shootMoment(26062026, DEFAULT_TACTICS, striker, zone).outcome);
    expect(outcomes).toContain('goal');
    expect(outcomes).toContain('save');
  });

  it('migrates v1 explicitly, restores checkpoints, and rejects malformed state', () => {
    const legacy = { version: 1, campaignId: 'argentina-group-c-001', seed: 91, nation: 'Argentina', group: ['Argentina', 'Nigeria', 'Poland', 'New Zealand'], stage: 'moment', tactics: DEFAULT_TACTICS, moment: progress([{ tick: 0, action: { type: 'pass', target: 'lw' } }], 1), completedMatches: [] };
    const migrated = migrateCampaign(legacy);
    expect(migrated).toMatchObject({ version: 2, stage: 'match', match: { tick: 68, phase: 'pivotal', moment: legacy.moment } });
    expect(readCampaign({ getItem: () => JSON.stringify(legacy) })).toEqual(migrated);
    expect(sanitizeCampaign({ ...migrated, match: { ...migrated!.match, tick: 999 } })).toBeNull();
    expect(sanitizeCampaign({ ...migrated, tactics: null })).toBeNull();
    expect(readCampaign({ getItem: () => '{broken' })).toBeNull();
  });

  it('persists only its isolated key and records full time once', () => {
    const setItem = vi.fn();
    const removeItem = vi.fn();
    const campaign = { ...createCampaign(26062026), stage: 'match' as const, tactics: DEFAULT_TACTICS };
    const checked = checkpointMatch(campaign, { ...campaign.match, tick: 36 });
    writeCampaign({ setItem }, checked);
    resetCampaign({ removeItem });
    expect(setItem).toHaveBeenCalledWith(CAMPAIGN_STORAGE_KEY, expect.any(String));
    expect(removeItem).toHaveBeenCalledWith(CAMPAIGN_STORAGE_KEY);
    const replay = progress([], 15);
    const match = completeMatch(simulateMatch(campaign.seed, DEFAULT_TACTICS), 'expired', DEFAULT_TACTICS, campaign.seed, replay);
    const recorded = recordMatch(campaign, match);
    expect(recordMatch(recorded, match)).toBe(recorded);
    expect(recorded.completedMatches).toHaveLength(1);
  });
});
