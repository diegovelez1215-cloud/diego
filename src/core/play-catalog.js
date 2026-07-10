export const PLAY_CATALOG_VERSION = 2;

export const PLAY_MODES = Object.freeze([
  { id: 'lobby', label: 'Play', group: 'home', primary: true },
  { id: 'shotlab', label: 'Shot Lab', group: 'skill', primary: true },
  { id: 'shootout', label: 'Penalty Rush', group: 'skill', primary: true },
  { id: 'lab', label: 'Match Lab', group: 'simulation', primary: true },
  { id: 'prediction', label: 'Prediction Run', group: 'competition', primary: true },
  { id: 'myworldcup', label: 'My World Cup', group: 'simulation', primary: true },
  { id: 'finalminute', label: 'Final Minute', group: 'tactics', primary: false },
  { id: 'coach', label: "Coach's Call", group: 'tactics', primary: false },
  { id: 'cup', label: 'Arcade Cup', group: 'campaign', primary: false },
]);

const BY_ID = new Map(PLAY_MODES.map((mode) => [mode.id, mode]));

export function playMode(id) {
  return BY_ID.get(id) || BY_ID.get('lobby');
}

export function playRailModes(activeId = 'lobby') {
  const primary = PLAY_MODES.filter((mode) => mode.primary);
  const active = playMode(activeId);
  if (active.primary) return primary;
  return [primary[0], active, ...primary.slice(1)];
}
