import type { CompletedMatch } from './contracts';

function hash(text: string) {
  return [...text].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 2166136261);
}

export function otherGroupResult(seed: number) {
  const value = hash(`pol-nzl:${seed}`) % 3;
  return value === 0 ? { home: 1, away: 1 } : value === 1 ? { home: 2, away: 0 } : { home: 1, away: 0 };
}

export function groupTable(match: CompletedMatch | undefined, seed: number) {
  const teams = new Map(['Argentina', 'Nigeria', 'Poland', 'New Zealand'].map((name) => [name, { name, played: 0, gd: 0, points: 0 }]));
  const record = (home: string, away: string, homeGoals: number, awayGoals: number) => {
    const h = teams.get(home)!;
    const a = teams.get(away)!;
    h.played++;
    a.played++;
    h.gd += homeGoals - awayGoals;
    a.gd += awayGoals - homeGoals;
    if (homeGoals > awayGoals) h.points += 3;
    else if (homeGoals < awayGoals) a.points += 3;
    else { h.points++; a.points++; }
  };
  if (match) {
    record('Argentina', 'Nigeria', match.homeGoals, match.awayGoals);
    const other = otherGroupResult(seed);
    record('Poland', 'New Zealand', other.home, other.away);
  }
  return [...teams.values()].sort((a, b) => b.points - a.points || b.gd - a.gd || a.name.localeCompare(b.name));
}
