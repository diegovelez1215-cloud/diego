import { canonicalTournamentSnapshot } from '../domain/tournament-bridge';
import { scheduleForFocus, selectMatchdayFocus, statusLabel, visibleScore } from '../data/matchday-model';
import { snapshotFromState, type SnapshotState } from '../data/snapshot-state';
import type { FixtureParticipant, FixtureSummary } from '../domain/contracts';

function participantName(participant: FixtureParticipant): string {
  return participant.kind === 'team' ? `${participant.flag} ${participant.name}` : participant.label;
}

function availabilityMessage(state: SnapshotState): string {
  if (state.kind === 'loading') return 'Loading the validated official match snapshot.';
  if (state.kind === 'verified') return state.snapshot.source.fetchedAt ? `Verified official snapshot · updated ${state.snapshot.source.fetchedAt}` : 'Verified official snapshot.';
  if (state.kind === 'partial') return state.snapshot.source.fetchedAt ? `Partially verified official snapshot · updated ${state.snapshot.source.fetchedAt}` : 'Partially verified official snapshot.';
  if (state.kind === 'stale') return state.snapshot.source.fetchedAt ? `Showing the last verified snapshot from ${state.snapshot.source.fetchedAt}; the latest refresh is stale.` : 'Showing the last verified snapshot; the latest refresh is stale.';
  if (state.kind === 'unavailable') return 'Official score data is unavailable. The canonical schedule remains visible.';
  return 'The official request did not complete; match status is not asserted.';
}

function MatchRow({ fixture, onNavigate }: { fixture: FixtureSummary; onNavigate: (path: string) => void }) {
  const score = visibleScore(fixture);
  return (
    <a className="v2-match-row" href={`/v2/match/${fixture.id}`} onClick={(event) => { event.preventDefault(); onNavigate(`/v2/match/${fixture.id}`); }}>
      <span className={`v2-match-status v2-match-status--${fixture.status.kind}`}>{statusLabel(fixture.status)}</span>
      <span className="v2-match-teams"><span>{participantName(fixture.home)}</span><span>{participantName(fixture.away)}</span></span>
      <span className="v2-match-score">{score || fixture.kickoffLabel}</span>
    </a>
  );
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
  return (
    <section className="v2-matchday" aria-busy={snapshotState.kind === 'loading' || refreshing}>
      <p className="v2-eyebrow">Matchday</p>
      <p className="v2-source-state" role="status">{availabilityMessage(snapshotState)}</p>
      {focus ? (
        <a className="v2-focus-stage" href={`/v2/match/${focus.id}`} onClick={(event) => { event.preventDefault(); onNavigate(`/v2/match/${focus.id}`); }}>
          <span className="v2-focus-meta">{focus.stageName} · {focus.tournamentDay}</span>
          <span className="v2-focus-teams"><span>{participantName(focus.home)}</span><strong>{visibleScore(focus) || 'vs'}</strong><span>{participantName(focus.away)}</span></span>
          <span className="v2-focus-facts">{statusLabel(focus.status)} · {focus.kickoffLabel} · {focus.venue}</span>
          <span className="v2-focus-action">Open match</span>
        </a>
      ) : <p className="v2-description">No canonical fixture is available for this tournament day.</p>}
      <div className="v2-ledger-heading">
        <div><p className="v2-eyebrow">Match ledger</p><h1>{focus?.tournamentDay || 'Tournament schedule'}</h1></div>
        <button type="button" className="v2-refresh" onClick={() => void onRefresh()} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      <div className="v2-match-ledger" aria-label="Chronological match schedule">
        {schedule.map((fixture) => <MatchRow fixture={fixture} key={fixture.id} onNavigate={onNavigate} />)}
      </div>
    </section>
  );
}
