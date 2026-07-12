import { describe, expect, it } from 'vitest';
import { applyOfficialOverlay, canonicalTournamentSnapshot } from '../domain/tournament-bridge';
import { scheduleForFocus, selectMatchdayFocus, visibleScore } from './matchday-model';

// @ts-expect-error The typed V2 adapter is characterized against this V1 authority.
import { buildOverlay } from '../../../../src/core/provider-overlay.js';
// @ts-expect-error The test controls V1's explicit clock seam.
import { setClock } from '../../../../src/core/time.js';
// @ts-expect-error The test characterizes V1 focus priority.
import { clearModelCache, homeModel } from '../../../../src/data/tournament-model.js';

const ok = { configured: true, sourceStatus: 'fresh', isStale: false, fetchedAt: '2026-07-01T17:05:00.000Z' };
const at = Date.parse('2026-07-01T13:05:00-04:00');

describe('Matchday view model', () => {
  it('matches V1 truthful focus priority: a validated live fixture outranks upcoming fixtures', () => {
    const input = { source: 'official-provider' as const, results: { ...ok, finished: [], live: [], hold: [], scheduled: [] }, live: { ...ok, response: [{ home: 'England', away: 'DR Congo', gh: 1, ga: 0, min: 55, status: '2H', kind: 'live', date: '2026-07-01T16:00:00Z' }], finished: [] } };
    const v2 = applyOfficialOverlay(input);
    const overlay = buildOverlay({ results: input.results, live: input.live });
    setClock(() => at);
    clearModelCache();
    try {
      expect(v2.accepted).toBe(true);
      if (v2.accepted) expect(selectMatchdayFocus(v2.snapshot.fixtures, at)?.id).toBe(homeModel(overlay).hero.id);
    } finally {
      setClock(null);
      clearModelCache();
    }
  });

  it('keeps the relevant day chronological', () => {
    const snapshot = canonicalTournamentSnapshot();
    const focus = snapshot.fixtures.find((fixture) => fixture.id === 80)!;
    const schedule = scheduleForFocus(snapshot.fixtures, focus, at);
    expect(schedule.map((fixture) => fixture.id)).toEqual([80, 82, 81]);
    expect(schedule.every((fixture, index) => index === 0 || fixture.kickoffEpoch >= schedule[index - 1].kickoffEpoch)).toBe(true);
  });

  it('renders scores only for validated live or final fixture states', () => {
    const snapshot = canonicalTournamentSnapshot();
    const scheduled = snapshot.fixtures.find((fixture) => fixture.id === 1)!;
    const livePending = { ...scheduled, status: { kind: 'live' as const, minute: 12, score: null, scoreState: 'pending' as const } };
    const liveScore = { ...scheduled, status: { kind: 'live' as const, minute: 12, score: { home: 1, away: 0 }, scoreState: 'available' as const } };
    const final = { ...scheduled, status: { kind: 'final' as const, score: { home: 2, away: 0 } } };
    expect(visibleScore(scheduled)).toBeNull();
    expect(visibleScore(livePending)).toBeNull();
    expect(visibleScore(liveScore)).toBe('1–0');
    expect(visibleScore(final)).toBe('2–0');
  });
});
