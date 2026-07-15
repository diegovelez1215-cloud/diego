import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { statusLabel } from '../data/matchday-model';
import type { FixtureParticipant, FixtureSummary } from '../domain/contracts';
import { ConsequenceLine } from './ConsequenceLine';
import { Flag } from './Flag';
import { participantName } from './MatchRow';
import { StatusMark, type StatusTone } from './StatusMark';

function readableDate(day: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${day}T12:00:00Z`));
}

function statusTone(fixture: FixtureSummary): StatusTone {
  if (fixture.status.kind === 'live') return 'live';
  if (fixture.status.kind === 'final') return 'verified';
  if (fixture.status.kind === 'pending') return 'pending';
  if (fixture.status.kind === 'unavailable') return 'unavailable';
  return 'neutral';
}

function AnimatedValue({ value }: { value: string }) {
  const previousValue = useRef(value);
  const changedToScore = previousValue.current !== value && /^\d+$/.test(value);

  useEffect(() => {
    previousValue.current = value;
  }, [value]);

  return (
    <b>
      <span key={value} data-score-value={/^\d+$/.test(value) ? 'true' : undefined} data-score-change={changedToScore ? 'true' : undefined}>{value}</span>
    </b>
  );
}

function ParticipantRow({ participant, value }: { participant: FixtureParticipant; value: string }) {
  return (
    <span className="v2-fixture-stage__team" data-kind={participant.kind}>
      <Flag code={participant.kind === 'team' ? participant.code : null} size="stage" />
      <strong>{participantName(participant)}</strong>
      <AnimatedValue value={value} />
    </span>
  );
}

function announcementFor(fixture: FixtureSummary): string {
  const home = participantName(fixture.home);
  const away = participantName(fixture.away);
  if (fixture.status.kind === 'live' && fixture.status.score) {
    const minute = fixture.status.minute == null ? 'live' : `${fixture.status.minute} minutes`;
    return `${home} ${fixture.status.score.home}, ${away} ${fixture.status.score.away}, ${minute}`;
  }
  if (fixture.status.kind === 'final') return `${home} ${fixture.status.score.home}, ${away} ${fixture.status.score.away}, full time`;
  return `${home} versus ${away}, ${statusLabel(fixture.status)}`;
}

function statusSignature(fixture: FixtureSummary): string {
  const score = fixture.status.kind === 'final' || fixture.status.kind === 'live' ? fixture.status.score : null;
  const minute = fixture.status.kind === 'live' ? fixture.status.minute : null;
  return `${fixture.id}:${fixture.status.kind}:${score?.home ?? '-'}:${score?.away ?? '-'}:${minute ?? '-'}`;
}

function useFixtureAnnouncement(fixture: FixtureSummary): string {
  const signature = statusSignature(fixture);
  const previousSignature = useRef(signature);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (previousSignature.current === signature) return;
    previousSignature.current = signature;
    const timer = window.setTimeout(() => setAnnouncement(announcementFor(fixture)), 350);
    return () => window.clearTimeout(timer);
  }, [fixture, signature]);

  return announcement;
}

export function FixtureStage({ fixture, onNavigate, detail = false }: {
  fixture: FixtureSummary;
  onNavigate?: (path: string) => void;
  detail?: boolean;
}) {
  const score = fixture.status.kind === 'final' || (fixture.status.kind === 'live' && fixture.status.score)
    ? fixture.status.score : null;
  const homeValue = score ? String(score.home) : fixture.status.kind === 'scheduled' ? fixture.kickoffLabel : '–';
  const awayValue = score ? String(score.away) : fixture.status.kind === 'scheduled' ? 'local' : '–';
  const announcement = useFixtureAnnouncement(fixture);
  const content = (
    <>
      <span className="v2-fixture-stage__topline">
        <span>{fixture.group ? `Group ${fixture.group} · ` : ''}Match {fixture.id}</span>
        <StatusMark tone={statusTone(fixture)}>{statusLabel(fixture.status)}</StatusMark>
      </span>
      <span className="v2-fixture-stage__teams">
        <ParticipantRow participant={fixture.home} value={homeValue} />
        <ParticipantRow participant={fixture.away} value={awayValue} />
      </span>
      <span className="v2-fixture-stage__venue">{fixture.stadium || fixture.venue} · {fixture.venue} · {fixture.stageName}</span>
      <ConsequenceLine fixture={fixture} className="v2-fixture-stage__consequence" />
      <span className="v2-fixture-stage__footer"><span>{readableDate(fixture.tournamentDay)}</span>{detail ? null : <span>Match centre →</span>}</span>
      <span className="v2-visually-hidden" aria-live="polite" aria-atomic="true">{announcement}</span>
    </>
  );
  const label = `${participantName(fixture.home)} versus ${participantName(fixture.away)}, ${statusLabel(fixture.status)}`;
  if (!onNavigate || detail) return <section className="v2-fixture-stage" data-status={fixture.status.kind} data-detail={detail ? 'true' : undefined} aria-label={label}>{content}</section>;
  const path = `/v2/match/${fixture.id}`;
  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate?.(path);
  }
  return <a className="v2-fixture-stage" data-status={fixture.status.kind} data-content-priority="primary" aria-label={label} href={path} onClick={open}>{content}</a>;
}
