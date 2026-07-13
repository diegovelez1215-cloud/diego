import type { MouseEvent } from 'react';
import { statusLabel } from '../data/matchday-model';
import type { FixtureParticipant, FixtureSummary } from '../domain/contracts';
import { Flag } from './Flag';
import { participantName } from './MatchRow';
import { StatusMark, type StatusTone } from './StatusMark';

function readableDate(day: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${day}T12:00:00Z`));
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

function ParticipantRow({ participant, value }: { participant: FixtureParticipant; value: string }) {
  return (
    <span className="v2-fixture-stage__team" data-kind={participant.kind}>
      <Flag code={participant.kind === 'team' ? participant.code : null} size="stage" />
      <strong>{participantName(participant)}</strong>
      <b>{value}</b>
    </span>
  );
}

export function FixtureStage({ fixture, onNavigate, detail = false }: {
  fixture: FixtureSummary;
  onNavigate?: (path: string) => void;
  detail?: boolean;
}) {
  const score = fixture.status.kind === 'final' || (fixture.status.kind === 'live' && fixture.status.score)
    ? fixture.status.score : null;
  const tone: StatusTone = fixture.status.kind === 'live' ? 'live' : fixture.status.kind === 'final' ? 'verified' : 'neutral';
  const homeValue = score ? String(score.home) : fixture.status.kind === 'scheduled' ? fixture.kickoffLabel : '–';
  const awayValue = score ? String(score.away) : fixture.status.kind === 'scheduled' ? 'local' : '–';
  const content = (
    <>
      <span className="v2-fixture-stage__topline">
        <span>{fixture.group ? `Group ${fixture.group} · ` : ''}Match {fixture.id}</span>
        <StatusMark tone={tone}>{statusLabel(fixture.status)}</StatusMark>
      </span>
      <span className="v2-fixture-stage__teams">
        <ParticipantRow participant={fixture.home} value={homeValue} />
        <ParticipantRow participant={fixture.away} value={awayValue} />
      </span>
      <span className="v2-fixture-stage__venue">{fixture.stadium || fixture.venue} · {fixture.venue} · {fixture.stageName}</span>
      <span className="v2-fixture-stage__consequence">{consequenceFor(fixture)}</span>
      <span className="v2-fixture-stage__footer"><span>{readableDate(fixture.tournamentDay)}</span>{detail ? null : <span>Match centre →</span>}</span>
    </>
  );
  if (!onNavigate || detail) return <section className="v2-fixture-stage" data-status={fixture.status.kind} data-detail={detail ? 'true' : undefined} aria-label={`${participantName(fixture.home)} versus ${participantName(fixture.away)}`}>{content}</section>;
  const path = `/v2/match/${fixture.id}`;
  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate?.(path);
  }
  return <a className="v2-fixture-stage" data-status={fixture.status.kind} data-content-priority="primary" href={path} onClick={open}>{content}</a>;
}
