import type { CompletedMatch, MomentOutcome, MomentProgress, Tactics } from './contracts';
import { buildMatchFrames, finalScore, type MatchFrame } from '../match/engine';
export { groupTable, otherGroupResult } from './group-table';

export type MatchSetup = Readonly<{
  homeGoals: number;
  awayGoals: number;
  minute: number;
  route: readonly ('left' | 'center' | 'right')[];
  prompt: string;
  story: readonly string[];
  frames: readonly MatchFrame[];
}>;

export function simulateMatch(seed: number, tactics: Tactics): MatchSetup {
  const frames = buildMatchFrames(seed, tactics, null);
  const entry = frames[68];
  return Object.freeze({
    homeGoals: entry.score.home,
    awayGoals: entry.score.away,
    minute: entry.minute,
    route: tactics.finalThird === 'wings' ? ['left', 'right'] as const : tactics.finalThird === 'number-10' ? ['center', 'right'] as const : ['right', 'center'] as const,
    prompt: 'Level in the second half. One move can change the closing phase.',
    story: Object.freeze(frames.filter((frame) => frame.meaningful && frame.tick < 68).slice(-4).map((frame) => `${String(frame.minute).padStart(2, '0')}′ ${frame.momentumContext}`)),
    frames,
  });
}

export function completeMatch(_setup: MatchSetup, decisiveMoment: MomentOutcome, tactics: Tactics, seed: number, progress: MomentProgress): CompletedMatch {
  const score = finalScore(seed, tactics, decisiveMoment);
  const outcome = score.home > score.away ? 'win' : score.home === score.away ? 'draw' : 'loss';
  return Object.freeze({ fixtureId: 'arg-nga', home: 'Argentina', away: 'Nigeria', homeGoals: score.home, awayGoals: score.away, outcome, decisiveMoment, tactics, replay: { seed, progress } });
}
