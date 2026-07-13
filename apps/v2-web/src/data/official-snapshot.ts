import { useCallback, useEffect, useRef, useState } from 'react';
import { applyOfficialOverlay } from '../domain/tournament-bridge';
import type { ProviderLiveInput, ProviderResultsInput, TournamentSnapshot } from '../domain/contracts';
import type { SnapshotState } from './snapshot-state';

const RESULTS_URL = '/api/results';
const LIVE_URL = '/api/live';

export type SnapshotFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type LoadedSnapshot =
  | Readonly<{ kind: 'verified'; snapshot: TournamentSnapshot }>
  | Readonly<{ kind: 'partial'; snapshot: TournamentSnapshot }>
  | Readonly<{ kind: 'unavailable'; snapshot: TournamentSnapshot; stale: boolean }>;

class SnapshotRequestError extends Error {
  constructor(readonly kind: 'request-error' | 'invalid-response') {
    super(kind);
  }
}

function isStalePayload(value: unknown): boolean {
  return !!value && typeof value === 'object' && (value as ProviderResultsInput | ProviderLiveInput).isStale === true;
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new SnapshotRequestError('request-error');
  try {
    return await response.json();
  } catch {
    throw new SnapshotRequestError('invalid-response');
  }
}

function localhostSnapshotFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> | null {
  if (typeof window === 'undefined' || window.location.hostname !== '127.0.0.1' || (window.localStorage.getItem('__u26v2_prediction_test') !== '1' && !new URLSearchParams(window.location.search).has('__v2e2e'))) return null;
  try {
    const configured = JSON.parse(window.localStorage.getItem('__u26v2_official_snapshot') || 'null') as { results?: unknown; live?: unknown } | null;
    if (!configured) return null;
    const url = String(input);
    const body = url.includes('/api/results') ? configured.results : configured.live;
    return Promise.resolve(new Response(JSON.stringify(body || {}), { status: 200, headers: { 'content-type': 'application/json' } }));
  } catch {
    return null;
  }
}

function snapshotFetcher(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return localhostSnapshotFetch(input, init) || fetch(input, init);
}

/**
 * The only browser boundary for official V2 data. Raw provider-shaped payloads
 * are immediately handed to the existing validated overlay before any route
 * receives a model. Canonical fixtures remain the sole source of identity.
 */
export async function loadOfficialSnapshot(fetcher: SnapshotFetch, signal?: AbortSignal): Promise<LoadedSnapshot> {
  let resultsRaw: unknown;
  let liveRaw: unknown;
  try {
    [resultsRaw, liveRaw] = await Promise.all([
      fetcher(RESULTS_URL, { signal, headers: { accept: 'application/json' } }).then(readJson),
      fetcher(LIVE_URL, { signal, headers: { accept: 'application/json' } }).then(readJson),
    ]);
  } catch (error) {
    if (error instanceof SnapshotRequestError) throw error;
    throw new SnapshotRequestError('request-error');
  }

  const results = resultsRaw as ProviderResultsInput;
  const live = liveRaw as ProviderLiveInput;
  const applied = applyOfficialOverlay({ source: 'official-provider', results, live });
  if (!applied.accepted) throw new SnapshotRequestError('invalid-response');

  if (applied.snapshot.source.kind === 'verified') return Object.freeze({ kind: 'verified', snapshot: applied.snapshot });
  if (applied.snapshot.source.kind === 'partial') return Object.freeze({ kind: 'partial', snapshot: applied.snapshot });
  return Object.freeze({ kind: 'unavailable', snapshot: applied.snapshot, stale: isStalePayload(results) || isStalePayload(live) });
}

export type OfficialSnapshotController = Readonly<{
  state: SnapshotState;
  refreshing: boolean;
  refresh: () => Promise<void>;
}>;

/**
 * Route-scoped memory state: no persistence, no query cache, and one in-flight
 * request pair at a time. A prior verified snapshot is retained only when a
 * provider marks its fallback stale or a later request fails.
 */
export function useOfficialSnapshot(fetcher: SnapshotFetch = snapshotFetcher): OfficialSnapshotController {
  const [state, setState] = useState<SnapshotState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const activeRequest = useRef<Promise<void> | null>(null);
  const activeAbort = useRef<AbortController | null>(null);
  const lastVerified = useRef<TournamentSnapshot | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(() => {
    if (activeRequest.current) return activeRequest.current;
    const controller = new AbortController();
    activeAbort.current = controller;
    if (mounted.current) setRefreshing(true);

    const request = loadOfficialSnapshot(fetcher, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted || !mounted.current) return;
        if (loaded.kind === 'verified') {
          lastVerified.current = loaded.snapshot;
          setState(loaded);
          return;
        }
        if (loaded.kind === 'partial') {
          setState(loaded);
          return;
        }
        if (lastVerified.current) {
          setState({ kind: 'stale', snapshot: lastVerified.current, reason: 'provider-stale' });
          return;
        }
        setState({ kind: 'unavailable', snapshot: loaded.snapshot });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || !mounted.current) return;
        const reason = error instanceof SnapshotRequestError ? error.kind : 'request-error';
        if (lastVerified.current && reason === 'request-error') {
          setState({ kind: 'stale', snapshot: lastVerified.current, reason: 'request-error' });
          return;
        }
        setState({ kind: 'error', reason });
      })
      .finally(() => {
        if (activeRequest.current === request) activeRequest.current = null;
        if (activeAbort.current === controller) activeAbort.current = null;
        if (mounted.current) setRefreshing(false);
      });
    activeRequest.current = request;
    return request;
  }, [fetcher]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      activeAbort.current?.abort();
    };
  }, [refresh]);

  return { state, refreshing, refresh };
}
