import { canonicalTournamentSnapshot } from '../domain/tournament-bridge';
import { scheduleForFocus, selectMatchdayFocus } from '../data/matchday-model';
import { snapshotFromState, type SnapshotState } from '../data/snapshot-state';
import { FixtureStage } from '../ui/FixtureStage';
import { MatchRow } from '../ui/MatchRow';
import { ServiceNotice } from '../ui/ServiceNotice';

function readableDate(day: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${day}T12:00:00Z`));
}

function freshness(state: SnapshotState): string {
  if ('snapshot' in state && state.snapshot.source.fetchedAt) {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(state.snapshot.source.fetchedAt));
  }
  return 'Not verified';
}

export function MatchdayRoute({ snapshotState, refreshing, onRefresh, onNavigate }: {
  snapshotState: SnapshotState;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onNavigate: (path: string) => void;
}) {
  const snapshot = snapshotFromState(snapshotState) || canonicalTournamentSnapshot();
  const focus = selectMatchdayFocus(snapshot.fixtures);
  const schedule = scheduleForFocus(snapshot.fixtures, focus);
  const days = [...new Set(snapshot.fixtures.map((fixture) => fixture.tournamentDay))].sort();
  const matchday = focus ? days.indexOf(focus.tournamentDay) + 1 : 0;
  return (
    <section className="v2-route v2-matchday" aria-busy={snapshotState.kind === 'loading' || refreshing}>
      <h1 className="v2-page-title">Matchday</h1>
      <div className="v2-matchday-context">
        <strong>{focus ? `${readableDate(focus.tournamentDay)} · Matchday ${matchday}` : 'Tournament schedule'}</strong>
        <span><span>Updated {freshness(snapshotState)}</span><button type="button" onClick={() => void onRefresh()} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button></span>
      </div>
      <div className="v2-matchday__layout">
        {focus ? <FixtureStage fixture={focus} onNavigate={onNavigate} /> : <section className="v2-empty-stage"><h2>No canonical fixture available</h2><p>The schedule contains no match to place in focus.</p></section>}
        <section className="v2-day-schedule" aria-labelledby="day-schedule-title">
          <header className="v2-ledger-heading"><h2 id="day-schedule-title">Today</h2><span>{schedule.length} {schedule.length === 1 ? 'match' : 'matches'}</span></header>
          {matchday > 0 ? <p className="v2-matchday-progress">Matchday {matchday} of {days.length}</p> : null}
          <div className="v2-match-ledger" aria-label="Chronological match schedule">
            {schedule.map((fixture) => <MatchRow fixture={fixture} key={fixture.id} onNavigate={onNavigate} />)}
          </div>
          <ServiceNotice state={snapshotState} onRetry={onRefresh} />
        </section>
      </div>
    </section>
  );
}
