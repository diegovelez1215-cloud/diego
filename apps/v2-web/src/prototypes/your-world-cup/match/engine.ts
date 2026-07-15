import type { MomentOutcome, Tactics } from '../campaign/contracts';

export type TeamId = 'arg' | 'nga';
export type Point = Readonly<{ x: number; y: number }>;
export type SimulatedPlayerState = Readonly<{
  id: string;
  teamId: TeamId;
  number: number;
  shortLabel: string;
  role: 'goalkeeper' | 'defender' | 'midfielder' | 'forward';
  position: Point;
  facing: 'up' | 'down';
  active: boolean;
}>;

export type MatchAction =
  | Readonly<{ type: 'pass'; from: string; to: string }>
  | Readonly<{ type: 'carry'; player: string }>
  | Readonly<{ type: 'interception'; player: string }>
  | Readonly<{ type: 'tackle'; player: string }>
  | Readonly<{ type: 'shot'; player: string; zone: 'left' | 'center' | 'right' }>
  | Readonly<{ type: 'save'; keeper: string }>
  | Readonly<{ type: 'goal'; player: string }>
  | Readonly<{ type: 'corner'; teamId: TeamId }>
  | Readonly<{ type: 'foul'; player: string }>
  | Readonly<{ type: 'substitution'; teamId: TeamId }>
  | Readonly<{ type: 'phase'; phase: 'buildup' | 'press' | 'transition' | 'final-third' | 'halftime' | 'full-time' }>;

export type MatchFrame = Readonly<{
  tick: number;
  minute: number;
  score: Readonly<{ home: number; away: number }>;
  possessionTeamId: TeamId;
  ball: Point;
  ballOwnerId: string | null;
  players: readonly SimulatedPlayerState[];
  action: MatchAction | null;
  momentumContext: string;
  meaningful: boolean;
}>;

type PlayerTemplate = Readonly<Omit<SimulatedPlayerState, 'position'>> & Readonly<{ base: Point }>;

const clamp = (value: number, min = 3, max = 97) => Math.max(min, Math.min(max, value));
const hash = (text: string) => [...text].reduce((value, character) => ((value * 33) + character.charCodeAt(0)) >>> 0, 5381);
const lerp = (start: number, end: number, amount: number) => start + ((end - start) * amount);

const ARGENTINA: readonly PlayerTemplate[] = [
  { id: 'arg-gk', teamId: 'arg', number: 1, shortLabel: 'RO', role: 'goalkeeper', facing: 'up', active: false, base: { x: 50, y: 93 } },
  { id: 'arg-lb', teamId: 'arg', number: 3, shortLabel: 'MO', role: 'defender', facing: 'up', active: false, base: { x: 16, y: 78 } },
  { id: 'arg-cb1', teamId: 'arg', number: 4, shortLabel: 'VE', role: 'defender', facing: 'up', active: false, base: { x: 37, y: 82 } },
  { id: 'arg-cb2', teamId: 'arg', number: 6, shortLabel: 'SO', role: 'defender', facing: 'up', active: false, base: { x: 63, y: 82 } },
  { id: 'arg-rb', teamId: 'arg', number: 2, shortLabel: 'BI', role: 'defender', facing: 'up', active: false, base: { x: 84, y: 78 } },
  { id: 'arg-dm', teamId: 'arg', number: 5, shortLabel: 'PA', role: 'midfielder', facing: 'up', active: false, base: { x: 50, y: 68 } },
  { id: 'arg-cm', teamId: 'arg', number: 8, shortLabel: 'AG', role: 'midfielder', facing: 'up', active: false, base: { x: 32, y: 62 } },
  { id: 'arg-ten', teamId: 'arg', number: 10, shortLabel: 'OC', role: 'midfielder', facing: 'up', active: false, base: { x: 58, y: 57 } },
  { id: 'arg-lw', teamId: 'arg', number: 11, shortLabel: 'LU', role: 'forward', facing: 'up', active: false, base: { x: 17, y: 43 } },
  { id: 'arg-st', teamId: 'arg', number: 9, shortLabel: 'FE', role: 'forward', facing: 'up', active: false, base: { x: 50, y: 36 } },
  { id: 'arg-rw', teamId: 'arg', number: 7, shortLabel: 'GA', role: 'forward', facing: 'up', active: false, base: { x: 83, y: 43 } },
] as const;

const NIGERIA: readonly PlayerTemplate[] = [
  { id: 'nga-gk', teamId: 'nga', number: 1, shortLabel: 'OK', role: 'goalkeeper', facing: 'down', active: false, base: { x: 50, y: 7 } },
  { id: 'nga-lb', teamId: 'nga', number: 3, shortLabel: 'SA', role: 'defender', facing: 'down', active: false, base: { x: 16, y: 22 } },
  { id: 'nga-cb1', teamId: 'nga', number: 5, shortLabel: 'AD', role: 'defender', facing: 'down', active: false, base: { x: 37, y: 18 } },
  { id: 'nga-cb2', teamId: 'nga', number: 6, shortLabel: 'BA', role: 'defender', facing: 'down', active: false, base: { x: 63, y: 18 } },
  { id: 'nga-rb', teamId: 'nga', number: 2, shortLabel: 'AI', role: 'defender', facing: 'down', active: false, base: { x: 84, y: 22 } },
  { id: 'nga-dm1', teamId: 'nga', number: 4, shortLabel: 'ND', role: 'midfielder', facing: 'down', active: false, base: { x: 38, y: 34 } },
  { id: 'nga-dm2', teamId: 'nga', number: 8, shortLabel: 'IW', role: 'midfielder', facing: 'down', active: false, base: { x: 62, y: 34 } },
  { id: 'nga-ten', teamId: 'nga', number: 10, shortLabel: 'CH', role: 'midfielder', facing: 'down', active: false, base: { x: 50, y: 43 } },
  { id: 'nga-lw', teamId: 'nga', number: 11, shortLabel: 'MO', role: 'forward', facing: 'down', active: false, base: { x: 18, y: 55 } },
  { id: 'nga-st', teamId: 'nga', number: 9, shortLabel: 'OS', role: 'forward', facing: 'down', active: false, base: { x: 50, y: 63 } },
  { id: 'nga-rw', teamId: 'nga', number: 7, shortLabel: 'SI', role: 'forward', facing: 'down', active: false, base: { x: 82, y: 55 } },
] as const;

const HOME_PATHS: Record<Tactics['finalThird'], readonly string[]> = {
  wings: ['arg-gk', 'arg-cb1', 'arg-dm', 'arg-ten', 'arg-lw', 'arg-st'],
  'number-10': ['arg-gk', 'arg-cb2', 'arg-dm', 'arg-cm', 'arg-ten', 'arg-st'],
  'direct-runners': ['arg-cb1', 'arg-dm', 'arg-ten', 'arg-st', 'arg-rw'],
};
const AWAY_PATH = ['nga-gk', 'nga-cb2', 'nga-dm2', 'nga-ten', 'nga-rw', 'nga-st'] as const;

function possessionAt(minute: number, tactics: Tactics): TeamId {
  if (minute < 9) return 'arg';
  if (minute < 20) return 'nga';
  if (minute < 31) return 'arg';
  if (minute < 39) return tactics.press === 'aggressive' ? 'arg' : 'nga';
  if (minute <= 45) return 'nga';
  if (minute < 50) return 'arg';
  if (minute < 56) return 'nga';
  if (minute < 69) return 'arg';
  if (minute < 76) return 'arg';
  return minute % (tactics.press === 'patient' ? 7 : 5) < 3 ? 'nga' : 'arg';
}

function scoreAt(minute: number, outcome: MomentOutcome | null) {
  const home = minute >= 25 ? 1 : 0;
  const awayBase = minute >= 53 ? 1 : 0;
  const momentGoal = outcome === 'goal' && minute >= 69 ? 1 : 0;
  const lateAwayGoal = outcome && outcome !== 'goal' && minute >= 83 ? 1 : 0;
  return { home: home + momentGoal, away: awayBase + lateAwayGoal };
}

function actionAt(minute: number, tactics: Tactics, outcome: MomentOutcome | null): MatchAction | null {
  const homePath = HOME_PATHS[tactics.finalThird];
  const actionMap = new Map<number, MatchAction>([
    [0, { type: 'phase', phase: 'buildup' }],
    [4, { type: 'pass', from: homePath[1], to: homePath[2] }],
    [9, { type: 'interception', player: 'nga-dm2' }],
    [13, { type: 'pass', from: 'nga-dm2', to: 'nga-ten' }],
    [17, { type: 'shot', player: 'nga-st', zone: 'center' }],
    [18, { type: 'save', keeper: 'arg-gk' }],
    [22, { type: 'phase', phase: 'transition' }],
    [24, { type: 'shot', player: 'arg-st', zone: tactics.finalThird === 'wings' ? 'left' : 'right' }],
    [25, { type: 'goal', player: 'arg-st' }],
    [31, { type: 'corner', teamId: 'nga' }],
    [37, { type: 'tackle', player: tactics.press === 'aggressive' ? 'arg-ten' : 'arg-dm' }],
    [45, { type: 'phase', phase: 'halftime' }],
    [46, { type: 'phase', phase: 'buildup' }],
    [52, { type: 'shot', player: 'nga-st', zone: 'right' }],
    [53, { type: 'goal', player: 'nga-st' }],
    [59, { type: 'substitution', teamId: tactics.press === 'aggressive' ? 'arg' : 'nga' }],
    [64, { type: 'phase', phase: tactics.press === 'patient' ? 'buildup' : 'press' }],
    [68, { type: 'phase', phase: 'final-third' }],
    [72, { type: 'phase', phase: 'transition' }],
    [76, { type: 'corner', teamId: outcome === 'goal' ? 'nga' : 'arg' }],
    [82, outcome === 'goal' ? { type: 'save', keeper: 'arg-gk' } : { type: 'shot', player: 'nga-rw', zone: 'left' }],
    [83, outcome === 'goal' ? { type: 'carry', player: 'arg-dm' } : { type: 'goal', player: 'nga-rw' }],
    [88, { type: 'foul', player: 'nga-dm1' }],
    [90, { type: 'phase', phase: 'full-time' }],
  ]);
  if (minute === 69 && outcome) return outcome === 'goal' ? { type: 'goal', player: 'arg-st' } : outcome === 'interception' ? { type: 'interception', player: 'nga-cb1' } : { type: 'save', keeper: 'nga-gk' };
  return actionMap.get(minute) ?? (minute % 6 === 2 ? { type: 'pass', from: possessionAt(minute, tactics) === 'arg' ? homePath[(minute + 1) % homePath.length] : AWAY_PATH[(minute + 1) % AWAY_PATH.length], to: possessionAt(minute, tactics) === 'arg' ? homePath[(minute + 2) % homePath.length] : AWAY_PATH[(minute + 2) % AWAY_PATH.length] } : null);
}

function commentary(minute: number, tactics: Tactics, action: MatchAction | null, outcome: MomentOutcome | null) {
  if (minute === 45) return tactics.press === 'aggressive' ? 'Half-time: Argentina’s press is winning territory but stretching the midfield.' : tactics.press === 'patient' ? 'Half-time: the compact shape has kept the match controlled.' : 'Half-time: the match is level in territory and tension.';
  if (minute === 68) return tactics.finalThird === 'wings' ? 'Argentina isolate the left channel. The pivotal pass is yours.' : tactics.finalThird === 'number-10' ? 'Ocampo receives between the lines. The pivotal pass is yours.' : 'The direct runners break the line. The pivotal pass is yours.';
  if (minute === 69 && outcome) return outcome === 'goal' ? 'Your move finishes the attack. Argentina lead and the match restarts.' : outcome === 'interception' ? 'Nigeria read the lane and carry the turnover into the closing phase.' : 'The keeper answers your shot. Argentina must defend the consequence.';
  if (minute === 83 && outcome && outcome !== 'goal') return 'Nigeria punish the missed moment. Argentina have one final push.';
  if (!action) return possessionAt(minute, tactics) === 'arg' ? 'Argentina circulate while the next lane develops.' : 'Nigeria move the block and look for the counter.';
  switch (action.type) {
    case 'pass': return tactics.finalThird === 'wings' && action.to.includes('lw') ? 'Argentina pin Nigeria on the left.' : tactics.finalThird === 'number-10' && action.to === 'arg-ten' ? 'Ocampo appears in the central pocket.' : `${action.to.startsWith('arg') ? 'Argentina' : 'Nigeria'} move the ball into the next line.`;
    case 'carry': return 'The carrier drives into space as the shape follows.';
    case 'interception': return `${action.player.startsWith('arg') ? 'Argentina' : 'Nigeria'} step into the lane and turn play around.`;
    case 'tackle': return 'The press arrives together and the tackle sticks.';
    case 'shot': return `${action.player.startsWith('arg') ? 'Argentina' : 'Nigeria'} open a shooting lane.`;
    case 'save': return `${action.keeper.startsWith('arg') ? 'Roldán' : 'Okoye'} gets set and makes the save.`;
    case 'goal': return `${action.player.startsWith('arg') ? 'ARGENTINA' : 'NIGERIA'} SCORE — the ball reaches the net and the score changes.`;
    case 'corner': return `${action.teamId === 'arg' ? 'Argentina' : 'Nigeria'} force a dangerous restart.`;
    case 'foul': return 'The final phase stops for one hard challenge.';
    case 'substitution': return `${action.teamId === 'arg' ? 'Argentina' : 'Nigeria'} adjust the shape for the closing half-hour.`;
    case 'phase': return action.phase === 'full-time' ? 'Full time. The match story is complete.' : `The match shifts into ${action.phase.replace('-', ' ')}.`;
  }
}

function momentPositions(seed: number, tactics: Tactics) {
  const wide = tactics.shape === '4-3-3-wide';
  const direct = tactics.finalThird === 'direct-runners';
  const spread = tactics.press === 'aggressive' ? 18 : tactics.press === 'patient' ? 10 : 14;
  const wobble = (hash(`${seed}:def`) % 7) - 3;
  const keeperX = [34, 50, 66][hash(`${seed}:keeper`) % 3];
  return new Map<string, Point>([
    ['arg-gk', { x: 50, y: 94 }], ['arg-lb', { x: 13, y: 88 }], ['arg-cb1', { x: 35, y: 88 }],
    ['arg-cb2', { x: 65, y: 88 }], ['arg-rb', { x: 87, y: 88 }], ['arg-dm', { x: 30, y: 63 }], ['arg-cm', { x: 70, y: 63 }],
    ['arg-lw', { x: wide ? 15 : 28, y: 73 }], ['arg-ten', { x: 50, y: tactics.shape === '4-2-3-1-control' ? 62 : 68 }],
    ['arg-rw', { x: wide ? 85 : 72, y: 73 }], ['arg-st', { x: 50, y: direct ? 43 : 49 }],
    ['nga-lb', { x: 13, y: 28 }], ['nga-rb', { x: 87, y: 28 }], ['nga-dm2', { x: 72, y: 37 }],
    ['nga-ten', { x: 28, y: 37 }], ['nga-lw', { x: 14, y: 54 }], ['nga-st', { x: 50, y: 28 }], ['nga-rw', { x: 86, y: 54 }],
    ['nga-cb1', { x: 50 - spread, y: 43 + wobble }], ['nga-dm1', { x: 50, y: 61 }], ['nga-cb2', { x: 50 + spread, y: 43 - wobble }],
    ['nga-gk', { x: keeperX, y: 10 }],
  ]);
}

function playerPositions(seed: number, tactics: Tactics, minute: number, ownerId: string | null, possession: TeamId) {
  const moment = momentPositions(seed, tactics);
  const momentBlend = minute >= 65 && minute <= 68 ? (minute - 64) / 4 : 0;
  const pressShift = tactics.press === 'aggressive' ? -6 : tactics.press === 'patient' ? 3 : 0;
  return [...ARGENTINA, ...NIGERIA].map((template) => {
    const teamShift = template.teamId === 'arg' ? (possession === 'arg' ? -7 : 2) : (possession === 'nga' ? 7 : -2);
    const formationX = template.teamId === 'arg' && tactics.shape === '4-2-3-1-control' && template.role === 'midfielder'
      ? lerp(template.base.x, 50, .18)
      : template.teamId === 'arg' && tactics.shape === '4-2-3-1-control' && (template.id === 'arg-lw' || template.id === 'arg-rw')
        ? lerp(template.base.x, 50, .24)
        : template.base.x;
    const sway = ((hash(`${seed}:${template.id}:${Math.floor(minute / 3)}`) % 7) - 3) * .55;
    const ordinary = { x: clamp(formationX + sway), y: clamp(template.base.y + teamShift + (template.teamId === 'arg' && template.role !== 'goalkeeper' ? pressShift : 0)) };
    const target = moment.get(template.id);
    const position = target && momentBlend > 0 ? { x: lerp(ordinary.x, target.x, momentBlend), y: lerp(ordinary.y, target.y, momentBlend) } : ordinary;
    return { ...template, position, active: template.id === ownerId } satisfies SimulatedPlayerState;
  });
}

function ownerAt(minute: number, tactics: Tactics, possession: TeamId) {
  if ([18, 25, 53, 69, 82, 83].includes(minute)) return null;
  if (minute === 68) return 'arg-ten';
  const path = possession === 'arg' ? HOME_PATHS[tactics.finalThird] : AWAY_PATH;
  return path[Math.floor(minute / 2) % path.length];
}

export function buildMatchFrames(seed: number, tactics: Tactics, outcome: MomentOutcome | null): readonly MatchFrame[] {
  return Object.freeze(Array.from({ length: 91 }, (_, minute) => {
    const possession = possessionAt(minute, tactics);
    const action = actionAt(minute, tactics, outcome);
    const ownerId = ownerAt(minute, tactics, possession);
    const players = playerPositions(seed, tactics, minute, ownerId, possession);
    let ball = ownerId ? players.find((player) => player.id === ownerId)!.position : { x: 50, y: 50 };
    if (minute === 18) ball = players.find((player) => player.id === 'arg-gk')!.position;
    if (minute === 25 || (minute === 69 && outcome === 'goal')) ball = { x: outcome === 'goal' && minute === 69 ? 72 : 34, y: 3 };
    if (minute === 53 || (minute === 83 && outcome && outcome !== 'goal')) ball = { x: 66, y: 97 };
    if (minute === 69 && outcome && outcome !== 'goal') ball = players.find((player) => player.id === 'nga-gk')!.position;
    return Object.freeze({
      tick: minute,
      minute,
      score: Object.freeze(scoreAt(minute, outcome)),
      possessionTeamId: possession,
      ball: Object.freeze(ball),
      ballOwnerId: ownerId,
      players: Object.freeze(players),
      action,
      momentumContext: commentary(minute, tactics, action, outcome),
      meaningful: action !== null,
    });
  }));
}

export function nextMeaningfulTick(frames: readonly MatchFrame[], currentTick: number) {
  return frames.find((frame) => frame.tick > currentTick && frame.meaningful)?.tick ?? 90;
}

export function finalScore(seed: number, tactics: Tactics, outcome: MomentOutcome) {
  return buildMatchFrames(seed, tactics, outcome)[90].score;
}
