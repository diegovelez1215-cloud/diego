import { useEffect, useState } from 'react';
import { canonicalTournamentSnapshot } from '../domain/tournament-bridge';
import { snapshotFromState, type SnapshotState } from '../data/snapshot-state';
import type { FixtureParticipant, TournamentSnapshot, TournamentStage } from '../domain/contracts';
import { Flag } from '../ui/Flag';
import { MatchRow, participantName } from '../ui/MatchRow';

type Section = 'groups' | 'bracket' | 'matches';

const phases: ReadonlyArray<{ stage: TournamentStage; label: string }> = [
  { stage: 'group', label: 'Groups' }, { stage: 'r32', label: 'R32' }, { stage: 'r16', label: 'R16' },
  { stage: 'qf', label: 'QF' }, { stage: 'sf', label: 'SF' }, { stage: 'final', label: 'Final' },
];

function sectionFromUrl(): Section {
  const value = new URLSearchParams(window.location.search).get('section');
  return value === 'bracket' || value === 'matches' ? value : 'groups';
}

function phaseState(snapshot: TournamentSnapshot, stage: TournamentStage) {
  const fixtures = snapshot.fixtures.filter((fixture) => fixture.stage === stage);
  if (fixtures.length && fixtures.every((fixture) => fixture.status.kind === 'final')) return 'complete';
  if (fixtures.some((fixture) => fixture.status.kind === 'live' || fixture.status.kind === 'final')) return 'current';
  return 'future';
}

function Participant({ participant }: { participant: FixtureParticipant }) {
  return <span><Flag code={participant.kind === 'team' ? participant.code : null} /><strong>{participantName(participant)}</strong></span>;
}

export function TournamentRoute({ snapshotState, onNavigate }: { snapshotState: SnapshotState; onNavigate: (path: string) => void }) {
  const snapshot = snapshotFromState(snapshotState) || canonicalTournamentSnapshot();
  const [section, setSection] = useState<Section>(sectionFromUrl);
  useEffect(() => {
    const sync = () => setSection(sectionFromUrl());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  function select(next: Section) {
    const url = new URL(window.location.href);
    if (next === 'groups') url.searchParams.delete('section'); else url.searchParams.set('section', next);
    window.history.pushState({ unitedV2Navigation: true }, '', `${url.pathname}${url.search}`);
    setSection(next);
  }
  const days = [...new Set(snapshot.fixtures.map((fixture) => fixture.tournamentDay))].sort();
  return (
    <section className="v2-route v2-tournament">
      <h1 className="v2-page-title">Tournament</h1>
      <section className="v2-phase-tracker" aria-label="Tournament phase progress">
        {phases.map((phase) => <span key={phase.stage} data-state={phaseState(snapshot, phase.stage)}><b>{phase.label}</b><i /></span>)}
      </section>
      <p className="v2-tournament-fact">{snapshot.fixtures.length} matches · 16 venues · 3 hosts</p>
      <nav className="v2-section-switcher" aria-label="Tournament sections">
        {(['groups', 'bracket', 'matches'] as const).map((item) => <button type="button" key={item} aria-current={section === item ? 'page' : undefined} onClick={() => select(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}
      </nav>
      {section === 'groups' ? (
        <div className="v2-groups-grid" data-section="groups">
          {snapshot.groups.map((group) => <section className="v2-group-table" key={group.group} aria-labelledby={`group-${group.group}`}>
            <header><h2 id={`group-${group.group}`}>Group {group.group}</h2><span>{group.state === 'not-started' ? 'Awaiting results' : group.state === 'complete' ? 'Complete' : 'Provisional'}</span></header>
            <div className="v2-group-table__labels" aria-hidden="true"><span>Pos</span><span>Team</span><span>MP</span><span>Pts</span></div>
            {group.rows.map((row) => <div className="v2-group-table__row" key={row.team.code}><b>{row.rank}</b><span><Flag code={row.team.code} /><strong>{row.team.name}</strong></span><b>{row.played}</b><b>{row.points}</b></div>)}
          </section>)}
        </div>
      ) : null}
      {section === 'bracket' ? (
        <div className="v2-bracket" data-section="bracket">
          {snapshot.bracket.filter((round) => round.stage !== 'bronze').map((round) => {
            const resolved = round.matches.filter((match) => match.fixture.home.kind === 'team' && match.fixture.away.kind === 'team').length;
            return <section className="v2-bracket-column" key={round.stage}><header><h2>{round.name}</h2><span>{resolved} of {round.matches.length} resolved</span></header>{round.matches.map((match) => <a href={`/v2/match/${match.fixture.id}`} onClick={(event) => { event.preventDefault(); onNavigate(`/v2/match/${match.fixture.id}`); }} className="v2-bracket-match" key={match.fixture.id}><Participant participant={match.fixture.home} /><Participant participant={match.fixture.away} /><small>{match.fixture.kickoffLabel}</small></a>)}</section>;
          })}
        </div>
      ) : null}
      {section === 'matches' ? (
        <div className="v2-tournament-matches" data-section="matches">
          {days.map((day) => <section key={day}><header className="v2-ledger-heading"><h2>{new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(new Date(`${day}T12:00:00Z`))}</h2></header>{snapshot.fixtures.filter((fixture) => fixture.tournamentDay === day).map((fixture) => <MatchRow fixture={fixture} key={fixture.id} onNavigate={onNavigate} />)}</section>)}
        </div>
      ) : null}
    </section>
  );
}
