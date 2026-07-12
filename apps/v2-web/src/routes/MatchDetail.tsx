import { canonicalTournamentSnapshot } from '../domain/tournament-bridge';
import { statusLabel, visibleScore } from '../data/matchday-model';
import { snapshotFromState, type SnapshotState } from '../data/snapshot-state';
import type { FixtureParticipant } from '../domain/contracts';

function participantName(participant: FixtureParticipant): string {
  return participant.kind === 'team' ? `${participant.flag} ${participant.name}` : participant.label;
}

function detailState(state: SnapshotState): string {
  if (state.kind === 'loading') return 'Loading validated official match status.';
  if (state.kind === 'verified') return state.snapshot.source.fetchedAt ? `Verified official snapshot · updated ${state.snapshot.source.fetchedAt}` : 'Verified official snapshot.';
  if (state.kind === 'partial') return 'Partially verified official snapshot.';
  if (state.kind === 'stale') return 'Showing the last verified match state; the latest refresh is stale.';
  if (state.kind === 'unavailable') return 'Official match status is unavailable. Canonical kickoff information is still shown.';
  return 'Official match status could not be refreshed.';
}

export function MatchDetailRoute({ fixtureId, snapshotState, refreshing, onRefresh, onNavigate }: {
  fixtureId: number;
  snapshotState: SnapshotState;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onNavigate: (path: string) => void;
}) {
  const snapshot = snapshotFromState(snapshotState) || canonicalTournamentSnapshot();
  const fixture = snapshot.fixtures.find((candidate) => candidate.id === fixtureId);
  if (!fixture) {
    return <section className="v2-match-detail v2-not-found" role="status"><p className="v2-eyebrow">Not found</p><h1>This canonical match does not exist.</h1><p className="v2-description">Match detail only resolves fixture IDs from the tournament registry.</p><button type="button" className="v2-refresh" onClick={() => onNavigate('/v2/')}>Back to Matchday</button></section>;
  }
  const score = visibleScore(fixture);
  return (
    <section className="v2-match-detail" aria-busy={snapshotState.kind === 'loading' || refreshing}>
      <button type="button" className="v2-back" onClick={() => onNavigate('/v2/')}>Back to Matchday</button>
      <p className="v2-eyebrow">Match detail</p>
      <p className="v2-source-state" role="status">{detailState(snapshotState)}</p>
      <div className="v2-detail-scoreboard">
        <p>{fixture.stageName}</p>
        <h1><span>{participantName(fixture.home)}</span><strong>{score || 'vs'}</strong><span>{participantName(fixture.away)}</span></h1>
        <p>{statusLabel(fixture.status)} · {fixture.kickoffLabel}</p>
      </div>
      <dl className="v2-detail-facts"><div><dt>Kickoff</dt><dd>{fixture.kickoff}</dd></div><div><dt>Venue</dt><dd>{fixture.stadium || fixture.venue}, {fixture.venue}</dd></div><div><dt>Stage</dt><dd>{fixture.stageName}</dd></div></dl>
      {fixture.status.kind === 'live' && !score ? <p className="v2-note">Validated live status is available, but the score is pending canonical identity.</p> : null}
      {fixture.status.kind === 'pending' || fixture.status.kind === 'unavailable' ? <p className="v2-note">Match data is pending or unavailable; no statistics are shown.</p> : null}
      {(snapshotState.kind === 'unavailable' || snapshotState.kind === 'error') ? <button type="button" className="v2-refresh" onClick={() => void onRefresh()} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Retry official data'}</button> : null}
    </section>
  );
}
