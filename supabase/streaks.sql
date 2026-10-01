-- Sudoku Sprint: daily streaks and all-time leaderboards.
-- Run after daily.sql, in Supabase → SQL Editor. Safe to run again.
--
-- A day counts toward a streak if the player solved at least one of that
-- day's Daily puzzles (any difficulty). A streak stays "current" until the end
-- of the following day, so it doesn't vanish before the player has had a
-- chance to play today. Everything is computed from server-verified solves.

-- ---------------------------------------------------------------------------
-- Per-player Daily stats. Internal: returns user ids, so it is not callable
-- from the browser; the functions below expose usernames only.
-- ---------------------------------------------------------------------------
create or replace function public.daily_player_stats()
returns table (user_id uuid, current_streak integer, best_streak integer, total_solves integer)
language sql
stable
security definer
set search_path = ''
as $$
  with solved_days as (
    select distinct a.user_id, a.day
    from public.daily_attempts a
    where a.finished_at is not null
  ),
  -- Consecutive days share the same (day - row number): classic gaps-and-islands.
  islands as (
    select sd.user_id, sd.day,
           sd.day - (row_number() over (partition by sd.user_id order by sd.day))::integer as grp
    from solved_days sd
  ),
  runs as (
    select i.user_id, count(*)::integer as len, max(i.day) as last_day
    from islands i
    group by i.user_id, i.grp
  ),
  totals as (
    select a.user_id, count(*)::integer as total_solves
    from public.daily_attempts a
    where a.finished_at is not null
    group by a.user_id
  )
  select t.user_id,
    coalesce((select r.len from runs r
              where r.user_id = t.user_id and r.last_day >= public.daily_today() - 1
              order by r.last_day desc limit 1), 0),
    coalesce((select max(r.len) from runs r where r.user_id = t.user_id), 0),
    t.total_solves
  from totals t
$$;

-- ---------------------------------------------------------------------------
-- All-time leaderboard. p_kind: 'streak' (current), 'best_streak', 'solves'.
-- ---------------------------------------------------------------------------
create or replace function public.alltime_leaderboard(p_kind text, p_limit integer default 50)
returns table (rank bigint, username text, value integer, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with v as (
    select s.user_id,
      case p_kind
        when 'streak' then s.current_streak
        when 'best_streak' then s.best_streak
        else s.total_solves
      end as value
    from public.daily_player_stats() s
    where p_kind in ('streak', 'best_streak', 'solves')
  )
  select rank() over (order by v.value desc),
         pr.username,
         v.value,
         coalesce(v.user_id = auth.uid(), false)
  from v
  join public.profiles pr on pr.id = v.user_id
  where v.value > 0
  order by v.value desc, pr.username
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

-- ---------------------------------------------------------------------------
-- The signed-in player's own Daily stats.
-- ---------------------------------------------------------------------------
create or replace function public.my_daily_stats()
returns table (current_streak integer, best_streak integer, total_solves integer, solved_today boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(s.current_streak, 0),
         coalesce(s.best_streak, 0),
         coalesce(s.total_solves, 0),
         exists (
           select 1 from public.daily_attempts a
           where a.user_id = auth.uid() and a.day = public.daily_today() and a.finished_at is not null
         )
  from (select 1) as one
  left join public.daily_player_stats() s on s.user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Who can call what (Supabase grants new functions to anon/authenticated by default)
-- ---------------------------------------------------------------------------
revoke all on function public.daily_player_stats() from public, anon, authenticated;
revoke all on function public.alltime_leaderboard(text, integer) from public, anon, authenticated;
revoke all on function public.my_daily_stats() from public, anon, authenticated;

grant execute on function public.alltime_leaderboard(text, integer) to anon, authenticated;
grant execute on function public.my_daily_stats() to authenticated;
