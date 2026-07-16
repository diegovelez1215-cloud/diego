import type { CompletedMatch, MomentOutcome, MomentProgress, Tactics } from './contracts';
import { buildPresentationFrames, createMatchPlan, injectPivotalOutcome, type MatchFrame } from '../match/engine';
import { campaignFixture } from './match-data';
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
  const plan = createMatchPlan({ fixtureId: campaignFixture.id, campaignSeed: seed, home: campaignFixture.home, away: campaignFixture.away, tactics });
  const frames = buildPresentationFrames(plan, { fixtureId: campaignFixture.id, campaignSeed: seed, home: campaignFixture.home, away: campaignFixture.away, tactics });
  const entry = frames.find((frame) => frame.action?.type === 'pivotal-entry') ?? frames[0];
  return Object.freeze({
    homeGoals: entry.score.home,
    awayGoals: entry.score.away,
    minute: entry.minute,
    route: tactics.finalThird === 'wings' ? ['left', 'right'] as const : tactics.finalThird === 'number-10' ? ['center', 'right'] as const : ['right', 'center'] as const,
    prompt: 'One late move can change the closing phase.',
    story: Object.freeze(frames.filter((frame) => frame.meaningful && frame.minute < entry.minute).slice(-4).map((frame) => `${String(frame.minute).padStart(2, '0')}′ ${frame.momentumContext}`)),
    frames,
  });
}

export function completeMatch(_setup: MatchSetup, decisiveMoment: MomentOutcome, tactics: Tactics, seed: number, progress: MomentProgress): CompletedMatch {
  const input = { fixtureId: campaignFixture.id, campaignSeed: seed, home: campaignFixture.home, away: campaignFixture.away, tactics } as const;
  const score = injectPivotalOutcome(createMatchPlan(input), input, decisiveMoment).baselineResultWithoutMoment;
  const outcome = score.home > score.away ? 'win' : score.home === score.away ? 'draw' : 'loss';
  return Object.freeze({ fixtureId: 'arg-nga', home: 'Argentina', away: 'Nigeria', homeGoals: score.home, awayGoals: score.away, outcome, decisiveMoment, tactics, replay: { seed, progress } });
}
