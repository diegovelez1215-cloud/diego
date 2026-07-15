import { describe, expect, it, vi } from 'vitest';
import { createCampaign, readCampaign, recordMatch, resetCampaign, sanitizeCampaign, writeCampaign } from './campaign-store';
import { CAMPAIGN_STORAGE_KEY, DEFAULT_TACTICS, type MomentProgress } from './contracts';
import { advanceMoment, initialMoment, passMoment, replayMoment, shootMoment } from './moment-engine';
import { completeMatch, groupTable, otherGroupResult, simulateMatch } from './simulation';

const defaultProgress = (events: MomentProgress['events'], tick = 0): MomentProgress => ({ tick, events });

describe('Your World Cup campaign contract', () => {
  it('sanitizes only the versioned campaign and preserves isolated reset behavior', () => {
    const state = createCampaign(91); const setItem = vi.fn(); const removeItem = vi.fn();
    expect(sanitizeCampaign(state)).toEqual(state); expect(sanitizeCampaign({ ...state, version: 2 })).toBeNull(); expect(readCampaign({ getItem: () => '{broken' })).toBeNull();
    writeCampaign({ setItem }, state); resetCampaign({ removeItem });
    expect(setItem).toHaveBeenCalledWith(CAMPAIGN_STORAGE_KEY, expect.any(String)); expect(removeItem).toHaveBeenCalledWith(CAMPAIGN_STORAGE_KEY);
  });

  it('moves defenders, moves the carrier/ball on valid passes, and has two open wide routes', () => {
    const start = initialMoment(26062026, DEFAULT_TACTICS); const ticked = advanceMoment(26062026, DEFAULT_TACTICS, start);
    expect(ticked.defenders).not.toEqual(start.defenders);
    expect(start.availablePasses).toContain('lw'); expect(start.availablePasses).toContain('rw');
    expect(ticked.availablePasses).toContain('lw'); expect(ticked.availablePasses).toContain('rw');
    const left = passMoment(26062026, DEFAULT_TACTICS, start, 'lw'); const right = passMoment(26062026, DEFAULT_TACTICS, start, 'rw');
    expect(left.ballCarrier).toBe('lw'); expect(left.ball).toEqual(left.attackers.lw); expect(right.ballCarrier).toBe('rw');
    expect(passMoment(26062026, DEFAULT_TACTICS, ticked, 'lw').availablePasses).toContain('st');
  });

  it('derives interceptions from a closed geometric lane and saves from an early shot', () => {
    const start = initialMoment(26062026, DEFAULT_TACTICS); const closed = start.closedPasses[0]!;
    expect(passMoment(26062026, DEFAULT_TACTICS, start, closed).outcome).toBe('interception');
    expect(shootMoment(26062026, DEFAULT_TACTICS, start, 'left').outcome).toBe('save');
  });

  it('replays exact actions deterministically, resolves zones, and expires honestly', () => {
    const progress = defaultProgress([{ tick: 0, action: { type: 'pass', target: 'lw' } }, { tick: 0, action: { type: 'pass', target: 'st' } }, { tick: 0, action: { type: 'shoot', zone: 'right' } }]);
    expect(replayMoment(26062026, DEFAULT_TACTICS, progress)).toEqual(replayMoment(26062026, DEFAULT_TACTICS, progress));
    const st = passMoment(26062026, DEFAULT_TACTICS, passMoment(26062026, DEFAULT_TACTICS, initialMoment(26062026, DEFAULT_TACTICS), 'lw'), 'st');
    expect(st.shotAvailable).toBe(true);
    const zones = ['left', 'center', 'right'] as const;
    expect(new Set(zones.map((zone) => shootMoment(26062026, DEFAULT_TACTICS, st, zone).outcome))).toContain('save');
    expect(new Set(zones.map((zone) => shootMoment(26062026, DEFAULT_TACTICS, st, zone).outcome))).toContain('goal');
    expect(replayMoment(26062026, DEFAULT_TACTICS, defaultProgress([], 15)).outcome).toBe('expired');
  });

  it('makes tactics observably alter layout, time and lanes', () => {
    const wide = initialMoment(44, DEFAULT_TACTICS); const control = initialMoment(44, { shape: '4-2-3-1-control', press: 'patient', finalThird: 'number-10' });
    const aggressive = initialMoment(44, { ...DEFAULT_TACTICS, press: 'aggressive', finalThird: 'direct-runners' });
    expect(wide.attackers.lw.x).not.toBe(control.attackers.lw.x); expect(wide.limit).not.toBe(control.limit); expect(aggressive.attackers.st.y).toBeLessThan(wide.attackers.st.y);
  });

  it('rejects dangerous restored state and validates result replay/score agreement', () => {
    const state = { ...createCampaign(26062026), stage: 'moment' as const, tactics: DEFAULT_TACTICS, moment: defaultProgress([{ tick: 0, action: { type: 'pass', target: 'lw' } }]) };
    expect(sanitizeCampaign(state)).toEqual(state);
    expect(sanitizeCampaign({ ...state, moment: { tick: 999, events: [] } })).toBeNull();
    expect(sanitizeCampaign({ ...state, stage: 'tactics', tactics: null })).toBeNull();
    expect(sanitizeCampaign({ ...state, completedMatches: [{}] })).toBeNull();
  });

  it('records one result and keeps group calculations deterministic', () => {
    const seed = 26062026; const setup = simulateMatch(seed, DEFAULT_TACTICS); const progress = defaultProgress([], 15); const outcome = replayMoment(seed, DEFAULT_TACTICS, progress).outcome!;
    const match = completeMatch(setup, outcome, DEFAULT_TACTICS, seed, progress); const recorded = recordMatch({ ...createCampaign(seed), stage: 'moment', tactics: DEFAULT_TACTICS, moment: progress }, match);
    expect(recordMatch(recorded, match)).toBe(recorded); expect(groupTable(match, seed)).toHaveLength(4); expect(otherGroupResult(seed)).toEqual(otherGroupResult(seed));
  });
});
