// United 2026 — liquid-glass segmented control. Interaction glass only:
// crisp, tactile, 44px targets, honest focus states.

import { esc } from './match-row.js';

export function segmentedControl({ id, options, value, label }) {
  const hasShort = options.some((o) => o.short);
  return `<div class="segmented${hasShort ? ' has-short' : ''}" role="tablist" aria-label="${esc(label)}" data-segmented="${esc(id)}">
    ${options.map((o) => `
      <button class="seg-btn${o.value === value ? ' active' : ''}" role="tab"
              aria-selected="${o.value === value}" tabindex="${o.value === value ? '0' : '-1'}" data-value="${esc(o.value)}"${o.short ? ` aria-label="${esc(o.label)}"` : ''}>${
  o.short
    ? `<span class="seg-label-full">${esc(o.label)}</span><span class="seg-label-short" aria-hidden="true">${esc(o.short)}</span>`
    : esc(o.label)
}</button>`).join('')}
  </div>`;
}
