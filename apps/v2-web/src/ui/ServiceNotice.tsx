import type { SnapshotState } from '../data/snapshot-state';

function messageFor(state: SnapshotState) {
  if (state.kind === 'loading') return 'Checking official status — the canonical schedule is ready.';
  if (state.kind === 'stale') return 'Last verified view — retained scores and status remain marked stale.';
  if (state.kind === 'unavailable') return 'Official status unavailable — schedule is canonical. No live state or score is implied.';
  if (state.kind === 'error') return 'Official status could not be checked — the canonical schedule remains available.';
  if (state.kind === 'partial') return 'Official coverage is partial — only validated fields are shown.';
  return null;
}

export function ServiceNotice({ state, onRetry }: { state: SnapshotState; onRetry: () => Promise<void> }) {
  const message = messageFor(state);
  if (!message) return null;
  return (
    <section className="v2-service-notice" data-state={state.kind} role={state.kind === 'error' ? 'alert' : state.kind === 'loading' ? 'status' : undefined}>
      <span className="v2-service-notice__dot" aria-hidden="true" />
      <p>{message}</p>
      {state.kind !== 'loading' ? <button className="v2-service-notice__action" type="button" onClick={() => void onRetry()}>Retry</button> : null}
    </section>
  );
}
