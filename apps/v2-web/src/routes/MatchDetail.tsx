import { canonicalTournamentSnapshot } from '../domain/tournament-bridge';
import { statusLabel, visibleScore } from '../data/matchday-model';
import { snapshotFromState, type SnapshotState } from '../data/snapshot-state';
import { MatchSide, participantName } from '../ui/MatchRow';
import { SectionHeader } from '../ui/SectionHeader';
import { StatePanel } from '../ui/StatePanel';
import { StatusMark, type StatusTone } from '../ui/StatusMark';

function sourceTone(state: SnapshotState): StatusTone {
  if (state.kind === 'verified') return 'verified';
  if (state.kind === 'partial' || state.kind === 'stale') return 'stale';
  if (state.kind === 'unavailable') return 'unavailable';
  if (state.kind === 'error') return 'error';
  return 'neutral';
}

function sourceCopy(state: SnapshotState): string {
  if (state.kind === 'verified') return 'Official snapshot verified';
  if (state.kind === 'partial') return 'Official coverage partial';
  if (state.kind === 'stale') return 'Last verified snapshot';
  if (state.kind === 'unavailable') return 'Official feed unavailable';
  if (state.kind === 'error') return 'Official check unavailable';
  return 'Checking official status';
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
        <button type="button" className="v2-back-button" onClick={onBack}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M17 10H4M9 5l-5 5 5 5" /></svg> Matchday</button>
        <StatePanel headingLevel={1} kind="not-found" eyebrow="Fixture not found" title="This match is not in the canonical registry" description="Match detail resolves only official United 2026 fixture IDs." action={<button type="button" className="v2-button v2-button--primary" onClick={() => onNavigate('/v2/')}>View Matchday</button>} />
      </section>
    );
  }
  const score = visibleScore(fixture);
  const matchTone: StatusTone = fixture.status.kind === 'live' ? 'live' : fixture.status.kind === 'final' ? 'verified' : 'neutral';
  const limited = snapshotState.kind === 'unavailable' || snapshotState.kind === 'error';
  return (
    <article className="v2-route v2-match-detail" aria-busy={snapshotState.kind === 'loading' || refreshing}>
      <button type="button" className="v2-back-button" onClick={onBack}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M17 10H4M9 5l-5 5 5 5" /></svg> Matchday</button>
      <header className="v2-route-intro v2-route-intro--detail">
        <SectionHeader level={1} eyebrow={`${fixture.stageName} · Match ${fixture.id}`} title="Match detail" description={`${fixture.tournamentDay} · ${fixture.kickoffLabel} · ${fixture.venue}`} />
      </header>
      <div className="v2-source-strip" data-tone={sourceTone(snapshotState)}><StatusMark tone={sourceTone(snapshotState)}>{sourceCopy(snapshotState)}</StatusMark><span>{snapshot.source.fetchedAt ? `Snapshot ${snapshot.source.fetchedAt}` : 'Canonical fixture fields only'}</span></div>
      <section className="v2-detail-stage" data-status={fixture.status.kind} aria-label={`${participantName(fixture.home)} versus ${participantName(fixture.away)}`}>
        <span className="v2-detail-stage__geometry" aria-hidden="true" />
        <div className="v2-detail-stage__status"><StatusMark tone={matchTone}>{statusLabel(fixture.status)}</StatusMark><span>{fixture.stageName}</span></div>
        <div className="v2-detail-stage__contest">
          <MatchSide participant={fixture.home} />
          <span className="v2-detail-stage__score" aria-label={score ? `Score ${score}` : 'Score pending'}>{score || 'VS'}</span>
          <MatchSide participant={fixture.away} align="end" />
        </div>
        <div className="v2-detail-stage__venue"><strong>{fixture.stadium || fixture.venue}</strong><span>{fixture.venue} · {fixture.kickoffLabel}</span></div>
      </section>
      <div className="v2-detail-grid">
        <section className="v2-detail-ledger" aria-labelledby="fixture-ledger-title">
          <SectionHeader eyebrow="Match file" title="Verified fields" description="Every value below comes from the canonical fixture or validated official state." />
          <dl id="fixture-ledger-title">
            <div><dt>Status</dt><dd>{statusLabel(fixture.status)}</dd></div>
            <div><dt>Kickoff</dt><dd><time dateTime={fixture.kickoff}>{fixture.kickoff}</time></dd></div>
            <div><dt>Stage</dt><dd>{fixture.stageName}</dd></div>
            <div><dt>Venue</dt><dd>{fixture.stadium || fixture.venue}, {fixture.venue}</dd></div>
            <div><dt>Source freshness</dt><dd>{snapshot.source.fetchedAt || 'Not provided'}</dd></div>
          </dl>
        </section>
        <aside className="v2-coverage-desk" aria-labelledby="coverage-title">
          <p className="v2-eyebrow">Coverage desk</p><h2 id="coverage-title">What is available</h2>
          <ul>
            <li><strong>Fixture identity</strong><StatusMark tone="verified">Canonical</StatusMark></li>
            <li><strong>Commentary</strong><span>Not provided</span></li>
            <li><strong>Lineups</strong><span>Not provided</span></li>
            <li><strong>Match statistics</strong><span>Not provided</span></li>
          </ul>
          {fixture.status.kind === 'live' && !score ? <p className="v2-coverage-note">Live status passed validation; the score remains hidden until canonical identity is fully resolved.</p> : null}
          {limited ? <button type="button" className="v2-button v2-button--quiet" onClick={() => void onRefresh()} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Retry official data'}</button> : null}
        </aside>
      </div>
    </article>
  );
}
