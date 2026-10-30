-- Automated hours: when no one is in the studio, so the credits in those
-- hours go to DAD (the DAD log, next). Hosted is the norm, as the station
-- runs today, and needs no record; only exceptions are kept:
--   * log_automated_weekly — routine automated windows, such as overnights
--     8 PM – 5 AM. end_time <= start_time means the window runs past
--     midnight and belongs to the day it starts on. Windows may overlap;
--     their union counts.
--   * log_on_air_changes — one-time changes in either direction: automated
--     (a holiday, a host out) or live (an election night inside hours that
--     are normally automated). A change wins over the weekly windows, and
--     changes never overlap each other (the exclusion constraint), so any
--     moment has one answer.
-- private.log_is_automated() is the SQL twin of src/lib/log/automated-hours.ts
-- isAutomated() — keep them in step.
--
-- And the one rule placement gains: a credit in automated time needs copy
-- with a DAD cut (uw_copy.dad_cut, 20261002120000), since DAD plays it — a
-- live read through its recorded version. A trigger on
-- uw_scheduled_placements enforces it for every writer (manual placement,
-- auto-fill, bumping, rotation swaps, a host's relocation), the same way
-- uw_guard_placement_copy_line() enforces copy_wrong_line.

create type public.log_on_air_mode as enum ('automated', 'live');

create table public.log_automated_weekly (
  id uuid primary key default gen_random_uuid(),
  days_of_week integer[] not null
    check (cardinality(days_of_week) > 0 and days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]),
  start_time time not null,
  end_time time not null,
  effective_from date not null default current_date,
  effective_to date,
  reason text,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

comment on table public.log_automated_weekly is
  'Routine automated hours, weekly. Hosted is the default and has no record. end_time <= start_time runs past midnight. The union of active windows counts; a log_on_air_changes row wins over them.';

create table public.log_on_air_changes (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  mode public.log_on_air_mode not null,
  reason text,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint log_on_air_changes_no_overlap
    exclude using gist (tstzrange(starts_at, ends_at) with &&) where (active)
);

comment on table public.log_on_air_changes is
  'One-time changes to who''s on air: automated (a holiday, a host out) or live (a special inside automated hours). Wins over log_automated_weekly; active changes never overlap.';

alter table public.log_automated_weekly enable row level security;
alter table public.log_on_air_changes enable row level security;

create policy log_automated_weekly_select on public.log_automated_weekly
  for select to authenticated
  using ((select private.has_log_access((select auth.uid()))));
create policy log_automated_weekly_insert on public.log_automated_weekly
  for insert to authenticated
  with check ((select private.is_log_producer((select auth.uid()))));
create policy log_automated_weekly_update on public.log_automated_weekly
  for update to authenticated
  using ((select private.is_log_producer((select auth.uid()))))
  with check ((select private.is_log_producer((select auth.uid()))));

create policy log_on_air_changes_select on public.log_on_air_changes
  for select to authenticated
  using ((select private.has_log_access((select auth.uid()))));
create policy log_on_air_changes_insert on public.log_on_air_changes
  for insert to authenticated
  with check ((select private.is_log_producer((select auth.uid()))));
create policy log_on_air_changes_update on public.log_on_air_changes
  for update to authenticated
  using ((select private.is_log_producer((select auth.uid()))))
  with check ((select private.is_log_producer((select auth.uid()))));

-- ---------------------------------------------------------------------------
-- Whether an instant is automated. Security definer: the placement trigger
-- runs for Underwriting staff, who can't read Log's tables.

create function private.log_is_automated(p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with here as (
    select (p_at at time zone 'America/Chicago')::date as d,
           extract(dow from (p_at at time zone 'America/Chicago'))::integer as dow,
           (p_at at time zone 'America/Chicago')::time as t
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

grant execute on function private.log_is_automated(timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Placement: automated time needs copy DAD can play.

create function public.uw_guard_placement_dad_cut()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'superseded' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.copy_id is not distinct from old.copy_id
     and new.scheduled_at is not distinct from old.scheduled_at then
    return new;
  end if;
  if private.log_is_automated(new.scheduled_at)
     and (select dad_cut from public.uw_copy where id = new.copy_id) is null then
    raise exception 'copy_needs_dad_cut'
      using hint = 'This break is in automated hours, and the message has no DAD cut for DAD to play.';
  end if;
  return new;
end;
$$;

create trigger uw_scheduled_placements_dad_cut_guard
  before insert or update of copy_id, scheduled_at on public.uw_scheduled_placements
  for each row execute function public.uw_guard_placement_dad_cut();
