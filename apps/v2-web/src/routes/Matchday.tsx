import type { MouseEvent } from 'react';
import { canonicalTournamentSnapshot } from '../domain/tournament-bridge';
import { scheduleForFocus, selectMatchdayFocus, statusLabel, visibleScore } from '../data/matchday-model';
import { snapshotFromState, type SnapshotState } from '../data/snapshot-state';
import type { FixtureSummary } from '../domain/contracts';
import { MatchRow, participantName } from '../ui/MatchRow';
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

function sourceLabel(state: SnapshotState): string {
  if (state.kind === 'verified') return 'Verified official snapshot';
  if (state.kind === 'partial') return 'Partially verified snapshot';
  if (state.kind === 'stale') return 'Last verified snapshot';
  if (state.kind === 'unavailable') return 'Provider unavailable';
  if (state.kind === 'error') return 'Official request error';
  return 'Loading official snapshot';
}

function stateNotice(state: SnapshotState, retry: () => Promise<void>) {
  if (state.kind === 'loading') return <StatePanel compact kind="loading" eyebrow="Official data" title="Opening the match ledger" description="Canonical fixtures are in place while validated match status loads." />;
  if (state.kind === 'stale') return <StatePanel compact kind="stale" eyebrow="Stale fallback" title="The last verified view remains available" description="The latest refresh did not validate. Scores and status below come only from the retained verified snapshot." action={<button className="v2-button v2-button--quiet" type="button" onClick={() => void retry()}>Try refresh</button>} />;
  if (state.kind === 'unavailable') return <StatePanel compact kind="unavailable" eyebrow="Provider unavailable" title="The official schedule still works" description="Canonical teams, kickoff, stage, and venue remain visible. No score or live state is asserted." action={<button className="v2-button v2-button--quiet" type="button" onClick={() => void retry()}>Try refresh</button>} />;
  if (state.kind === 'error') return <StatePanel compact kind="error" eyebrow="Request error" title="Official status could not be checked" description="The canonical schedule remains useful, but United is not asserting a current match state." action={<button className="v2-button v2-button--quiet" type="button" onClick={() => void retry()}>Retry official data</button>} />;
  return null;
}

function FocusMatch({ fixture, onNavigate }: { fixture: FixtureSummary; onNavigate: (path: string) => void }) {
  const path = `/v2/match/${fixture.id}`;
  const score = visibleScore(fixture);
  const tone: StatusTone = fixture.status.kind === 'live' ? 'live' : fixture.status.kind === 'final' ? 'verified' : 'neutral';
  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(path);
  }
  return (
    <a className="v2-scoreboard" data-status={fixture.status.kind} href={path} onClick={open}>
      <span className="v2-scoreboard__topline"><span>{fixture.stageName}</span><StatusMark tone={tone}>{statusLabel(fixture.status)}</StatusMark></span>
      <span className="v2-scoreboard__teams">
        <strong>{participantName(fixture.home)}</strong>
        <span className="v2-scoreboard__score" aria-label={score ? `Score ${score}` : 'Match pending'}>{score || 'vs'}</span>
        <strong>{participantName(fixture.away)}</strong>
      </span>
      <span className="v2-scoreboard__facts">{fixture.tournamentDay} · {fixture.kickoffLabel} · {fixture.venue}</span>
      <span className="v2-scoreboard__action">Open match <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h13M11 5l5 5-5 5" /></svg></span>
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
    <section className="v2-route v2-matchday" aria-busy={snapshotState.kind === 'loading' || refreshing}>
      <SectionHeader level={1} eyebrow="Now, next, consequence" title="Matchday" description="The verified World Cup schedule, focused on what matters next." action={<button type="button" className="v2-icon-button" data-refreshing={refreshing ? 'true' : 'false'} onClick={() => void onRefresh()} disabled={refreshing} aria-label={refreshing ? 'Refreshing official match data' : 'Refresh official match data'}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M18.5 9A7 7 0 0 0 6 7M5.5 15A7 7 0 0 0 18 17" /></svg></button>} />
      <div className="v2-source-strip" data-tone={sourceTone(snapshotState)}>
        <StatusMark tone={sourceTone(snapshotState)}>{sourceLabel(snapshotState)}</StatusMark>
        {'snapshot' in snapshotState && snapshotState.snapshot.source.fetchedAt ? <time dateTime={snapshotState.snapshot.source.fetchedAt}>{snapshotState.snapshot.source.fetchedAt}</time> : <span>Canonical schedule active</span>}
      </div>
      {stateNotice(snapshotState, onRefresh)}
      {focus ? <FocusMatch fixture={focus} onNavigate={onNavigate} /> : <StatePanel kind="empty" eyebrow="Empty schedule" title="No fixture is available for this day" description="United did not find a canonical match to place in focus." />}
      <section className="v2-ledger-section" aria-labelledby="match-ledger-title">
        <SectionHeader eyebrow="Chronological ledger" title={focus?.tournamentDay || 'Tournament schedule'} description={`${schedule.length} canonical ${schedule.length === 1 ? 'fixture' : 'fixtures'}`} />
        <div className="v2-match-ledger" id="match-ledger-title" aria-label="Chronological match schedule">
          {schedule.map((fixture) => <MatchRow fixture={fixture} key={fixture.id} onNavigate={onNavigate} />)}
        </div>
      </section>
    </section>
  );
}
