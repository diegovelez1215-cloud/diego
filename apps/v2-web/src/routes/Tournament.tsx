import type { CSSProperties } from 'react';
import { canonicalTournamentSnapshot } from '../domain/tournament-bridge';
import { participantName } from '../ui/MatchRow';
import { SectionHeader } from '../ui/SectionHeader';
import { StatusMark } from '../ui/StatusMark';

export function TournamentRoute() {
  const snapshot = canonicalTournamentSnapshot();
  const completedGroups = snapshot.groups.filter((group) => group.state === 'complete').length;
  const provisionalGroups = snapshot.groups.filter((group) => group.state === 'provisional').length;
  const knockoutMatches = snapshot.bracket.reduce((total, round) => total + round.matches.length, 0);
  const resolvedKnockout = snapshot.bracket.reduce((total, round) => total + round.matches.filter((match) => match.fixture.home.kind === 'team' && match.fixture.away.kind === 'team').length, 0);
  const groupMatches = snapshot.fixtures.filter((fixture) => fixture.stage === 'group').length;
  const final = snapshot.fixtures.find((fixture) => fixture.stage === 'final');
  return (
    <section className="v2-route v2-tournament">
      <header className="v2-route-intro">
        <SectionHeader level={1} eyebrow="Competition command" title="Tournament" description="Every group, every qualification path, one truthful road to the final." />
      </header>
      <div className="v2-source-strip" data-tone="unavailable"><StatusMark tone="unavailable">Official progress unavailable</StatusMark><span>Canonical competition map active</span></div>
      <section className="v2-tournament-command" aria-labelledby="phase-overview-title">
        <div className="v2-tournament-command__lead">
          <p className="v2-eyebrow">World Cup structure</p><h2 id="phase-overview-title">The complete field, without guessed results</h2><p>Group and knockout progression remains open until validated official results resolve it.</p>
        </div>
        <dl className="v2-command-metrics">
          <div><dt>Fixtures</dt><dd>{snapshot.fixtures.length}</dd><span>Canonical schedule</span></div>
          <div><dt>Group matches</dt><dd>{groupMatches}</dd><span>Across 12 groups</span></div>
          <div><dt>Knockout matches</dt><dd>{knockoutMatches}</dd><span>Round of 32 to final</span></div>
          <div><dt>Final venue</dt><dd className="v2-command-metrics__word">{final?.venue || 'Pending'}</dd><span>{final?.stadium || 'Canonical venue'}</span></div>
        </dl>
      </section>
      <div className="v2-tournament-grid">
        <section className="v2-group-command" aria-labelledby="group-progress-title">
          <SectionHeader eyebrow="12 groups · 48 teams" title="Group field" description="Team placement changes only when official finals validate." />
          <div className="v2-progress-line" id="group-progress-title" style={{ '--v2-progress': `${(completedGroups / snapshot.groups.length) * 100}%` } as CSSProperties}><strong>{completedGroups} of {snapshot.groups.length} complete</strong><small>{provisionalGroups} provisional · official progress unavailable</small></div>
          <div className="v2-group-matrix" aria-label="Group stage states">
            {snapshot.groups.map((group) => <div className="v2-group-row" key={group.group}><span className="v2-group-row__letter">{group.group}</span><span className="v2-group-row__teams">{group.rows.map((row) => row.team.code).join(' · ')}</span><span className="v2-group-row__state">{group.state === 'not-started' ? 'Awaiting results' : group.state}</span></div>)}
          </div>
        </section>
        <section className="v2-knockout-command" aria-labelledby="knockout-summary-title">
          <SectionHeader eyebrow="Knockout runway" title="Road to the final" description={`${resolvedKnockout} of ${knockoutMatches} pairings currently resolve to named teams.`} />
          <div className="v2-round-runway" id="knockout-summary-title">
            {snapshot.bracket.map((round, index) => {
              const sample = round.matches[0]?.fixture;
              const resolved = round.matches.filter((match) => match.fixture.home.kind === 'team' && match.fixture.away.kind === 'team').length;
              return <div className="v2-round-step" key={round.stage}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{round.name}</strong><small>{round.matches.length} {round.matches.length === 1 ? 'match' : 'matches'} · {resolved} resolved</small>{sample ? <p>{participantName(sample.home)} <b>vs</b> {participantName(sample.away)}</p> : null}</div><StatusMark tone={resolved === round.matches.length ? 'verified' : 'pending'}>{resolved === round.matches.length ? 'Resolved' : 'Path open'}</StatusMark></div>;
            })}
          </div>
        </section>
      </div>
    </section>
  );
}
