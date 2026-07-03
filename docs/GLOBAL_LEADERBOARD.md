# Global World Cup Leaderboard — Supabase v2

United 2026 has ONE global, live leaderboard for every authenticated player.
There are no private rooms, invite codes, or friends-only tables. The legacy
anonymous `scores` table (restored in an earlier phase) allowed any anon
client to update any row; v2 replaces that trust model entirely.

## Architecture

```
Prediction Run (browser)          Official results (Football-Data.org)
  │  pre-kickoff picks,                      │
  │  auth.uid() ownership                    ▼
  ▼                                  /api/settle (Vercel, server-only)
Supabase `picks`  ◄─── RLS ───►      validates finals through the SAME
                                     canonical pipeline the app trusts
                                     (src/core/provider-overlay.js), then
                                     upserts Supabase `results` with the
                                     service-role key
  │                                          │
  └────────────► `leaderboard_v2` view ◄─────┘
                 (points DERIVED, never stored)
                          │
                 authenticated reads only
```

## Security posture

- **Supabase Auth required.** Creating a profile, syncing picks, appearing in
  rankings, and even reading the boards all require a signed-in session
  (email OTP — a 6-digit code). Anonymous clients get nothing.
- **RLS with `auth.uid()` ownership.** Browsers can insert/update only their
  own `profiles`, `picks` (strictly before the official kickoff, enforced by
  the database against the canonical `fixtures` schedule), and
  `arcade_scores` row. No public update policies, no header-based owner keys.
- **Settlement is server-only.** The `results` table has **no** client write
  policy. Only `/api/settle` writes it, using `SUPABASE_SERVICE_ROLE_KEY`
  from Vercel env vars. That key appears nowhere in shipped client code; a
  release test fails the build if a service-role JWT ever lands in the repo.
- **Settlement is idempotent.** `/api/settle` upserts by `fixture_id` primary
  key with values derived from canonical official truth, and points are
  computed in the `leaderboard_v2` view — never incremented — so settling the
  same final twice cannot double-count a point.
- **No localStorage official truth.** The only new storage key is
  `u26v2.auth` (session credentials). Standings, fixtures, and scores are
  never persisted client-side.
- **Legacy rows are not migrated.** Anonymous `scores` rows have no reliable
  authenticated ownership mapping, so migration would fabricate identity.
  The migration locks the legacy table read-only instead.
- **Arcade is separate.** `arcade_scores` / `arcade_ladder_v2` rank the Match
  Lab & My World Cup game score globally. Nothing in the schema or client
  lets arcade points touch official Picks points, accuracy, or standings.

## Honesty rules (same as the rest of the app)

- Every leaderboard row is a real authenticated profile. Nothing fabricates
  people, points, movement, or activity.
- Rank movement compares against ranks the client genuinely observed on a
  previous successful fetch (stored in prefs), never invented.
- The header shows an honest "Updated just now / Nm ago" stamp from the real
  time of the last successful fetch. There is no fake "live" indicator.
- Loading, empty, offline, and sync-error states render truthfully.

## Points model (identical client + SQL)

Per settled official final: a correct call earns `confidence × 10` insight.
Tournament bonuses: `best streak × 20` and `exact scorelines × 15`. Accuracy
is `correct / settled`. The SQL view and the local `gradePredictions` /
`officialPickPoints` derivations agree by construction.

## One-time setup

1. **Apply the migration once** (Supabase Dashboard → SQL editor, or
   `supabase db push`): run
   `supabase/migrations/0001_global_leaderboard_v2.sql`.
2. **Enable email OTP auth** (Supabase Dashboard → Authentication →
   Sign In / Up): make sure Email provider is enabled with OTP codes
   (default). No SMTP config is required for the built-in sender, but a
   custom SMTP sender is recommended for production volume.
3. **Vercel Preview env vars** (Project → Settings → Environment Variables):
   - `FOOTBALL_DATA_KEY` — already used by `/api/results`
   - `SUPABASE_URL` — `https://<ref>.supabase.co`
   - `SUPABASE_ANON_KEY` — browser-safe public anon key
   - `SUPABASE_SERVICE_ROLE_KEY` — from Supabase → Settings → API
     (server-only; never expose)
   - `CRON_SECRET` — any long random string; Vercel Cron sends it
     automatically as `Authorization: Bearer <CRON_SECRET>`
   - `SETTLE_SECRET` — optional, for manual runs
4. **Cron.** `vercel.json` schedules `/api/settle` every 30 minutes.
   Manual settlement:
   `curl -H "Authorization: Bearer $SETTLE_SECRET" https://<app>/api/settle`
