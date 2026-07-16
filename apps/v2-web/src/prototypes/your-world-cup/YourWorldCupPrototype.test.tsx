import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { TOURNAMENT_STORAGE_KEY } from './campaign/tournament';

let root: Root | undefined; let container: HTMLDivElement | undefined;
async function renderPrototype() {
  window.history.replaceState({}, '', '/v2/your-world-cup-prototype');
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => { root?.render(<App />); await import('./YourWorldCupPrototype'); await Promise.resolve(); await Promise.resolve(); });
  return container;
}
function button(label: string) { return [...(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((candidate) => candidate.textContent?.toLowerCase().includes(label.toLowerCase())); }

beforeEach(() => { window.localStorage.clear(); });
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); root = undefined; container = undefined; window.localStorage.clear(); vi.restoreAllMocks(); });

describe('Your World Cup campaign route', () => {
  it('direct-loads an isolated fictional campaign without the existing V2 shell', async () => {
    const app = await renderPrototype();
    expect(app.querySelector('[data-screen="opening"]')).toBeTruthy();
    expect(app.textContent).toContain('SIMULATED PERSONAL TOURNAMENT');
    expect(app.querySelector('.v2-app')).toBeNull(); expect(app.querySelector('.v2-primary-nav')).toBeNull();
    expect(document.title).toBe('Your World Cup — United 26');
  });

  it('chooses a nation, prints a complete fictional draw, persists only the campaign, and opens tactics', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem'); await renderPrototype();
    await act(async () => button('start new campaign')?.click());
    expect(container?.querySelector('[data-screen="nation"]')).toBeTruthy();
    expect(container?.querySelectorAll('.ywc-nation-sticker')).toHaveLength(48);
    await act(async () => container?.querySelector<HTMLButtonElement>('button[aria-pressed="false"]')?.click());
    expect(container?.querySelector('[data-screen="draw"]')).toBeTruthy();
    expect(container?.querySelectorAll('.ywc-draw-sticker')).toHaveLength(4);
    await act(async () => button('enter campaign')?.click());
    expect(container?.querySelector('[data-screen="campaign"]')).toBeTruthy();
    await act(async () => button('prepare')?.click());
    expect(container?.querySelector('[data-screen="tactics"]')).toBeTruthy();
    expect(new Set(setItem.mock.calls.map(([key]) => key))).toEqual(new Set([TOURNAMENT_STORAGE_KEY]));
    expect(window.localStorage.getItem('u26v2.auth')).toBeNull(); expect(window.localStorage.getItem('u26v2.predictions.local')).toBeNull();
  });

  it('restores a persisted campaign to its wall and can create a clean new campaign', async () => {
    window.localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify({ version: 4, id: 'your-world-cup-1', seed: 1, nation: 'arg', tactics: { shape: '4-3-3-wide', press: 'balanced', finalThird: 'wings' }, screen: 'wall', groups: { A: ['arg', 'nga', 'pol', 'nzl'], B: ['mex', 'jpn', 'bra', 'can'], C: ['usa', 'fra', 'esp', 'ger'], D: ['eng', 'ita', 'por', 'ned'], E: ['bel', 'cro', 'uru', 'col'], F: ['ecu', 'chi', 'per', 'par'], G: ['mar', 'sen', 'egy', 'gha'], H: ['cmr', 'kor', 'aus', 'ksa'], I: ['irn', 'qat', 'crc', 'pan'], J: ['jam', 'hon', 'sui', 'den'], K: ['srb', 'tur', 'ukr', 'aut'], L: ['cze', 'nor', 'alg', 'tun'] }, fixtures: [], activeFixtureId: null, stage: 'groups', history: [], trophy: false, eliminated: false }));
    await renderPrototype(); expect(container?.querySelector('[data-screen="campaign"]')).toBeTruthy();
    await act(async () => button('new campaign')?.click()); expect(container?.querySelector('[data-screen="opening"]')).toBeTruthy(); expect(window.localStorage.getItem(TOURNAMENT_STORAGE_KEY)).toBeNull();
  });
});
