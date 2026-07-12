import { canonicalTournamentSnapshot } from '../domain/tournament-bridge';

export function TournamentRoute() {
  const snapshot = canonicalTournamentSnapshot();
  const knockoutMatches = snapshot.bracket.reduce((total, round) => total + round.matches.length, 0);
  return (
    <>
      <p className="v2-eyebrow">Tournament</p>
      <h1>Tournament is being rebuilt.</h1>
      <p className="v2-description">The foundation reads {snapshot.groups.length} group tables and {knockoutMatches} canonical bracket matches.</p>
      <p className="v2-note">Official results are unavailable until a later verified snapshot package; unresolved bracket places remain unresolved.</p>
    </>
  );
}
