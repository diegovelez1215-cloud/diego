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
