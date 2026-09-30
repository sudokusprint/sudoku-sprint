-- Sudoku Sprint: Daily Challenge and leaderboards.
-- Run after schema.sql, in Supabase → SQL Editor. Safe to run again.
--
-- Anti-cheat design: the browser never receives a solution. The server hands
-- out the puzzle when an attempt starts (recording the start time itself),
-- checks the finished grid against the stored solution, and computes the
-- time from its own clock. Players can't read these tables directly; all
-- access goes through the functions below.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.daily_puzzles (
  day date not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  puzzle text not null check (puzzle ~ '^[0-9]{81}$'),      -- row by row, 0 = blank
  solution text not null check (solution ~ '^[1-9]{81}$'),
  tier smallint,
  clue_count smallint,
  techniques text[],
  primary key (day, difficulty)
);

create table if not exists public.daily_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  difficulty text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  seconds integer,
  primary key (user_id, day, difficulty),
  foreign key (day, difficulty) references public.daily_puzzles (day, difficulty) on delete cascade
);

create index if not exists daily_attempts_board_idx
  on public.daily_attempts (day, difficulty, seconds, finished_at)
  where finished_at is not null;

alter table public.daily_puzzles enable row level security;
alter table public.daily_attempts enable row level security;
-- No policies and no grants: only the security-definer functions below can read them.
revoke all on public.daily_puzzles, public.daily_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The game's "today". Everyone shares one daily puzzle, which changes at
-- midnight US Eastern time.
-- ---------------------------------------------------------------------------
create or replace function public.daily_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/New_York')::date
$$;

-- ---------------------------------------------------------------------------
-- Start (or resume) today's attempt at a difficulty. Returns the puzzle, but
-- never the solution. The clock starts on the first call and keeps running.
-- ---------------------------------------------------------------------------
create or replace function public.start_daily(p_difficulty text)
returns table (
  day date, puzzle text, tier smallint, techniques text[],
  started_at timestamptz, finished_at timestamptz, seconds integer, server_now timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_day date := public.daily_today();
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  if not exists (select 1 from public.profiles pr where pr.id = v_uid) then
    raise exception 'needs_username';
  end if;
  if not exists (
    select 1 from public.daily_puzzles dp where dp.day = v_day and dp.difficulty = p_difficulty
  ) then
    raise exception 'no_puzzle_today';
  end if;

  insert into public.daily_attempts (user_id, day, difficulty)
  values (v_uid, v_day, p_difficulty)
  on conflict do nothing;

  return query
    select dp.day, dp.puzzle, dp.tier, dp.techniques,
           a.started_at, a.finished_at, a.seconds, now()
    from public.daily_puzzles dp
    join public.daily_attempts a
      on a.day = dp.day and a.difficulty = dp.difficulty and a.user_id = v_uid
    where dp.day = v_day and dp.difficulty = p_difficulty;
end;
$$;

-- ---------------------------------------------------------------------------
-- Submit a finished grid (81 digits, row by row). If it matches the solution,
-- the attempt is finished and timed by the server. Returns the result and
-- the player's rank. A wrong grid just returns correct = false.
-- Attempts can be submitted until the end of the following day.
-- ---------------------------------------------------------------------------
create or replace function public.submit_daily(p_day date, p_difficulty text, p_grid text)
returns table (correct boolean, seconds integer, rank bigint, total bigint)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_finished timestamptz;
  v_solution text;
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;

  select a.finished_at into v_finished
  from public.daily_attempts a
  where a.user_id = v_uid and a.day = p_day and a.difficulty = p_difficulty;
  if not found then
    raise exception 'not_started';
  end if;

  if v_finished is null then
    if p_day < public.daily_today() - 1 then
      raise exception 'too_late';
    end if;
    select dp.solution into v_solution
    from public.daily_puzzles dp
    where dp.day = p_day and dp.difficulty = p_difficulty;
    if p_grid is distinct from v_solution then
      return query select false, null::integer, null::bigint, null::bigint;
      return;
    end if;
    update public.daily_attempts a
    set finished_at = now(),
        seconds = greatest(0, floor(extract(epoch from (now() - a.started_at))))::integer
    where a.user_id = v_uid and a.day = p_day and a.difficulty = p_difficulty
      and a.finished_at is null;
  end if;

  return query
    select true, me.seconds,
      (select count(*) + 1 from public.daily_attempts o
        where o.day = p_day and o.difficulty = p_difficulty and o.finished_at is not null
          and (o.seconds < me.seconds or (o.seconds = me.seconds and o.finished_at < me.finished_at))),
      (select count(*) from public.daily_attempts o
        where o.day = p_day and o.difficulty = p_difficulty and o.finished_at is not null)
    from public.daily_attempts me
    where me.user_id = v_uid and me.day = p_day and me.difficulty = p_difficulty;
end;
$$;

-- ---------------------------------------------------------------------------
-- Today's status for each difficulty: whether a puzzle exists, how many have
-- finished, and (for a signed-in player) their own attempt and rank.
-- ---------------------------------------------------------------------------
create or replace function public.daily_status()
returns table (
  day date, difficulty text, available boolean,
  started_at timestamptz, finished_at timestamptz, seconds integer,
  rank bigint, total bigint, server_now timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (select public.daily_today() as day),
  diffs as (select unnest(array['easy', 'medium', 'hard']) as difficulty)
  select t.day, diffs.difficulty,
    exists (select 1 from public.daily_puzzles p where p.day = t.day and p.difficulty = diffs.difficulty),
    a.started_at, a.finished_at, a.seconds,
    case when a.finished_at is not null then
      (select count(*) + 1 from public.daily_attempts o
        where o.day = t.day and o.difficulty = diffs.difficulty and o.finished_at is not null
          and (o.seconds < a.seconds or (o.seconds = a.seconds and o.finished_at < a.finished_at)))
    end,
    (select count(*) from public.daily_attempts o
      where o.day = t.day and o.difficulty = diffs.difficulty and o.finished_at is not null),
    now()
  from t
  cross join diffs
  left join public.daily_attempts a
    on a.user_id = auth.uid() and a.day = t.day and a.difficulty = diffs.difficulty
  order by array_position(array['easy', 'medium', 'hard'], diffs.difficulty)
$$;

-- ---------------------------------------------------------------------------
-- Public leaderboard for one day and difficulty: usernames and times only.
-- ---------------------------------------------------------------------------
create or replace function public.daily_leaderboard(p_day date, p_difficulty text, p_limit integer default 50)
returns table (rank bigint, username text, seconds integer, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select rank() over (order by a.seconds, a.finished_at),
         pr.username,
         a.seconds,
         coalesce(a.user_id = auth.uid(), false)
  from public.daily_attempts a
  join public.profiles pr on pr.id = a.user_id
  where a.day = p_day and a.difficulty = p_difficulty and a.finished_at is not null
  order by a.seconds, a.finished_at
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

-- ---------------------------------------------------------------------------
-- Who can call what
-- ---------------------------------------------------------------------------
-- Supabase grants new functions to anon/authenticated by default, so revoke explicitly.
revoke all on function public.daily_today() from public, anon, authenticated;
revoke all on function public.start_daily(text) from public, anon, authenticated;
revoke all on function public.submit_daily(date, text, text) from public, anon, authenticated;
revoke all on function public.daily_status() from public, anon, authenticated;
revoke all on function public.daily_leaderboard(date, text, integer) from public, anon, authenticated;

grant execute on function public.daily_today() to anon, authenticated;
grant execute on function public.daily_status() to anon, authenticated;
grant execute on function public.daily_leaderboard(date, text, integer) to anon, authenticated;
grant execute on function public.start_daily(text) to authenticated;
grant execute on function public.submit_daily(date, text, text) to authenticated;
