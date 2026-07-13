import { canonicalTournamentSnapshot } from '../domain/tournament-bridge';
import { statusLabel } from '../data/matchday-model';
import { snapshotFromState, type SnapshotState } from '../data/snapshot-state';
import { FixtureStage } from '../ui/FixtureStage';
import { ServiceNotice } from '../ui/ServiceNotice';
import { StatePanel } from '../ui/StatePanel';

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
        <button type="button" className="v2-back-button" onClick={onBack}>← Matchday</button>
        <StatePanel headingLevel={1} kind="not-found" eyebrow="Fixture not found" title="This match is not in the canonical registry" description="Match detail resolves only official United 2026 fixture IDs." action={<button type="button" className="v2-button v2-button--primary" onClick={() => onNavigate('/v2/')}>View Matchday</button>} />
      </section>
    );
  }
  return (
    <article className="v2-route v2-match-detail" aria-busy={snapshotState.kind === 'loading' || refreshing}>
      <button type="button" className="v2-back-button" onClick={onBack}>← Matchday</button>
      <h1 className="v2-page-title">Match detail</h1>
      <FixtureStage fixture={fixture} detail />
      <div className="v2-detail-grid">
        <section className="v2-detail-ledger" aria-labelledby="fixture-ledger-title">
          <h2 id="fixture-ledger-title">Verified fields</h2>
          <dl>
            <div><dt>Status</dt><dd>{statusLabel(fixture.status)}</dd></div>
            <div><dt>Kickoff</dt><dd><time dateTime={fixture.kickoff}>{fixture.kickoff}</time></dd></div>
            <div><dt>Stage</dt><dd>{fixture.stageName}</dd></div>
            <div><dt>Venue</dt><dd>{fixture.stadium || fixture.venue}, {fixture.venue}</dd></div>
            <div><dt>Source freshness</dt><dd>{snapshot.source.fetchedAt || 'Not provided'}</dd></div>
          </dl>
        </section>
        <section className="v2-coverage-list" aria-labelledby="coverage-title">
          <h2 id="coverage-title">Coverage</h2>
          <ul><li><strong>Fixture identity</strong><span>Canonical</span></li><li><strong>Commentary</strong><span>Not provided</span></li><li><strong>Lineups</strong><span>Not provided</span></li><li><strong>Match statistics</strong><span>Not provided</span></li></ul>
          {fixture.status.kind === 'live' && !fixture.status.score ? <p>Live status passed validation; the score remains hidden until canonical identity is fully resolved.</p> : null}
        </section>
      </div>
      <ServiceNotice state={snapshotState} onRetry={onRefresh} />
    </article>
  );
}
