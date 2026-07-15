import type { MomentOutcome, Tactics } from './contracts';
import type { MatchSetup } from './simulation';

export type MomentState = Readonly<{ outcome: MomentOutcome | null; active: 'left' | 'center' | 'right'; passes: number; ticks: number; message: string }>;

export function replayMoment(setup: MatchSetup, tactics: Tactics, eventInputs: readonly string[]): MomentState {
  let active: MomentState['active'] = 'center'; let passes = 0; let ticks = 0; let outcome: MomentOutcome | null = null; let message = 'Keep the ball moving. Tap an open teammate.';
  for (const input of eventInputs) {
    if (outcome) break;
    if (input === 'tick') { ticks++; if (ticks >= 12) { outcome = 'expired'; message = 'The whistle cuts through the attack.'; } continue; }
    if (input.startsWith('pass:')) {
      const target = input.slice(5) as MomentState['active'];
      if (!['left', 'center', 'right'].includes(target) || target === active) continue;
      passes++;
      active = target;
      const expected = setup.route[passes - 1];
      if (target !== expected && (tactics.finalThird === 'direct-runners' || passes > 1)) { outcome = 'interception'; message = 'Nigeria read the lane and intercept.'; }
      else message = `${target === 'left' ? 'Luna' : target === 'right' ? 'Garay' : 'Ocampo'} receives in space.`;
      continue;
    }
    if (input === 'shoot') {
      if (passes < 2) { outcome = 'save'; message = 'The early shot is gathered by the goalkeeper.'; }
      else if (active === setup.route[1]) { outcome = 'goal'; message = 'GOAL! The finish tears into the net.'; }
      else { outcome = 'save'; message = 'The goalkeeper pushes the shot away.'; }
    }
  }
  return Object.freeze({ outcome, active, passes, ticks, message });
}
