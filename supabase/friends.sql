-- Sudoku Sprint: friends, online status, and race invites.
-- Run after schema.sql, in Supabase → SQL Editor. Safe to run again.
--
-- Privacy: friendships, online status and invites are only reachable through
-- the functions below, which check who is asking. Online status is visible
-- to accepted friends only; invites can only be sent between friends.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (requester, addressee),
  constraint friendships_not_self check (requester <> addressee)
);
-- One row per pair, whichever direction it was sent in.
create unique index if not exists friendships_pair_key
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_addressee_idx on public.friendships (addressee);

-- Last time each player's game checked in (only while "Show me as online" is on).
create table if not exists public.player_presence (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_seen timestamptz not null default now()
);

create table if not exists public.race_invites (
  id bigint generated always as identity primary key,
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9]{6}$'),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  created_at timestamptz not null default now()
);
create index if not exists race_invites_to_idx on public.race_invites (to_user, created_at);

alter table public.friendships enable row level security;
alter table public.player_presence enable row level security;
alter table public.race_invites enable row level security;
revoke all on public.friendships, public.player_presence, public.race_invites from anon, authenticated;

-- Recipients may read their own invites. This is what lets Supabase Realtime
-- deliver new invites to them instantly (and to nobody else).
drop policy if exists "Players see invites sent to them" on public.race_invites;
create policy "Players see invites sent to them" on public.race_invites
  for select to authenticated using (to_user = (select auth.uid()));
grant select on public.race_invites to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'race_invites'
  ) then
    alter publication supabase_realtime add table public.race_invites;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helpers (internal)
-- ---------------------------------------------------------------------------
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a))
  )
$$;

-- The signed-in player's id, or an error if they're signed out / have no username.
create or replace function public.require_player()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'needs_username';
  end if;
  return v_uid;
end;
$$;

create or replace function public.user_id_for(p_username text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profiles p where lower(p.username) = lower(trim(leading '@' from trim(p_username)))
$$;

-- ---------------------------------------------------------------------------
-- Friend requests
-- ---------------------------------------------------------------------------
-- Returns 'sent', or 'accepted' if they had already asked you.
create or replace function public.send_friend_request(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_player();
  v_them uuid := public.user_id_for(p_username);
  v_row public.friendships%rowtype;
begin
  if v_them is null then raise exception 'user_not_found'; end if;
  if v_them = v_me then raise exception 'cannot_add_self'; end if;

  select * into v_row from public.friendships f
  where least(f.requester, f.addressee) = least(v_me, v_them)
    and greatest(f.requester, f.addressee) = greatest(v_me, v_them);

  if found then
    if v_row.status = 'accepted' then raise exception 'already_friends'; end if;
    if v_row.requester = v_me then raise exception 'already_requested'; end if;
    -- They already asked us: accept.
    update public.friendships set status = 'accepted', accepted_at = now()
    where requester = v_them and addressee = v_me;
    return 'accepted';
  end if;

  if (select count(*) from public.friendships f where f.requester = v_me and f.status = 'pending') >= 50 then
    raise exception 'too_many_requests';
  end if;
  insert into public.friendships (requester, addressee) values (v_me, v_them);
  return 'sent';
end;
$$;

create or replace function public.respond_friend_request(p_username text, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_player();
  v_them uuid := public.user_id_for(p_username);
begin
  if p_accept then
    update public.friendships set status = 'accepted', accepted_at = now()
    where requester = v_them and addressee = v_me and status = 'pending';
  else
    delete from public.friendships
    where requester = v_them and addressee = v_me and status = 'pending';
  end if;
end;
$$;

-- Unfriend, or cancel a request you sent.
create or replace function public.remove_friend(p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_player();
  v_them uuid := public.user_id_for(p_username);
begin
  delete from public.friendships f
  where (f.requester = v_me and f.addressee = v_them)
     or (f.requester = v_them and f.addressee = v_me);
end;
$$;

-- Friends and requests, with online status for accepted friends only.
-- direction: 'friend' | 'incoming' (they asked you) | 'outgoing' (you asked them)
create or replace function public.my_friends()
returns table (username text, direction text, online boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.username,
         case
           when f.status = 'accepted' then 'friend'
           when f.addressee = auth.uid() then 'incoming'
           else 'outgoing'
         end,
         f.status = 'accepted' and exists (
           select 1 from public.player_presence pp
           where pp.user_id = p.id and pp.last_seen > now() - interval '2 minutes'
         )
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where f.requester = auth.uid() or f.addressee = auth.uid()
  order by 2, 3 desc, lower(p.username)
$$;

-- ---------------------------------------------------------------------------
-- Online status
-- ---------------------------------------------------------------------------
create or replace function public.heartbeat()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then return; end if;
  insert into public.player_presence (user_id, last_seen) values (v_me, now())
  on conflict (user_id) do update set last_seen = now();
end;
$$;

create or replace function public.go_offline()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.player_presence where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Race invites (friends only, expire after 10 minutes)
-- ---------------------------------------------------------------------------
create or replace function public.send_race_invite(p_username text, p_code text, p_difficulty text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_player();
  v_them uuid := public.user_id_for(p_username);
begin
  if v_them is null or not public.are_friends(v_me, v_them) then
    raise exception 'not_friends';
  end if;
  -- Tidy up: expired invites, and any earlier invite from me to them.
  delete from public.race_invites where created_at < now() - interval '10 minutes';
  delete from public.race_invites where from_user = v_me and to_user = v_them;
  insert into public.race_invites (from_user, to_user, code, difficulty)
  values (v_me, v_them, upper(p_code), p_difficulty);
end;
$$;

create or replace function public.my_race_invites()
returns table (id bigint, from_username text, code text, difficulty text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, p.username, i.code, i.difficulty, i.created_at
  from public.race_invites i
  join public.profiles p on p.id = i.from_user
  where i.to_user = auth.uid() and i.created_at > now() - interval '10 minutes'
  order by i.created_at desc
$$;

create or replace function public.dismiss_race_invite(p_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.race_invites where id = p_id and to_user = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Who can call what
-- ---------------------------------------------------------------------------
revoke all on function public.are_friends(uuid, uuid) from public, anon, authenticated;
revoke all on function public.require_player() from public, anon, authenticated;
revoke all on function public.user_id_for(text) from public, anon, authenticated;
revoke all on function public.send_friend_request(text) from public, anon, authenticated;
revoke all on function public.respond_friend_request(text, boolean) from public, anon, authenticated;
revoke all on function public.remove_friend(text) from public, anon, authenticated;
revoke all on function public.my_friends() from public, anon, authenticated;
revoke all on function public.heartbeat() from public, anon, authenticated;
revoke all on function public.go_offline() from public, anon, authenticated;
revoke all on function public.send_race_invite(text, text, text) from public, anon, authenticated;
revoke all on function public.my_race_invites() from public, anon, authenticated;
revoke all on function public.dismiss_race_invite(bigint) from public, anon, authenticated;

grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(text, boolean) to authenticated;
grant execute on function public.remove_friend(text) to authenticated;
grant execute on function public.my_friends() to authenticated;
grant execute on function public.heartbeat() to authenticated;
grant execute on function public.go_offline() to authenticated;
grant execute on function public.send_race_invite(text, text, text) to authenticated;
grant execute on function public.my_race_invites() to authenticated;
grant execute on function public.dismiss_race_invite(bigint) to authenticated;
