// Visual grammar guardrails: official surfaces stay blue/neutral, Play stays gold,
// and red remains reserved for live or danger/card states.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildOverlay } from '../src/core/provider-overlay.js';
import { setBracketMode } from '../src/core/app-state.js';
import { renderKnockout } from '../src/views/knockout.js';
import { OK } from './mock-provider.mjs';

const realCss = readFileSync(new URL('../src/styles/real-world.css', import.meta.url), 'utf8');
const playCss = readFileSync(new URL('../src/styles/play.css', import.meta.url), 'utf8');

function cssRule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]+)\\}`).exec(css);
  assert.ok(match, `missing CSS rule for ${selector}`);
  return match[1];
}

test('official Groups third-place qualification treatment does not use Play gold', () => {
  const third = cssRule(realCss, '.q-mark.third');
  assert.match(third, /--official/);
  assert.doesNotMatch(third, /--gold|gold-ink/);
  assert.doesNotMatch(realCss, /--gold|gold-ink/, 'official stylesheet has no Play gold tokens');
});

test('official Bracket follow and pick treatments use blue or neutral styling', () => {
  const overlay = buildOverlay({ results: { ...OK, finished: [] } });
  setBracketMode('follow', 'CAN');
  try {
    const html = renderKnockout(overlay);
    assert.ok(html.includes('My Team'), 'follow mode rendered');
    assert.doesNotMatch(html, /--tc:/, 'follow affordance does not inject team-color glow');
    assert.doesNotMatch(html, /var\(--gold\)|gold-ink/);
  } finally {
    setBracketMode('full', null);
  }
  assert.doesNotMatch(cssRule(realCss, '.bk-card.pickable'), /--gold|gold-ink/);
  assert.doesNotMatch(cssRule(realCss, '.bk-state.pick'), /--gold|gold-ink/);
  assert.doesNotMatch(cssRule(realCss, '.bk-state.picked'), /--gold|gold-ink/);
  assert.match(playCss, /\.bk-scroll\.sim \.bk-card\.pickable[^}]+--gold/s, 'Play sim bracket keeps gold');
});

test('non-live Home action tile avoids live-red while actual live status stays red', () => {
  const action = cssRule(realCss, '.cc-tile.action');
  assert.match(action, /--official|--hairline/);
  assert.doesNotMatch(action, /--live/);
  assert.match(cssRule(realCss, '.match-row.is-live'), /--live/);
  assert.match(cssRule(realCss, '.bk-state.live'), /--live/);
  assert.match(cssRule(realCss, '.score-stage.live .ss-status'), /--live/);
});
