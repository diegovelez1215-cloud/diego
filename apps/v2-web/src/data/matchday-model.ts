import type { FixtureStatus, FixtureSummary } from '../domain/contracts';

const TOURNAMENT_OFFSET_MS = -4 * 60 * 60 * 1000;

export function tournamentDayAt(nowMs: number): string {
  return new Date(nowMs + TOURNAMENT_OFFSET_MS).toISOString().slice(0, 10);
}

function isLive(fixture: FixtureSummary): boolean {
  return fixture.status.kind === 'live';
}

function isFinal(fixture: FixtureSummary): boolean {
  return fixture.status.kind === 'final';
}

function chronological(fixtures: readonly FixtureSummary[]): FixtureSummary[] {
  return [...fixtures].sort((a, b) => a.kickoffEpoch - b.kickoffEpoch || a.id - b.id);
}

/** Mirrors V1 homeModel priority: live, then upcoming today, future, final. */
export function selectMatchdayFocus(fixtures: readonly FixtureSummary[], nowMs = Date.now()): FixtureSummary | null {
  const ordered = chronological(fixtures);
  const today = tournamentDayAt(nowMs);
  const live = ordered.filter(isLive);
  const upcomingToday = ordered.filter((fixture) => fixture.tournamentDay === today && !isLive(fixture) && !isFinal(fixture) && fixture.kickoffEpoch >= nowMs - 30 * 60 * 1000);
  const upcomingAll = ordered.filter((fixture) => !isLive(fixture) && !isFinal(fixture) && fixture.kickoffEpoch >= nowMs - 30 * 60 * 1000);
  const recentFinal = [...ordered].filter(isFinal).sort((a, b) => b.kickoffEpoch - a.kickoffEpoch || b.id - a.id);
  return live[0] || upcomingToday[0] || upcomingAll[0] || recentFinal[0] || null;
}

export function scheduleForFocus(fixtures: readonly FixtureSummary[], focus: FixtureSummary | null, nowMs = Date.now()): readonly FixtureSummary[] {
  const day = focus?.tournamentDay || tournamentDayAt(nowMs);
  return Object.freeze(chronological(fixtures.filter((fixture) => fixture.tournamentDay === day)));
}

export function statusLabel(status: FixtureStatus): string {
  if (status.kind === 'live') return status.minute == null ? 'LIVE — score pending' : `LIVE · ${status.minute}'`;
  if (status.kind === 'final') return 'FT';
  if (status.kind === 'pending') return status.reason === 'on-hold' ? 'Pending' : 'Score pending';
  if (status.kind === 'unavailable') return 'Unavailable';
  return 'Scheduled';
}

export function visibleScore(fixture: FixtureSummary): string | null {
  if (fixture.status.kind === 'final') return `${fixture.status.score.home}–${fixture.status.score.away}`;
  if (fixture.status.kind === 'live' && fixture.status.score) return `${fixture.status.score.home}–${fixture.status.score.away}`;
  return null;
}
