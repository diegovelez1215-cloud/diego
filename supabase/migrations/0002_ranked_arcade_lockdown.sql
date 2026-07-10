-- United 2026 — fail-closed ranked Arcade + explicit Data API grants.
--
-- Prepared locally only. Do not apply to production without direct approval.
-- Official Picks remain global and server-settled. Browser-computed Arcade
-- scores are disabled until a server owns signed challenges and replays the
-- versioned event log.

begin;

-- Supabase's 2026 Data API permission change makes privileges explicit.
-- RLS still decides which authenticated rows are visible/writable; GRANT is
-- the separate table-level permission required before RLS is evaluated.
revoke all on table public.fixtures, public.profiles, public.picks,
  public.results, public.arcade_scores from anon;

grant select on table public.fixtures, public.profiles, public.results to authenticated;
grant select, insert, update on table public.picks, public.profiles to authenticated;

-- The insecure Arcade path is locked at both policy and privilege layers.
drop policy if exists "arcade readable by signed-in users" on public.arcade_scores;
drop policy if exists "insert own arcade score" on public.arcade_scores;
drop policy if exists "update own arcade score" on public.arcade_scores;
revoke all on table public.arcade_scores from authenticated;
revoke all on table public.arcade_ladder_v2 from anon, authenticated;

-- The Picks view exposes only derived, post-settlement aggregates. Raw picks
-- remain protected by their own RLS policies and are never granted to anon.
revoke all on table public.leaderboard_v2 from anon;
grant select on table public.leaderboard_v2 to authenticated;

-- Defensive search path for the trigger function used by profile writes.
alter function public.set_updated_at() set search_path = public, pg_temp;

commit;
