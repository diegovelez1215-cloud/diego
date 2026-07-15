import type { FixtureSummary } from '../domain/contracts';

export function consequenceFor(fixture: FixtureSummary): string {
  if (fixture.stage === 'final') return 'The World Cup title is decided here.';
  if (fixture.stage === 'bronze') return 'Third place is decided here.';
  if (fixture.stage === 'sf') return 'A place in the World Cup final is on the line.';
  if (fixture.stage === 'qf') return 'The winner moves into the final four.';
  if (fixture.stage === 'r16') return 'The winner reaches the quarter-finals.';
  if (fixture.stage === 'r32') return 'Knockout football begins: the winner advances.';
  return `Group ${fixture.group} points shape the road to the knockouts.`;
}

export function ConsequenceLine({ fixture, className = '' }: { fixture: FixtureSummary; className?: string }) {
  return <span className={`v2-consequence-line${className ? ` ${className}` : ''}`}>{consequenceFor(fixture)}</span>;
}
