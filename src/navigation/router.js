// United 2026 — router with persistent outlets.
// The shell and bottom dock are created once. Each tab owns a persistent
// outlet that keeps its last rendered content. A normal tab tap:
//   • returns immediately (synchronous class flip)
//   • never fetches, never writes storage, never starts a view transition
//   • never shows a blank screen — outlets are seeded with a non-empty shell
// Stale content refreshes through the rAF scheduler AFTER the tap completes.

import { getState, setTab, subscribe } from '../core/app-state.js';
import { schedule } from './render-scheduler.js';

export const TABS = [
  { id: 'home', label: 'World Cup', icon: '✦' },
  { id: 'tournament', label: 'Tournament', icon: '◈' },
  { id: 'play', label: 'Play', icon: '▸' },
  { id: 'you', label: 'You', icon: '●' },
];

const outlets = new Map();
const views = new Map();          // id -> { render(outlet), seedHTML }
const renderedVersion = new Map(); // id -> version key last painted

let versionKeyFn = () => '0';

export function registerView(id, view) { views.set(id, view); }
export function setVersionKey(fn) { versionKeyFn = fn; }
export function outletFor(id) { return outlets.get(id) || null; }

export function init(root) {
  const shell = document.createElement('div');
  shell.className = 'app-shell';
  shell.innerHTML = `
    <main class="outlets" id="outlets"></main>
    <nav class="dock" role="tablist" aria-label="United 2026">
      ${TABS.map((t) => `
        <button class="dock-tab" role="tab" id="tab-${t.id}" data-tab="${t.id}"
                aria-selected="${t.id === 'home'}" aria-controls="outlet-${t.id}">
          <span class="dock-icon" aria-hidden="true">${t.icon}</span>
          <span class="dock-label">${t.label}</span>
        </button>`).join('')}
    </nav>`;
  root.appendChild(shell);

  const main = shell.querySelector('#outlets');
  for (const t of TABS) {
    const el = document.createElement('section');
    el.className = 'outlet' + (t.id === 'home' ? ' active' : '');
    el.id = 'outlet-' + t.id;
    el.dataset.tab = t.id;
    el.setAttribute('role', 'tabpanel');
    el.setAttribute('aria-labelledby', 'tab-' + t.id);
    const view = views.get(t.id);
    el.innerHTML = (view && view.seedHTML) || '<div class="view-shell"></div>';
    main.appendChild(el);
    outlets.set(t.id, el);
  }

  shell.querySelector('.dock').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (btn) activate(btn.dataset.tab);
  });

  // Re-render only the views whose data changed, and only via rAF.
  subscribe((tags) => {
    if (tags.includes('real')) {
      // Canonical/overlay updates invalidate only the views that read them.
      // 'you' reads the overlay too: official settlement of Picks League calls.
      for (const id of ['home', 'tournament', 'play', 'you']) markStale(id);
    }
    if (tags.includes('tournament')) markStale('tournament');
    if (tags.includes('play')) markStale('play');
    if (tags.includes('sims') || tags.includes('you') || tags.includes('prefs')) markStale('you');
  });

  paint(getState().nav.tab, true);
}

function markStale(id) {
  renderedVersion.delete(id);
  if (getState().nav.tab === id) schedule('view:' + id, () => paint(id));
}

/**
 * Re-tapping the tab you are already on returns that tab's vertical scroll
 * to the top — the native iPhone gesture. It must never reset state: no
 * setTab, no repaint, no touching Tournament subsections, Bracket position
 * (horizontal scrollers are left alone), Play mode, or simulation state.
 */
export function scrollActiveToTop() {
  const reduced = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
    try { window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); } catch { window.scrollTo(0, 0); }
  }
}

/**
 * Normal tab activation. Synchronous, storage-free, fetch-free,
 * transition-free. Prior content stays visible in the target outlet until a
 * queued repaint (if any) lands in the next frame.
 */
export function activate(id) {
  if (!outlets.has(id)) return;
  if (getState().nav.tab === id) { scrollActiveToTop(); return; }
  setTab(id);
  for (const [tid, el] of outlets) el.classList.toggle('active', tid === id);
  document.querySelectorAll('.dock-tab').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.tab === id));
  });
  const key = versionKeyFn(id);
  if (renderedVersion.get(id) !== key) schedule('view:' + id, () => paint(id));
}

function paint(id, force) {
  const view = views.get(id);
  const outlet = outlets.get(id);
  if (!view || !outlet) return;
  const key = versionKeyFn(id);
  if (!force && renderedVersion.get(id) === key) return;
  view.render(outlet);
  renderedVersion.set(id, key);
}

/** Immediate repaint of the active view (used after overlay refresh on boot). */
export function repaintActive() {
  schedule('view:' + getState().nav.tab, () => paint(getState().nav.tab, true));
}
