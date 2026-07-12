import { canonicalTournamentSnapshot } from '../domain/tournament-bridge';
import { statusLabel, visibleScore } from '../data/matchday-model';
import { snapshotFromState, type SnapshotState } from '../data/snapshot-state';
import { participantName } from '../ui/MatchRow';
import { SectionHeader } from '../ui/SectionHeader';
import { StatePanel } from '../ui/StatePanel';
import { StatusMark, type StatusTone } from '../ui/StatusMark';

function tone(state: SnapshotState): StatusTone {
  if (state.kind === 'verified') return 'verified';
  if (state.kind === 'partial' || state.kind === 'stale') return 'stale';
  if (state.kind === 'unavailable') return 'unavailable';
  if (state.kind === 'error') return 'error';
  return 'neutral';
}

export function MatchDetailRoute({ fixtureId, snapshotState, refreshing, onRefresh, onNavigate, onBack }: {
  fixtureId: number;
  snapshotState: SnapshotState;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onNavigate: (path: string) => void;
  onBack: () => void;
}) {
  const snapshot = snapshotFromState(snapshotState) || canonicalTournamentSnapshot();
  const fixture = snapshot.fixtures.find((candidate) => candidate.id === fixtureId);
  if (!fixture) {
    return (
      <section className="v2-route v2-match-detail" aria-busy={snapshotState.kind === 'loading'}>
        <button type="button" className="v2-back-button" onClick={onBack}><span aria-hidden="true">←</span> Matchday</button>
        <StatePanel headingLevel={1} kind="not-found" eyebrow="Fixture not found" title="This match is not in the canonical registry" description="Match detail resolves only official United 2026 fixture IDs." action={<button type="button" className="v2-button v2-button--primary" onClick={() => onNavigate('/v2/')}>View Matchday</button>} />
      </section>
    );
  }
  const score = visibleScore(fixture);
  const matchTone: StatusTone = fixture.status.kind === 'live' ? 'live' : fixture.status.kind === 'final' ? 'verified' : 'neutral';
  return (
    <article className="v2-route v2-match-detail" aria-busy={snapshotState.kind === 'loading' || refreshing}>
      <button type="button" className="v2-back-button" onClick={onBack}><span aria-hidden="true">←</span> Matchday</button>
      <SectionHeader level={1} eyebrow={`${fixture.stageName} · Match ${fixture.id}`} title="Match detail" description={`${fixture.tournamentDay} · ${fixture.kickoffLabel}`} />
      <div className="v2-source-strip" data-tone={tone(snapshotState)}><StatusMark tone={tone(snapshotState)}>{snapshotState.kind === 'verified' ? 'Verified official snapshot' : snapshotState.kind === 'stale' ? 'Last verified snapshot' : snapshotState.kind === 'unavailable' ? 'Provider unavailable' : snapshotState.kind === 'error' ? 'Official request error' : snapshotState.kind === 'partial' ? 'Partially verified snapshot' : 'Loading official snapshot'}</StatusMark><span>{fixture.venue}</span></div>
      <section className="v2-detail-board" data-status={fixture.status.kind} aria-label={`${participantName(fixture.home)} versus ${participantName(fixture.away)}`}>
        <StatusMark tone={matchTone}>{statusLabel(fixture.status)}</StatusMark>
        <div className="v2-detail-board__teams"><strong>{participantName(fixture.home)}</strong><span aria-label={score ? `Score ${score}` : 'Score pending'}>{score || 'vs'}</span><strong>{participantName(fixture.away)}</strong></div>
        <p>{fixture.stadium || fixture.venue} · {fixture.venue}</p>
      </section>
      <section className="v2-detail-ledger" aria-labelledby="fixture-ledger-title">
        <SectionHeader eyebrow="Fixture ledger" title="Verified fields" />
        <dl id="fixture-ledger-title">
          <div><dt>Status</dt><dd>{statusLabel(fixture.status)}</dd></div>
          <div><dt>Kickoff</dt><dd><time dateTime={fixture.kickoff}>{fixture.kickoff}</time></dd></div>
          <div><dt>Stage</dt><dd>{fixture.stageName}</dd></div>
          <div><dt>Venue</dt><dd>{fixture.stadium || fixture.venue}, {fixture.venue}</dd></div>
          <div><dt>Source freshness</dt><dd>{snapshot.source.fetchedAt || 'Official freshness unavailable'}</dd></div>
        </dl>
      </section>
      {fixture.status.kind === 'live' && !score ? <StatePanel compact kind="neutral" eyebrow="Live status verified" title="Score pending canonical identity" description="United will not display a number until the score is validated against the fixture." /> : null}
      {fixture.status.kind === 'pending' || fixture.status.kind === 'unavailable' ? <StatePanel compact kind="unavailable" eyebrow="Match data limited" title="No event timeline is available" description="Commentary, lineups, possession, shots, and player statistics are not shown because verified fields do not exist." /> : null}
      {(snapshotState.kind === 'unavailable' || snapshotState.kind === 'error') ? <button type="button" className="v2-button v2-button--quiet" onClick={() => void onRefresh()} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Retry official data'}</button> : null}
    </article>
  );
}
