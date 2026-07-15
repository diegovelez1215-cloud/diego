import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { PROTOTYPE_STORAGE_KEY } from './prototype-state';
import { CAMPAIGN_STORAGE_KEY, createCampaign, DEFAULT_TACTICS } from './campaign/contracts';

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function mockMotion(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

async function renderPrototype() {
  window.history.replaceState({}, '', '/v2/your-world-cup-prototype');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<App />);
    await Promise.resolve();
  });
  return container;
}

function button(name: string) {
  return [...(container?.querySelectorAll<HTMLButtonElement>('button') || [])].find((candidate) => candidate.textContent?.toLowerCase().includes(name.toLowerCase()));
}

beforeEach(() => {
  window.localStorage.clear();
  mockMotion(false);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Your World Cup prototype route', () => {
  it('direct-loads the isolated opening without the existing V2 shell or navigation', async () => {
    const app = await renderPrototype();
    expect(app.querySelector('[data-screen="opening"]')).toBeTruthy();
    expect(app.querySelector('h1')?.textContent).toBe('YourWorld Cup');
    expect(app.querySelector('.v2-app')).toBeNull();
    expect(app.querySelector('.v2-primary-nav')).toBeNull();
    expect(document.title).toBe('Your World Cup — United 26 Prototype');
    expect(button('continue campaign')).toBeUndefined();
    expect(app.querySelector('.ywc-opening__terrace')?.textContent).toBe('48 NATIONS · 3 HOST COUNTRIES · YOUR COLORS · YOUR NOISE · YOUR WORLD CUP');
  });

  it('supports opening, tactile selection, draw, campaign, and isolated tactics handoff', async () => {
    vi.useFakeTimers();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await renderPrototype();

    await act(async () => button('start your world cup')?.click());
    expect(container?.querySelector('[data-screen="nation"]')).toBeTruthy();
    expect(container?.querySelectorAll('.ywc-nation-sticker:disabled')).toHaveLength(5);
    expect(container?.textContent).not.toContain('Preview');
    expect(container?.querySelector('.ywc-simulation-label.is-compact')).toBeTruthy();
    const argentina = container?.querySelector<HTMLButtonElement>('button[aria-label^="Argentina, Quick combinations"]');
    expect(argentina).toBeTruthy();
    await act(async () => argentina?.click());
    expect(argentina?.getAttribute('aria-pressed')).toBe('true');

    await act(async () => button('choose argentina')?.click());
    expect(container?.querySelector('[data-screen="draw"]')).toBeTruthy();
    expect(container?.querySelector('[data-draw-complete="false"]')).toBeTruthy();
    await act(async () => vi.advanceTimersByTime(2700));
    expect(container?.querySelector('[data-draw-complete="true"]')).toBeTruthy();

    await act(async () => button('enter campaign')?.click());
    expect(container?.querySelector('[data-screen="campaign"]')).toBeTruthy();
    expect(container?.textContent).toContain('Argentina v Nigeria');
    await act(async () => button('play argentina v nigeria')?.click());
    expect(container?.querySelector('[data-screen="tactics"]')).toBeTruthy();
    expect(container?.textContent).toContain('Make the plan');

    expect(setItem.mock.calls.length).toBeGreaterThan(0);
    expect(new Set(setItem.mock.calls.map(([key]) => key))).toEqual(new Set([PROTOTYPE_STORAGE_KEY, CAMPAIGN_STORAGE_KEY]));
    expect([...new Set(Object.keys(window.localStorage))]).toEqual([PROTOTYPE_STORAGE_KEY, CAMPAIGN_STORAGE_KEY]);
    expect(window.localStorage.getItem('u26v2.auth')).toBeNull();
    expect(window.localStorage.getItem('u26v2.predictions.local')).toBeNull();
  });

  it('returns from nation selection to the opening and reveals Continue only after prototype state exists', async () => {
    await renderPrototype();
    await act(async () => button('start your world cup')?.click());
    await act(async () => button('back')?.click());
    expect(container?.querySelector('[data-screen="opening"]')).toBeTruthy();
    expect(button('continue campaign')).toBeTruthy();
  });

  it('reveals the complete group instantly in reduced motion', async () => {
    window.localStorage.setItem(PROTOTYPE_STORAGE_KEY, JSON.stringify({ version: 1, screen: 'draw', nation: 'Argentina' }));
    mockMotion(true);
    await renderPrototype();
    await act(async () => button('continue campaign')?.click());
    expect(container?.querySelector('[data-screen="draw"][data-draw-complete="true"]')).toBeTruthy();
    expect(button('enter campaign')).toBeTruthy();
    expect(button('skip draw')).toBeUndefined();
  });

  it('persists only discrete pitch decisions, restores them, and resolves direct controls', async () => {
    vi.useFakeTimers();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await renderPrototype();
    await act(async () => button('start your world cup')?.click());
    await act(async () => container?.querySelector<HTMLButtonElement>('button[aria-label^="Argentina, Quick combinations"]')?.click());
    await act(async () => button('choose argentina')?.click());
    await act(async () => button('skip draw')?.click());
    await act(async () => button('enter campaign')?.click());
    await act(async () => button('play argentina v nigeria')?.click());
    await act(async () => button('kick off')?.click());
    await act(async () => button('skip to the moment')?.click());
    expect(container?.querySelector('[data-screen="moment"]')).toBeTruthy();
    expect(container?.querySelectorAll('.ywc-player')).toHaveLength(4);
    expect(container?.querySelectorAll('.ywc-defender')).toHaveLength(3);
    expect(container?.querySelectorAll('.ywc-goal-zone')).toHaveLength(0);

    setItem.mockClear();
    await act(async () => vi.advanceTimersByTime(500));
    expect(setItem).not.toHaveBeenCalled();
    await act(async () => container?.querySelector<HTMLButtonElement>('button[aria-label^="Luna, open"]')?.click());
    const persisted = JSON.parse(window.localStorage.getItem(CAMPAIGN_STORAGE_KEY)!);
    expect(persisted.moment.events).toHaveLength(1); expect(persisted.moment.tick).toBe(1);

    await act(async () => root?.unmount());
    container?.remove(); root = undefined; container = undefined;
    await renderPrototype();
    const restored = document.body.lastElementChild as HTMLDivElement;
    expect(restored.querySelector('[data-screen="moment"]')).toBeTruthy();
    expect(restored.textContent).toContain('Ball: Luna');
    await act(async () => vi.advanceTimersByTime(300));
    await act(async () => restored.querySelector<HTMLButtonElement>('button[aria-label^="Ferreyra, open"]')?.click());
    expect(restored.querySelectorAll('.ywc-goal-zone')).toHaveLength(3);
    await act(async () => vi.advanceTimersByTime(300));
    await act(async () => restored.querySelector<HTMLButtonElement>('button[aria-label="Shoot right goal zone"]')?.click());
    expect(restored.querySelector('.ywc-moment-feedback')?.textContent).toMatch(/goal/i);
    await act(async () => vi.advanceTimersByTime(700));
    expect(restored.querySelector('[data-screen="result"]')).toBeTruthy();
  });

  it('shows a closed direct lane as a real interception and negative result', async () => {
    vi.useFakeTimers();
    const campaign = { ...createCampaign(26062026), stage: 'moment' as const, tactics: DEFAULT_TACTICS };
    window.localStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(campaign));
    await renderPrototype();
    const closed = container?.querySelector<HTMLButtonElement>('button[aria-label^="Ferreyra, lane closing"]');
    expect(closed).toBeTruthy();
    await act(async () => closed?.click());
    expect(container?.querySelector('.ywc-moment-feedback')?.textContent).toMatch(/closed|cut it out/i);
    await act(async () => vi.advanceTimersByTime(700));
    expect(container?.querySelector('[data-screen="result"]')).toBeTruthy();
    expect(button('pin it up')).toBeTruthy();
  });
});
