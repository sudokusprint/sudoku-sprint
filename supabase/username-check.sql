-- Sudoku Sprint: live username availability while typing.
-- Run after schema.sql, in Supabase → SQL Editor. Safe to run again.
--
-- Mirrors the rules enforced when a username is saved (format, blocked words,
-- unique regardless of capitals). Saving is still checked separately, so this
-- is only a preview for the sign-up / rename screen.

-- 'invalid' | 'not_allowed' | 'taken' | 'yours' | 'available'
create or replace function public.username_status(p_username text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n text := lower(coalesce(p_username, ''));
begin
  if coalesce(p_username, '') !~ '^[A-Za-z0-9_]{3,20}$' then
    return 'invalid';
  end if;
  if exists (
    select 1 from public.blocked_username_words b
    where (b.match = 'exact' and n = b.word)
       or (b.match = 'contains' and position(b.word in n) > 0)
  ) then
    return 'not_allowed';
  end if;
  if exists (select 1 from public.profiles p where lower(p.username) = n and p.id = auth.uid()) then
    return 'yours';
  end if;
  if exists (select 1 from public.profiles p where lower(p.username) = n) then
    return 'taken';
  end if;
  return 'available';
end;
$$;

revoke all on function public.username_status(text) from public, anon, authenticated;
-- Usernames are public anyway, so anyone may ask (signed-out callers never get 'yours').
grant execute on function public.username_status(text) to anon, authenticated;
