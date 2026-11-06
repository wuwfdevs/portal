-- The station's own settings, and the station's clock in the database.
--
-- Five SQL functions hard-coded 'America/Chicago': the station's current calendar date (uw_station_today,
-- bk_station_today), a time of day in station time (uw_station_local_time), and whether an instant falls in
-- automated hours or hours closed to underwriting (log_is_automated, log_is_closed_to_underwriting). A
-- station in another zone would have had the right TypeScript and the wrong database. They now ask
-- private.station_time_zone(), which reads the one row of public.station_settings.
--
-- The table is a singleton (id is always true, the shape ap_settings and bk_settings use). It holds the
-- station's time zone now and the identity text a later change moves out of the code (display name,
-- call sign, licensee, mailing address, city, region, support address, public attribution line); those
-- columns are nullable and unset until that change fills them. Everyone signed in can read it; only an
-- administrator can change it. Nothing deletes or inserts a row: the one row is created here.
--
-- The seeded time zone is America/Chicago: the value the code used until now, so nothing changes for the
-- existing deployments. A new install sets its own (INSTALL.md). The TypeScript half of the clock is the
-- NEXT_PUBLIC_STATION_TIME_ZONE setting (lib/station-time.ts); the two must agree, and /admin/tools says
-- so when they do not.
--
-- Volatility: uw_station_local_time was `immutable`, which a function reading a table cannot be. It is
-- `stable` now. Nothing indexes it, checks with it, defaults to it or has a policy on it, and its only
-- callers are volatile functions (checked on both hosted projects). bk_station_today is callable by anyone
-- (it never revoked from public) and the zone function is not, so it becomes security definer rather than
-- start failing for a caller without the right to the private schema; it returns a date and nothing else.

create table public.station_settings (
  id boolean primary key default true check (id),
  time_zone text not null default 'America/Chicago',
  display_name text check (char_length(display_name) <= 120),
  short_name text check (char_length(short_name) <= 40),
  call_sign text check (char_length(call_sign) <= 40),
  licensee text check (char_length(licensee) <= 160),
  mailing_address text check (char_length(mailing_address) <= 400),
  primary_city text check (char_length(primary_city) <= 80),
  region text check (char_length(region) <= 80),
  support_email text check (char_length(support_email) <= 200),
  public_attribution text check (char_length(public_attribution) <= 200),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

comment on table public.station_settings is
  'Singleton (id always true). The station''s time zone and identity. private.station_time_zone() reads time_zone; the TypeScript clock is NEXT_PUBLIC_STATION_TIME_ZONE and must agree with it.';

-- A time zone Postgres does not know would make every `at time zone` in the functions below fail or,
-- worse, shift silently. Refuse it at the write.
create function public.station_settings_check_time_zone()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.time_zone) then
    raise exception 'Unknown time zone "%". Use an IANA name such as America/Chicago.', new.time_zone;
  end if;
  return new;
end;
$$;

create trigger station_settings_check_time_zone
  before insert or update on public.station_settings
  for each row execute function public.station_settings_check_time_zone();

create trigger set_station_settings_updated_at
  before update on public.station_settings
  for each row execute function public.set_updated_at();

alter table public.station_settings enable row level security;

-- Supabase grants new tables to anon and authenticated broadly; only reading and updating the one row is
-- ever meant to be allowed, and row security enforces that too (there is no insert or delete policy).
revoke all on public.station_settings from anon, authenticated;
grant select, update on public.station_settings to authenticated;

create policy station_settings_select on public.station_settings
  for select to authenticated
  using (private.is_active_profile(auth.uid()));

create policy station_settings_update on public.station_settings
  for update to authenticated
  using (private.is_administrator(auth.uid()))
  with check (private.is_administrator(auth.uid()));

insert into public.station_settings (id, time_zone) values (true, 'America/Chicago') on conflict (id) do nothing;

-- The station's zone for the functions below. Security definer so a caller without table access (Traffic
-- staff running a placement that reads On Air's hours) still gets the answer. A missing row is an error,
-- not a quiet default: an `at time zone null` would return null and every date computed from it would be
-- wrong without a message.
create function private.station_time_zone()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_zone text;
begin
  select s.time_zone into v_zone from public.station_settings s where s.id;
  if v_zone is null then
    raise exception 'public.station_settings has no row; the station time zone is not set.';
  end if;
  return v_zone;
end;
$$;

revoke execute on function private.station_time_zone() from public, anon;
grant execute on function private.station_time_zone() to authenticated;

create or replace function public.uw_station_local_time(p_at timestamptz)
returns time
language sql
stable
as $$
  select (p_at at time zone private.station_time_zone())::time;
$$;

create or replace function public.uw_station_today()
returns date
language sql
stable
as $$
  select (now() at time zone private.station_time_zone())::date;
$$;

create or replace function public.bk_station_today()
returns date language sql stable security definer set search_path = public
as $$ select (now() at time zone private.station_time_zone())::date; $$;

create or replace function private.log_is_automated(p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with here as (
    select (p_at at time zone private.station_time_zone())::date as d,
           extract(dow from (p_at at time zone private.station_time_zone()))::integer as dow,
           (p_at at time zone private.station_time_zone())::time as t
  ),
  change as (
    select c.mode
    from public.log_on_air_changes c
    where c.active and p_at >= c.starts_at and p_at < c.ends_at
    limit 1
  )
  select case
    when exists (select 1 from change) then (select mode = 'automated' from change)
    else exists (
      select 1
      from public.log_automated_weekly w, here h
      where w.active
        and (
          -- Same-day window.
          (w.end_time > w.start_time
            and h.dow = any (w.days_of_week)
            and h.t >= w.start_time and h.t < w.end_time
            and w.effective_from <= h.d and (w.effective_to is null or w.effective_to >= h.d))
          -- Past midnight, evening part: today's window.
          or (w.end_time <= w.start_time
            and h.t >= w.start_time
            and h.dow = any (w.days_of_week)
            and w.effective_from <= h.d and (w.effective_to is null or w.effective_to >= h.d))
          -- Past midnight, early-morning part: the window that started yesterday.
          or (w.end_time <= w.start_time
            and h.t < w.end_time
            and ((h.dow + 6) % 7) = any (w.days_of_week)
            and w.effective_from <= h.d - 1 and (w.effective_to is null or w.effective_to >= h.d - 1))
        )
    )
  end;
$$;

create or replace function private.log_is_closed_to_underwriting(p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with here as (
    select (p_at at time zone private.station_time_zone())::date as d,
           extract(dow from (p_at at time zone private.station_time_zone()))::integer as dow,
           (p_at at time zone private.station_time_zone())::time as t
  ),
  change as (
    select c.mode
    from public.log_underwriting_hour_changes c
    where c.active and p_at >= c.starts_at and p_at < c.ends_at
    limit 1
  )
  select case
    when exists (select 1 from change) then (select mode = 'closed' from change)
    else exists (
      select 1
      from public.log_underwriting_closed_weekly w, here h
      where w.active
        and (
          -- Same-day window.
          (w.end_time > w.start_time
            and h.dow = any (w.days_of_week)
            and h.t >= w.start_time and h.t < w.end_time
            and w.effective_from <= h.d and (w.effective_to is null or w.effective_to >= h.d))
          -- Past midnight, evening part: today's window.
          or (w.end_time <= w.start_time
            and h.t >= w.start_time
            and h.dow = any (w.days_of_week)
            and w.effective_from <= h.d and (w.effective_to is null or w.effective_to >= h.d))
          -- Past midnight, early-morning part: the window that started yesterday.
          or (w.end_time <= w.start_time
            and h.t < w.end_time
            and ((h.dow + 6) % 7) = any (w.days_of_week)
            and w.effective_from <= h.d - 1 and (w.effective_to is null or w.effective_to >= h.d - 1))
        )
    )
  end;
$$;

comment on function public.uw_station_today() is
  'The station''s current calendar date, in the zone private.station_time_zone() names — the SQL twin of lib/station-time.ts''s stationTodayISO().';
