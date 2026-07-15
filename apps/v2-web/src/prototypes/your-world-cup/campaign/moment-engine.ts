import type { MomentOutcome, MomentProgress, PlayerId, ShotZone, Tactics } from './contracts';
import type { MatchSetup } from './simulation';

export type Point = Readonly<{ x: number; y: number }>;
export type MomentState = Readonly<{
  tick: number;
  limit: number;
  ballCarrier: PlayerId;
  ball: Point;
  attackers: Readonly<Record<PlayerId, Point>>;
  defenders: readonly Point[];
  keeper: Point;
  availablePasses: readonly PlayerId[];
  closedPasses: readonly PlayerId[];
  shotAvailable: boolean;
  outcome: MomentOutcome | null;
  message: string;
  lastAction: MomentProgress['events'][number]['action'] | null;
}>;

const PLAYERS: readonly PlayerId[] = ['lw', 'ten', 'rw', 'st'];
const ZONES: readonly ShotZone[] = ['left', 'center', 'right'];
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const hash = (value: string) => [...value].reduce((total, character) => ((total * 33) + character.charCodeAt(0)) >>> 0, 5381);
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function distanceToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x; const dy = end.y - start.y;
  const rawRatio = dx || dy ? ((point.x - start.x) * dx + (point.y - start.y) * dy) / ((dx * dx) + (dy * dy)) : 0;
  if (rawRatio < .12 || rawRatio > .95) return Number.POSITIVE_INFINITY;
  const ratio = clamp(rawRatio, 0, 1);
  return distance(point, { x: start.x + dx * ratio, y: start.y + dy * ratio });
}

function limitFor(tactics: Tactics) { return tactics.press === 'patient' ? 15 : tactics.press === 'aggressive' ? 11 : 13; }

function startingAttackers(tactics: Tactics): Record<PlayerId, Point> {
  const wide = tactics.shape === '4-3-3-wide';
  const direct = tactics.finalThird === 'direct-runners';
  return {
    lw: { x: wide ? 15 : 28, y: 73 }, ten: { x: 50, y: tactics.shape === '4-2-3-1-control' ? 62 : 68 },
    rw: { x: wide ? 85 : 72, y: 73 }, st: { x: 50, y: direct ? 43 : 49 },
  };
}

function startingDefenders(seed: number, tactics: Tactics): readonly Point[] {
  const spread = tactics.press === 'aggressive' ? 18 : tactics.press === 'patient' ? 10 : 14;
  const wobble = (hash(`${seed}:def`) % 7) - 3;
  return [{ x: 50 - spread, y: 43 + wobble }, { x: 50, y: 61 }, { x: 50 + spread, y: 43 - wobble }];
}

function keeperFor(seed: number): Point { return { x: [34, 50, 66][hash(`${seed}:keeper`) % 3], y: 10 }; }

function runAttackers(state: MomentState, tactics: Tactics): Record<PlayerId, Point> {
  const time = state.tick + 1; const current = state.attackers;
  const wide = tactics.shape === '4-3-3-wide'; const direct = tactics.finalThird === 'direct-runners';
  return {
    lw: { x: clamp(current.lw.x + (wide ? (current.lw.x < 50 ? -1.2 : 1.2) : .25), 8, 92), y: clamp(current.lw.y - (tactics.finalThird === 'wings' ? 2.0 : 1.1), 22, 85) },
    ten: { x: clamp(50 + (tactics.shape === '4-2-3-1-control' ? Math.sin(time) * 5 : Math.sin(time) * 2), 25, 75), y: clamp(current.ten.y - (tactics.finalThird === 'number-10' ? 2.3 : 1.2), 25, 75) },
    rw: { x: clamp(current.rw.x + (wide ? (current.rw.x > 50 ? 1.2 : -1.2) : -.25), 8, 92), y: clamp(current.rw.y - (tactics.finalThird === 'wings' ? 2.0 : 1.1), 22, 85) },
    st: { x: clamp(50 + (direct ? Math.sin(time * 1.4) * 8 : Math.sin(time) * 3), 28, 72), y: clamp(current.st.y - (direct ? 3.2 : 1.65), 18, 60) },
  };
}

function moveDefenders(state: MomentState, attackers: Record<PlayerId, Point>): readonly Point[] {
  const carrier = attackers[state.ballCarrier];
  return state.defenders.map((defender, index) => {
    const cover = index === 1 ? attackers.st : midpoint(carrier, index === 0 ? attackers.lw : attackers.rw);
    const target = midpoint(carrier, cover);
    const rate = 3.4 + index * .35;
    const dx = target.x - defender.x; const dy = target.y - defender.y; const length = Math.max(1, Math.hypot(dx, dy));
    return { x: clamp(defender.x + (dx / length) * rate, 5, 95), y: clamp(defender.y + (dy / length) * rate, 16, 88) };
  });
}

function laneState(carrier: PlayerId, attackers: Record<PlayerId, Point>, defenders: readonly Point[]) {
  const open: PlayerId[] = []; const closed: PlayerId[] = [];
  for (const player of PLAYERS) {
    if (player === carrier) continue;
    if ((carrier === 'lw' || carrier === 'rw') && player === 'st') { open.push(player); continue; }
    const proximity = Math.min(...defenders.map((defender) => distanceToSegment(defender, attackers[carrier], attackers[player])));
    const clearance = carrier === 'ten' && player === 'st' ? 8.5 : 5;
    if (proximity >= clearance) open.push(player); else closed.push(player);
  }
  return { open, closed };
}

function build(seed: number, tactics: Tactics, tick: number, carrier: PlayerId, attackers: Record<PlayerId, Point>, defenders: readonly Point[], outcome: MomentOutcome | null, message: string, lastAction: MomentState['lastAction']): MomentState {
  const lanes = laneState(carrier, attackers, defenders);
  return Object.freeze({ tick, limit: limitFor(tactics), ballCarrier: carrier, ball: attackers[carrier], attackers, defenders, keeper: keeperFor(seed), availablePasses: lanes.open, closedPasses: lanes.closed, shotAvailable: !outcome && (carrier === 'st' || (carrier === 'ten' && attackers.ten.y < 47)), outcome, message, lastAction });
}

export function initialMoment(seed: number, tactics: Tactics): MomentState {
  const attackers = startingAttackers(tactics); const defenders = startingDefenders(seed, tactics);
  return build(seed, tactics, 0, 'ten', attackers, defenders, null, 'Ocampo has the first touch. Find the open run.', null);
}

export function advanceMoment(seed: number, tactics: Tactics, state: MomentState): MomentState {
  if (state.outcome) return state;
  const attackers = runAttackers(state, tactics); const defenders = moveDefenders(state, attackers); const nextTick = state.tick + 1;
  if (nextTick >= state.limit) return build(seed, tactics, nextTick, state.ballCarrier, attackers, defenders, 'expired', 'The whistle cuts through the attack.', null);
  return build(seed, tactics, nextTick, state.ballCarrier, attackers, defenders, null, 'Nigeria are closing. The next lane matters.', null);
}

export function passMoment(seed: number, tactics: Tactics, state: MomentState, target: PlayerId): MomentState {
  if (state.outcome || target === state.ballCarrier) return state;
  const closed = state.closedPasses.includes(target);
  if (closed) return build(seed, tactics, state.tick, state.ballCarrier, state.attackers as Record<PlayerId, Point>, state.defenders, 'interception', 'The lane was closed. Nigeria cut it out.', { type: 'pass', target });
  const received = build(seed, tactics, state.tick, target, state.attackers as Record<PlayerId, Point>, state.defenders, null, `${target === 'lw' ? 'Luna' : target === 'rw' ? 'Garay' : target === 'st' ? 'Ferreyra' : 'Ocampo'} takes it on the move.`, { type: 'pass', target });
  const attackers = runAttackers(received, tactics); const defenders = moveDefenders(received, attackers); const nextTick = state.tick + 1;
  if (nextTick >= received.limit) return build(seed, tactics, nextTick, target, attackers, defenders, 'expired', 'The whistle cuts through the attack.', { type: 'pass', target });
  return build(seed, tactics, nextTick, target, attackers, defenders, null, 'The pass lands. Nigeria reset their line around the new carrier.', { type: 'pass', target });
}

export function shootMoment(seed: number, tactics: Tactics, state: MomentState, zone: ShotZone): MomentState {
  if (state.outcome) return state;
  if (!state.shotAvailable) return build(seed, tactics, state.tick, state.ballCarrier, state.attackers as Record<PlayerId, Point>, state.defenders, 'save', 'Early shot smothered by the keeper.', { type: 'shoot', zone });
  const pressure = Math.min(...state.defenders.map((defender) => distance(defender, state.attackers[state.ballCarrier])));
  const keeperZone: ShotZone = state.keeper.x < 42 ? 'left' : state.keeper.x > 58 ? 'right' : 'center';
  const roll = hash(`${seed}:${tactics.shape}:${tactics.finalThird}:${state.tick}:${zone}`) % 13;
  const pressureThreshold = pressure < 4 ? 4 : 1;
  const goal = zone !== keeperZone && roll > pressureThreshold;
  return build(seed, tactics, state.tick, state.ballCarrier, state.attackers as Record<PlayerId, Point>, state.defenders, goal ? 'goal' : 'save', goal ? 'GOAL! The net snaps before the print slam.' : 'Saved. The keeper gets across and freezes the moment.', { type: 'shoot', zone });
}

export function replayMoment(seed: number, tactics: Tactics, progress: MomentProgress): MomentState {
  let state = initialMoment(seed, tactics); let eventIndex = 0;
  const applyActions = () => {
    while (eventIndex < progress.events.length && progress.events[eventIndex].tick === state.tick && !state.outcome) {
      const event = progress.events[eventIndex++];
      state = event.action.type === 'pass' ? passMoment(seed, tactics, state, event.action.target) : shootMoment(seed, tactics, state, event.action.zone);
    }
  };
  applyActions();
  while (state.tick < progress.tick && !state.outcome) { state = advanceMoment(seed, tactics, state); applyActions(); }
  return state;
}

export function validMomentProgress(value: unknown): value is MomentProgress {
  if (!value || typeof value !== 'object') return false;
  const progress = value as { tick?: unknown; events?: unknown };
  return Number.isInteger(progress.tick) && Number(progress.tick) >= 0 && Number(progress.tick) <= 20 && Array.isArray(progress.events) && progress.events.length <= 24 && progress.events.every((event) => {
    if (!event || typeof event !== 'object') return false;
    const item = event as { tick?: unknown; action?: { type?: unknown; target?: unknown; zone?: unknown } };
    return Number.isInteger(item.tick) && Number(item.tick) >= 0 && Number(item.tick) <= Number(progress.tick) && ((item.action?.type === 'pass' && PLAYERS.includes(item.action.target as PlayerId)) || (item.action?.type === 'shoot' && ZONES.includes(item.action.zone as ShotZone)));
  });
}
