import type { SnapshotState } from '../data/snapshot-state';

function sourceView(state: SnapshotState) {
  if (state.kind === 'loading') return { label: 'Checking', tone: 'checking', copy: 'United is checking the official match source. The canonical schedule remains available.' };
  if (state.kind === 'verified') return { label: 'Official', tone: 'official', copy: 'Match status and scores shown as official passed provider validation.' };
  if (state.kind === 'partial') return { label: 'Unverified', tone: 'unverified', copy: 'Official coverage is partial. Only fields that passed validation are shown.' };
  if (state.kind === 'stale') return { label: 'Unverified', tone: 'unverified', copy: 'The latest check did not validate. Any retained official fields are marked stale.' };
  if (state.kind === 'unavailable') return { label: 'Unverified', tone: 'unverified', copy: 'Official status is unavailable. Schedule identity and kickoff details remain canonical.' };
  return { label: 'Unverified', tone: 'error', copy: 'The official source could not be checked. No score or live state is implied.' };
}

export function SourceChip({ state, refreshing, onRefresh }: {
  state: SnapshotState;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
}) {
  const view = sourceView(state);
  return (
    <details className="v2-source-chip" data-tone={view.tone}>
      <summary><span aria-hidden="true" />{refreshing ? 'Checking' : view.label}</summary>
      <div className="v2-source-chip__sheet">
        <strong>Source status</strong>
        <p>{view.copy}</p>
        <button type="button" onClick={() => void onRefresh()} disabled={refreshing}>{refreshing ? 'Checking…' : state.kind === 'loading' ? 'Refresh' : 'Retry / Refresh'}</button>
      </div>
    </details>
  );
}
