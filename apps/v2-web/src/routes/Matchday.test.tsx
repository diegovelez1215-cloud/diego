import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalTournamentSnapshot } from '../domain/tournament-bridge';
import type { SnapshotState } from '../data/snapshot-state';
import { MatchdayRoute } from './Matchday';

let root: Root | undefined;
let container: HTMLDivElement | undefined;

async function render(state: SnapshotState, refresh = vi.fn(async () => {})) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(<MatchdayRoute snapshotState={state} refreshing={false} onRefresh={refresh} onNavigate={() => {}} />));
  return { app: container, refresh };
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe('V2 Matchday states', () => {
  it('renders a non-blank loading state', async () => {
    const { app } = await render({ kind: 'loading' });
    expect(app.textContent).toContain('Loading the validated official match snapshot.');
    expect(app.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(app.querySelector('.v2-focus-stage')).toBeTruthy();
  });

  it('renders unavailable honestly and exposes retry', async () => {
    const { app, refresh } = await render({ kind: 'unavailable', snapshot: canonicalTournamentSnapshot() });
    expect(app.textContent).toContain('Official score data is unavailable. The canonical schedule remains visible.');
    const retry = [...app.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Refresh');
    await act(async () => retry?.click());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not invent offline or live state after a request error', async () => {
    const { app } = await render({ kind: 'error', reason: 'request-error' });
    expect(app.textContent).toContain('The official request did not complete; match status is not asserted.');
    expect(app.textContent).not.toMatch(/offline|LIVE ·/i);
  });

  it('labels retained verified content stale', async () => {
    const { app } = await render({ kind: 'stale', snapshot: canonicalTournamentSnapshot(), reason: 'request-error' });
    expect(app.textContent).toContain('Showing the last verified snapshot');
  });
});
