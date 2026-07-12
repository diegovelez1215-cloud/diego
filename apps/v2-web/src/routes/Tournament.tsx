import type { CSSProperties } from 'react';
import { canonicalTournamentSnapshot } from '../domain/tournament-bridge';
import { Metric } from '../ui/Metric';
import { SectionHeader } from '../ui/SectionHeader';
import { StatePanel } from '../ui/StatePanel';
import { StatusMark } from '../ui/StatusMark';

export function TournamentRoute() {
  const snapshot = canonicalTournamentSnapshot();
  const completedGroups = snapshot.groups.filter((group) => group.state === 'complete').length;
  const provisionalGroups = snapshot.groups.filter((group) => group.state === 'provisional').length;
  const knockoutMatches = snapshot.bracket.reduce((total, round) => total + round.matches.length, 0);
  const resolvedKnockout = snapshot.bracket.reduce((total, round) => total + round.matches.filter((match) => match.fixture.home.kind === 'team' && match.fixture.away.kind === 'team').length, 0);
  return (
    <section className="v2-route v2-tournament">
      <SectionHeader level={1} eyebrow="Verified competition structure" title="Tournament" description="A truthful foundation for the 104-match World Cup journey." />
      <div className="v2-source-strip" data-tone="unavailable"><StatusMark tone="unavailable">Official results unavailable</StatusMark><span>Canonical bridge active</span></div>
      <section className="v2-phase-band" aria-labelledby="phase-overview-title">
        <SectionHeader eyebrow="Competition ledger" title="Phase overview" description="Structure is canonical. Progress changes only with verified results." />
        <dl className="v2-metric-row" id="phase-overview-title">
          <Metric label="Fixtures" value={String(snapshot.fixtures.length)} note="Canonical" />
          <Metric label="Groups" value={String(snapshot.groups.length)} note="Official draw" />
          <Metric label="Knockout" value={String(knockoutMatches)} note="Fixture slots" />
        </dl>
      </section>
      <section className="v2-tournament-ledger" aria-labelledby="group-progress-title">
        <SectionHeader eyebrow="Group stage" title="Group progress" description="No result is inferred from the schedule." />
        <div className="v2-progress-line" id="group-progress-title" style={{ '--v2-progress': `${(completedGroups / snapshot.groups.length) * 100}%` } as CSSProperties}><strong>{completedGroups} of {snapshot.groups.length} complete</strong><small>{provisionalGroups} provisional</small></div>
        <div className="v2-group-strip" aria-label="Group stage states">
          {snapshot.groups.map((group) => <div className="v2-group-line" key={group.group}><strong>Group {group.group}</strong><span>{group.state === 'not-started' ? 'Not started' : group.state}</span></div>)}
        </div>
      </section>
      <section className="v2-tournament-ledger" aria-labelledby="knockout-summary-title">
        <SectionHeader eyebrow="Knockout" title="Road to the final" description={`${resolvedKnockout} of ${knockoutMatches} pairings currently resolve to named teams.`} />
        <div className="v2-round-ledger" id="knockout-summary-title">
          {snapshot.bracket.map((round, index) => <div className="v2-round-line" key={round.stage}><span>{String(index + 1).padStart(2, '0')}</span><strong>{round.name}</strong><small>{round.matches.length} {round.matches.length === 1 ? 'match' : 'matches'}</small><StatusMark tone={round.matches.every((match) => match.fixture.home.kind === 'team' && match.fixture.away.kind === 'team') ? 'verified' : 'pending'}>{round.matches.every((match) => match.fixture.home.kind === 'team' && match.fixture.away.kind === 'team') ? 'Resolved' : 'Slots pending'}</StatusMark></div>)}
        </div>
      </section>
      <StatePanel compact kind="neutral" eyebrow="Foundation scope" title="Full bracket and statistics come later" description="This package establishes truthful tournament hierarchy without inventing results, leaders, or a decorative bracket." />
    </section>
  );
}
