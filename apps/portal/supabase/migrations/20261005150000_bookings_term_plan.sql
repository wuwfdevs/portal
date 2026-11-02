-- Bookings: milestone 1, slice 2 — the term plan and the production calendar
-- (docs/bookings-design.md §2.1, §2.5, §5 "Capacity", §6.4, §6.5, §8, §9).
--
-- What this adds:
--   * bk_term_plans — one term's envelope: net professional hours (the
--     director's number, a placeholder until the capacity study), the reserve
--     share, the airtime minutes a week the station contributes, and the
--     lead's hours a day. One plan is active at a time.
--   * bk_term_resources — the plan's schedulable pools (studio, field, live,
--     edit) with their units for the term and the windows a booking may take.
--   * bk_blackouts — a policy: no partner work in these dates on these pools.
--   * bk_holds — WUWF's own use of one window (core work, maintenance),
--     entered by the director; nothing is pulled from On Air's schedule.
--   * bk_bookings — a partner's hold on one window: tentative (an estimate's
--     14-day hold), confirmed, or released. project_id is a bare uuid here;
--     slice 3 adds bk_projects and the foreign key.
--   * bk_booking_allowed() — the booking rule (§6.4) as a before trigger, the
--     SQL twin of lib/bookings/scheduling.ts, so no writer slips past it. An
--     exception is the executive's alone.
--   * bk_university_avails_per_week() — the first of §6.5's two boundary
--     reads: the clocks' marked opportunities that admit university messaging,
--     counted across the week's schedule. The second,
--     bk_institutional_airtime_honored(), keys off a project's airtime
--     commitments and ships with them in slice 3.
--
-- What it does not do: SQL never computes a price (the booking records its
-- pricing treatment, not a figure), and nothing here writes into On Air or
-- Traffic.

-- Enums ------------------------------------------------------------------------------------------------------

create type public.bk_term_plan_status as enum ('draft', 'active', 'closed');
create type public.bk_hold_kind as enum ('core', 'maintenance');
create type public.bk_booking_status as enum ('tentative', 'confirmed', 'released');
create type public.bk_pricing_treatment as enum ('strategic', 'incremental', 'external');

-- Tables -----------------------------------------------------------------------------------------------------

create table public.bk_term_plans (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  starts_on date not null,
  ends_on date not null,
  -- Net schedulable professional hours for the term (§2.1: a project day is 8).
  net_professional_hours numeric(8, 2) not null default 0,
  -- The station's contribution, as a share of net (the framework's 15%).
  reserve_share numeric(5, 4) not null default 0.15,
  -- The airtime envelope: university-eligible avail minutes a week the station contributes (§2.5).
  airtime_contributed_minutes_per_week integer not null default 0,
  -- The production lead's schedulable hours in one day (§6.4 step 4).
  lead_hours_per_day numeric(4, 2) not null default 8,
  status public.bk_term_plan_status not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint bk_term_plans_dates check (ends_on >= starts_on),
  constraint bk_term_plans_net_nonnegative check (net_professional_hours >= 0),
  constraint bk_term_plans_reserve_share check (reserve_share >= 0 and reserve_share <= 1),
  constraint bk_term_plans_airtime_nonnegative check (airtime_contributed_minutes_per_week >= 0),
  constraint bk_term_plans_lead_hours check (lead_hours_per_day > 0 and lead_hours_per_day <= 24)
);
comment on table public.bk_term_plans is
  'One term''s production and airtime envelopes (docs/bookings-design.md §8). Net capacity and the reserve are kept in professional hours and shown in days.';
create unique index bk_term_plans_one_active on public.bk_term_plans (status) where status = 'active';

create table public.bk_term_resources (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.bk_term_plans (id) on delete cascade,
  pool public.bk_pool_key not null,
  -- Units available in the term (studio half-days, field days, live days, edit hours).
  available_units numeric(8, 2) not null default 0,
  unit_label text not null,
  -- The windows a booking on this pool may take: [{"key","label","start","end"}] with HH:MM times.
  windows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bk_term_resources_plan_pool unique (plan_id, pool),
  constraint bk_term_resources_units_nonnegative check (available_units >= 0),
  constraint bk_term_resources_windows_array check (jsonb_typeof(windows) = 'array')
);
comment on table public.bk_term_resources is
  'A term plan''s schedulable pools and their windows (docs/bookings-design.md §5). Units are availability constraints on the calendar; they are never summed into the guardrail.';

create table public.bk_blackouts (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.bk_term_plans (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  -- Null means every pool.
  pools public.bk_pool_key[],
  reason text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint bk_blackouts_dates check (ends_on >= starts_on),
  constraint bk_blackouts_pools_nonempty check (pools is null or cardinality(pools) > 0)
);
comment on table public.bk_blackouts is
  'A policy: no partner work on these dates and pools. No exception below the executive (docs/bookings-design.md §6.4 step 1).';
create index bk_blackouts_plan_idx on public.bk_blackouts (plan_id, starts_on);

create table public.bk_holds (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.bk_term_plans (id) on delete cascade,
  -- Null holds only the lead's hours (a day of core work away from every pool).
  pool public.bk_pool_key,
  date date not null,
  window_start time not null,
  window_end time not null,
  -- The lead's hours this takes from the day and from net capacity.
  professional_hours numeric(5, 2) not null default 0,
  kind public.bk_hold_kind not null default 'core',
  label text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint bk_holds_window check (window_end > window_start),
  constraint bk_holds_hours_nonnegative check (professional_hours >= 0)
);
comment on table public.bk_holds is
  'WUWF''s own use of one window: core work or maintenance, entered by the director. A hold takes the window and the lead''s hours; core work is never checked against capacity, it reduces it.';
create index bk_holds_plan_date_idx on public.bk_holds (plan_id, date);

create table public.bk_bookings (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.bk_term_plans (id) on delete cascade,
  -- The project this books for. A bare uuid in slice 2; slice 3 adds bk_projects and the foreign key.
  project_id uuid,
  pool public.bk_pool_key not null,
  date date not null,
  window_start time not null,
  window_end time not null,
  units numeric(6, 2) not null default 1,
  -- The professional hours this draws (a package's own figure, never converted from units).
  professional_hours numeric(5, 2) not null default 0,
  treatment public.bk_pricing_treatment not null,
  status public.bk_booking_status not null default 'tentative',
  -- A tentative booking frees itself when its estimate expires (§6.4: 14 days).
  expires_at timestamptz,
  released_at timestamptz,
  label text not null,
  notes text,
  -- The executive's exception to the booking rule: both set, or neither.
  exception_by uuid references public.profiles (id) on delete set null,
  exception_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint bk_bookings_window check (window_end > window_start),
  constraint bk_bookings_units_positive check (units > 0),
  constraint bk_bookings_hours_nonnegative check (professional_hours >= 0),
  constraint bk_bookings_exception_pair check ((exception_by is null) = (exception_reason is null))
);
comment on table public.bk_bookings is
  'A partner''s hold on one window of one pool (docs/bookings-design.md §6.4). Tentative holds count as taken; released ones are history. bk_booking_allowed() is the rule.';
create index bk_bookings_plan_date_idx on public.bk_bookings (plan_id, date);
create index bk_bookings_project_idx on public.bk_bookings (project_id) where project_id is not null;

-- updated_at maintenance ------------------------------------------------------------------------------

create trigger set_bk_term_plans_updated_at
  before update on public.bk_term_plans
  for each row execute function public.set_updated_at();
create trigger set_bk_term_resources_updated_at
  before update on public.bk_term_resources
  for each row execute function public.set_updated_at();
create trigger set_bk_bookings_updated_at
  before update on public.bk_bookings
  for each row execute function public.set_updated_at();

-- The booking rule ----------------------------------------------------------------------------------------
-- §6.4, in order: blackout or hold; window free (tentative counted as taken,
-- expired tentative not); room in the lead's day; capacity for the pricing
-- treatment. Step 2 (a reserved block for another partner) arrives with
-- agreements in slice 5. lib/bookings/scheduling.ts is the TypeScript twin
-- that explains a refusal and proposes alternatives; keep the two in step.

create function public.bk_booking_allowed()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_plan public.bk_term_plans;
  v_blackout public.bk_blackouts;
  v_hold public.bk_holds;
  v_other public.bk_bookings;
  v_day_hours numeric;
  v_reserve numeric;
  v_strategic numeric;
  v_nonstrategic numeric;
  v_held numeric;
  v_open numeric;
begin
  -- Releasing frees the window; nothing to check.
  if new.status = 'released' then
    new.released_at := coalesce(new.released_at, now());
    return new;
  end if;
  new.released_at := null;

  -- An update that leaves the booking where it is (confirming it, a label
  -- edit) is not re-checked: a later hold or a tighter plan must not refuse
  -- to confirm a hold the estimate already placed.
  if tg_op = 'UPDATE'
     and old.status <> 'released'
     and (new.plan_id, new.pool, new.date, new.window_start, new.window_end,
          new.professional_hours, new.treatment)
         is not distinct from
         (old.plan_id, old.pool, old.date, old.window_start, old.window_end,
          old.professional_hours, old.treatment) then
    return new;
  end if;

  select * into v_plan from public.bk_term_plans where id = new.plan_id;
  if v_plan.id is null then
    raise exception 'That term plan no longer exists.' using errcode = 'check_violation';
  end if;
  if new.date < v_plan.starts_on or new.date > v_plan.ends_on then
    raise exception 'The date is outside the term plan (% to %).', v_plan.starts_on, v_plan.ends_on
      using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.bk_term_resources r where r.plan_id = new.plan_id and r.pool = new.pool
  ) then
    raise exception 'The term plan has no % resource to book.', new.pool
      using errcode = 'check_violation';
  end if;

  -- The executive's exception: recorded, audited by the action, and the rule
  -- is not applied. Anyone else writing a reason is refused.
  if new.exception_reason is not null then
    if not private.is_bookings_executive(auth.uid()) then
      raise exception 'Only the Executive Director can record a booking-rule exception.'
        using errcode = 'check_violation';
    end if;
    new.exception_by := coalesce(new.exception_by, auth.uid());
    return new;
  end if;
  new.exception_by := null;

  -- 1. Blacked out?
  select * into v_blackout
  from public.bk_blackouts b
  where b.plan_id = new.plan_id
    and new.date between b.starts_on and b.ends_on
    and (b.pools is null or new.pool = any (b.pools))
  order by b.starts_on
  limit 1;
  if v_blackout.id is not null then
    raise exception 'Blacked out: % (% to %).', v_blackout.reason, v_blackout.starts_on, v_blackout.ends_on
      using errcode = 'check_violation';
  end if;

  -- 1 and 3. A WUWF hold on the window?
  select * into v_hold
  from public.bk_holds h
  where h.plan_id = new.plan_id
    and h.pool = new.pool
    and h.date = new.date
    and h.window_start < new.window_end
    and h.window_end > new.window_start
  order by h.window_start
  limit 1;
  if v_hold.id is not null then
    raise exception 'Held for WUWF on %: % (% to %).', new.date, v_hold.label, v_hold.window_start, v_hold.window_end
      using errcode = 'check_violation';
  end if;

  -- 3. Window free? Tentative holds are taken until they expire.
  select * into v_other
  from public.bk_bookings o
  where o.plan_id = new.plan_id
    and o.id <> new.id
    and o.pool = new.pool
    and o.date = new.date
    and o.status <> 'released'
    and (o.status <> 'tentative' or o.expires_at is null or o.expires_at > now())
    and o.window_start < new.window_end
    and o.window_end > new.window_start
  order by o.window_start
  limit 1;
  if v_other.id is not null then
    raise exception 'Already booked on %: % (% to %, %).', new.date, v_other.label, v_other.window_start, v_other.window_end, v_other.status
      using errcode = 'check_violation';
  end if;

  -- 4. Room in the lead's day?
  select coalesce(sum(hours), 0) into v_day_hours
  from (
    select o.professional_hours as hours
    from public.bk_bookings o
    where o.plan_id = new.plan_id and o.id <> new.id and o.date = new.date
      and o.status <> 'released'
      and (o.status <> 'tentative' or o.expires_at is null or o.expires_at > now())
    union all
    select h.professional_hours
    from public.bk_holds h
    where h.plan_id = new.plan_id and h.date = new.date
  ) day;
  if v_day_hours + new.professional_hours > v_plan.lead_hours_per_day then
    raise exception 'The lead''s day on % has % of % hours left; this needs %.',
      new.date, v_plan.lead_hours_per_day - v_day_hours, v_plan.lead_hours_per_day, new.professional_hours
      using errcode = 'check_violation';
  end if;

  -- 5. Capacity for its pricing?
  v_reserve := v_plan.net_professional_hours * v_plan.reserve_share;
  select
    coalesce(sum(o.professional_hours) filter (where o.treatment = 'strategic'), 0),
    coalesce(sum(o.professional_hours) filter (where o.treatment <> 'strategic'), 0)
  into v_strategic, v_nonstrategic
  from public.bk_bookings o
  where o.plan_id = new.plan_id and o.id <> new.id
    and o.status <> 'released'
    and (o.status <> 'tentative' or o.expires_at is null or o.expires_at > now());
  select coalesce(sum(h.professional_hours), 0) into v_held
  from public.bk_holds h where h.plan_id = new.plan_id;

  if new.treatment = 'strategic' then
    if v_strategic + new.professional_hours > v_reserve then
      raise exception 'The reserve has % of % hours left; this strategic booking needs %.',
        v_reserve - v_strategic, v_reserve, new.professional_hours
        using errcode = 'check_violation';
    end if;
  else
    -- Open capacity = net − booked − held − unused reserve, which is
    -- net − reserve − held − non-strategic bookings.
    v_open := v_plan.net_professional_hours - v_reserve - v_held - v_nonstrategic;
    if new.professional_hours > v_open then
      raise exception 'Open capacity has % hours left; this % booking needs %.',
        v_open, new.treatment, new.professional_hours
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger bk_bookings_allowed
  before insert or update on public.bk_bookings
  for each row execute function public.bk_booking_allowed();

-- The airtime boundary (§6.5), read side ----------------------------------------------------------
-- Security definer: a Bookings member has no RLS access to On Air's clocks.
-- Returns the week's university-eligible avails: for every recurring
-- schedule entry in effect on the plan's reference date (today inside the
-- term, else the term's first day), the current clock version's marked
-- opportunities whose permitted_content_types admit a university
-- announcement, repeated per hour of the block and per day of the week, plus
-- the minutes those opportunities' pinned content already takes. Nothing is
-- placed or pinned here.

create function public.bk_university_avails_per_week(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_plan public.bk_term_plans;
  v_as_of date;
  v_programs jsonb;
begin
  if auth.uid() is null or not private.has_bookings_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select * into v_plan from public.bk_term_plans where id = p_plan_id;
  if v_plan.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  v_as_of := least(greatest(v_plan.starts_on, current_date), v_plan.ends_on);

  with entries as (
    select s.id, s.program_id, s.clock_template_id, s.duration_minutes,
           case when cardinality(s.days_of_week) = 0 then 7 else cardinality(s.days_of_week) end as days,
           case when cardinality(s.days_of_week) = 0 then array[0, 1, 2, 3, 4, 5, 6] else s.days_of_week end as day_set,
           ceil(s.duration_minutes / 60.0)::integer as hours
    from public.log_schedule s
    where s.entry_type = 'recurring'
      and s.start_date <= v_as_of
      and (s.end_date is null or s.end_date >= v_as_of)
  ),
  versions as (
    select distinct on (e.id) e.id as entry_id, v.id as version_id
    from entries e
    join public.log_clock_versions v on v.clock_template_id = e.clock_template_id
    where v.effective_from <= v_as_of
      and (v.effective_to is null or v.effective_to >= v_as_of)
    order by e.id, v.effective_from desc
  ),
  opportunities as (
    select e.id as entry_id, e.program_id, e.days, e.day_set, e.hours,
           o.id as opportunity_id, cs.duration_seconds
    from entries e
    join versions v on v.entry_id = e.id
    join public.log_local_opportunities o on o.clock_version_id = v.version_id and o.active
    join public.log_clock_slots cs on cs.id = o.slot_id
    where 'university_announcement' = any (o.permitted_content_types)
  ),
  pins as (
    select op.entry_id,
           a.id as assignment_id,
           (case when a.hour_index is null then op.hours else 1 end)
             * (case when cardinality(a.days_of_week) = 0 then op.days
                     else (select count(*) from unnest(a.days_of_week) d where d = any (op.day_set)) end)
             as occurrences,
           coalesce(
             nullif((select sum(c.duration_seconds) from public.log_content_components c
                      where c.content_item_id = ci.id and c.required), 0),
             ci.expected_duration_seconds,
             0
           ) as seconds
    from opportunities op
    join public.log_opportunity_assignments a on a.local_opportunity_id = op.opportunity_id and a.active
    join public.log_content_items ci on ci.id = a.content_item_id
  ),
  per_entry as (
    select e.id as entry_id, e.program_id,
           coalesce(count(op.opportunity_id) * max(e.hours) * max(e.days), 0) as avails,
           coalesce(sum(op.duration_seconds) * max(e.hours) * max(e.days), 0) as seconds,
           coalesce((select sum(p.occurrences * p.seconds) from pins p where p.entry_id = e.id), 0) as pinned_seconds
    from entries e
    left join opportunities op on op.entry_id = e.id
    group by e.id, e.program_id
  ),
  per_program as (
    select pe.program_id, pr.name,
           sum(pe.avails)::integer as avails,
           round(sum(pe.seconds) / 60.0, 1) as minutes,
           round(sum(pe.pinned_seconds) / 60.0, 1) as pinned_minutes
    from per_entry pe
    join public.log_programs pr on pr.id = pe.program_id
    group by pe.program_id, pr.name
    having sum(pe.avails) > 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'program_id', program_id,
    'name', name,
    'avails_per_week', avails,
    'minutes_per_week', minutes,
    'pinned_minutes_per_week', pinned_minutes
  ) order by name), '[]'::jsonb)
  into v_programs
  from per_program;

  return jsonb_build_object(
    'ok', true,
    'as_of', v_as_of,
    'programs', v_programs
  );
end;
$$;
comment on function public.bk_university_avails_per_week(uuid) is
  'Bookings'' read of On Air''s clocks (docs/bookings-design.md §6.5): university-eligible avails and minutes a week, per program, with the minutes their pinned content already takes. Security definer; read only; places nothing.';

revoke execute on function public.bk_university_avails_per_week(uuid) from public, anon;
grant execute on function public.bk_university_avails_per_week(uuid) to authenticated;

-- RLS ----------------------------------------------------------------------------------------------------------
-- Members read everything. The plan, its resources, blackouts and holds are
-- the director's (§6.1); a booking is the lead's or the director's. Nothing
-- deletes a booking — it is released.

alter table public.bk_term_plans enable row level security;
alter table public.bk_term_resources enable row level security;
alter table public.bk_blackouts enable row level security;
alter table public.bk_holds enable row level security;
alter table public.bk_bookings enable row level security;

grant select, insert, update on public.bk_term_plans to authenticated;
grant select, insert, update, delete on public.bk_term_resources to authenticated;
grant select, insert, update, delete on public.bk_blackouts to authenticated;
grant select, insert, update, delete on public.bk_holds to authenticated;
grant select, insert, update on public.bk_bookings to authenticated;

create policy bk_term_plans_select on public.bk_term_plans
  for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_term_plans_write on public.bk_term_plans
  for all to authenticated
  using ((select private.is_bookings_director((select auth.uid()))))
  with check ((select private.is_bookings_director((select auth.uid()))));

create policy bk_term_resources_select on public.bk_term_resources
  for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_term_resources_write on public.bk_term_resources
  for all to authenticated
  using ((select private.is_bookings_director((select auth.uid()))))
  with check ((select private.is_bookings_director((select auth.uid()))));

create policy bk_blackouts_select on public.bk_blackouts
  for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_blackouts_write on public.bk_blackouts
  for all to authenticated
  using ((select private.is_bookings_director((select auth.uid()))))
  with check ((select private.is_bookings_director((select auth.uid()))));

create policy bk_holds_select on public.bk_holds
  for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_holds_write on public.bk_holds
  for all to authenticated
  using ((select private.is_bookings_director((select auth.uid()))))
  with check ((select private.is_bookings_director((select auth.uid()))));

create policy bk_bookings_select on public.bk_bookings
  for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_bookings_insert on public.bk_bookings
  for insert to authenticated
  with check (
    (select private.is_bookings_lead((select auth.uid())))
    or (select private.is_bookings_director((select auth.uid())))
    or (select private.is_bookings_executive((select auth.uid())))
  );
create policy bk_bookings_update on public.bk_bookings
  for update to authenticated
  using (
    (select private.is_bookings_lead((select auth.uid())))
    or (select private.is_bookings_director((select auth.uid())))
    or (select private.is_bookings_executive((select auth.uid())))
  )
  with check (
    (select private.is_bookings_lead((select auth.uid())))
    or (select private.is_bookings_director((select auth.uid())))
    or (select private.is_bookings_executive((select auth.uid())))
  );
