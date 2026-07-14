import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

let root: Root | undefined;
let container: HTMLDivElement | undefined;

async function renderAt(path: string) {
  window.history.replaceState({}, '', path);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<App />);
    await Promise.resolve();
  });
  return container;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  window.localStorage.clear();
  vi.useRealTimers();
});

describe('United 2026 V2 product routes', () => {
  it.each([
    ['/v2/', 'Matchday'],
    ['/v2/tournament', 'Tournament'],
    ['/v2/play', 'Play'],
    ['/v2/you', 'You'],
  ])('renders one route-specific h1 at %s', async (path, title) => {
    const app = await renderAt(path);
    expect(app.querySelectorAll('h1')).toHaveLength(1);
    expect(app.querySelector('h1')?.textContent).toBe(title);
    expect(app.querySelector('main')?.textContent?.trim().length).toBeGreaterThan(100);
    expect(document.title).toBe(`${title} — United 2026`);
  });

  it('changes URL and selected accessible state through primary navigation', async () => {
    const app = await renderAt('/v2/');
    const play = [...app.querySelectorAll<HTMLAnchorElement>('.v2-nav-link')].find((link) => link.textContent === 'Play');
    expect(play).toBeTruthy();
    await act(async () => play?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })));
    expect(window.location.pathname).toBe('/v2/play');
    expect(play?.getAttribute('aria-current')).toBe('page');
    expect(app.querySelectorAll('.v2-nav-link[aria-current="page"]')).toHaveLength(1);
    expect(app.querySelector('h1')?.textContent).toBe('Play');
  });

  it('keeps match detail outside the four primary selected destinations', async () => {
    const app = await renderAt('/v2/match/1');
    expect(app.querySelector('h1')?.textContent).toBe('Match detail');
    expect(app.textContent).toContain('Mexico');
    expect(app.textContent).toContain('South Africa');
    expect(app.querySelectorAll('.v2-nav-link')).toHaveLength(4);
    expect(app.querySelectorAll('.v2-nav-link[aria-current="page"]')).toHaveLength(0);
  });

  it('returns safely when browser history changes', async () => {
    const app = await renderAt('/v2/match/1');
    window.history.replaceState({}, '', '/v2/');
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(app.querySelector('h1')?.textContent).toBe('Matchday');
  });

  it('renders bridge-derived Tournament facts without official results', async () => {
    const app = await renderAt('/v2/tournament');
    expect(app.textContent).toContain('104');
    expect(app.querySelectorAll('.v2-group-table')).toHaveLength(12);
    expect(app.textContent).toContain('104 matches · 16 venues · 3 hosts');
    expect(app.querySelectorAll('.v2-phase-tracker [data-state="future"]')).toHaveLength(6);
  });

  it('makes Predictions a real local entry point and shows only real local counts', async () => {
    const app = await renderAt('/v2/play');
    expect(app.textContent).toContain('In development');
    expect(app.textContent).toContain('Predictions are local to this device.');
    const predictions = [...app.querySelectorAll<HTMLAnchorElement>('a')].find((link) => link.textContent?.includes('Predictions'));
    expect(predictions?.textContent).toContain('eligible');
    await act(async () => predictions?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })));
    expect(window.location.pathname).toBe('/v2/predictions');
    expect(app.querySelector('h1')?.textContent).toBe('Predictions');
    expect(app.querySelector('.v2-play time')).toBeNull();
    expect(app.querySelector('[data-rank], [role="timer"], [data-score]')).toBeNull();
    expect(app.textContent).not.toMatch(/streak|reward|leaderboard|rank/i);
  });

  it('keeps You local and shows an honest prediction empty state', async () => {
    const app = await renderAt('/v2/you');
    expect(app.textContent).toContain('These predictions stay on this device.');
    expect(app.textContent).toContain('No predictions yet.');
    expect(app.querySelector('[data-username], [data-level], [data-rank], [data-trophy]')).toBeNull();
    expect(app.textContent).not.toMatch(/#\d+|level \d+|\d+[- ]day streak/i);
  });

  it('shows only local prediction history in You', async () => {
    window.localStorage.setItem('u26v2.predictions.local', JSON.stringify({
      version: 1,
      records: [{ fixtureId: 2, outcome: 'away', confidence: 2, confirmedAt: '2026-06-10T12:00:00.000Z', kickoffEpoch: 1781229600000 }],
    }));
    const app = await renderAt('/v2/you');
    expect(app.textContent).toContain('Korea Republic v Czechia');
    expect(app.textContent).toContain('Pending grade');
    expect(app.textContent).toContain('Device-local');
  });

  it('direct-loads canonical prediction detail and preserves browser back navigation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T12:00:00-04:00'));
    const app = await renderAt('/v2/predictions/1');
    expect(app.textContent).toContain('Mexico');
    expect(app.textContent).toContain('Choose a result');
    window.history.replaceState({}, '', '/v2/predictions');
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(app.querySelector('h1')?.textContent).toBe('Predictions');
  });

  it('shows unresolved canonical fixtures without impossible outcome controls', async () => {
    const app = await renderAt('/v2/predictions/73');
    expect(app.textContent).toContain('Participants are unresolved');
    expect(app.querySelectorAll('input[name="outcome"]')).toHaveLength(0);
  });

  it('renders a useful fixture-not-found route with one h1', async () => {
    const app = await renderAt('/v2/match/99999');
    expect(app.querySelectorAll('h1')).toHaveLength(1);
    expect(app.querySelector('h1')?.textContent).toContain('not in the canonical registry');
    expect(app.textContent).toContain('View Matchday');
  });

  it('renders a useful unknown-route state with one h1', async () => {
    const app = await renderAt('/v2/missing');
    expect(app.querySelectorAll('h1')).toHaveLength(1);
    expect(app.querySelector('h1')?.textContent).toBe('This destination is off the ledger.');
    expect(app.textContent).toContain('Return to Matchday');
  });
});
