import type { CompletedMatch, MomentOutcome, MomentProgress, Tactics } from './contracts';

export type MatchSetup = Readonly<{
  homeGoals: number;
  awayGoals: number;
  minute: number;
  route: readonly ('left' | 'center' | 'right')[];
  prompt: string;
  story: readonly string[];
}>;

function hash(text: string) { return [...text].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 2166136261); }

export function simulateMatch(seed: number, tactics: Tactics): MatchSetup {
  const score = hash(`${seed}:${tactics.shape}:${tactics.press}:${tactics.finalThird}`);
  const trailing = (score + (tactics.press === 'aggressive' ? 1 : 0)) % 3 === 2;
  const homeGoals = trailing ? 0 : 1;
  const awayGoals = 1;
  const route = tactics.finalThird === 'wings' ? ['left', 'right'] as const : tactics.finalThird === 'number-10' ? ['center', 'right'] as const : ['right', 'center'] as const;
  const pressNote = tactics.press === 'patient' ? 'Nigeria have fewer breaks, but the match stays tight.' : tactics.press === 'aggressive' ? 'The press wins territory, then leaves one risky gap.' : 'Argentina trade control and pressure through a tense half.';
  return Object.freeze({
    homeGoals, awayGoals, minute: trailing ? 86 : 88,
    route,
    prompt: trailing ? 'One goal down. Find the equaliser.' : 'Level late. One move can win it.',
    story: Object.freeze(['08′ Argentina settle the ball under the tape lights.', '31′ Nigeria answer with a sharp counter.', pressNote, `${trailing ? '86′' : '88′'} The last attack belongs to you.`]),
  });
}

export function otherGroupResult(seed: number) {
  const value = hash(`pol-nzl:${seed}`) % 3;
  return value === 0 ? { home: 1, away: 1 } : value === 1 ? { home: 2, away: 0 } : { home: 1, away: 0 };
}

export function completeMatch(setup: MatchSetup, decisiveMoment: MomentOutcome, tactics: Tactics, seed: number, progress: MomentProgress): CompletedMatch {
  const scored = decisiveMoment === 'goal';
  const homeGoals = setup.homeGoals + (scored ? 1 : 0);
  const outcome = homeGoals > setup.awayGoals ? 'win' : homeGoals === setup.awayGoals ? 'draw' : 'loss';
  return Object.freeze({ fixtureId: 'arg-nga', home: 'Argentina', away: 'Nigeria', homeGoals, awayGoals: setup.awayGoals, outcome, decisiveMoment, tactics, replay: { seed, progress } });
}

export function groupTable(match: CompletedMatch | undefined, seed: number) {
  const teams = new Map(['Argentina', 'Nigeria', 'Poland', 'New Zealand'].map((name) => [name, { name, played: 0, gd: 0, points: 0 }]));
  const record = (home: string, away: string, homeGoals: number, awayGoals: number) => {
    const h = teams.get(home)!; const a = teams.get(away)!; h.played++; a.played++; h.gd += homeGoals - awayGoals; a.gd += awayGoals - homeGoals;
    if (homeGoals > awayGoals) h.points += 3; else if (homeGoals < awayGoals) a.points += 3; else { h.points++; a.points++; }
  };
  if (match) { record('Argentina', 'Nigeria', match.homeGoals, match.awayGoals); const other = otherGroupResult(seed); record('Poland', 'New Zealand', other.home, other.away); }
  return [...teams.values()].sort((a, b) => b.points - a.points || b.gd - a.gd || a.name.localeCompare(b.name));
}
