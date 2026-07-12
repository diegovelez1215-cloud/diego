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
  await act(async () => root?.render(<App />));
  return container;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe('United 2026 V2 foundation routes', () => {
  it.each([
    ['/v2/', 'Match ledger'],
    ['/v2/tournament', '12 group tables'],
    ['/v2/play', 'Play is being rebuilt.'],
    ['/v2/you', 'You is being rebuilt.'],
  ])('renders non-empty content at %s', async (path, title) => {
    const app = await renderAt(path);
    expect(app.textContent).toContain(title);
    expect(app.querySelector('[role="tabpanel"]')?.textContent?.trim().length).toBeGreaterThan(40);
  });

  it('changes the URL and selected accessible tab through visible navigation', async () => {
    const app = await renderAt('/v2/');
    const play = [...app.querySelectorAll<HTMLAnchorElement>('[role="tab"]')].find((tab) => tab.textContent === 'Play');
    expect(play).toBeTruthy();
    await act(async () => play?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })));
    expect(window.location.pathname).toBe('/v2/play');
    expect(play?.getAttribute('aria-selected')).toBe('true');
    expect(app.textContent).toContain('Play is being rebuilt.');
  });

  it('renders bridge-derived Matchday and Tournament content', async () => {
    const matchday = await renderAt('/v2/');
    expect(matchday.textContent).toContain('Match ledger');
    await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
    const tournament = await renderAt('/v2/tournament');
    expect(tournament.textContent).toContain('12 group tables');
    expect(tournament.textContent).toContain('32 canonical bracket matches');
  });

  it('resolves a direct canonical match route and returns safely on browser back', async () => {
    const app = await renderAt('/v2/match/1');
    expect(app.textContent).toContain('Mexico');
    expect(app.textContent).toContain('South Africa');
    window.history.replaceState({}, '', '/v2/');
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(app.textContent).toContain('Match ledger');
  });

  it('renders match detail not found for an unknown canonical fixture ID', async () => {
    const app = await renderAt('/v2/match/99999');
    expect(app.textContent).toContain('This canonical match does not exist.');
  });

  it('renders a route-level not-found state for an unknown V2 path', async () => {
    const app = await renderAt('/v2/missing');
    expect(app.textContent).toContain('That V2 destination is not here.');
    expect(app.querySelector('.v2-not-found')).toBeTruthy();
  });
});
