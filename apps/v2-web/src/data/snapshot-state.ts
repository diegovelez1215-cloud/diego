import type { TournamentSnapshot } from '../domain/contracts';

export type SnapshotState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'verified'; snapshot: TournamentSnapshot }>
  | Readonly<{ kind: 'partial'; snapshot: TournamentSnapshot }>
  | Readonly<{ kind: 'stale'; snapshot: TournamentSnapshot; reason: 'provider-stale' | 'request-error' }>
  | Readonly<{ kind: 'unavailable'; snapshot: TournamentSnapshot }>
  | Readonly<{ kind: 'error'; reason: 'request-error' | 'invalid-response' }>;

export function snapshotFromState(state: SnapshotState): TournamentSnapshot | null {
  return 'snapshot' in state ? state.snapshot : null;
}
