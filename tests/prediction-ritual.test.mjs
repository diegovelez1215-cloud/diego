// Prediction Run ritual: the only lock is the real kickoff, and no lock
// jargon survives in the Play surface copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { setClock } from '../src/core/time.js';
import { pickLockedAtKickoff } from '../src/views/play.js';
import { allFixtures } from '../src/core/canonical-truth.js';

test('a pick locks exactly at the official kickoff instant, not before', () => {
  const fx = allFixtures().find((f) => f.id === 1);
  setClock(() => fx.epoch - 1000);
  assert.equal(pickLockedAtKickoff(1), false, 'one second before kickoff: still editable');
  setClock(() => fx.epoch);
  assert.equal(pickLockedAtKickoff(1), true, 'at kickoff: locked');
  setClock(() => fx.epoch + 1000);
  assert.equal(pickLockedAtKickoff(1), true, 'after kickoff: locked');
  setClock(null);
});

test('"Hunch Call Lock" wording is gone from the Play surface', async () => {
  const src = await readFile(new URL('../src/views/play.js', import.meta.url), 'utf8');
  assert.ok(!/['"]Hunch['"]/.test(src), 'no Hunch label');
  assert.ok(!/CONF\s*=\s*{[^}]*Lock/.test(src), 'no Lock confidence label');
  assert.ok(/Locked at kickoff/i.test(src), 'the only lock is the real kickoff');
  assert.ok(/Confirm call/i.test(src), 'confirm-once ritual present');
});
