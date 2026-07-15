import { canonicalTournamentSnapshot } from '../domain/tournament-bridge';
import { statusLabel } from '../data/matchday-model';
import { snapshotFromState, type SnapshotState } from '../data/snapshot-state';
import type { FixtureSummary } from '../domain/contracts';
import { hasResolvedParticipants, type LocalPrediction } from '../predictions/contracts';
import { isEligibleFixture, predictionNow, predictionState } from '../predictions/prediction-bridge';
import { ConsequenceLine } from '../ui/ConsequenceLine';
import { FixtureStage } from '../ui/FixtureStage';
import { participantName } from '../ui/MatchRow';
import { PredictionEntryRow } from '../ui/PredictionEntryRow';
import { ServiceNotice } from '../ui/ServiceNotice';
import { StatePanel } from '../ui/StatePanel';

function provided(value: string | null | undefined): string {
  return value?.trim() || 'Not provided';
}

function readableTimestamp(value: string | null): string {
  if (!value) return 'Not provided';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function fixtureVenue(fixture: FixtureSummary): string {
  if (fixture.stadium && fixture.venue) return `${fixture.stadium}, ${fixture.venue}`;
  return provided(fixture.stadium || fixture.venue);
}

function outcomeLabel(record: LocalPrediction, fixture: FixtureSummary): string {
  if (record.outcome === 'draw') return 'Draw';
  const participant = record.outcome === 'home' ? fixture.home : fixture.away;
  return participantName(participant);
}

function verifiedResultSentence(fixture: FixtureSummary): string | null {
  if (fixture.status.kind !== 'final') return null;
  const scoreline = `${fixture.status.score.home}–${fixture.status.score.away}`;
  if (fixture.winner === 'draw') return `${participantName(fixture.home)} and ${participantName(fixture.away)} finished ${scoreline}.`;
  if (fixture.winner === 'home') return `${participantName(fixture.home)} won ${scoreline}.`;
  if (fixture.winner === 'away') return `${participantName(fixture.away)} won ${scoreline}.`;
  return `The validated official score is ${scoreline}.`;
}

function canonicalNarrative(fixture: FixtureSummary, resultSentence: string | null): string {
  const stageContext = fixture.group ? `This is a Group ${fixture.group} fixture.` : `This is the ${fixture.stageName}.`;
  if (resultSentence) return `${stageContext} ${resultSentence}`;
  const venueContext = fixture.stadium ? `The canonical venue is ${fixture.stadium}.` : '';
  return `${stageContext}${venueContext ? ` ${venueContext}` : ''}`;
}

export function MatchDetailRoute({ fixtureId, snapshotState, predictionRecords, refreshing, onRefresh, onNavigate, onBack }: {
  fixtureId: number;
  snapshotState: SnapshotState;
  predictionRecords: readonly LocalPrediction[];
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

  const record = predictionRecords.find((candidate) => candidate.fixtureId === fixture.id);
  const now = predictionNow();
  const showPrediction = hasResolvedParticipants(fixture) && (!!record || isEligibleFixture(fixture, now));
  const state = predictionState(fixture, record, now);
  const resultSentence = verifiedResultSentence(fixture);

  return (
    <article className="v2-route v2-match-detail" aria-busy={snapshotState.kind === 'loading' || refreshing}>
      <button type="button" className="v2-back-button" onClick={onBack}>← Matchday</button>
      <h1 className="v2-page-title">Match detail</h1>
      <FixtureStage fixture={fixture} detail />
      {showPrediction ? <PredictionEntryRow fixtureId={fixture.id} state={state} call={record ? outcomeLabel(record, fixture) : null} onNavigate={onNavigate} /> : null}
      <section className="v2-match-narrative" aria-labelledby="match-context-title">
        <h2 id="match-context-title">Match context</h2>
        <ConsequenceLine fixture={fixture} />
        <p>{canonicalNarrative(fixture, resultSentence)}</p>
      </section>
      <div className="v2-detail-grid">
        <section className="v2-detail-ledger" aria-labelledby="fixture-ledger-title">
          <h2 id="fixture-ledger-title">Verified fields</h2>
          <dl>
            <div><dt>Status</dt><dd>{statusLabel(fixture.status)}</dd></div>
            <div><dt>Kickoff</dt><dd><time dateTime={fixture.kickoff}>{readableTimestamp(fixture.kickoff)}</time></dd></div>
            <div><dt>Stage</dt><dd>{provided(fixture.stageName)}</dd></div>
            <div><dt>Venue</dt><dd>{fixtureVenue(fixture)}</dd></div>
            <div><dt>Source freshness</dt><dd>{readableTimestamp(snapshot.source.fetchedAt)}</dd></div>
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
