-- OpenPlayCourt booking engine. Venue timezone: Asia/Manila (UTC+8, no DST).
create extension if not exists btree_gist;
create extension if not exists pgcrypto;

create type sport          as enum ('pickleball', 'tennis', 'padel');
create type booking_type   as enum ('full_court', 'open_play');
create type booking_status as enum ('held', 'confirmed', 'checked_in', 'cancelled', 'expired');
create type skill_level    as enum ('beginner', 'intermediate', 'advanced', 'all');

-- ───────────────────────── courts ─────────────────────────
create table courts (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  slug              text not null unique,
  sport             sport not null,
  surface           text,
  is_indoor         boolean not null default false,
  hourly_rate_cents integer not null check (hourly_rate_cents >= 0),
  opens_at          time not null default '06:00',
  closes_at         time not null default '22:00',
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  check (closes_at > opens_at and closes_at <= '23:00')
);

-- ──────────────────── open_play_sessions ────────────────────
create table open_play_sessions (
  id                     uuid primary key default gen_random_uuid(),
  court_id               uuid not null references courts(id) on delete restrict,
  sport                  sport not null,
  title                  text not null,
  skill_level            skill_level not null default 'all',
  starts_at              timestamptz not null,
  ends_at                timestamptz not null,
  capacity               integer not null check (capacity between 2 and 16),
  price_per_player_cents integer not null check (price_per_player_cents >= 0),
  status                 text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_at             timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint no_session_overlap exclude using gist (
    court_id with =, tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'scheduled')
);
create index on open_play_sessions (starts_at);

-- ───────────────────────── bookings ─────────────────────────
create or replace function gen_pass_code() returns text language sql volatile as $$
  select 'OPC-' || upper(substr(translate(encode(gen_random_bytes(8), 'base64'), '+/=lIO01', 'XYZABCD'), 1, 8));
$$;

create table bookings (
  id                uuid primary key default gen_random_uuid(),
  confirmation_code text not null unique default gen_pass_code(),
  booking_type      booking_type not null,
  status            booking_status not null default 'confirmed',
  court_id          uuid not null references courts(id) on delete restrict,
  session_id        uuid references open_play_sessions(id) on delete restrict,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  players           integer not null default 1 check (players between 1 and 16),
  guest_name        text not null,
  guest_email       text not null,
  guest_phone       text,
  total_cents       integer not null check (total_cents >= 0),
  hold_expires_at   timestamptz,           -- set only for payment holds
  user_id           uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((booking_type = 'full_court' and session_id is null)
      or (booking_type = 'open_play'  and session_id is not null)),
  -- THE double-booking guard: Postgres refuses overlapping live full-court rows, atomically.
  constraint no_court_double_booking exclude using gist (
    court_id with =, tstzrange(starts_at, ends_at, '[)') with &&
  ) where (booking_type = 'full_court' and status in ('held', 'confirmed', 'checked_in'))
);
create index on bookings (court_id, starts_at);
create index on bookings (session_id) where session_id is not null;
create index on bookings (lower(guest_email));

-- Full rentals and open-play sessions share courts; GiST can't span two tables,
-- so serialise per court with an advisory lock and cross-check in a trigger.
create or replace function assert_no_cross_conflict() returns trigger language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.court_id::text, 42));
  if tg_table_name = 'bookings' then
    if new.booking_type = 'full_court' and new.status in ('held', 'confirmed', 'checked_in') and exists (
      select 1 from open_play_sessions s
      where s.court_id = new.court_id and s.status = 'scheduled'
        and tstzrange(s.starts_at, s.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
    ) then raise exception 'SLOT_TAKEN'; end if;
  elsif new.status = 'scheduled' and exists (
    select 1 from bookings b
    where b.court_id = new.court_id and b.booking_type = 'full_court'
      and b.status in ('held', 'confirmed', 'checked_in')
      and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then raise exception 'SLOT_TAKEN'; end if;
  return new;
end $$;

create trigger bookings_cross_conflict before insert or update of status, starts_at, ends_at, court_id
  on bookings for each row execute function assert_no_cross_conflict();
create trigger sessions_cross_conflict before insert or update of status, starts_at, ends_at, court_id
  on open_play_sessions for each row execute function assert_no_cross_conflict();

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger bookings_touch before update on bookings for each row execute function touch_updated_at();

-- ─────────────────────── leaderboard ───────────────────────
create table player_stats (
  id           uuid primary key default gen_random_uuid(),
  display_name text not null,
  sport        sport not null,
  rating       numeric(4, 2) not null default 3.00,
  wins         integer not null default 0,
  losses       integer not null default 0,
  streak       integer not null default 0,     -- positive = win streak, negative = losing streak
  updated_at   timestamptz not null default now()
);

create view leaderboard with (security_invoker = true) as
  select p.*, (rank() over (partition by sport order by rating desc, wins desc))::int as rank
  from player_stats p;

create view session_availability with (security_invoker = true) as
  select s.*, c.name as court_name,
         coalesce(sum(b.players) filter (where b.status in ('held', 'confirmed', 'checked_in')), 0)::int as spots_taken
  from open_play_sessions s
  join courts c on c.id = s.court_id
  left join bookings b on b.session_id = s.id
  group by s.id, c.name;

-- ───────────────────── booking RPCs (atomic) ─────────────────────
create or replace function release_expired_holds() returns integer language sql as $$
  with u as (update bookings set status = 'expired'
             where status = 'held' and hold_expires_at < now() returning 1)
  select count(*)::int from u;
$$;

create or replace function create_full_court_booking(
  p_court_id uuid, p_starts_at timestamptz, p_ends_at timestamptz,
  p_guest_name text, p_guest_email text, p_guest_phone text default null,
  p_hold_minutes integer default null            -- null = confirm immediately
) returns bookings language plpgsql security definer set search_path = public as $$
declare
  v_court courts; v_booking bookings; v_hours numeric;
  v_ls timestamp := p_starts_at at time zone 'Asia/Manila';
  v_le timestamp := p_ends_at   at time zone 'Asia/Manila';
begin
  select * into v_court from courts where id = p_court_id and is_active;
  if not found then raise exception 'COURT_NOT_FOUND'; end if;
  if p_starts_at <= now() then raise exception 'IN_THE_PAST'; end if;
  if p_ends_at <= p_starts_at or v_ls::date <> v_le::date
     or v_ls::time < v_court.opens_at or v_le::time > v_court.closes_at
  then raise exception 'OUTSIDE_HOURS'; end if;

  v_hours := extract(epoch from (p_ends_at - p_starts_at)) / 3600;
  perform release_expired_holds();
  begin
    insert into bookings (booking_type, status, court_id, starts_at, ends_at, players,
                          guest_name, guest_email, guest_phone, total_cents, hold_expires_at)
    values ('full_court', case when p_hold_minutes is null then 'confirmed' else 'held' end::booking_status,
            p_court_id, p_starts_at, p_ends_at, 1, p_guest_name, p_guest_email, p_guest_phone,
            round(v_court.hourly_rate_cents * v_hours)::int,
            case when p_hold_minutes is null then null else now() + make_interval(mins => p_hold_minutes) end)
    returning * into v_booking;
  exception when exclusion_violation then raise exception 'SLOT_TAKEN';
  end;
  return v_booking;
end $$;

create or replace function book_open_play(
  p_session_id uuid, p_players integer,
  p_guest_name text, p_guest_email text, p_guest_phone text default null
) returns bookings language plpgsql security definer set search_path = public as $$
declare v_s open_play_sessions; v_taken integer; v_booking bookings;
begin
  -- row lock serialises every concurrent joiner of this session: no overselling
  select * into v_s from open_play_sessions where id = p_session_id and status = 'scheduled' for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_s.starts_at <= now() then raise exception 'IN_THE_PAST'; end if;
  if exists (select 1 from bookings where session_id = p_session_id
             and lower(guest_email) = lower(p_guest_email) and status in ('held', 'confirmed', 'checked_in'))
  then raise exception 'ALREADY_JOINED'; end if;

  select coalesce(sum(players), 0) into v_taken from bookings
   where session_id = p_session_id and status in ('held', 'confirmed', 'checked_in');
  if v_taken + p_players > v_s.capacity then raise exception 'SESSION_FULL'; end if;

  insert into bookings (booking_type, status, court_id, session_id, starts_at, ends_at, players,
                        guest_name, guest_email, guest_phone, total_cents)
  values ('open_play', 'confirmed', v_s.court_id, v_s.id, v_s.starts_at, v_s.ends_at, p_players,
          p_guest_name, p_guest_email, p_guest_phone, v_s.price_per_player_cents * p_players)
  returning * into v_booking;
  return v_booking;
end $$;

revoke execute on function create_full_court_booking, book_open_play, release_expired_holds
  from public, anon, authenticated;                -- callable only via the service role (Server Actions)

-- ───────────────────────── RLS ─────────────────────────
alter table courts             enable row level security;
alter table open_play_sessions enable row level security;
alter table bookings           enable row level security;
alter table player_stats       enable row level security;

create policy "courts are public"   on courts             for select using (is_active);
create policy "sessions are public" on open_play_sessions for select using (status = 'scheduled');
create policy "leaderboard public"  on player_stats       for select using (true);
-- bookings: no policies. PII is only reachable through the service role in Server Actions.
-- Optional: schedule release_expired_holds() every minute with pg_cron.
