import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverLogicTests, excludeLogicTests, planLogicShard } from './run-logic-shard.mjs';

function assertShardsCoverExactlyOnce(files, total) {
  const shards = Array.from({ length: total }, (_, index) => planLogicShard(files, index + 1, total));
  const covered = shards.flat();
  assert.equal(new Set(covered).size, files.length, 'no test file may appear in more than one shard');
  assert.deepEqual([...covered].sort(), [...files].sort(), 'all discovered logic tests must be assigned to a shard');
  shards.forEach((shard, index) => assert.ok(shard.length > 0, `shard ${index + 1} should not be empty`));
}

test('logic shards cover every logic test exactly once', () => {
  const files = discoverLogicTests();
  assert.ok(files.length > 0, 'expected logic tests to be discovered');
  assert.ok(files.includes('tests/logic-shard-coverage.test.mjs'), 'shard coverage test must be covered by the logic gate');
  assert.ok(files.includes('tests/matchup-intelligence.test.js'), 'matchup intelligence must stay in the logic manifest');

  assertShardsCoverExactlyOnce(files, 5);

  const nonMatchupFiles = excludeLogicTests(files, ['tests/matchup-intelligence.test.js']);
  assert.equal(nonMatchupFiles.length, files.length - 1, 'only matchup intelligence should be excluded from generic CI shards');
  assertShardsCoverExactlyOnce(nonMatchupFiles, 5);
});
