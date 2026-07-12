import type { MouseEvent } from 'react';
import { statusLabel, visibleScore } from '../data/matchday-model';
import type { FixtureParticipant, FixtureSummary } from '../domain/contracts';
import { StatusMark, type StatusTone } from './StatusMark';

export function participantName(participant: FixtureParticipant): string {
  return participant.kind === 'team' ? participant.name : participant.label;
}

export function MatchSide({ participant, align = 'start' }: { participant: FixtureParticipant; align?: 'start' | 'end' }) {
  return (
    <span className="v2-match-side" data-kind={participant.kind} data-align={align}>
      <span className="v2-match-side__mark" aria-hidden="true">{participant.kind === 'team' ? participant.code : 'PATH'}</span>
      <strong>{participantName(participant)}</strong>
      <small>{participant.kind === 'team' ? participant.code : 'Qualification path'}</small>
    </span>
  );
}

function toneFor(fixture: FixtureSummary): StatusTone {
  if (fixture.status.kind === 'live') return 'live';
  if (fixture.status.kind === 'unavailable') return 'unavailable';
  if (fixture.status.kind === 'pending') return 'pending';
  if (fixture.status.kind === 'final') return 'verified';
  return 'neutral';
}

export function MatchRow({ fixture, onNavigate }: { fixture: FixtureSummary; onNavigate: (path: string) => void }) {
  const score = visibleScore(fixture);
  const path = `/v2/match/${fixture.id}`;
  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(path);
  }
  return (
    <a className="v2-match-row" data-status={fixture.status.kind} href={path} onClick={open} aria-label={`${participantName(fixture.home)} versus ${participantName(fixture.away)}, ${statusLabel(fixture.status)}`}>
      <span className="v2-match-row__time">{fixture.kickoffLabel}</span>
      <span className="v2-match-row__body">
        <span className="v2-match-row__teams"><strong>{participantName(fixture.home)}</strong><strong>{participantName(fixture.away)}</strong></span>
        <span className="v2-match-row__meta">{fixture.stageName} · {fixture.venue}</span>
      </span>
      <span className="v2-match-row__result">
        <strong>{score || (fixture.status.kind === 'scheduled' ? '—' : 'Pending')}</strong>
        <StatusMark tone={toneFor(fixture)}>{statusLabel(fixture.status)}</StatusMark>
      </span>
      <svg className="v2-row-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 6 6-6 6" /></svg>
    </a>
  );
}
