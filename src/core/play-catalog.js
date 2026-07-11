// United 2026 — the Play catalog, versioned so navigation can change without
// erasing old records. v3 retires Shot Lab and seats Rondo as the flagship
// skill game; retired records move to a readable legacy shelf in migration.

export const PLAY_CATALOG_VERSION = 3;

/** Route ids retired from navigation. Renderers must fall back to the lobby
    for these and migrations must keep their records readable. */
export const RETIRED_MODES = Object.freeze(['shotlab']);

export const PLAY_MODES = Object.freeze([
  { id: 'lobby', label: 'Play', group: 'home', primary: true },
  { id: 'rondo', label: 'Rondo', group: 'skill', primary: true },
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
