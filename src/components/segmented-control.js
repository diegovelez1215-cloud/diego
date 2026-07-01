// United 2026 — liquid-glass segmented control. Interaction glass only:
// crisp, tactile, 44px targets, honest focus states.

import { esc } from './match-row.js';

export function segmentedControl({ id, options, value, label }) {
  return `<div class="segmented" role="tablist" aria-label="${esc(label)}" data-segmented="${esc(id)}">
    ${options.map((o) => `
      <button class="seg-btn${o.value === value ? ' active' : ''}" role="tab"
              aria-selected="${o.value === value}" data-value="${esc(o.value)}">${esc(o.label)}</button>`).join('')}
  </div>`;
}
