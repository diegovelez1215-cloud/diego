-- ============================================================
-- United 2026 · leaderboard cleanup + one-row-per-player
-- Run this ONCE in the Supabase SQL editor (your "scores" table
-- already exists — do NOT re-run the create table statement).
-- ============================================================

-- 1) Allow upserts to UPDATE an existing row (you currently only
--    have read + insert policies, so updates are blocked).
drop policy if exists "public update" on scores;
create policy "public update" on scores
  for update using (true) with check (true);

-- 2) Delete duplicate rows, keeping the NEWEST post per name.
--    (id is a uuid, not time-ordered, so we use created_at.)
delete from scores a
using scores b
where a.name = b.name
  and (a.created_at < b.created_at
       or (a.created_at = b.created_at and a.id < b.id));

-- 3) Enforce one row per name so every future post updates in
--    place instead of stacking. Idempotent — safe to re-run.
create unique index if not exists scores_name_key on scores (name);

-- ============================================================
-- 4) OPTIONAL · Phase 5A roster cleanup (permanent server-side)
-- The app already HIDES inactive/seeded rows from view via a
-- client-side active roster (Dingus, Diego, Ana). This query
-- additionally DELETES random/seeded rows from the table so they
-- are gone for good. Review the kept list first, then run.
-- Safe: it only removes rows whose visible name is NOT in the
-- active roster. It never touches Diego's local wallet/tickets/
-- picks (those live in the browser, not in this table).
-- Note: names may be stored as "LEAGUECODE|DisplayName" for
-- league posts, so we compare the part after any "|".
-- ============================================================
-- delete from scores
-- where lower(split_part(name, '|', 2)) not in ('dingus','diego','ana')
--   and lower(name) not in ('dingus','diego','ana');
