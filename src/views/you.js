// United 2026 — You. Quiet, collected, museum-like. Saved simulations,
// simulation history, and small preferences. Nothing communal, nothing ranked.

import { getState, setPrefs, setSims } from '../core/app-state.js';
import { savePrefs, saveSims } from '../core/persistence.js';
import { teamFlag } from '../core/canonical-truth.js';
import { esc } from '../components/match-row.js';

export const seedHTML = `<div class="view you-view">
  <header class="view-head"><h1>You</h1><p class="view-sub">Saved simulations · preferences</p></header>
  <div class="view-shell-note"></div>
</div>`;

function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function render(outlet) {
  const { sims, prefs, play } = getState();
  const saved = sims.saved || [];
  const history = (play.myWorldCup && play.myWorldCup.log) || [];
  outlet.innerHTML = `<div class="view you-view">
    <header class="view-head"><h1>You</h1></header>
    <section class="you-card" aria-label="Saved simulations">
      <h2>Saved simulations</h2>
      ${saved.length ? saved.map((s) => `
        <div class="you-sim">
          <span class="you-sim-flag" aria-hidden="true">${teamFlag(s.champion)}</span>
          <span class="you-sim-name">${esc(s.championName)}</span>
          <span class="you-sim-meta">${esc(fmtDate(s.at))} · ${s.rounds} rounds</span>
          <button class="you-del" data-del="${esc(s.id)}" aria-label="Delete simulation ${esc(s.championName)}">Remove</button>
        </div>`).join('')
    : '<p class="empty-line grug-line">no timelines archived yet. the multiverse is patient.</p>'}
    </section>
    <section class="you-card" aria-label="Simulation history">
      <h2>Current run</h2>
      ${history.length
    ? `<p class="you-history">${history.length} simulated ${history.length === 1 ? 'round' : 'rounds'} in progress on the Play tab.</p>`
    : '<p class="empty-line">No simulation in progress.</p>'}
    </section>
    <section class="you-card" aria-label="Preferences">
      <h2>Preferences</h2>
      <div class="you-pref">
        <span id="pref-theme-label">Appearance</span>
        <div class="segmented small" role="tablist" aria-labelledby="pref-theme-label" data-segmented="theme">
          ${['auto', 'dark', 'light'].map((v) => `
            <button class="seg-btn${(prefs.theme || 'auto') === v ? ' active' : ''}" role="tab"
              aria-selected="${(prefs.theme || 'auto') === v}" data-value="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}
        </div>
      </div>
    </section>
  </div>`;
  outlet.querySelectorAll('[data-del]').forEach((el) => {
    el.addEventListener('click', () => {
      const next = { saved: (getState().sims.saved || []).filter((s) => s.id !== el.dataset.del) };
      setSims(next); saveSims(next);
    });
  });
  outlet.querySelector('[data-segmented="theme"]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-value]');
    if (!btn) return;
    setPrefs({ theme: btn.dataset.value });
    savePrefs(getState().prefs);
    document.documentElement.dataset.theme = btn.dataset.value;
  });
}
