import type { MomentOutcome, Tactics } from '../campaign/contracts';
import { formationForShape, type FormationLine } from '../campaign/formations';
import { campaignFixture } from '../campaign/match-data';

export type Point = Readonly<{ x: number; y: number }>;
export type MatchPlayer = Readonly<{
  id: string;
  number: number;
  shortLabel: string;
  displayName: string;
  role: 'goalkeeper' | 'defender' | 'midfielder' | 'forward';
  side?: 'left' | 'center' | 'right';
}>;
export type MatchTeam = Readonly<{
  id: string;
  name: string;
  shortName: string;
  colors: Readonly<{ primary: string; secondary: string; goalkeeper: string }>;
  direction: 'north' | 'south';
  strengths: Readonly<{ attack: number; midfield: number; defense: number; goalkeeper: number; pace: number; discipline: number }>;
  lineup: readonly MatchPlayer[];
  bench?: readonly MatchPlayer[];
}>;
export type TeamId = string;
export type PassVariant = 'short-pass' | 'progressive-pass' | 'switch' | 'through-ball' | 'cross' | 'cutback';
export type ShotOutcome = 'goal' | 'save' | 'parried-save' | 'blocked-shot' | 'wide' | 'over' | 'post' | 'crossbar' | 'deflection' | 'one-on-one-miss';
export type VarReview = 'close-offside-goal' | 'possible-penalty' | 'possible-red' | 'possible-handball' | 'disputed-goal';
export type VarDecision = 'confirmed' | 'overturned' | 'penalty-awarded' | 'no-penalty' | 'red-card' | 'no-red';
export type MatchActionType =
  | 'phase' | 'pass' | 'carry' | 'press' | 'tackle' | 'interception' | 'blocked-pass' | 'loose-ball' | 'counterattack' | 'defensive-recovery'
  | 'shot' | ShotOutcome | 'foul' | 'advantage' | 'yellow' | 'second-yellow-red' | 'straight-red' | 'offside'
  | 'throw-in' | 'goal-kick' | 'corner' | 'direct-free-kick' | 'indirect-free-kick' | 'penalty' | 'substitution' | 'added-time'
  | 'var-check' | 'var-decision' | 'pivotal-entry';
export type MatchAction = Readonly<{
  type: MatchActionType;
  variant?: PassVariant;
  outcome?: ShotOutcome;
  actor?: string;
  target?: string;
  teamId?: TeamId;
  keeper?: string;
  zone?: 'left' | 'center' | 'right';
  phase?: 'kickoff' | 'buildup' | 'press' | 'transition' | 'final-third' | 'halftime' | 'full-time';
  review?: VarReview;
  decision?: VarDecision;
  reason?: string;
  addedMinutes?: number;
}>;
export type PlannedMatchEvent = Readonly<{
  id: string;
  minute: number;
  second: number;
  teamId: TeamId;
  action: MatchAction;
  possessionAfter: TeamId;
  start: Point;
  end: Point;
  scoreAfter: Readonly<{ home: number; away: number }>;
}>;
export type SimulatedPlayerState = Readonly<{
  id: string;
  teamId: TeamId;
  number: number;
  shortLabel: string;
  role: MatchPlayer['role'];
  position: Point;
  facing: 'up' | 'down';
  facingDegrees: number;
  active: boolean;
  line: FormationLine;
}>;
export type BallState = 'owned' | 'grounded' | 'lofted' | 'deflected' | 'keeper' | 'out' | 'net';
export type MatchFrame = Readonly<{
  tick: number;
  minute: number;
  second: number;
  eventIndex: number;
  eventProgress: number;
  score: Readonly<{ home: number; away: number }>;
  possessionTeamId: TeamId;
  ball: Point;
  ballHeight: number;
  ballRotation: number;
  ballState: BallState;
  ballOwnerId: string | null;
  players: readonly SimulatedPlayerState[];
  action: MatchAction | null;
  momentumContext: string;
  meaningful: boolean;
  camera: Point;
}>;
export type MatchPlan = Readonly<{
  version: 1;
  fixtureId: string;
  seed: number;
  homeTeamId: TeamId;
  awayTeamId: TeamId;
  tactics: Tactics;
  pivotalMinute: number;
  pivotalTeamId: TeamId;
  events: readonly PlannedMatchEvent[];
  baselineResultWithoutMoment: Readonly<{ home: number; away: number }>;
}>;
export type MatchInput = Readonly<{ fixtureId: string; campaignSeed: number; replaySalt?: string; home: MatchTeam; away: MatchTeam; tactics: Tactics }>;

type LineupSlot = { player: MatchPlayer; slotId: string };
type ActiveLineups = Record<TeamId, LineupSlot[]>;

const PASS_VARIANTS: readonly PassVariant[] = ['short-pass', 'progressive-pass', 'switch', 'through-ball', 'cross', 'cutback'];
const SHOT_OUTCOMES: readonly ShotOutcome[] = ['goal', 'save', 'parried-save', 'blocked-shot', 'wide', 'over', 'post', 'crossbar', 'deflection', 'one-on-one-miss'];
const clamp = (value: number, min = .6, max = 99.4) => Math.max(min, Math.min(max, value));
const lerp = (a: number, b: number, n: number) => a + ((b - a) * n);
const smoothstep = (n: number) => n * n * (3 - (2 * n));
const hash = (text: string) => [...text].reduce((value, character) => ((value * 33) + character.charCodeAt(0)) >>> 0, 5381);
const random = (seed: number) => { let value = seed >>> 0; return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const derivedSeed = (input: MatchInput) => hash(`${input.campaignSeed}:${input.fixtureId}:${input.home.id}:${input.away.id}:${input.tactics.shape}:${input.tactics.press}:${input.tactics.finalThird}:${input.replaySalt ?? 'v2-realism'}`);
const suffix = (id: string) => id.slice(id.indexOf('-') + 1);
const attackSign = (team: MatchTeam) => team.direction === 'south' ? -1 : 1;
const goalY = (team: MatchTeam) => team.direction === 'south' ? 4 : 96;
const opponentOf = (input: MatchInput, team: MatchTeam) => team.id === input.home.id ? input.away : input.home;
const teamById = (input: MatchInput, id: TeamId) => id === input.home.id ? input.home : input.away;
const allPlayers = (team: MatchTeam) => [...team.lineup, ...(team.bench ?? [])];
const playerById = (team: MatchTeam, id?: string) => id ? allPlayers(team).find((player) => player.id === id) : undefined;
const roleCandidates = (lineup: readonly LineupSlot[], role: MatchPlayer['role'] | 'any') => lineup.filter(({ player }) => role === 'any' || player.role === role);
const candidate = (lineup: readonly LineupSlot[], role: MatchPlayer['role'] | 'any', rng: () => number) => {
  const choices = roleCandidates(lineup, role);
  return choices[Math.floor(rng() * choices.length)]?.player ?? lineup[0].player;
};

function initialLineups(input: MatchInput): ActiveLineups {
  return {
    [input.home.id]: input.home.lineup.map((player) => ({ player, slotId: suffix(player.id) })),
    [input.away.id]: input.away.lineup.map((player) => ({ player, slotId: suffix(player.id) })),
  };
}

function applyLineupEvent(active: ActiveLineups, input: MatchInput, event: Pick<PlannedMatchEvent, 'teamId' | 'action'>) {
  const lineup = active[event.teamId];
  if (!lineup) return;
  if (event.action.type === 'substitution' && event.action.actor && event.action.target) {
    const index = lineup.findIndex(({ player }) => player.id === event.action.actor);
    const incoming = playerById(teamById(input, event.teamId), event.action.target);
    if (index >= 0 && incoming) lineup.splice(index, 1, { player: incoming, slotId: lineup[index].slotId });
  }
  if ((event.action.type === 'straight-red' || event.action.type === 'second-yellow-red') && event.action.actor) {
    const index = lineup.findIndex(({ player }) => player.id === event.action.actor);
    if (index >= 0) lineup.splice(index, 1);
  }
}

function lineupsAt(input: MatchInput, events: readonly PlannedMatchEvent[], eventIndex: number, progress: number): ActiveLineups {
  const active = initialLineups(input);
  for (let index = 0; index < eventIndex; index++) applyLineupEvent(active, input, events[index]);
  if (progress >= 1 && events[eventIndex]) applyLineupEvent(active, input, events[eventIndex]);
  return active;
}

function formationPoint(slotId: string, player: MatchPlayer, team: MatchTeam, tactics: Tactics, possession: TeamId, action: MatchAction | null, progress: number): { point: Point; line: FormationLine } {
  const slots = formationForShape(tactics.shape, team.direction);
  const fallback = slots.find((slot) => slot.line === (player.role === 'goalkeeper' ? 'goalkeeper' : player.role === 'defender' ? 'defense' : player.role === 'forward' ? 'attack' : 'midfield')) ?? slots[0];
  const slot = slots.find((item) => item.id === slotId) ?? fallback;
  const ownsBall = team.id === possession;
  const sign = attackSign(team);
  const forwardShift = ownsBall
    ? slot.line === 'attack' ? 5 : slot.line === 'attacking-midfield' || slot.line === 'midfield' ? 4 : slot.line === 'pivot' ? 3 : slot.line === 'defense' ? 2 : 0
    : tactics.press === 'aggressive' ? 3 : tactics.press === 'patient' ? -1 : 1;
  let x = slot.x;
  let y = slot.y + (sign * forwardShift);
  if (!ownsBall) x += (50 - x) * (tactics.press === 'patient' ? .12 : .07);
  if (tactics.finalThird === 'wings' && ['lw', 'rw', 'lb', 'rb'].includes(slot.id)) x += slot.x < 50 ? -3 : 3;
  if (tactics.finalThird === 'number-10' && ['ten', 'dm', 'cm'].includes(slot.id)) x += (50 - x) * .18;
  if (tactics.finalThird === 'direct-runners' && slot.line === 'attack') y += sign * 3;
  if (ownsBall && tactics.shape === '4-3-3-wide' && ['lb', 'rb'].includes(slot.id)) y += sign * 5;
  if (player.id === action?.actor && ['carry', 'counterattack'].includes(action.type)) y += sign * progress * 6;
  if (player.id === action?.target && action?.type === 'pass') {
    y += sign * progress * 3;
    x += (50 - x) * progress * .03;
  }
  return { point: { x: clamp(x, 4, 96), y: clamp(y, 4, 96) }, line: slot.line };
}

function anchorFor(slot: LineupSlot, team: MatchTeam, tactics: Tactics): Point {
  return formationPoint(slot.slotId, slot.player, team, tactics, team.id, null, 0).point;
}

function currentSlot(active: ActiveLineups, teamId: TeamId, playerId?: string) {
  return playerId ? active[teamId]?.find(({ player }) => player.id === playerId) : undefined;
}

export function isGoalMouthCrossing(start: Point, end: Point, direction: MatchTeam['direction'], ballHeight = 0) {
  const line = direction === 'south' ? 4 : 96;
  if (ballHeight > .82 || start.y === end.y) return false;
  const crosses = direction === 'south' ? start.y >= line && end.y <= line : start.y <= line && end.y >= line;
  if (!crosses) return false;
  const ratio = (line - start.y) / (end.y - start.y);
  const x = lerp(start.x, end.x, ratio);
  return x >= 36 && x <= 64;
}

export function deriveShotOutcome(input: Readonly<{
  shooterQuality: number;
  chanceQuality: number;
  pressure: number;
  defenders: number;
  goalkeeperQuality: number;
  goalkeeperPosition: number;
  tactics: Tactics;
  fatigue: number;
  seed: number;
}>): ShotOutcome {
  const tacticalChance = input.tactics.finalThird === 'number-10' ? .03 : input.tactics.finalThird === 'wings' ? .015 : -.005;
  const goalProbability = Math.max(.045, Math.min(.28, .08 + ((input.shooterQuality - input.goalkeeperQuality) / 260) + (input.chanceQuality / 190) - (input.pressure / 180) - (input.defenders * .012) - (input.fatigue * .05) + tacticalChance + (input.goalkeeperPosition / 500)));
  const roll = (hash(`shot:${input.seed}:${input.shooterQuality}:${input.chanceQuality}:${input.pressure}:${input.defenders}:${input.goalkeeperQuality}:${input.goalkeeperPosition}:${input.tactics.shape}:${input.tactics.press}:${input.tactics.finalThird}:${input.fatigue}`) % 10_000) / 10_000;
  if (roll < goalProbability) return 'goal';
  const missRoll = (roll - goalProbability) / (1 - goalProbability);
  if (missRoll < .24) return 'save';
  if (missRoll < .34) return 'parried-save';
  if (missRoll < .46) return 'blocked-shot';
  if (missRoll < .60) return 'wide';
  if (missRoll < .71) return 'over';
  if (missRoll < .77) return 'post';
  if (missRoll < .82) return 'crossbar';
  if (missRoll < .90) return 'deflection';
  return 'one-on-one-miss';
}

function shotEnd(team: MatchTeam, outcome: ShotOutcome, zone: MatchAction['zone'], keeper?: MatchPlayer): Point {
  const line = goalY(team);
  const insideX = zone === 'left' ? 42 : zone === 'right' ? 58 : 50;
  if (outcome === 'wide') return { x: zone === 'right' ? 99.2 : .8, y: team.direction === 'south' ? 2 : 98 };
  if (outcome === 'over') return { x: insideX, y: team.direction === 'south' ? .8 : 99.2 };
  if (outcome === 'post') return { x: zone === 'right' ? 64 : 36, y: line };
  if (outcome === 'crossbar') return { x: insideX, y: line };
  if (outcome === 'blocked-shot' || outcome === 'deflection') return { x: insideX + (zone === 'left' ? 5 : -5), y: team.direction === 'south' ? 15 : 85 };
  if (outcome === 'save' || outcome === 'parried-save' || outcome === 'one-on-one-miss') return { x: keeper?.side === 'left' ? 42 : keeper?.side === 'right' ? 58 : insideX, y: team.direction === 'south' ? 7 : 93 };
  return { x: insideX, y: line };
}

function eventEnd(action: MatchAction, team: MatchTeam, opponent: MatchTeam, active: ActiveLineups, tactics: Tactics, start: Point): Point {
  const target = action.target ? currentSlot(active, team.id, action.target) : undefined;
  if (action.type === 'pass' && target) return anchorFor(target, team, tactics);
  if (action.type === 'carry' || action.type === 'counterattack') return { x: clamp(start.x + (action.zone === 'left' ? -7 : action.zone === 'right' ? 7 : 0)), y: clamp(start.y + (attackSign(team) * 12)) };
  if (action.type === 'shot') return shotEnd(team, action.outcome ?? 'save', action.zone, candidate(active[opponent.id], 'goalkeeper', () => .2));
  if (action.type === 'goal') return { x: action.zone === 'left' ? 42 : action.zone === 'right' ? 58 : 50, y: team.direction === 'south' ? 2.2 : 97.8 };
  if (action.type === 'post' || action.type === 'crossbar') return { x: action.zone === 'left' ? 44 : action.zone === 'right' ? 56 : 50, y: team.direction === 'south' ? 12 : 88 };
  if (action.type === 'parried-save' || action.type === 'deflection' || action.type === 'blocked-shot') return { x: clamp(start.x + (action.zone === 'left' ? 9 : -9)), y: clamp(start.y - (attackSign(team) * 10)) };
  if (action.type === 'save' || action.type === 'one-on-one-miss') return start;
  if (action.type === 'wide' || action.type === 'over') return start;
  if (action.type === 'corner') return { x: action.zone === 'right' ? 99 : 1, y: goalY(team) };
  if (action.type === 'goal-kick') return { x: 50, y: team.direction === 'south' ? 8 : 92 };
  if (action.type === 'throw-in') return { x: action.zone === 'right' ? 99 : 1, y: clamp(start.y, 12, 88) };
  if (action.type === 'penalty') return { x: 50, y: team.direction === 'south' ? 12 : 88 };
  return start;
}

function isResolution(type: MatchActionType) {
  return SHOT_OUTCOMES.includes(type as ShotOutcome) || type === 'var-check' || type === 'var-decision';
}

function appendEvent(events: PlannedMatchEvent[], input: MatchInput, active: ActiveLineups, minute: number, second: number, team: MatchTeam, action: MatchAction, possessionAfter: TeamId, override?: Readonly<{ start?: Point; end?: Point }>) {
  const previous = events.at(-1);
  const slot = currentSlot(active, team.id, action.actor);
  const start = override?.start ?? (isResolution(action.type) && previous ? previous.end : slot ? anchorFor(slot, team, input.tactics) : previous?.end ?? { x: 50, y: 50 });
  const end = override?.end ?? eventEnd(action, team, opponentOf(input, team), active, input.tactics, start);
  const event: PlannedMatchEvent = Object.freeze({
    id: `${events.length}:${minute}:${second}:${action.type}`,
    minute,
    second,
    teamId: team.id,
    action: Object.freeze({ ...action, teamId: action.teamId ?? team.id }),
    possessionAfter,
    start: Object.freeze(start),
    end: Object.freeze(end),
    scoreAfter: Object.freeze({ home: 0, away: 0 }),
  });
  events.push(event);
  applyLineupEvent(active, input, event);
}

function withScoreLedger(events: readonly PlannedMatchEvent[], input: MatchInput) {
  let home = 0;
  let away = 0;
  const ordered = [...events].sort((a, b) => a.minute - b.minute || a.second - b.second);
  const coherent = ordered.map((event) => {
    if (event.action.type === 'goal') event.teamId === input.home.id ? home++ : away++;
    return Object.freeze({ ...event, scoreAfter: Object.freeze({ home, away }) });
  });
  return { events: Object.freeze(coherent), score: Object.freeze({ home, away }) };
}

function passVariant(tactics: Tactics, rng: () => number): PassVariant {
  const roll = rng();
  if (tactics.finalThird === 'wings') return roll < .26 ? 'switch' : roll < .49 ? 'cross' : roll < .64 ? 'cutback' : roll < .82 ? 'progressive-pass' : 'short-pass';
  if (tactics.finalThird === 'number-10') return roll < .34 ? 'short-pass' : roll < .68 ? 'progressive-pass' : roll < .88 ? 'through-ball' : 'switch';
  return roll < .48 ? 'through-ball' : roll < .72 ? 'progressive-pass' : roll < .86 ? 'switch' : 'short-pass';
}

function eventZone(tactics: Tactics, rng: () => number): 'left' | 'center' | 'right' {
  if (tactics.finalThird === 'number-10') return rng() < .68 ? 'center' : rng() < .5 ? 'left' : 'right';
  if (tactics.finalThird === 'wings') return rng() < .5 ? 'left' : 'right';
  return rng() < .36 ? 'center' : rng() < .5 ? 'left' : 'right';
}

function addShotSequence(events: PlannedMatchEvent[], input: MatchInput, active: ActiveLineups, minute: number, second: number, team: MatchTeam, opponent: MatchTeam, possession: TeamId, rng: () => number, fatigue: number, forceOutcome?: ShotOutcome) {
  const shooter = candidate(active[team.id], rng() < .18 ? 'midfielder' : 'forward', rng);
  const keeper = candidate(active[opponent.id], 'goalkeeper', rng);
  const zone = eventZone(input.tactics, rng);
  const defenders = roleCandidates(active[opponent.id], 'defender').length;
  const pressure = 30 + (rng() * 50) + (input.tactics.press === 'aggressive' ? 9 : input.tactics.press === 'patient' ? -7 : 0);
  const chanceQuality = 42 + (input.tactics.finalThird === 'number-10' ? 10 : input.tactics.finalThird === 'wings' ? 6 : 2) + (rng() * 25);
  const outcome = forceOutcome ?? deriveShotOutcome({ shooterQuality: team.strengths.attack, chanceQuality, pressure, defenders, goalkeeperQuality: opponent.strengths.goalkeeper, goalkeeperPosition: Math.abs(50 - (zone === 'left' ? 42 : zone === 'right' ? 58 : 50)), tactics: input.tactics, fatigue, seed: hash(`${events.length}:${minute}:${second}:${rng()}`) });
  appendEvent(events, input, active, minute, second, team, { type: 'shot', actor: shooter.id, keeper: keeper.id, zone, outcome }, possession);

  const rareVar = outcome === 'goal' && hash(`${derivedSeed(input)}:${minute}:${shooter.id}:var`) % 7 === 0;
  if (rareVar) {
    const review: VarReview = hash(`${minute}:${shooter.id}:review`) % 2 ? 'close-offside-goal' : 'disputed-goal';
    const decision: VarDecision = hash(`${derivedSeed(input)}:${minute}:decision`) % 3 ? 'confirmed' : 'overturned';
    appendEvent(events, input, active, minute, second + 6, team, { type: 'var-check', actor: shooter.id, review, reason: 'Goal held pending review' }, possession);
    appendEvent(events, input, active, minute, second + 12, team, { type: 'var-decision', actor: shooter.id, review, decision }, decision === 'confirmed' ? opponent.id : opponent.id);
    if (decision === 'confirmed') appendEvent(events, input, active, minute, second + 16, team, { type: 'goal', actor: shooter.id, zone, reason: 'VAR confirmed the goal' }, opponent.id);
    else appendEvent(events, input, active, minute, second + 16, opponent, { type: 'indirect-free-kick', actor: candidate(active[opponent.id], 'defender', rng).id, reason: 'Offside after review' }, opponent.id);
    return;
  }

  if (outcome === 'goal') {
    appendEvent(events, input, active, minute, second + 4, team, { type: 'goal', actor: shooter.id, zone }, opponent.id);
    return;
  }
  const resolvingTeam = ['save', 'parried-save', 'one-on-one-miss', 'blocked-shot', 'deflection'].includes(outcome) ? opponent : team;
  appendEvent(events, input, active, minute, second + 4, resolvingTeam, { type: outcome, actor: outcome === 'blocked-shot' || outcome === 'deflection' ? candidate(active[opponent.id], 'defender', rng).id : outcome === 'save' || outcome === 'parried-save' || outcome === 'one-on-one-miss' ? keeper.id : shooter.id, keeper: keeper.id, zone }, outcome === 'post' || outcome === 'crossbar' ? team.id : opponent.id);
  if (outcome === 'wide' || outcome === 'over' || outcome === 'one-on-one-miss') appendEvent(events, input, active, minute, second + 8, opponent, { type: 'goal-kick', actor: keeper.id }, opponent.id);
  if (outcome === 'blocked-shot' || outcome === 'deflection' || outcome === 'parried-save') appendEvent(events, input, active, minute, second + 8, team, { type: 'corner', actor: candidate(active[team.id], 'midfielder', rng).id, zone }, team.id);
  if (outcome === 'post' || outcome === 'crossbar') appendEvent(events, input, active, minute, second + 8, opponent, { type: 'defensive-recovery', actor: candidate(active[opponent.id], 'defender', rng).id }, opponent.id);
}

function addOpenPlay(events: PlannedMatchEvent[], input: MatchInput, active: ActiveLineups, minute: number, team: MatchTeam, opponent: MatchTeam, possession: TeamId, rng: () => number, cards = new Map<string, number>()) {
  const zone = eventZone(input.tactics, rng);
  const fatigue = Math.max(0, (minute - 55) / 55) * (input.tactics.press === 'aggressive' ? 1 : .72);
  const disciplineRisk = (100 - opponent.strengths.discipline) / 190 + (input.tactics.press === 'aggressive' ? .09 : input.tactics.press === 'patient' ? -.03 : 0);
  const offsideRisk = input.tactics.finalThird === 'direct-runners' ? .12 : .035;
  const roll = rng();

  if (roll < offsideRisk) {
    const passer = candidate(active[team.id], 'midfielder', rng);
    const runner = candidate(active[team.id], 'forward', rng);
    appendEvent(events, input, active, minute, 4, team, { type: 'pass', variant: 'through-ball', actor: passer.id, target: runner.id, zone }, team.id);
    appendEvent(events, input, active, minute, 12, team, { type: 'offside', actor: runner.id, reason: 'Runner beyond the last defender' }, opponent.id);
    appendEvent(events, input, active, minute, 16, opponent, { type: 'indirect-free-kick', actor: candidate(active[opponent.id], 'defender', rng).id }, opponent.id);
    return opponent.id;
  }

  if (roll < offsideRisk + disciplineRisk) {
    const foulRole = rng() < .7 ? 'defender' : 'midfielder';
    const foulPool = roleCandidates(active[opponent.id], foulRole).filter(({ slotId }) => slotId !== 'ten');
    const fouler = (foulPool[Math.floor(rng() * foulPool.length)] ?? active[opponent.id][0]).player;
    appendEvent(events, input, active, minute, 4, opponent, { type: 'press', actor: fouler.id, target: candidate(active[team.id], 'midfielder', rng).id }, possession);
    appendEvent(events, input, active, minute, 9, opponent, { type: rng() < .18 ? 'advantage' : 'foul', actor: fouler.id, reason: 'Late challenge' }, team.id);
    const cardRoll = rng();
    if (cardRoll < (input.tactics.press === 'aggressive' ? .38 : .22)) {
      const priorCards = cards.get(fouler.id) ?? 0;
      const card = cardRoll < .035 ? 'straight-red' : priorCards > 0 && cardRoll < .14 ? 'second-yellow-red' : 'yellow';
      const reviewRed = (card === 'straight-red' || card === 'second-yellow-red') && hash(`${derivedSeed(input)}:${minute}:red-var`) % 5 === 0;
      if (reviewRed) {
        const decision: VarDecision = hash(`${minute}:red-decision`) % 2 ? 'red-card' : 'no-red';
        appendEvent(events, input, active, minute, 13, opponent, { type: 'var-check', actor: fouler.id, review: 'possible-red' }, team.id);
        appendEvent(events, input, active, minute, 17, opponent, { type: 'var-decision', actor: fouler.id, review: 'possible-red', decision }, team.id);
        if (decision === 'red-card') appendEvent(events, input, active, minute, 20, opponent, { type: card, actor: fouler.id, reason: card === 'second-yellow-red' ? 'Second caution confirmed' : 'Serious foul play confirmed' }, team.id);
        else { appendEvent(events, input, active, minute, 20, opponent, { type: 'yellow', actor: fouler.id, reason: 'Review reduced the sanction' }, team.id); cards.set(fouler.id, priorCards + 1); }
      } else {
        appendEvent(events, input, active, minute, 13, opponent, { type: card, actor: fouler.id, reason: card === 'yellow' ? 'Reckless challenge' : card === 'second-yellow-red' ? 'Second caution' : 'Serious foul play' }, team.id);
        if (card === 'yellow') cards.set(fouler.id, priorCards + 1);
      }
    }
    const penaltyArea = minute > 18 && rng() < .13;
    const penaltyReview = hash(`${derivedSeed(input)}:${minute}:penalty-var`) % 13 === 0;
    if (penaltyReview) {
      const review: VarReview = hash(`${minute}:handball`) % 2 ? 'possible-penalty' : 'possible-handball';
      const decision: VarDecision = hash(`${derivedSeed(input)}:${minute}:penalty-decision`) % 2 ? 'penalty-awarded' : 'no-penalty';
      appendEvent(events, input, active, minute, 22, team, { type: 'var-check', actor: candidate(active[team.id], 'forward', rng).id, review }, team.id);
      appendEvent(events, input, active, minute, 27, team, { type: 'var-decision', review, decision }, team.id);
      appendEvent(events, input, active, minute, 31, team, { type: decision === 'penalty-awarded' ? 'penalty' : 'direct-free-kick', actor: candidate(active[team.id], 'midfielder', rng).id, zone, reason: decision === 'penalty-awarded' ? 'Penalty awarded after review' : 'No penalty; foul outside the area' }, team.id);
      if (decision === 'penalty-awarded') addShotSequence(events, input, active, minute, 35, team, opponent, team.id, rng, fatigue, rng() < .26 ? 'goal' : 'save');
    } else {
      appendEvent(events, input, active, minute, 22, team, { type: penaltyArea ? 'penalty' : 'direct-free-kick', actor: candidate(active[team.id], 'midfielder', rng).id, zone }, team.id);
      if (penaltyArea) addShotSequence(events, input, active, minute, 26, team, opponent, team.id, rng, fatigue, rng() < .26 ? 'goal' : 'save');
    }
    return events.at(-1)?.possessionAfter ?? team.id;
  }

  const variant = passVariant(input.tactics, rng);
  const passer = candidate(active[team.id], rng() < .34 ? 'defender' : 'midfielder', rng);
  const receiver = candidate(active[team.id], variant === 'short-pass' ? 'midfielder' : 'forward', rng);
  if (roll < .62) appendEvent(events, input, active, minute, 4, team, { type: 'pass', variant, actor: passer.id, target: receiver.id, zone }, team.id);
  else appendEvent(events, input, active, minute, 4, team, { type: roll < .78 ? 'carry' : 'counterattack', actor: receiver.id, zone }, team.id);

  const disruption = rng();
  if (disruption < .11) {
    appendEvent(events, input, active, minute, 12, opponent, { type: 'blocked-pass', actor: candidate(active[opponent.id], 'defender', rng).id, target: receiver.id, zone }, team.id);
    appendEvent(events, input, active, minute, 16, team, { type: 'throw-in', actor: candidate(active[team.id], 'defender', rng).id, zone }, team.id);
    return team.id;
  }
  if (disruption < .24) {
    const type = disruption < .17 ? 'interception' : 'tackle';
    appendEvent(events, input, active, minute, 12, opponent, { type, actor: candidate(active[opponent.id], type === 'tackle' ? 'defender' : 'midfielder', rng).id, target: receiver.id, zone }, opponent.id);
    appendEvent(events, input, active, minute, 16, opponent, { type: 'defensive-recovery', actor: candidate(active[opponent.id], 'midfielder', rng).id }, opponent.id);
    return opponent.id;
  }
  if (disruption < .34) appendEvent(events, input, active, minute, 12, opponent, { type: 'press', actor: candidate(active[opponent.id], 'midfielder', rng).id, target: receiver.id }, team.id);
  if (disruption > .38 && rng() < .52) addShotSequence(events, input, active, minute, 18, team, opponent, team.id, rng, fatigue);
  else if (disruption > .68) appendEvent(events, input, active, minute, 18, team, { type: 'loose-ball', actor: receiver.id, zone }, rng() < .5 ? team.id : opponent.id);
  return events.at(-1)?.possessionAfter ?? team.id;
}

export function createMatchPlan(input: MatchInput): MatchPlan {
  const seed = derivedSeed(input);
  const rng = random(seed);
  const events: PlannedMatchEvent[] = [];
  const active = initialLineups(input);
  const cards = new Map<string, number>();
  let possession = rng() > .5 ? input.home.id : input.away.id;
  appendEvent(events, input, active, 0, 0, teamById(input, possession), { type: 'phase', phase: 'kickoff', reason: 'Kickoff shape set' }, possession, { start: { x: 50, y: 50 }, end: { x: 50, y: 50 } });
  const pivotalMinute = 64 + Math.floor(rng() * 14);
  const minutes = Array.from({ length: 22 }, (_, index) => 3 + Math.floor(index * 86 / 22) + Math.floor(rng() * 2)).filter((minute) => minute !== 45 && Math.abs(minute - pivotalMinute) > 1);
  let homeSubbed = false;
  let awaySubbed = false;
  for (const minute of minutes) {
    if (minute > 57 && !homeSubbed && input.home.bench?.length) {
      const outgoing = (active[input.home.id].find(({ slotId }) => slotId === 'cm') ?? active[input.home.id].find(({ slotId }) => slotId === 'dm') ?? active[input.home.id][0]).player;
      const incoming = input.home.bench.find((player) => player.role === outgoing.role) ?? input.home.bench[0];
      appendEvent(events, input, active, minute, 1, input.home, { type: 'substitution', actor: outgoing.id, target: incoming.id }, possession);
      homeSubbed = true;
    }
    if (minute > 67 && !awaySubbed && input.away.bench?.length) {
      const outgoing = candidate(active[input.away.id], 'forward', rng);
      const incoming = input.away.bench.find((player) => player.role === outgoing.role) ?? input.away.bench[0];
      appendEvent(events, input, active, minute, 2, input.away, { type: 'substitution', actor: outgoing.id, target: incoming.id }, possession);
      awaySubbed = true;
    }
    const team = teamById(input, possession);
    const opponent = opponentOf(input, team);
    possession = addOpenPlay(events, input, active, minute, team, opponent, possession, rng, cards);
  }
  appendEvent(events, input, active, 45, 0, input.home, { type: 'added-time', addedMinutes: 2 }, possession);
  appendEvent(events, input, active, 45, 30, input.home, { type: 'phase', phase: 'halftime' }, possession);
  const pivotalTeam = input.home;
  appendEvent(events, input, active, pivotalMinute, 14, pivotalTeam, { type: 'pivotal-entry', actor: candidate(active[pivotalTeam.id], 'midfielder', rng).id }, pivotalTeam.id);
  appendEvent(events, input, active, 90, 0, input.home, { type: 'added-time', addedMinutes: 3 }, possession);
  appendEvent(events, input, active, 93, 0, input.home, { type: 'phase', phase: 'full-time' }, possession);
  const ledger = withScoreLedger(events, input);
  return Object.freeze({ version: 1, fixtureId: input.fixtureId, seed, homeTeamId: input.home.id, awayTeamId: input.away.id, tactics: input.tactics, pivotalMinute, pivotalTeamId: pivotalTeam.id, events: ledger.events, baselineResultWithoutMoment: ledger.score });
}

export function injectPivotalOutcome(plan: MatchPlan, input: MatchInput, outcome: MomentOutcome | null): MatchPlan {
  if (!outcome) return plan;
  const pivotalIndex = plan.events.findIndex((event) => event.action.type === 'pivotal-entry');
  if (pivotalIndex < 0) return plan;
  const events = plan.events.slice(0, pivotalIndex + 1).map((event) => ({ ...event })) as PlannedMatchEvent[];
  const active = lineupsAt(input, plan.events, pivotalIndex, 1);
  const rng = random(hash(`${plan.seed}:${outcome}:future-v2`));
  const team = teamById(input, plan.pivotalTeamId);
  const opponent = opponentOf(input, team);
  const shooter = candidate(active[team.id], 'forward', rng);
  const keeper = candidate(active[opponent.id], 'goalkeeper', rng);
  const zone = rng() < .5 ? 'left' : 'right';
  if (outcome === 'goal' || outcome === 'save') {
    appendEvent(events, input, active, plan.pivotalMinute, 22, team, { type: 'shot', actor: shooter.id, keeper: keeper.id, zone, outcome: outcome === 'goal' ? 'goal' : 'save' }, team.id);
    appendEvent(events, input, active, plan.pivotalMinute, 28, outcome === 'goal' ? team : opponent, { type: outcome === 'goal' ? 'goal' : 'save', actor: outcome === 'goal' ? shooter.id : keeper.id, keeper: keeper.id, zone, reason: 'Pivotal control resolved' }, opponent.id);
  } else {
    appendEvent(events, input, active, plan.pivotalMinute, 22, opponent, { type: outcome === 'interception' ? 'interception' : 'defensive-recovery', actor: candidate(active[opponent.id], 'defender', rng).id, target: shooter.id }, opponent.id);
  }
  let possession = events.at(-1)?.possessionAfter ?? opponent.id;
  const cards = new Map<string, number>();
  for (const event of events) if (event.action.type === 'yellow' && event.action.actor) cards.set(event.action.actor, (cards.get(event.action.actor) ?? 0) + 1);
  for (let minute = plan.pivotalMinute + 5; minute < 90; minute += 5 + Math.floor(rng() * 3)) {
    const owner = teamById(input, possession);
    possession = addOpenPlay(events, input, active, minute, owner, opponentOf(input, owner), possession, rng, cards);
  }
  appendEvent(events, input, active, 90, 0, input.home, { type: 'added-time', addedMinutes: 3 }, possession);
  appendEvent(events, input, active, 93, 0, input.home, { type: 'phase', phase: 'full-time' }, possession);
  const ledger = withScoreLedger(events, input);
  return Object.freeze({ ...plan, events: ledger.events, baselineResultWithoutMoment: ledger.score });
}

function commentary(event: PlannedMatchEvent, input: MatchInput) {
  const team = teamById(input, event.teamId);
  const opponent = opponentOf(input, team);
  const actor = playerById(team, event.action.actor)?.displayName ?? team.name;
  const target = playerById(team, event.action.target)?.displayName;
  const passName = event.action.variant?.replace('-', ' ') ?? 'pass';
  switch (event.action.type) {
    case 'pass': return `${actor} sends a ${passName}${target ? ` toward ${target}` : ''}.`;
    case 'carry': return `${actor} carries into the ${event.action.zone ?? 'central'} lane.`;
    case 'counterattack': return `${actor} drives the counterattack forward.`;
    case 'press': return `${actor} closes the ball and the line shifts behind the press.`;
    case 'tackle': return `${actor} times the tackle and wins possession.`;
    case 'interception': return `${actor} meets the pass at the interception point.`;
    case 'blocked-pass': return `${actor} blocks the passing lane.`;
    case 'loose-ball': return `The loose ball is contested in the ${event.action.zone ?? 'central'} channel.`;
    case 'defensive-recovery': return `${actor} completes the defensive recovery.`;
    case 'shot': return `${actor} shoots under pressure; the ball is still live.`;
    case 'goal': return `${actor}'s shot crosses the line and settles inside the net.`;
    case 'save': return `${actor} sets, gets across, and holds the shot.`;
    case 'parried-save': return `${actor} parries the shot away from goal.`;
    case 'blocked-shot': return `${actor} blocks the shot before it reaches goal.`;
    case 'wide': return `${actor}'s shot travels wide. Goal kick.`;
    case 'over': return `${actor}'s shot clears the bar. Goal kick.`;
    case 'post': return `${actor}'s shot strikes the post and rebounds.`;
    case 'crossbar': return `${actor}'s shot clips the crossbar and stays out.`;
    case 'deflection': return `${actor} deflects the shot behind for a corner.`;
    case 'one-on-one-miss': return `${actor} wins the one-on-one. The chance is gone.`;
    case 'foul': return `${actor} commits a foul. The referee stops play.`;
    case 'advantage': return `Advantage ${opponent.name}; the referee lets the attack continue.`;
    case 'yellow': return `${actor} is shown a yellow card for ${event.action.reason?.toLowerCase() ?? 'the challenge'}.`;
    case 'second-yellow-red': return `${actor} receives a second yellow and is sent off.`;
    case 'straight-red': return `${actor} is sent off for serious foul play.`;
    case 'offside': return `${actor} is offside. The defensive line held.`;
    case 'throw-in': return `${team.name} restart with a throw-in from the touchline.`;
    case 'goal-kick': return `${team.name} restart from the goal area.`;
    case 'corner': return `${team.name} place the ball for a corner.`;
    case 'direct-free-kick': return `${team.name} set the direct free kick.`;
    case 'indirect-free-kick': return `${team.name} restart with an indirect free kick.`;
    case 'penalty': return `Penalty to ${team.name}. The ball is on the spot.`;
    case 'substitution': return `${target ?? team.name} replaces ${actor}; the shape adjusts.`;
    case 'added-time': return `${event.action.addedMinutes} minutes of added time are shown.`;
    case 'var-check': return `VAR check: ${(event.action.review ?? 'incident').replaceAll('-', ' ')}. The clock is paused.`;
    case 'var-decision': return `VAR decision: ${(event.action.decision ?? 'confirmed').replaceAll('-', ' ')}.`;
    case 'pivotal-entry': return `${team.name} find a late opening. The next move is yours.`;
    case 'phase': return event.action.phase === 'halftime' ? 'Half-time. The ledger and score agree.' : event.action.phase === 'full-time' ? 'Full time. The final whistle locks the result.' : 'Kickoff. Both formations hold their opening shape.';
    default: return `${team.name} keep the match connected.`;
  }
}

function statePlayers(input: MatchInput, events: readonly PlannedMatchEvent[], eventIndex: number, progress: number, possession: TeamId, action: MatchAction | null) {
  const active = lineupsAt(input, events, eventIndex, progress);
  return [input.home, input.away].flatMap((team) => active[team.id].map(({ player, slotId }) => {
    const formation = formationPoint(slotId, player, team, input.tactics, possession, action, progress);
    const targetPoint = action?.target === player.id ? formation.point : null;
    const startPoint = action?.actor === player.id ? formation.point : null;
    const angle = targetPoint && startPoint ? Math.atan2(targetPoint.y - startPoint.y, targetPoint.x - startPoint.x) * 180 / Math.PI : team.direction === 'south' ? -90 : 90;
    const slot = formationForShape(input.tactics.shape, team.direction).find((item) => item.id === slotId);
    return Object.freeze({
      id: player.id,
      teamId: team.id,
      number: slot?.number ?? player.number,
      shortLabel: slot?.position ?? player.shortLabel,
      role: player.role,
      position: Object.freeze(formation.point),
      facing: team.direction === 'south' ? 'up' : 'down',
      facingDegrees: angle,
      active: player.id === action?.actor,
      line: formation.line,
    });
  }));
}

function stepsFor(action: MatchAction) {
  if (action.type === 'pass') return action.variant === 'switch' || action.variant === 'cross' ? 11 : action.variant === 'through-ball' || action.variant === 'progressive-pass' ? 9 : 7;
  if (action.type === 'shot') return 9;
  if (action.type === 'var-check') return 8;
  if (action.type === 'var-decision') return 6;
  if (SHOT_OUTCOMES.includes(action.type as ShotOutcome)) return 5;
  if (action.type === 'pivotal-entry') return 4;
  return 4;
}

function ballStateFor(action: MatchAction, progress: number): BallState {
  if (action.type === 'goal') return 'net';
  if (['wide', 'over', 'goal-kick', 'throw-in', 'corner'].includes(action.type)) return 'out';
  if (['save', 'one-on-one-miss'].includes(action.type) && progress >= 1) return 'keeper';
  if (['parried-save', 'blocked-shot', 'deflection', 'post', 'crossbar'].includes(action.type)) return 'deflected';
  if (action.type === 'pass' && (action.variant === 'switch' || action.variant === 'cross')) return 'lofted';
  if (action.type === 'pass' || action.type === 'shot') return 'grounded';
  return 'owned';
}

export function buildPresentationFrames(plan: MatchPlan, input: MatchInput): readonly MatchFrame[] {
  const frames: MatchFrame[] = [];
  plan.events.forEach((event, eventIndex) => {
    const previous = plan.events[eventIndex - 1];
    const priorScore = previous?.scoreAfter ?? { home: 0, away: 0 };
    const priorPossession = previous?.possessionAfter ?? event.teamId;
    const steps = stepsFor(event.action);
    for (let step = 0; step < steps; step++) {
      const progress = step / (steps - 1);
      const eased = smoothstep(progress);
      const travels = event.action.type === 'pass' || event.action.type === 'shot' || SHOT_OUTCOMES.includes(event.action.type as ShotOutcome);
      const ball = travels || isResolution(event.action.type)
        ? { x: lerp(event.start.x, event.end.x, eased), y: lerp(event.start.y, event.end.y, eased) }
        : event.start;
      const lofted = event.action.type === 'pass' && (event.action.variant === 'switch' || event.action.variant === 'cross');
      const highShot = event.action.type === 'shot' && (event.action.outcome === 'over' || event.action.outcome === 'crossbar');
      const ballHeight = lofted ? Math.sin(Math.PI * progress) * .72 : highShot ? Math.sin(Math.PI * progress) * .92 + (event.action.outcome === 'over' ? progress * .38 : 0) : event.action.type === 'post' || event.action.type === 'crossbar' ? Math.max(0, .24 * (1 - progress)) : 0;
      const possessionChanges = event.possessionAfter !== priorPossession;
      const possessionTeamId = event.action.type === 'pivotal-entry' ? event.possessionAfter : possessionChanges && progress < 1 ? priorPossession : event.possessionAfter;
      const players = statePlayers(input, plan.events, eventIndex, progress, possessionTeamId, event.action);
      const ballOwnerId = event.action.type === 'pass'
        ? progress === 0 ? event.action.actor ?? null : progress === 1 ? event.action.target ?? null : null
        : event.action.type === 'shot' ? progress === 0 ? event.action.actor ?? null : null
          : (event.action.type === 'save' || event.action.type === 'one-on-one-miss') && progress === 1 ? event.action.keeper ?? event.action.actor ?? null
            : event.action.type === 'carry' || event.action.type === 'counterattack' ? event.action.actor ?? null
              : event.action.actor ?? null;
      const score = event.action.type === 'goal' && progress < 1 ? priorScore : event.scoreAfter;
      const camera = { x: clamp(ball.x, 35, 65), y: clamp(ball.y, 28, 72) };
      frames.push(Object.freeze({
        tick: frames.length,
        minute: event.minute,
        second: event.second,
        eventIndex,
        eventProgress: progress,
        score: Object.freeze(score),
        possessionTeamId,
        ball: Object.freeze(ball),
        ballHeight,
        ballRotation: (eventIndex * 47) + (progress * (lofted ? 420 : 260)),
        ballState: ballStateFor(event.action, progress),
        ballOwnerId,
        players: Object.freeze(players),
        action: event.action,
        momentumContext: commentary(event, input),
        meaningful: step === 0,
        camera: Object.freeze(camera),
      }));
    }
  });
  return Object.freeze(frames);
}

export function nextMeaningfulTick(frames: readonly MatchFrame[], currentTick: number) { return frames.find((frame) => frame.tick > currentTick && frame.meaningful)?.tick ?? frames.length - 1; }
export function planForCampaign(seed: number, tactics: Tactics, home: MatchTeam, away: MatchTeam) { return createMatchPlan({ fixtureId: `${home.id}-${away.id}`, campaignSeed: seed, home, away, tactics }); }
export function buildMatchFrames(seed: number, tactics: Tactics, outcome: MomentOutcome | null): readonly MatchFrame[] { const input = { fixtureId: campaignFixture.id, campaignSeed: seed, home: campaignFixture.home, away: campaignFixture.away, tactics } as const; return buildPresentationFrames(injectPivotalOutcome(createMatchPlan(input), input, outcome), input); }
export function finalScore(seed: number, tactics: Tactics, outcome: MomentOutcome) { const frames = buildMatchFrames(seed, tactics, outcome); return frames[frames.length - 1].score; }
export const EVENT_CATALOG = Object.freeze({ pass: PASS_VARIANTS, shot: SHOT_OUTCOMES });
