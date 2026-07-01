// Deleted features are unreachable AND physically removed from shipped code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function collectShipped(dir, out = []) {
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    const s = await stat(p);
    if (s.isDirectory()) await collectShipped(p, out);
    else if (/\.(js|css|html|webmanifest)$/.test(name)) out.push(p);
  }
  return out;
}

const FORBIDDEN = [
  /bankroll/i, /wallet/i, /\bbets?\b/i, /betting/i, /\bodds\b/i, /bet.?slip/i,
  /cash.?out/i, /payout/i, /pick.?em/i, /leaderboard/i, /social/i, /ticket/i,
  /supabase/i, /startViewTransition/, /theoddsapi/i, /open-meteo/i, /wikipedia/i,
];

test('shipped app code contains no betting, social, or legacy-transition surfaces', async () => {
  const files = [
    join(root, 'index.html'), join(root, 'sw.js'), join(root, 'manifest.webmanifest'),
    ...(await collectShipped(join(root, 'src'))),
    ...(await collectShipped(join(root, 'api'))),
  ];
  assert.ok(files.length >= 25, 'expected the full module tree, got ' + files.length);
  for (const f of files) {
    const text = await readFile(f, 'utf8');
    for (const re of FORBIDDEN) {
      assert.ok(!re.test(text), `${f} matches forbidden pattern ${re}`);
    }
  }
});

test('legacy routes and dead files are physically gone', async () => {
  const gone = [
    'api/odds.js', 'api/scorers.js', 'api/matchstats.js', 'api/matchday.js',
    'api/rapid.js', 'api/diag.js', 'api/officialR32Fixtures.js',
    'SUPABASE_leaderboard_fix.sql', 'deploy.command',
    'tests/ticket-simulation-engine.test.js', 'e2e/matchup-explorer.spec.js',
  ];
  for (const rel of gone) {
    await assert.rejects(stat(join(root, rel)), undefined, rel + ' must not exist');
  }
});

test('the monolith is actually gone: index.html is a slim module shell', async () => {
  const html = await readFile(join(root, 'index.html'), 'utf8');
  assert.ok(html.length < 5000, 'index.html is ' + html.length + ' bytes — must stay a shell');
  assert.ok(html.includes('src/app.js'));
});
