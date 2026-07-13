import type { MouseEvent } from 'react';
import { statusLabel, visibleScore } from '../data/matchday-model';
import type { FixtureParticipant, FixtureSummary } from '../domain/contracts';
import { Flag } from './Flag';
import { StatusMark, type StatusTone } from './StatusMark';

export function participantName(participant: FixtureParticipant): string {
  return participant.kind === 'team' ? participant.name : participant.label;
}

export function MatchSide({ participant, align = 'start' }: { participant: FixtureParticipant; align?: 'start' | 'end' }) {
  return (
    <span className="v2-match-side" data-kind={participant.kind} data-align={align}>
      <Flag code={participant.kind === 'team' ? participant.code : null} size="stage" />
      <strong>{participantName(participant)}</strong>
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
        <span className="v2-match-row__teams">
          <span><Flag code={fixture.home.kind === 'team' ? fixture.home.code : null} /><strong>{participantName(fixture.home)}</strong></span>
          <span><Flag code={fixture.away.kind === 'team' ? fixture.away.code : null} /><strong>{participantName(fixture.away)}</strong></span>
        </span>
      </span>
      <span className="v2-match-row__result">
        <strong>{score || '—'}</strong>
        <StatusMark tone={toneFor(fixture)}>{statusLabel(fixture.status)}</StatusMark>
      </span>
    </a>
  );
}
