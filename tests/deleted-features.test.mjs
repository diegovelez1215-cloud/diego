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

// Money mechanics stay banned everywhere, permanently — and so is the whole
// private-league concept (rooms, invite codes, legacy score columns). The
// leaderboard is one GLOBAL authenticated competition.
const FORBIDDEN = [
  /wallet/i, /\bbets?\b/i, /betting/i, /\bodds\b/i, /bet.?slip/i,
  /cash.?out/i, /payout/i, /pick.?em/i, /ticket/i, /deposit/i, /withdraw/i,
  /startViewTransition/, /theoddsapi/i, /open-meteo/i, /wikipedia/i,
  /bankroll/i, /invite.?only/i, /room.?code/i, /league.?code/i, /picks-league/,
];
// Supabase exists only inside the two sanctioned modules: the browser
// leaderboard client (anon key, RLS-bounded) and the server settlement route
// (service-role env vars, never a literal credential).
const BOARD_CLIENT = join(root, 'src', 'core', 'leaderboard.js');
const SETTLE_ROUTE = join(root, 'api', 'settle.js');
const SANCTIONED_SUPABASE = new Set([BOARD_CLIENT, SETTLE_ROUTE]);

test('shipped app code contains no betting, private-league, or legacy-transition surfaces', async () => {
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
    if (!SANCTIONED_SUPABASE.has(f)) {
      assert.ok(!/supabase/i.test(text), `${f} must not reach the leaderboard backend directly`);
    }
    if (!SANCTIONED_SUPABASE.has(f)) {
      // outside the two sanctioned modules nothing may even mention the
      // service role (the client mentions it only to document its absence)
      assert.ok(!/service.?role/i.test(text), `${f} must not reference the service role`);
    }
    // A service-role JWT must never ship anywhere, ever.
    // (Supabase JWTs carry the role in their base64 payload: "service_role".)
    assert.ok(!/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*c2VydmljZV9yb2xl/.test(text), `${f} must not embed a service-role JWT`);
  }
  // the browser client itself: anon usage only, no service-role credential
  const client = await readFile(BOARD_CLIENT, 'utf8');
  assert.ok(/anon/i.test(client), 'leaderboard client documents anon-key usage');
  assert.ok(!/service.?role.{0,40}=.{0,10}eyJ/i.test(client), 'no service-role credential in the browser client');
  assert.ok(!/SUPABASE_SERVICE_ROLE_KEY/.test(client), 'browser client never reads the service-role env var');
  // the server route reads the service-role key ONLY from env
  const settle = await readFile(SETTLE_ROUTE, 'utf8');
  assert.ok(/process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(settle), 'service role comes from server env');
  assert.ok(!/SUPABASE_SERVICE_ROLE_KEY\s*=/.test(settle), 'no hardcoded service-role value');
});

test('the private Picks League is gone: no rooms, no invite codes, no legacy client', async () => {
  await assert.rejects(stat(join(root, 'src', 'core', 'picks-league.js')), undefined,
    'picks-league.js must not exist');
  await assert.rejects(stat(join(root, 'docs', 'PICKS_LEAGUE.md')), undefined,
    'PICKS_LEAGUE.md must not exist');
  const you = await readFile(join(root, 'src', 'views', 'you.js'), 'utf8');
  assert.ok(!/makeRoomCode|validRoomCode|postedName|roomOf/.test(you), 'no room plumbing in You');
  assert.ok(!/Start a new league|Join league/.test(you), 'no private-league UI copy');
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
