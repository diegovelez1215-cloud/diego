import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalTournamentSnapshot } from '../domain/tournament-bridge';
import type { TournamentSnapshot } from '../domain/contracts';
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

function snapshotWithStatus(status: TournamentSnapshot['fixtures'][number]['status']): TournamentSnapshot {
  const snapshot = canonicalTournamentSnapshot();
  return Object.freeze({
    ...snapshot,
    source: Object.freeze({ kind: 'verified' as const, fetchedAt: '2026-06-11T19:05:00.000Z' }),
    fixtures: Object.freeze(snapshot.fixtures.map((fixture) => fixture.id === 1 ? Object.freeze({ ...fixture, status }) : fixture)),
  });
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe('V2 Matchday states', () => {
  it('keeps loading non-blank and layout-stable', async () => {
    const { app } = await render({ kind: 'loading' });
    expect(app.querySelector('h1')?.textContent).toBe('Matchday');
    expect(app.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(app.querySelector('[data-state="loading"]')).toBeTruthy();
    expect(app.querySelector('.v2-match-stage')).toBeTruthy();
    expect(app.querySelector('.v2-match-ledger')).toBeTruthy();
  });

  it('distinguishes unavailable treatment and exposes retry', async () => {
    const { app, refresh } = await render({ kind: 'unavailable', snapshot: canonicalTournamentSnapshot() });
    expect(app.querySelector('[data-state="unavailable"]')).toBeTruthy();
    expect(app.textContent).toContain('No live state or score is implied');
    expect(app.querySelector('.v2-status-mark--live')).toBeNull();
    const retry = [...app.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Retry');
    await act(async () => retry?.click());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps request errors useful and distinct from unavailable', async () => {
    const { app } = await render({ kind: 'error', reason: 'request-error' });
    expect(app.querySelector('[data-state="error"]')).toBeTruthy();
    expect(app.querySelector('[data-state="unavailable"]')).toBeNull();
    expect(app.textContent).not.toMatch(/offline|LIVE/i);
    expect(app.querySelector('.v2-match-stage')).toBeTruthy();
    const stage = app.querySelector('.v2-match-stage');
    const notice = app.querySelector('[data-state="error"]');
    expect(stage && notice && !!(stage.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('labels retained verified content stale without live treatment', async () => {
    const { app } = await render({ kind: 'stale', snapshot: canonicalTournamentSnapshot(), reason: 'request-error' });
    expect(app.querySelector('[data-state="stale"]')).toBeTruthy();
    expect(app.textContent).toContain('Last verified view');
    expect(app.querySelector('.v2-status-mark--live')).toBeNull();
  });

  it('uses live treatment only for a validated live fixture', async () => {
    const live = snapshotWithStatus({ kind: 'live', minute: 63, score: { home: 1, away: 0 }, scoreState: 'available' });
    const { app } = await render({ kind: 'verified', snapshot: live });
    expect(app.querySelector('.v2-match-stage[data-status="live"]')).toBeTruthy();
    expect(app.querySelector('.v2-match-stage .v2-status-mark--live')?.textContent).toContain('63');
    expect(app.querySelector('.v2-match-stage__score')?.textContent).toBe('1–0');
  });

  it('truth-gates a validated live status whose score is unresolved', async () => {
    const pending = snapshotWithStatus({ kind: 'live', minute: 63, score: null, scoreState: 'pending' });
    const { app } = await render({ kind: 'verified', snapshot: pending });
    expect(app.querySelector('.v2-match-stage[data-status="live"]')).toBeTruthy();
    expect(app.querySelector('.v2-match-stage__score')?.textContent).toBe('VS');
    expect(app.querySelector('.v2-match-stage')?.textContent).not.toContain('1–0');
  });
});
