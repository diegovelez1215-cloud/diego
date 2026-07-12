import { canonicalFixtures } from '../domain/fixtures';

export function MatchdayRoute() {
  const fixtures = canonicalFixtures();
  return (
    <>
      <p className="v2-eyebrow">Matchday</p>
      <h1>Matchday is being rebuilt.</h1>
      <p className="v2-description">The foundation reads {fixtures.length} canonical fixtures from the shared tournament registry.</p>
      <p className="v2-note">Live scores are not connected here. Fixture identity and kickoff remain official schedule data.</p>
    </>
  );
}
