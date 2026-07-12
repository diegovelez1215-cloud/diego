import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
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
    expect(app.textContent).toContain('12');
    expect(app.textContent).toContain('32');
    expect(app.textContent).toContain('Canonical competition map active');
  });

  it('keeps Play an honest non-playable shell', async () => {
    const app = await renderAt('/v2/play');
    expect(app.textContent).toContain('Concept preview · Not playable');
    expect(app.textContent).toContain('No imitation gameplay');
    expect(app.querySelector('.v2-play time')).toBeNull();
    expect(app.querySelector('[data-rank], [role="timer"], [data-score]')).toBeNull();
    expect([...app.querySelectorAll('button')].filter((button) => !button.closest('nav'))).toHaveLength(0);
  });

  it('keeps You free of invented identity or competitive records', async () => {
    const app = await renderAt('/v2/you');
    expect(app.textContent).toContain('No player is signed in');
    expect(app.querySelector('[data-username], [data-level], [data-rank], [data-trophy]')).toBeNull();
    expect(app.textContent).not.toMatch(/#\d+|level \d+|\d+[- ]day streak/i);
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
