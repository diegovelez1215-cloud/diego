// United 2026 — You. Quiet, collected, museum-like. Saved simulation
// timelines, Match Lab results, your prediction record, and small
// preferences. Nothing communal, nothing ranked against strangers.

import { getState, setPrefs, setSims } from '../core/app-state.js';
import { savePrefs, saveSims } from '../core/persistence.js';
import { teamFlag, teamName } from '../core/canonical-truth.js';
import { gradePredictions } from './play.js';
import { esc } from '../components/match-row.js';

export const seedHTML = `<div class="view you-view">
  <header class="view-head"><h1>You</h1><p class="view-sub">Saved simulations · record · preferences</p></header>
  <div class="view-shell-note"></div>
</div>`;

function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function render(outlet) {
  const { sims, prefs, play, real } = getState();
  const saved = sims.saved || [];
  const lab = play.labHistory || [];
  const stats = gradePredictions(play.predictions?.picks || {}, real.overlay);
  const pickCount = Object.keys(play.predictions?.picks || {}).length;
  outlet.innerHTML = `<div class="view you-view">
    <header class="view-head"><h1>You</h1></header>

    <section class="you-card" aria-label="Prediction record">
      <h2>Prediction record</h2>
      ${pickCount ? `<div class="pr-stats quiet" role="group" aria-label="Record">
        <div class="pr-stat"><strong>${stats.right}<span class="pr-of">/${stats.total}</span></strong><span>correct</span></div>
        <div class="pr-stat"><strong>${stats.insight}</strong><span>insight</span></div>
        <div class="pr-stat"><strong>${stats.streak}</strong><span>streak</span></div>
        <div class="pr-stat"><strong>${stats.best}</strong><span>best run</span></div>
      </div>
      <p class="you-history">${pickCount} ${pickCount === 1 ? 'call' : 'calls'} on the record${stats.total < pickCount ? ' · ' + (pickCount - stats.total) + ' awaiting kickoff' : ''}.</p>`
    : '<p class="empty-line">No calls yet. Prediction Run is waiting on the Play tab.</p>'}
    </section>

    <section class="you-card" aria-label="Saved simulations">
      <h2>Saved timelines</h2>
      ${saved.length ? saved.map((s) => `
        <div class="you-sim">
          <span class="you-sim-flag" aria-hidden="true">${teamFlag(s.champion)}</span>
          <span class="you-sim-name">${esc(s.championName)}</span>
          <span class="you-sim-meta">${esc(fmtDate(s.at))}${s.picks ? ' · ' + s.picks + ' hand-picked' : ''}</span>
          <button class="you-del" data-del="${esc(s.id)}" aria-label="Delete simulation ${esc(s.championName)}">Remove</button>
        </div>`).join('')
    : '<p class="empty-line grug-line">no timelines archived yet. the multiverse is patient.</p>'}
    </section>

    <section class="you-card" aria-label="Match Lab history">
      <h2>Match Lab</h2>
      ${lab.length ? lab.slice(0, 6).map((m) => `
        <div class="you-lab">
          <span class="you-lab-score">${teamFlag(m.home)} <strong>${m.gh}–${m.ga}</strong>${m.pens ? `<small> ${m.pens.ph}–${m.pens.pa}p</small>` : ''} ${teamFlag(m.away)}</span>
          <span class="you-sim-meta">${esc(teamName(m.home))} v ${esc(teamName(m.away))} · ${esc(fmtDate(m.at))}</span>
        </div>`).join('')
    : '<p class="empty-line">No lab matches yet.</p>'}
    </section>

    <section class="you-card" aria-label="Preferences">
      <h2>Preferences</h2>
      <div class="you-pref">
        <span id="pref-theme-label">Appearance</span>
        <div class="segmented small" role="tablist" aria-labelledby="pref-theme-label" data-segmented="theme">
          ${['dark', 'light'].map((v) => `
            <button class="seg-btn${(prefs.theme || 'dark') === v ? ' active' : ''}" role="tab"
              aria-selected="${(prefs.theme || 'dark') === v}" data-value="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}
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
