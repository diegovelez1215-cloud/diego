import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TEST_PATTERN = /\.test\.(js|mjs)$/;

export function discoverLogicTests(rootDir = process.cwd()) {
  return readdirSync(path.join(rootDir, 'tests'))
    .filter((name) => TEST_PATTERN.test(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => `tests/${name}`);
}

export function excludeLogicTests(files, excludes = []) {
  const excluded = new Set(excludes.filter(Boolean));
  return files.filter((file) => !excluded.has(file));
}

export function planLogicShard(files, shardIndex, shardTotal) {
  const index = Number(shardIndex);
  const total = Number(shardTotal);
  if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1 || index < 1 || index > total) {
    throw new Error(`Invalid logic shard ${shardIndex}/${shardTotal}`);
  }
  return files.filter((_, i) => (i % total) === (index - 1));
}

function durationSeconds(startedAt) {
  return ((Date.now() - startedAt) / 1000).toFixed(1);
}

async function runFile(file) {
  const startedAt = Date.now();
  console.log(`::logic-file start ${file}`);
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['--test', file], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    });
    child.on('close', (status, signal) => {
      if (signal) resolve(128);
      else resolve(status ?? 1);
    });
  });
  console.log(`::logic-file end ${file} code=${code} duration=${durationSeconds(startedAt)}s`);
  return code;
}

export async function runLogicShard(options = {}) {
  const discovered = discoverLogicTests(options.rootDir || process.cwd());
  const excludes = options.excludes || String(process.env.LOGIC_EXCLUDE_FILES || '').split(',').map((value) => value.trim());
  const files = excludeLogicTests(discovered, excludes);
  const shardTotal = options.shardTotal || process.env.LOGIC_SHARD_TOTAL || 1;
  const shardIndex = options.shardIndex || process.env.LOGIC_SHARD_INDEX || 1;
  const selected = planLogicShard(files, shardIndex, shardTotal);

  console.log(`::logic-shard ${shardIndex}/${shardTotal} files=${selected.length} total=${files.length} discovered=${discovered.length}`);
  excludes.filter(Boolean).forEach((file) => console.log(`::logic-shard-excluded ${file}`));
  selected.forEach((file) => console.log(`::logic-shard-file ${file}`));
  if (!selected.length) throw new Error(`Logic shard ${shardIndex}/${shardTotal} selected no test files`);

  for (const file of selected) {
    const code = await runFile(file);
    if (code !== 0) return code;
  }
  return 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  runLogicShard()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error && error.stack ? error.stack : error);
      process.exit(1);
    });
}
