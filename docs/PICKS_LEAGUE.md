# Picks League — restored Supabase foundation

United 2026 originally shipped a Supabase-backed leaderboard (a `scores`
table reached over PostgREST with the project's public anon key). That
foundation was removed with the betting-era product; this restoration
brings back the *shared scoreboard* without any of the money mechanics.

## What was recovered from history

From commit `c8da840` (`SUPABASE_leaderboard_fix.sql` + the monolith client):

- Table **`scores`**: `id uuid`, `name text` (unique via `scores_name_key`),
  `bankroll numeric`, `champ text`, `roi numeric`, `created_at timestamptz`.
- RLS policies: public `select`, `insert`, and `update` (added by the fix
  script so upserts could update in place).
- Room scheme: league posts store `name` as `CODE|DisplayName`, so a private
  league is a single PostgREST prefix filter — no schema change needed.
- Upsert path: `POST /rest/v1/scores?on_conflict=name` with
  `Prefer: resolution=merge-duplicates`, plain-insert fallback.

## What the columns mean now

No money exists in the product. The legacy columns are remapped once, in
`src/core/picks-league.js` (the only file allowed to reference them):

| column     | meaning today                                  |
|------------|------------------------------------------------|
| `bankroll` | League Points (derived from official results)  |
| `roi`      | pick accuracy, %                               |
| `champ`    | the member's official champion call            |

## Truth & security posture

- The **anon key** ships in the client by design and is bounded by RLS.
  The **service-role key** appears nowhere in this repository; a release
  test (`tests/deleted-features.test.mjs`) fails the build if a
  service-role JWT or reference ever lands in shipped code.
- League Points are **derived, never incremented**: the client recomputes
  the total from validated official results every time
  (`gradePredictions` → `leaguePickPoints`). Settling the same result
  twice therefore cannot double-count — idempotence by construction.
- Standings, movement, and activity are only ever what the table and the
  local record genuinely contain. Loading, empty, offline, and sync-error
  states render truthfully and never fabricate rows.
- Picks League (official) and Arcade Ladder (Match Lab / My World Cup) are
  separate scoreboards; simulation points never post to the league.

## Known limitation (requires a migration we cannot run from the client)

The recovered schema pre-dates Supabase Auth adoption: RLS currently allows
any anon client to update any row, so "a member edits only their own row"
is enforced by the client but not yet by the database, and the browser
computes its own League Points. Closing this fully needs the following
migration (Supabase SQL editor; NOT runnable with the anon key):

```sql
-- 1) per-row ownership secret (server-generated, returned once on insert)
alter table scores add column if not exists owner_key uuid default gen_random_uuid();

-- 2) replace the open update policy with owner-scoped updates
drop policy if exists "public update" on scores;
create policy "owner update" on scores
  for update using (owner_key::text = current_setting('request.headers', true)::json->>'x-owner-key')
  with check (owner_key::text = current_setting('request.headers', true)::json->>'x-owner-key');

-- 3) (recommended) move settlement server-side: an Edge Function with the
--    service role recomputes points from the official results feed on a
--    schedule, so browsers only ever *read* settled standings.
```

Until that migration runs, the client keeps the old trust model the
original leaderboard shipped with — honest data, RLS-bounded anon writes,
no secrets in the browser.
