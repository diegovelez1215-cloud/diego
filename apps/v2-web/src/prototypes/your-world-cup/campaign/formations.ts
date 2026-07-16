import type { Shape } from './contracts';

export type FormationLine = 'goalkeeper' | 'defense' | 'pivot' | 'midfield' | 'attacking-midfield' | 'attack';
export type FormationSlot = Readonly<{
  id: string;
  position: string;
  number: number;
  line: FormationLine;
  x: number;
  y: number;
  captain?: boolean;
}>;

const FOUR_THREE_THREE: readonly FormationSlot[] = Object.freeze([
  { id: 'gk', position: 'GK', number: 1, line: 'goalkeeper', x: 50, y: 92 },
  { id: 'lb', position: 'LB', number: 4, line: 'defense', x: 14, y: 78 },
  { id: 'cb1', position: 'LCB', number: 5, line: 'defense', x: 38, y: 78 },
  { id: 'cb2', position: 'RCB', number: 2, line: 'defense', x: 62, y: 78 },
  { id: 'rb', position: 'RB', number: 3, line: 'defense', x: 86, y: 78 },
  { id: 'dm', position: 'DM', number: 6, line: 'pivot', x: 50, y: 64 },
  { id: 'cm', position: 'LCM', number: 8, line: 'midfield', x: 34, y: 51 },
  { id: 'ten', position: 'RCM', number: 10, line: 'midfield', x: 66, y: 51, captain: true },
  { id: 'lw', position: 'LW', number: 7, line: 'attack', x: 13, y: 30 },
  { id: 'st', position: 'ST', number: 9, line: 'attack', x: 50, y: 21 },
  { id: 'rw', position: 'RW', number: 11, line: 'attack', x: 87, y: 30 },
]);

const FOUR_TWO_THREE_ONE: readonly FormationSlot[] = Object.freeze([
  { id: 'gk', position: 'GK', number: 1, line: 'goalkeeper', x: 50, y: 92 },
  { id: 'lb', position: 'LB', number: 4, line: 'defense', x: 14, y: 78 },
  { id: 'cb1', position: 'LCB', number: 6, line: 'defense', x: 38, y: 78 },
  { id: 'cb2', position: 'RCB', number: 2, line: 'defense', x: 62, y: 78 },
  { id: 'rb', position: 'RB', number: 3, line: 'defense', x: 86, y: 78 },
  { id: 'dm', position: 'LDM', number: 5, line: 'pivot', x: 36, y: 62 },
  { id: 'cm', position: 'RDM', number: 8, line: 'pivot', x: 64, y: 62 },
  { id: 'lw', position: 'LW', number: 7, line: 'attacking-midfield', x: 14, y: 43 },
  { id: 'ten', position: 'CAM', number: 10, line: 'attacking-midfield', x: 50, y: 40, captain: true },
  { id: 'rw', position: 'RW', number: 11, line: 'attacking-midfield', x: 86, y: 43 },
  { id: 'st', position: 'ST', number: 9, line: 'attack', x: 50, y: 21 },
]);

export const FORMATION_LAYOUTS: Readonly<Record<Shape, readonly FormationSlot[]>> = Object.freeze({
  '4-3-3-wide': FOUR_THREE_THREE,
  '4-2-3-1-control': FOUR_TWO_THREE_ONE,
});

export function formationForShape(shape: Shape, direction: 'north' | 'south' = 'south'): readonly FormationSlot[] {
  const slots = FORMATION_LAYOUTS[shape];
  if (direction === 'south') return slots;
  return slots.map((slot) => Object.freeze({ ...slot, x: 100 - slot.x, y: 100 - slot.y }));
}
