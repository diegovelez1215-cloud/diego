import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadOfficialSnapshot, type OfficialSnapshotController, type SnapshotFetch, useOfficialSnapshot } from './official-snapshot';

const ok = { configured: true, sourceStatus: 'fresh', isStale: false, fetchedAt: '2026-06-11T19:05:00.000Z' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function payloads(results: unknown, live: unknown): SnapshotFetch {
  return vi.fn((input: RequestInfo | URL) => Promise.resolve(String(input).endsWith('/api/results') ? json(results) : json(live)));
}

const cleanLive = { ...ok, response: [], finished: [], hold: [], scheduled: [] };
const cleanResults = { ...ok, finished: [], live: [], hold: [], scheduled: [] };

describe('official snapshot boundary', () => {
  it('projects verified provider data through the typed bridge', async () => {
    const loaded = await loadOfficialSnapshot(payloads({
      ...cleanResults,
      finished: [{ home: 'Mexico', away: 'South Africa', gh: 2, ga: 0, status: 'FINISHED', utcDate: '2026-06-11T19:00:00Z' }],
    }, cleanLive));
    expect(loaded.kind).toBe('verified');
    if (loaded.kind === 'verified') expect(loaded.snapshot.fixtures.find((fixture) => fixture.id === 1)?.status).toEqual({ kind: 'final', score: { home: 2, away: 0 } });
  });

  it('never creates a fixture from mismatched provider identity', async () => {
    const loaded = await loadOfficialSnapshot(payloads({
      ...cleanResults,
      finished: [{ home: 'Atlantis', away: 'El Dorado', gh: 9, ga: 9, status: 'FINISHED', utcDate: '2026-06-11T19:00:00Z' }],
    }, cleanLive));
    expect(loaded.kind).toBe('verified');
    if (loaded.kind === 'verified') {
      expect(loaded.snapshot.fixtures).toHaveLength(104);
      expect(loaded.snapshot.rejectedProviderEntries).toBeGreaterThan(0);
      expect(loaded.snapshot.fixtures.find((fixture) => fixture.id === 1)?.status.kind).toBe('scheduled');
    }
  });

  it('suppresses an unresolved knockout score even when live provider data arrives', async () => {
    const loaded = await loadOfficialSnapshot(payloads(cleanResults, {
      ...cleanLive,
      response: [{ home: 'England', away: 'DR Congo', gh: 1, ga: 0, min: 63, status: '2H', kind: 'live', date: '2026-07-01T16:00:00Z' }],
    }));
    expect(loaded.kind).toBe('verified');
    if (loaded.kind === 'verified') expect(loaded.snapshot.fixtures.find((fixture) => fixture.id === 80)?.status).toEqual({ kind: 'live', minute: 63, score: null, scoreState: 'pending' });
  });

  it('reports stale input as unavailable unless a prior verified snapshot is retained by the route', async () => {
    const loaded = await loadOfficialSnapshot(payloads({ ...cleanResults, isStale: true }, { ...cleanLive, isStale: true }));
    expect(loaded).toMatchObject({ kind: 'unavailable', stale: true });
  });
});

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let controller: OfficialSnapshotController | undefined;

function SnapshotHarness({ fetcher }: { fetcher: SnapshotFetch }) {
  controller = useOfficialSnapshot(fetcher);
  return <output>{controller.state.kind}</output>;
}

async function mount(fetcher: SnapshotFetch) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<SnapshotHarness fetcher={fetcher} />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  controller = undefined;
});

describe('official snapshot React state', () => {
  it('retains the last verified snapshot with a stale label after a degraded refresh', async () => {
    let stale = false;
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const body = String(input).endsWith('/api/results') ? { ...cleanResults, isStale: stale } : { ...cleanLive, isStale: stale };
      return Promise.resolve(json(body));
    });
    await mount(fetcher);
    expect(controller?.state.kind).toBe('verified');
    stale = true;
    await act(async () => { await controller?.refresh(); });
    expect(controller?.state).toMatchObject({ kind: 'stale', reason: 'provider-stale' });
  });

  it('keeps a validated final projected through an unavailable refresh', async () => {
    let unavailable = false;
    const verifiedResults = {
      ...cleanResults,
      finished: [{ home: 'Mexico', away: 'South Africa', gh: 2, ga: 0, status: 'FINISHED', utcDate: '2026-06-11T19:00:00Z' }],
    };
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      if (unavailable) return Promise.resolve(json({ configured: false, finished: [], live: [], hold: [], scheduled: [], response: [] }));
      return Promise.resolve(json(String(input).endsWith('/api/results') ? verifiedResults : cleanLive));
    });
    await mount(fetcher);
    unavailable = true;
    await act(async () => { await controller?.refresh(); });
    expect(controller?.state).toMatchObject({ kind: 'stale', reason: 'provider-stale' });
    if (controller?.state.kind === 'stale') expect(controller.state.snapshot.fixtures.find((fixture) => fixture.id === 1)?.status.kind).toBe('final');
  });

  it('does not create concurrent duplicate manual refresh requests', async () => {
    const fetcher = vi.fn((input: RequestInfo | URL) => Promise.resolve(json(String(input).endsWith('/api/results') ? cleanResults : cleanLive)));
    await mount(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    let first: Promise<void> | undefined;
    let second: Promise<void> | undefined;
    await act(async () => {
      first = controller?.refresh();
      second = controller?.refresh();
      await Promise.all([first, second]);
    });
    expect(first).toBe(second);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('uses a request-error state without inventing offline or live status', async () => {
    const fetcher = vi.fn(() => Promise.reject(new Error('network failed')));
    await mount(fetcher);
    expect(controller?.state).toEqual({ kind: 'error', reason: 'request-error' });
  });
});
