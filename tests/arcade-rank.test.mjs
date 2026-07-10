// The terrace ladder: one shared rank system for Play and You, derived live
// from Arcade Points. Pure progression — thresholds climb, progress stays
// honest, and the language stays a game, never money.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { arcadeRank, ARCADE_RANKS } from '../src/views/play.js';

test('thresholds climb strictly and start at zero', () => {
  assert.equal(ARCADE_RANKS[0].at, 0, 'everyone starts on the ladder');
  for (let i = 1; i < ARCADE_RANKS.length; i++) {
    assert.ok(ARCADE_RANKS[i].at > ARCADE_RANKS[i - 1].at, `tier ${i} is above tier ${i - 1}`);
  }
});

test('rank derivation is honest at the edges', () => {
  assert.equal(arcadeRank(0).name, 'Sunday League');
  assert.equal(arcadeRank(-50).name, 'Sunday League', 'negative input clamps');
  assert.equal(arcadeRank(119).tier, 0, 'one point short stays down');
  assert.equal(arcadeRank(120).tier, 1, 'the threshold itself promotes');
  const top = arcadeRank(999999);
  assert.equal(top.name, ARCADE_RANKS[ARCADE_RANKS.length - 1].name);
  assert.equal(top.next, null, 'nothing above the top');
  assert.equal(top.progress, 1);
});

test('progress is a real fraction and next.need is exact', () => {
  const r = arcadeRank(180);
  assert.equal(r.tier, 1);
  assert.ok(r.progress > 0 && r.progress < 1);
  assert.equal(r.next.need, 300 - 180);
  assert.equal(Math.round(r.progress * 180), Math.round(((180 - 120) / (300 - 120)) * 180));
});

test('one ladder everywhere: You imports the shared rank, no local copy', async () => {
  const you = await readFile(new URL('../src/views/you.js', import.meta.url), 'utf8');
  assert.match(you, /arcadeRank/, 'You uses the shared ladder');
  assert.doesNotMatch(you, /const TIERS\s*=/, 'the duplicate ladder is gone');
});

test('rank names carry no money language', () => {
  for (const { name } of ARCADE_RANKS) {
    assert.ok(!/cash|bet|stake|wager|payout|odds|deposit/i.test(name), name);
  }
});
