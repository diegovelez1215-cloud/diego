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

// Money mechanics stay banned everywhere, permanently. The Picks League is a
// points scoreboard, so nothing below may reappear even though the shared
// Supabase backend is restored.
const FORBIDDEN = [
  /wallet/i, /\bbets?\b/i, /betting/i, /\bodds\b/i, /bet.?slip/i,
  /cash.?out/i, /payout/i, /pick.?em/i, /ticket/i, /deposit/i, /withdraw/i,
  /startViewTransition/, /theoddsapi/i, /open-meteo/i, /wikipedia/i,
];
// `bankroll` is a legacy COLUMN NAME in the restored scores table; the only
// file allowed to mention it (to map it to League Points) is the league
// client. Supabase likewise exists only inside that one sanctioned module.
const LEAGUE_CLIENT = join(root, 'src', 'core', 'picks-league.js');
const LEAGUE_ONLY = [/bankroll/i, /supabase/i];

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
    if (f !== LEAGUE_CLIENT) {
      for (const re of LEAGUE_ONLY) {
        assert.ok(!re.test(text), `${f} matches league-client-only pattern ${re}`);
      }
      // outside the league client nothing may even mention the service role
      assert.ok(!/service.?role/i.test(text), `${f} must not reference the service role`);
    }
    // A service-role JWT must never ship to browsers, anywhere, ever.
    // (Supabase JWTs carry the role in their base64 payload: "service_role".)
    assert.ok(!/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*c2VydmljZV9yb2xl/.test(text), `${f} must not embed a service-role JWT`);
  }
  // the league client itself: anon usage only
  const league = await readFile(LEAGUE_CLIENT, 'utf8');
  assert.ok(/anon/i.test(league), 'league client documents anon-key usage');
  assert.ok(!/service.?role.{0,40}=.{0,10}eyJ/i.test(league), 'no service-role credential in league client');
});

test('legacy routes and dead files are physically gone', async () => {
  const gone = [
    'api/odds.js', 'api/matchstats.js', 'api/matchday.js',
    'api/rapid.js', 'api/diag.js', 'api/officialR32Fixtures.js',
    'SUPABASE_leaderboard_fix.sql', 'deploy.command',
    'tests/ticket-simulation-engine.test.js', 'e2e/matchup-explorer.spec.js',
  ];
  for (const rel of gone) {
    await assert.rejects(stat(join(root, rel)), undefined, rel + ' must not exist');
  }
});

test('verified scorer route has no built-in player leaders', async () => {
  const text = await readFile(join(root, 'api/scorers.js'), 'utf8');
  assert.ok(text.includes('FOOTBALL_DATA_KEY'));
  assert.ok(text.includes('/competitions/WC/scorers'));
  assert.ok(!/REALGOALS|REALASSISTS|Mbapp|Messi|Ronaldo/i.test(text));
});

test('the monolith is actually gone: index.html is a slim module shell', async () => {
  const html = await readFile(join(root, 'index.html'), 'utf8');
  assert.ok(html.length < 5000, 'index.html is ' + html.length + ' bytes — must stay a shell');
  assert.ok(html.includes('src/app.js'));
});
