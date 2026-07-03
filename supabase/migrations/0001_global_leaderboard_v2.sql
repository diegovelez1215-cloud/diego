-- United 2026 — Global Live Leaderboard v2.
-- One global, authenticated competition. Replaces the legacy anonymous
-- `scores` table trust model with Supabase Auth + auth.uid() row ownership.
--
-- Security model:
--   * Supabase Auth (email OTP) is REQUIRED to create a profile, sync picks,
--     or appear in rankings.
--   * Browsers hold only the public anon key; every write is bounded by RLS
--     with auth.uid() ownership. No header-based owner keys, no public
--     update policies.
--   * Official settlement rows (`results`) are written ONLY by the
--     server-side settlement route using the service-role key (which stays
--     in Vercel env vars and never ships to clients). No client policy
--     allows writing them.
--   * Standings are DERIVED in the `leaderboard_v2` / `arcade_ladder_v2`
--     views — never incremented — so settling the same official final twice
--     cannot double-count a single point.
--   * Legacy `scores` rows are anonymous; there is no reliable authenticated
--     ownership mapping, so they are NOT migrated. The table is locked
--     read-only below and kept for the historical record.

-- ---------------------------------------------------------------------------
-- 0) Lock the unsafe legacy table (read-only from now on).
--    Locked by PRIVILEGE, not by policy name — whatever policies exist, no
--    client role can write once the table privilege itself is revoked.
--    Guarded so the migration also applies cleanly on databases without the
--    legacy table (fresh projects, preview branches).
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.scores') is not null then
    execute 'alter table public.scores enable row level security';
    execute 'revoke insert, update, delete, truncate on public.scores from anon, authenticated, public';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) Canonical fixture schedule (kickoff truth for the pick-lock policy)
--    Identity/schedule only — mirrors src/data/fixtures.js. No scores here.
-- ---------------------------------------------------------------------------
create table if not exists public.fixtures (
  id       integer primary key,
  stage    text not null check (stage in ('group','r32','r16','qf','sf','bronze','final')),
  grp      text,
  kickoff  timestamptz not null
);
alter table public.fixtures enable row level security;
create policy "fixtures readable by signed-in users"
  on public.fixtures for select to authenticated using (true);

insert into public.fixtures (id, stage, grp, kickoff) values
  (1, 'group', 'A', '2026-06-11T15:00:00-04:00'),
  (2, 'group', 'A', '2026-06-11T22:00:00-04:00'),
  (3, 'group', 'B', '2026-06-12T15:00:00-04:00'),
  (4, 'group', 'D', '2026-06-12T21:00:00-04:00'),
  (5, 'group', 'C', '2026-06-13T21:00:00-04:00'),
  (6, 'group', 'D', '2026-06-13T00:00:00-04:00'),
  (7, 'group', 'C', '2026-06-13T18:00:00-04:00'),
  (8, 'group', 'B', '2026-06-13T15:00:00-04:00'),
  (9, 'group', 'E', '2026-06-14T19:00:00-04:00'),
  (10, 'group', 'E', '2026-06-14T13:00:00-04:00'),
  (11, 'group', 'F', '2026-06-14T16:00:00-04:00'),
  (12, 'group', 'F', '2026-06-14T22:00:00-04:00'),
  (13, 'group', 'H', '2026-06-15T18:00:00-04:00'),
  (14, 'group', 'H', '2026-06-15T12:00:00-04:00'),
  (15, 'group', 'G', '2026-06-15T21:00:00-04:00'),
  (16, 'group', 'G', '2026-06-15T15:00:00-04:00'),
  (17, 'group', 'I', '2026-06-16T15:00:00-04:00'),
  (18, 'group', 'I', '2026-06-16T18:00:00-04:00'),
  (19, 'group', 'J', '2026-06-16T21:00:00-04:00'),
  (20, 'group', 'J', '2026-06-16T00:00:00-04:00'),
  (21, 'group', 'L', '2026-06-17T19:00:00-04:00'),
  (22, 'group', 'L', '2026-06-17T16:00:00-04:00'),
  (23, 'group', 'K', '2026-06-17T13:00:00-04:00'),
  (24, 'group', 'K', '2026-06-17T22:00:00-04:00'),
  (25, 'group', 'A', '2026-06-18T12:00:00-04:00'),
  (26, 'group', 'B', '2026-06-18T15:00:00-04:00'),
  (27, 'group', 'B', '2026-06-18T18:00:00-04:00'),
  (28, 'group', 'A', '2026-06-18T21:00:00-04:00'),
  (29, 'group', 'C', '2026-06-19T20:30:00-04:00'),
  (30, 'group', 'C', '2026-06-19T18:00:00-04:00'),
  (31, 'group', 'D', '2026-06-19T23:00:00-04:00'),
  (32, 'group', 'D', '2026-06-19T15:00:00-04:00'),
  (33, 'group', 'E', '2026-06-20T16:00:00-04:00'),
  (34, 'group', 'E', '2026-06-20T20:00:00-04:00'),
  (35, 'group', 'F', '2026-06-20T13:00:00-04:00'),
  (36, 'group', 'F', '2026-06-20T00:00:00-04:00'),
  (37, 'group', 'H', '2026-06-21T18:00:00-04:00'),
  (38, 'group', 'H', '2026-06-21T12:00:00-04:00'),
  (39, 'group', 'G', '2026-06-21T15:00:00-04:00'),
  (40, 'group', 'G', '2026-06-21T21:00:00-04:00'),
  (41, 'group', 'I', '2026-06-22T20:00:00-04:00'),
  (42, 'group', 'I', '2026-06-22T17:00:00-04:00'),
  (43, 'group', 'J', '2026-06-22T13:00:00-04:00'),
  (44, 'group', 'J', '2026-06-22T23:00:00-04:00'),
  (45, 'group', 'L', '2026-06-23T16:00:00-04:00'),
  (46, 'group', 'L', '2026-06-23T19:00:00-04:00'),
  (47, 'group', 'K', '2026-06-23T13:00:00-04:00'),
  (48, 'group', 'K', '2026-06-23T22:00:00-04:00'),
  (49, 'group', 'C', '2026-06-24T18:00:00-04:00'),
  (50, 'group', 'C', '2026-06-24T18:00:00-04:00'),
  (51, 'group', 'B', '2026-06-24T15:00:00-04:00'),
  (52, 'group', 'B', '2026-06-24T15:00:00-04:00'),
  (53, 'group', 'A', '2026-06-24T21:00:00-04:00'),
  (54, 'group', 'A', '2026-06-24T21:00:00-04:00'),
  (55, 'group', 'E', '2026-06-25T16:00:00-04:00'),
  (56, 'group', 'E', '2026-06-25T16:00:00-04:00'),
  (57, 'group', 'F', '2026-06-25T19:00:00-04:00'),
  (58, 'group', 'F', '2026-06-25T19:00:00-04:00'),
  (59, 'group', 'D', '2026-06-25T22:00:00-04:00'),
  (60, 'group', 'D', '2026-06-25T22:00:00-04:00'),
  (61, 'group', 'I', '2026-06-26T15:00:00-04:00'),
  (62, 'group', 'I', '2026-06-26T15:00:00-04:00'),
  (63, 'group', 'G', '2026-06-26T23:00:00-04:00'),
  (64, 'group', 'G', '2026-06-26T23:00:00-04:00'),
  (65, 'group', 'H', '2026-06-26T20:00:00-04:00'),
  (66, 'group', 'H', '2026-06-26T20:00:00-04:00'),
  (67, 'group', 'L', '2026-06-27T17:00:00-04:00'),
  (68, 'group', 'L', '2026-06-27T17:00:00-04:00'),
  (69, 'group', 'J', '2026-06-27T22:00:00-04:00'),
  (70, 'group', 'J', '2026-06-27T22:00:00-04:00'),
  (71, 'group', 'K', '2026-06-27T19:30:00-04:00'),
  (72, 'group', 'K', '2026-06-27T19:30:00-04:00'),
  (73, 'r32', null, '2026-06-28T15:00:00-04:00'),
  (74, 'r32', null, '2026-06-29T16:30:00-04:00'),
  (75, 'r32', null, '2026-06-29T21:00:00-04:00'),
  (76, 'r32', null, '2026-06-29T13:00:00-04:00'),
  (77, 'r32', null, '2026-06-30T17:00:00-04:00'),
  (78, 'r32', null, '2026-06-30T13:00:00-04:00'),
  (79, 'r32', null, '2026-06-30T21:00:00-04:00'),
  (80, 'r32', null, '2026-07-01T12:00:00-04:00'),
  (81, 'r32', null, '2026-07-01T20:00:00-04:00'),
  (82, 'r32', null, '2026-07-01T16:00:00-04:00'),
  (83, 'r32', null, '2026-07-02T19:00:00-04:00'),
  (84, 'r32', null, '2026-07-02T15:00:00-04:00'),
  (85, 'r32', null, '2026-07-02T23:00:00-04:00'),
  (86, 'r32', null, '2026-07-03T18:00:00-04:00'),
  (87, 'r32', null, '2026-07-03T21:30:00-04:00'),
  (88, 'r32', null, '2026-07-03T14:00:00-04:00'),
  (89, 'r16', null, '2026-07-04T17:00:00-04:00'),
  (90, 'r16', null, '2026-07-04T13:00:00-04:00'),
  (91, 'r16', null, '2026-07-05T16:00:00-04:00'),
  (92, 'r16', null, '2026-07-05T20:00:00-04:00'),
  (93, 'r16', null, '2026-07-06T15:00:00-04:00'),
  (94, 'r16', null, '2026-07-06T20:00:00-04:00'),
  (95, 'r16', null, '2026-07-07T12:00:00-04:00'),
  (96, 'r16', null, '2026-07-07T16:00:00-04:00'),
  (97, 'qf', null, '2026-07-09T16:00:00-04:00'),
  (98, 'qf', null, '2026-07-10T15:00:00-04:00'),
  (99, 'qf', null, '2026-07-11T17:00:00-04:00'),
  (100, 'qf', null, '2026-07-11T21:00:00-04:00'),
  (101, 'sf', null, '2026-07-14T15:00:00-04:00'),
  (102, 'sf', null, '2026-07-15T15:00:00-04:00'),
  (103, 'bronze', null, '2026-07-18T17:00:00-04:00'),
  (104, 'final', null, '2026-07-19T15:00:00-04:00')
on conflict (id) do update set stage = excluded.stage, grp = excluded.grp, kickoff = excluded.kickoff;

-- ---------------------------------------------------------------------------
-- 2) Profiles — one per authenticated user, self-owned
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (
    char_length(trim(display_name)) between 2 and 24
    and display_name !~ '[|<>]'
  ),
  avatar       text check (avatar is null or char_length(avatar) <= 8),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists profiles_display_name_key
  on public.profiles (lower(trim(display_name)));
-- updated_at is server-maintained, never trusted from the client
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before insert or update on public.profiles
  for each row execute function public.set_updated_at();
alter table public.profiles enable row level security;
create policy "profiles readable by signed-in users"
  on public.profiles for select to authenticated using (true);
create policy "insert own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- 3) Picks — own rows only, editable strictly BEFORE the official kickoff
-- ---------------------------------------------------------------------------
create table if not exists public.picks (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  fixture_id integer not null references public.fixtures (id),
  side       text not null check (side in ('home','away','draw')),
  gh         smallint check (gh is null or gh between 0 and 20),
  ga         smallint check (ga is null or ga between 0 and 20),
  conf       smallint not null default 1 check (conf between 1 and 3),
  updated_at timestamptz not null default now(),
  primary key (user_id, fixture_id)
);
alter table public.picks enable row level security;
create policy "read own picks"
  on public.picks for select to authenticated using (auth.uid() = user_id);
create policy "insert own pick before kickoff"
  on public.picks for insert to authenticated with check (
    auth.uid() = user_id
    and exists (select 1 from public.fixtures f
                where f.id = fixture_id and now() < f.kickoff)
  );
create policy "update own pick before kickoff"
  on public.picks for update to authenticated
  using (
    auth.uid() = user_id
    and exists (select 1 from public.fixtures f
                where f.id = fixture_id and now() < f.kickoff)
  )
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.fixtures f
                where f.id = fixture_id and now() < f.kickoff)
  );

-- ---------------------------------------------------------------------------
-- 4) Official settlement records — SERVER-ONLY writes (service role bypasses
--    RLS; no client policy grants insert/update/delete)
-- ---------------------------------------------------------------------------
create table if not exists public.results (
  fixture_id integer primary key references public.fixtures (id),
  gh         smallint not null,
  ga         smallint not null,
  winner     text not null check (winner in ('home','away','draw')),
  settled_at timestamptz not null default now()
);
alter table public.results enable row level security;
create policy "results readable by signed-in users"
  on public.results for select to authenticated using (true);
-- no insert/update/delete policies: browsers cannot write settlement.

-- ---------------------------------------------------------------------------
-- 5) Arcade scores — self-reported game ladder, fully separate from picks
-- ---------------------------------------------------------------------------
create table if not exists public.arcade_scores (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  points     integer not null default 0 check (points between 0 and 1000000),
  wins       integer not null default 0 check (wins between 0 and 100000),
  played     integer not null default 0 check (played between 0 and 100000),
  streak     integer not null default 0 check (streak between 0 and 100000),
  updated_at timestamptz not null default now()
);
alter table public.arcade_scores enable row level security;
create policy "arcade readable by signed-in users"
  on public.arcade_scores for select to authenticated using (true);
create policy "insert own arcade score"
  on public.arcade_scores for insert to authenticated with check (auth.uid() = user_id);
create policy "update own arcade score"
  on public.arcade_scores for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 6) Derived global standings (points are computed, never stored)
--    Views execute as owner by design: they expose ONLY aggregates over
--    officially settled results plus public profile fields — never raw
--    pre-kickoff pick details.
-- ---------------------------------------------------------------------------
create or replace view public.leaderboard_v2 as
with graded as (
  select p.user_id, p.fixture_id, f.kickoff, f.stage,
         (r.winner = p.side)                                   as correct,
         p.conf,
         (p.gh is not null and p.ga is not null
          and p.gh = r.gh and p.ga = r.ga)                     as exact
  from public.picks p
  join public.results  r on r.fixture_id = p.fixture_id
  join public.fixtures f on f.id = p.fixture_id
),
-- streak ordering is deterministic: kickoff then fixture id, matching the
-- client's gradePredictions sort (simultaneous kickoffs are standard in the
-- final group rounds)
islands as (
  select user_id, correct, kickoff,
         (row_number() over (partition by user_id order by kickoff, fixture_id))
       - (row_number() over (partition by user_id, correct order by kickoff, fixture_id)) as grp
  from graded
),
best as (
  select user_id, max(len) as best_streak
  from (select user_id, grp, count(*) as len
        from islands where correct group by user_id, grp) runs
  group by user_id
),
cur as (
  select g.user_id, count(*) as streak
  from graded g
  left join (
    select distinct on (user_id) user_id, kickoff, fixture_id
    from graded where not correct
    order by user_id, kickoff desc, fixture_id desc
  ) lw on lw.user_id = g.user_id
  where g.correct
    and (lw.user_id is null
         or (g.kickoff, g.fixture_id) > (lw.kickoff, lw.fixture_id))
  group by g.user_id
),
round_now as (
  select f.stage from public.results r
  join public.fixtures f on f.id = r.fixture_id
  order by f.kickoff desc limit 1
),
agg as (
  select user_id,
         count(*)                                              as total,
         count(*) filter (where correct)                       as correct,
         coalesce(sum(conf * 10) filter (where correct), 0)    as insight,
         count(*) filter (where exact)                         as exact,
         count(*) filter (where stage = (select stage from round_now))                as round_total,
         count(*) filter (where correct and stage = (select stage from round_now))    as round_correct,
         coalesce(sum(conf * 10) filter (where correct and stage = (select stage from round_now)), 0) as round_points
  from graded group by user_id
)
select
  pr.id                                   as user_id,
  pr.display_name,
  pr.avatar,
  pr.created_at                           as joined_at,
  coalesce(a.insight, 0) + coalesce(b.best_streak, 0) * 20
    + coalesce(a.exact, 0) * 15           as points,
  coalesce(a.total, 0)                    as total,
  coalesce(a.correct, 0)                  as correct,
  case when coalesce(a.total, 0) > 0
       then round(a.correct::numeric * 100 / a.total) end as accuracy,
  coalesce(c.streak, 0)                   as streak,
  coalesce(b.best_streak, 0)              as best_streak,
  coalesce(a.exact, 0)                    as exact,
  (select stage from round_now)           as round_stage,
  coalesce(a.round_points, 0)             as round_points,
  coalesce(a.round_correct, 0)            as round_correct,
  coalesce(a.round_total, 0)              as round_total,
  -- ties on points are broken by join date (earlier joiner ranks higher) so
  -- every player holds exactly one global position
  rank() over (order by
    coalesce(a.insight, 0) + coalesce(b.best_streak, 0) * 20 + coalesce(a.exact, 0) * 15 desc,
    pr.created_at asc)                    as rank
from public.profiles pr
left join agg  a on a.user_id = pr.id
left join best b on b.user_id = pr.id
left join cur  c on c.user_id = pr.id;

create or replace view public.arcade_ladder_v2 as
select
  s.user_id, pr.display_name, pr.avatar,
  s.points, s.wins, s.played, s.streak, s.updated_at,
  rank() over (order by s.points desc, s.updated_at asc) as rank
from public.arcade_scores s
join public.profiles pr on pr.id = s.user_id;

-- signed-in reads only; anonymous clients get nothing
revoke all on public.leaderboard_v2  from anon;
revoke all on public.arcade_ladder_v2 from anon;
grant select on public.leaderboard_v2   to authenticated;
grant select on public.arcade_ladder_v2 to authenticated;
