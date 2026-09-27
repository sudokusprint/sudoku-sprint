-- Sudoku Sprint database setup.
-- Paste into Supabase → SQL Editor → New query, then Run. Safe to run again.
--
-- Security model: the browser uses the public "publishable" key, so every
-- table below has Row Level Security. Players can only read and write their
-- own data; the only public data is each player's username.

-- ---------------------------------------------------------------------------
-- Profiles: one row per player, holding their public username.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[A-Za-z0-9_]{3,20}$')
);

-- Usernames are unique regardless of capitalisation.
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

-- ---------------------------------------------------------------------------
-- Solves: one row per finished Solo puzzle, Race, or Workshop practice.
-- ---------------------------------------------------------------------------
create table if not exists public.solves (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id uuid not null,              -- generated in the browser so retries can't double-save
  mode text not null check (mode in ('solo', 'race', 'workshop')),
  difficulty text check (difficulty in ('easy', 'medium', 'hard')),
  technique text,                       -- workshop only
  seconds integer check (seconds >= 0),
  mistakes integer check (mistakes >= 0),
  won boolean,                          -- race only
  created_at timestamptz not null default now(),
  constraint solves_user_client_key unique (user_id, client_id)
);

create index if not exists solves_user_created_idx
  on public.solves (user_id, created_at);

-- ---------------------------------------------------------------------------
-- Imported stats: totals a player had as a guest before signing up.
-- One row per player, written once. Kept separate because guest stats have
-- no per-solve history and were never verified.
-- ---------------------------------------------------------------------------
create table if not exists public.imported_stats (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  stats jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Username rules. Add your own rows in Table Editor → blocked_username_words.
--   match = 'exact'    blocks that exact name (any capitalisation)
--   match = 'contains' blocks any name containing it
-- ---------------------------------------------------------------------------
create table if not exists public.blocked_username_words (
  word text primary key,
  match text not null default 'contains' check (match in ('exact', 'contains'))
);

insert into public.blocked_username_words (word, match) values
  ('admin', 'exact'), ('administrator', 'exact'), ('moderator', 'exact'), ('mod', 'exact'),
  ('support', 'exact'), ('staff', 'exact'), ('official', 'exact'), ('system', 'exact'),
  ('root', 'exact'), ('null', 'exact'), ('undefined', 'exact'), ('anonymous', 'exact'),
  ('sudokusprint', 'contains'), ('supabase', 'contains'),
  ('fuck', 'contains'), ('shit', 'contains'), ('cunt', 'contains'), ('bitch', 'contains'),
  ('whore', 'contains'), ('slut', 'contains'), ('porn', 'contains'), ('nazi', 'contains'),
  ('hitler', 'contains'), ('nigg', 'contains'), ('fagg', 'contains')
on conflict (word) do nothing;

create or replace function public.check_username()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n text := lower(new.username);
begin
  if exists (
    select 1 from public.blocked_username_words b
    where (b.match = 'exact' and n = b.word)
       or (b.match = 'contains' and position(b.word in n) > 0)
  ) then
    raise exception 'username_not_allowed';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_check_username on public.profiles;
create trigger profiles_check_username
  before insert or update of username on public.profiles
  for each row execute function public.check_username();

-- ---------------------------------------------------------------------------
-- Account deletion: removes the auth user; everything else cascades.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.solves enable row level security;
alter table public.imported_stats enable row level security;
alter table public.blocked_username_words enable row level security;  -- no policies: not readable from the browser

drop policy if exists "Usernames are public" on public.profiles;
create policy "Usernames are public" on public.profiles
  for select using (true);

drop policy if exists "Players create their own profile" on public.profiles;
create policy "Players create their own profile" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));

drop policy if exists "Players rename themselves" on public.profiles;
create policy "Players rename themselves" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "Players read their own solves" on public.solves;
create policy "Players read their own solves" on public.solves
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Players save their own solves" on public.solves;
create policy "Players save their own solves" on public.solves
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Players read their imported stats" on public.imported_stats;
create policy "Players read their imported stats" on public.imported_stats
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Players import their stats once" on public.imported_stats;
create policy "Players import their stats once" on public.imported_stats
  for insert to authenticated with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants (explicit, so nothing depends on project defaults)
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.solves, public.imported_stats, public.blocked_username_words from anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant insert (id, username) on public.profiles to authenticated;
grant update (username) on public.profiles to authenticated;

grant select, insert on public.solves to authenticated;
grant select, insert on public.imported_stats to authenticated;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
revoke all on function public.check_username() from public, anon, authenticated;
