import type { MouseEvent } from 'react';
import { canonicalTournamentSnapshot } from '../domain/tournament-bridge';
import { scheduleForFocus, selectMatchdayFocus, statusLabel, visibleScore } from '../data/matchday-model';
import { snapshotFromState, type SnapshotState } from '../data/snapshot-state';
import type { FixtureSummary } from '../domain/contracts';
import { MatchRow, MatchSide } from '../ui/MatchRow';
import { SectionHeader } from '../ui/SectionHeader';
import { StatusMark, type StatusTone } from '../ui/StatusMark';

function sourceTone(state: SnapshotState): StatusTone {
  if (state.kind === 'verified') return 'verified';
  if (state.kind === 'partial' || state.kind === 'stale') return 'stale';
  if (state.kind === 'unavailable') return 'unavailable';
  if (state.kind === 'error') return 'error';
  return 'neutral';
}

function sourceLabel(state: SnapshotState): string {
  if (state.kind === 'verified') return 'Official snapshot verified';
  if (state.kind === 'partial') return 'Official coverage partial';
  if (state.kind === 'stale') return 'Last verified snapshot';
  if (state.kind === 'unavailable') return 'Official feed unavailable';
  if (state.kind === 'error') return 'Official check unavailable';
  return 'Checking official status';
}

function readableDate(day: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${day}T12:00:00Z`));
}

function freshnessLabel(state: SnapshotState): string {
  if ('snapshot' in state && state.snapshot.source.fetchedAt) {
    return `Updated ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(state.snapshot.source.fetchedAt))}`;
  }
  return 'Canonical schedule active';
}

function consequenceFor(fixture: FixtureSummary): string {
  if (fixture.stage === 'final') return 'The World Cup title is decided here.';
  if (fixture.stage === 'bronze') return 'Third place is decided here.';
  if (fixture.stage === 'sf') return 'A place in the World Cup final is on the line.';
  if (fixture.stage === 'qf') return 'The winner moves into the final four.';
  if (fixture.stage === 'r16') return 'The winner reaches the quarter-finals.';
  if (fixture.stage === 'r32') return 'Knockout football begins: the winner advances.';
  return `Group ${fixture.group} points shape the road to the knockouts.`;
}

function stateNotice(state: SnapshotState, retry: () => Promise<void>) {
  const action = state.kind !== 'loading'
    ? <button className="v2-service-notice__action" type="button" onClick={() => void retry()}>Retry</button>
    : null;
  if (state.kind === 'loading') return <section className="v2-service-notice" data-state="loading" role="status"><div><strong>Checking official status</strong><p>The canonical schedule is ready while validation completes.</p></div></section>;
  if (state.kind === 'stale') return <section className="v2-service-notice" data-state="stale"><div><strong>Last verified view</strong><p>The latest refresh did not validate. Retained scores and status remain marked stale.</p></div>{action}</section>;
  if (state.kind === 'unavailable') return <section className="v2-service-notice" data-state="unavailable"><div><strong>Schedule available, official status unavailable</strong><p>Teams, kickoff, stage, and venue remain canonical. No live state or score is implied.</p></div>{action}</section>;
  if (state.kind === 'error') return <section className="v2-service-notice" data-state="error" role="alert"><div><strong>Official status could not be checked</strong><p>The match schedule remains available without asserting a current match state.</p></div>{action}</section>;
  if (state.kind === 'partial') return <section className="v2-service-notice" data-state="partial"><div><strong>Official coverage is partial</strong><p>Only fields that passed provider validation are shown.</p></div>{action}</section>;
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
    <a className="v2-match-stage" data-status={fixture.status.kind} data-content-priority="primary" href={path} onClick={open}>
      <span className="v2-match-stage__geometry" aria-hidden="true" />
      <span className="v2-match-stage__topline">
        <span><b>{fixture.stageName}</b><small>Match {fixture.id}</small></span>
        <StatusMark tone={tone}>{statusLabel(fixture.status)}</StatusMark>
      </span>
      <span className="v2-match-stage__contest">
        <MatchSide participant={fixture.home} />
        <span className="v2-match-stage__score" aria-label={score ? `Score ${score}` : 'Match pending'}>{score || 'VS'}</span>
        <MatchSide participant={fixture.away} align="end" />
      </span>
      <span className="v2-match-stage__consequence">{consequenceFor(fixture)}</span>
      <span className="v2-match-stage__footer">
        <span><strong>{readableDate(fixture.tournamentDay)} · {fixture.kickoffLabel}</strong><small>{fixture.stadium || fixture.venue} · {fixture.venue}</small></span>
        <span className="v2-match-stage__open">Match centre <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h13M11 5l5 5-5 5" /></svg></span>
      </span>
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
  const groupMatches = snapshot.fixtures.filter((fixture) => fixture.stage === 'group').length;
  const roundOf32 = snapshot.bracket.find((round) => round.stage === 'r32');
  const final = snapshot.fixtures.find((fixture) => fixture.stage === 'final');
  return (
    <section className="v2-route v2-matchday" aria-busy={snapshotState.kind === 'loading' || refreshing}>
      <header className="v2-route-intro">
        <SectionHeader level={1} eyebrow="Match command" title="Matchday" description="The match that matters, the full day around it, and nothing invented." />
        <button type="button" className="v2-icon-button" data-refreshing={refreshing ? 'true' : 'false'} onClick={() => void onRefresh()} disabled={refreshing} aria-label={refreshing ? 'Refreshing official match data' : 'Refresh official match data'}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M18.5 9A7 7 0 0 0 6 7M5.5 15A7 7 0 0 0 18 17" /></svg></button>
      </header>
      <div className="v2-source-strip" data-tone={sourceTone(snapshotState)}>
        <StatusMark tone={sourceTone(snapshotState)}>{sourceLabel(snapshotState)}</StatusMark>
        <span>{freshnessLabel(snapshotState)}</span>
      </div>
      <div className="v2-matchday__layout">
        {focus ? <FocusMatch fixture={focus} onNavigate={onNavigate} /> : <section className="v2-empty-stage"><h2>No canonical fixture available</h2><p>The schedule contains no match to place in focus.</p></section>}
        <aside className="v2-day-desk" aria-labelledby="day-desk-title">
          <div className="v2-day-desk__header"><div><p className="v2-eyebrow">Day schedule</p><h2 id="day-desk-title">{focus ? readableDate(focus.tournamentDay) : 'Tournament day'}</h2></div><strong>{schedule.length}</strong></div>
          <div className="v2-match-ledger" aria-label="Chronological match schedule">
            {schedule.map((fixture) => <MatchRow fixture={fixture} key={fixture.id} onNavigate={onNavigate} />)}
          </div>
          {stateNotice(snapshotState, onRefresh)}
        </aside>
      </div>
      <section className="v2-competition-ribbon" aria-label="Tournament structure">
        <span><small>Group stage</small><strong>{groupMatches} matches</strong></span>
        <span><small>Knockout field</small><strong>{(roundOf32?.matches.length || 0) * 2} slots</strong></span>
        <span><small>Final destination</small><strong>{final?.venue || 'Canonical venue'}</strong></span>
        <span><small>Canonical registry</small><strong>{snapshot.fixtures.length} fixtures</strong></span>
      </section>
    </section>
  );
}
