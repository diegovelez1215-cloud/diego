// Celebration engine: pure visual, Play-only. It must be a silent no-op
// anywhere a DOM is missing, store nothing, fetch nothing, and stay out of
// official truth. These tests pin that contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { celebrate, celebrateFrom } from '../src/components/celebrate.js';

test('celebrate is a safe no-op without a document (never throws in node)', () => {
  assert.equal(celebrate('trophy'), false);
  assert.equal(celebrate('win'), false);
  assert.equal(celebrate('seal', { x: 10, y: 10 }), false);
  assert.equal(celebrateFrom(null, 'seal'), false);
});

test('celebration module touches no storage, network, or official truth', async () => {
  const src = await readFile(new URL('../src/components/celebrate.js', import.meta.url), 'utf8');
  assert.ok(!/localStorage|sessionStorage|indexedDB/.test(src), 'no storage');
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket/.test(src), 'no network');
  assert.ok(!/canonical-truth|provider-overlay|app-state/.test(src), 'no truth imports');
  assert.match(src, /prefers-reduced-motion/, 'respects reduced motion');
});

test('every Play peak moment is wired to the engine', async () => {
  const src = await readFile(new URL('../src/views/play.js', import.meta.url), 'utf8');
  const hooks = src.match(/celebrate(?:From)?\(/g) || [];
  assert.ok(hooks.length >= 6, `rush, final minute, coach, lab, champion, and the sealed call all celebrate (found ${hooks.length})`);
});
