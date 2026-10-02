-- Sudoku Sprint: check Daily Challenge numbers as they're placed.
-- Run after daily.sql, in Supabase → SQL Editor. Safe to run again.
--
-- The browser still never receives the solution: it asks about one cell at a
-- time, only during the player's own unfinished attempt. Wrong guesses are
-- counted (daily_attempts.mistakes) so a time penalty can be added later;
-- they don't affect the leaderboard yet.

alter table public.daily_attempts add column if not exists mistakes integer not null default 0;

-- p_index: 0-80, row by row. Returns true if p_value is right for that cell.
create or replace function public.check_daily_cell(p_day date, p_difficulty text, p_index integer, p_value integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_solution text;
  v_correct boolean;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if p_index < 0 or p_index > 80 or p_value < 1 or p_value > 9 then raise exception 'bad_cell'; end if;
  if not exists (
    select 1 from public.daily_attempts a
    where a.user_id = v_uid and a.day = p_day and a.difficulty = p_difficulty and a.finished_at is null
  ) then
    raise exception 'not_started';
  end if;
  if p_day < public.daily_today() - 1 then raise exception 'too_late'; end if;

  select dp.solution into v_solution
  from public.daily_puzzles dp
  where dp.day = p_day and dp.difficulty = p_difficulty;

  v_correct := substr(v_solution, p_index + 1, 1)::integer = p_value;
  if not v_correct then
    update public.daily_attempts a set mistakes = a.mistakes + 1
    where a.user_id = v_uid and a.day = p_day and a.difficulty = p_difficulty;
  end if;
  return v_correct;
end;
$$;

revoke all on function public.check_daily_cell(date, text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_daily_cell(date, text, integer, integer) to authenticated;
