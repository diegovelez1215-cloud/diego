import { describe, expect, it, vi } from 'vitest';
import { createCampaign, readCampaign, recordMatch, resetCampaign, sanitizeCampaign, writeCampaign } from './campaign-store';
import { CAMPAIGN_STORAGE_KEY, DEFAULT_TACTICS } from './contracts';
import { replayMoment } from './moment-engine';
import { completeMatch, groupTable, otherGroupResult, simulateMatch } from './simulation';

describe('Your World Cup campaign contract', () => {
  it('sanitizes only the minimal versioned state', () => {
    const state = createCampaign(91);
    expect(sanitizeCampaign(state)).toEqual(state);
    expect(sanitizeCampaign({ ...state, version: 2 })).toBeNull();
    expect(sanitizeCampaign({ ...state, group: ['Argentina'] })).toBeNull();
    expect(readCampaign({ getItem: () => '{broken' })).toBeNull();
  });

  it('writes and resets only its isolated key', () => {
    const setItem = vi.fn(); const removeItem = vi.fn();
    writeCampaign({ setItem }, createCampaign());
    resetCampaign({ removeItem });
    expect(setItem).toHaveBeenCalledWith(CAMPAIGN_STORAGE_KEY, expect.any(String));
    expect(removeItem).toHaveBeenCalledWith(CAMPAIGN_STORAGE_KEY);
    expect(setItem.mock.calls[0][0]).not.toContain('predictions');
    expect(setItem.mock.calls[0][0]).not.toContain('auth');
  });

  it('makes tactics influence deterministic match setup', () => {
    const wide = simulateMatch(44, DEFAULT_TACTICS);
    const control = simulateMatch(44, { shape: '4-2-3-1-control', press: 'patient', finalThird: 'number-10' });
    expect(wide).toEqual(simulateMatch(44, DEFAULT_TACTICS));
    expect(wide.route).not.toEqual(control.route);
  });

  it('replays the same moment from the same exact input log', () => {
    const setup = simulateMatch(44, DEFAULT_TACTICS);
    const inputs = ['pass:left', 'pass:right', 'shoot'] as const;
    expect(replayMoment(setup, DEFAULT_TACTICS, inputs)).toEqual(replayMoment(setup, DEFAULT_TACTICS, inputs));
    expect(replayMoment(setup, DEFAULT_TACTICS, inputs).outcome).toBe('goal');
    expect(replayMoment(setup, DEFAULT_TACTICS, ['shoot']).outcome).toBe('save');
  });

  it('records a result once and calculates the full group table deterministically', () => {
    const state = createCampaign(44); const setup = simulateMatch(44, DEFAULT_TACTICS);
    const match = completeMatch(setup, 'goal', DEFAULT_TACTICS, 44, ['pass:left', 'pass:right', 'shoot']);
    const recorded = recordMatch({ ...state, tactics: DEFAULT_TACTICS }, match);
    expect(recordMatch(recorded, match)).toBe(recorded);
    expect(groupTable(match, 44).find((team) => team.name === 'Argentina')?.points).toBe(match.outcome === 'draw' ? 1 : 3);
    expect(otherGroupResult(44)).toEqual(otherGroupResult(44));
  });

  it('calculates win, draw and loss points honestly', () => {
    const base = completeMatch(simulateMatch(9, DEFAULT_TACTICS), 'goal', DEFAULT_TACTICS, 9, ['pass:left', 'pass:right', 'shoot']);
    const result = (homeGoals: number, awayGoals: number) => groupTable({ ...base, homeGoals, awayGoals, outcome: homeGoals > awayGoals ? 'win' : homeGoals === awayGoals ? 'draw' : 'loss' }, 9).find((team) => team.name === 'Argentina')?.points;
    expect(result(2, 1)).toBe(3);
    expect(result(1, 1)).toBe(1);
    expect(result(0, 1)).toBe(0);
  });
});
