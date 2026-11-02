-- Underwriting & Traffic: insertion-order-grounded redesign —
-- docs/underwriting-traffic-redesign.md (read it first; §1 lists every
-- object this touches and §5 is the data plan this file executes).
--
-- The one-shape schedule line (days of week + a total override) could not
-- express the real orders on file: "3 rotation spots a week on any day",
-- "2 AM-drive credits each weekday the week before the concert", an
-- explicit date list per production, or an agency's week-by-week grid.
-- This migration:
--
--   1. Resets test data: every uw_contracts row (production: one draft
--      contract with no lines; preview: the seeded reference contract and 75
--      test placements whose Log items the slot-keyed migration already
--      removed). Underwriters and copy — the copy library the program-log
--      import maintains — are untouched.
--   2. Rewrites uw_contract_schedule_lines in place around four typed rule
--      kinds (fixed_days / weekly_quota / explicit_dates / week_grid), an
--      inventory pool or program target, optional flight, cancellation.
--   3. Adds uw_inventory_pools/_targets (station-defined "AM Drive",
--      "Carpool" … mapped to Log programs/windows), uw_contract_flights
--      (event groupings that scope copy), uw_schedule_allocations (the
--      per-date / per-week quantities behind the explicit and grid kinds).
--   4. Records on every placement which demand unit it consumes
--      (demand_period_start/end) and which makegood it schedules, so
--      per-period fulfillment never counts a missed unit and its
--      replacement as two deliveries.
--   5. Adds the agency-approval and separation policy the FPM orders need,
--      on the contract and on each exception.
--   6. Replaces log_place_underwriting_credit() and
--      log_list_placeable_rundown_breaks() so the database enforces the
--      same contractual limits the planner plans against — date and day
--      eligibility, pool/window, the period's quota, the day cap, one credit
--      per contract per break, flight-scoped copy, and a makegood's approval
--      state — under a row lock on the schedule line, so two concurrent
--      staff actions cannot both fill the same unit.
--
-- Station-local time: the window checks below convert scheduled_at with the
-- same zone lib/log/timezone.ts's STATION_TIME_ZONE names ("America/Chicago"
-- — WUWF is Central despite the Florida address). If that constant ever
-- changes, uw_station_local_time() below is the one SQL place to change.

-- ============================================================================
-- 1. Test-data reset
-- ============================================================================

-- A Log item still backed by an active placement would be orphaned in its
-- break once the placement cascades away; delete it first (none exist in
-- either project as of 2026-09-25 — this is a guard, not a data step).
delete from public.log_rundown_items i
using public.uw_scheduled_placements sp
where sp.log_rundown_item_id = i.id and sp.status <> 'superseded';

delete from public.uw_contracts;

-- ============================================================================
-- 2. Enums
-- ============================================================================

create type public.uw_schedule_rule_kind as enum ('fixed_days', 'weekly_quota', 'explicit_dates', 'week_grid');
create type public.uw_schedule_line_status as enum ('active', 'cancelled');
create type public.uw_allocation_period_kind as enum ('day', 'week');
create type public.uw_flight_status as enum ('active', 'cancelled');
create type public.uw_separation_policy as enum ('unspecified', 'none', 'min_minutes');
create type public.uw_makegood_approval as enum ('not_required', 'pending', 'approved', 'declined');

-- ============================================================================
-- 3. Inventory pools
-- ============================================================================

create table public.uw_inventory_pools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uw_inventory_pools_name_unique unique (name)
);

comment on table public.uw_inventory_pools is
  'A station-defined inventory class an insertion order sells by name — "AM Drive", "PM Drive", "Total Program Rotation", "Weekend Edition", "Carpool", "Mid-day" (docs/underwriting-traffic-redesign.md §3). Never assumed to be a log_programs id; its targets map it to real Log opportunities.';

create table public.uw_inventory_pool_targets (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.uw_inventory_pools (id) on delete cascade,
  program_id uuid references public.log_programs (id) on delete restrict,
  window_start time,
  window_end time,
  days_of_week integer[],
  notes text,
  created_at timestamptz not null default now(),
  constraint uw_inventory_pool_targets_window_pair_check
    check ((window_start is null) = (window_end is null)),
  constraint uw_inventory_pool_targets_window_order_check
    check (window_start is null or window_end > window_start),
  constraint uw_inventory_pool_targets_days_check
    check (days_of_week is null or array_length(days_of_week, 1) > 0)
);

comment on table public.uw_inventory_pool_targets is
  'One way a pool maps onto Log: an optional program, an optional station-local time window (end exclusive), optional days. A break belongs to the pool when any target matches. A pool with one all-null target means "any marked opportunity, any program" (Total Program Rotation).';

create index uw_inventory_pool_targets_pool_idx on public.uw_inventory_pool_targets (pool_id);

create trigger set_uw_inventory_pools_updated_at
  before update on public.uw_inventory_pools
  for each row execute function public.set_updated_at();

alter table public.uw_inventory_pools enable row level security;
alter table public.uw_inventory_pool_targets enable row level security;

grant select, insert, update on public.uw_inventory_pools to authenticated;
grant select, insert, update, delete on public.uw_inventory_pool_targets to authenticated;

create policy uw_inventory_pools_select on public.uw_inventory_pools
  for select to authenticated
  using ((select private.has_underwriting_access((select auth.uid()))));
create policy uw_inventory_pools_insert on public.uw_inventory_pools
  for insert to authenticated
  with check ((select private.has_underwriting_access((select auth.uid()))));
create policy uw_inventory_pools_update on public.uw_inventory_pools
  for update to authenticated
  using ((select private.has_underwriting_access((select auth.uid()))))
  with check ((select private.has_underwriting_access((select auth.uid()))));

create policy uw_inventory_pool_targets_select on public.uw_inventory_pool_targets
  for select to authenticated
  using ((select private.has_underwriting_access((select auth.uid()))));
create policy uw_inventory_pool_targets_insert on public.uw_inventory_pool_targets
  for insert to authenticated
  with check ((select private.has_underwriting_access((select auth.uid()))));
create policy uw_inventory_pool_targets_update on public.uw_inventory_pool_targets
  for update to authenticated
  using ((select private.has_underwriting_access((select auth.uid()))))
  with check ((select private.has_underwriting_access((select auth.uid()))));
create policy uw_inventory_pool_targets_delete on public.uw_inventory_pool_targets
  for delete to authenticated
  using ((select private.has_underwriting_access((select auth.uid()))));

-- ============================================================================
-- 4. Contract flights
-- ============================================================================

create table public.uw_contract_flights (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.uw_contracts (id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  status public.uw_flight_status not null default 'active',
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint uw_contract_flights_date_range_check check (end_date >= start_date),
  constraint uw_contract_flights_cancel_check check (status = 'active' or cancelled_at is not null)
);

comment on table public.uw_contract_flights is
  'An event or production under a contract (a concert, a theatre run) that groups schedule lines and scopes copy: uw_contract_copy.flight_id ties a script to its event, and a line in flight X only ever places copy linked to X or to no flight. Cancelling a flight cancels its lines from today.';

create index uw_contract_flights_contract_idx on public.uw_contract_flights (contract_id);

alter table public.uw_contract_flights enable row level security;
grant select, insert, update on public.uw_contract_flights to authenticated;

create policy uw_contract_flights_select on public.uw_contract_flights
  for select to authenticated
  using ((select private.has_underwriting_access((select auth.uid()))));
create policy uw_contract_flights_insert on public.uw_contract_flights
  for insert to authenticated
  with check ((select private.has_underwriting_access((select auth.uid()))));
create policy uw_contract_flights_update on public.uw_contract_flights
  for update to authenticated
  using ((select private.has_underwriting_access((select auth.uid()))))
  with check ((select private.has_underwriting_access((select auth.uid()))));

alter table public.uw_contract_copy
  add column flight_id uuid references public.uw_contract_flights (id) on delete set null;

comment on column public.uw_contract_copy.flight_id is
  'Null: this copy serves the whole contract. Set: only schedule lines in this flight may place it (checked by log_place_underwriting_credit()).';

-- ============================================================================
-- 5. Contracts: policy the orders state
-- ============================================================================

alter table public.uw_contracts
  add column stated_total_spots integer,
  add column makegood_requires_agency_approval boolean not null default false,
  add column separation_source_text text,
  add column separation_policy public.uw_separation_policy not null default 'unspecified',
  add column separation_minutes integer,
  add constraint uw_contracts_stated_total_check
    check (stated_total_spots is null or stated_total_spots >= 0),
  add constraint uw_contracts_separation_minutes_check
    check ((separation_policy = 'min_minutes') = (separation_minutes is not null)),
  add constraint uw_contracts_separation_minutes_positive_check
    check (separation_minutes is null or separation_minutes > 0);

comment on column public.uw_contracts.stated_total_spots is
  'The order''s own total spot count, when it prints one. Validated against the schedule lines'' expansion on screen — never the scheduling target.';
comment on column public.uw_contracts.makegood_requires_agency_approval is
  'FPM orders: "MAKEGOODS MUST BE APPROVED BY AGENCY." Every new exception under this contract starts with makegood_approval = pending, and no makegood is scheduled until staff record the agency''s approval.';
comment on column public.uw_contracts.separation_source_text is
  'The order''s separation instruction verbatim (FPM prints "3" with no unit). Stored, never interpreted: separation_policy stays unspecified until a staff member decides, and auto-fill skips the contract while it does.';
comment on column public.uw_contracts.separation_policy is
  'unspecified: no decision yet (auto-fill refuses to schedule while source text is present). none: only the standard within-break rules apply. min_minutes: this contract''s own credits on one day are kept at least separation_minutes apart.';

-- ============================================================================
-- 6. Schedule lines, rewritten in place (the table is empty after §1)
-- ============================================================================

alter table public.uw_contract_schedule_lines
  drop constraint uw_contract_schedule_lines_days_check,
  drop constraint uw_contract_schedule_lines_occurrence_override_check,
  drop column occurrence_count_override,
  drop column makegood_policy,
  alter column days_of_week drop not null,
  alter column days_of_week set default '{}'::integer[],
  add column label text not null default '',
  add column rule_kind public.uw_schedule_rule_kind not null,
  add column flight_id uuid references public.uw_contract_flights (id) on delete set null,
  add column pool_id uuid references public.uw_inventory_pools (id) on delete restrict,
  add column window_start time,
  add column window_end time,
  add column count_per_day integer,
  add column quantity_per_week integer,
  add column max_per_day integer,
  add column is_bonus boolean not null default false,
  add column stated_total integer,
  add column source_text text,
  add column status public.uw_schedule_line_status not null default 'active',
  add column cancelled_from date,
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references public.profiles (id) on delete set null,
  add column updated_at timestamptz not null default now(),
  add constraint uw_contract_schedule_lines_target_check
    check (pool_id is not null or program_id is not null),
  add constraint uw_contract_schedule_lines_window_pair_check
    check ((window_start is null) = (window_end is null)),
  add constraint uw_contract_schedule_lines_window_order_check
    check (window_start is null or window_end > window_start),
  add constraint uw_contract_schedule_lines_stated_total_check
    check (stated_total is null or stated_total >= 0),
  add constraint uw_contract_schedule_lines_cancel_check
    check (status = 'active' or (cancelled_from is not null and cancelled_at is not null)),
  add constraint uw_contract_schedule_lines_rule_shape_check check (
    case rule_kind
      when 'fixed_days' then
        count_per_day >= 1 and array_length(days_of_week, 1) > 0
        and quantity_per_week is null and max_per_day is null
      when 'weekly_quota' then
        quantity_per_week >= 1 and max_per_day >= 1 and array_length(days_of_week, 1) > 0
        and count_per_day is null
      when 'explicit_dates' then
        count_per_day is null and quantity_per_week is null and max_per_day is null
      when 'week_grid' then
        max_per_day >= 1 and array_length(days_of_week, 1) > 0
        and count_per_day is null and quantity_per_week is null
    end
  );

comment on table public.uw_contract_schedule_lines is
  'One traffic instruction under a contract, in one of four typed shapes (docs/underwriting-traffic-redesign.md §3): fixed_days (count_per_day on each of days_of_week), weekly_quota (quantity_per_week on any of days_of_week, at most max_per_day a day), explicit_dates and week_grid (quantities in uw_schedule_allocations). Targets an inventory pool and/or a program, optionally narrowed to a station-local window. Dated phases are separate lines; event flights group them. Demand expansion lives in lib/underwriting/demand.ts; the same rules are enforced by log_place_underwriting_credit() through uw_line_period_for_date().';
comment on column public.uw_contract_schedule_lines.days_of_week is
  '0=Sunday..6=Saturday, matching log_schedule. fixed_days: the days a credit airs. weekly_quota/week_grid: the days a credit may air. explicit_dates: unused (empty).';
comment on column public.uw_contract_schedule_lines.target_time is
  'A contracted exact time ("Tuesday @ 8:19 AM") is preserved here and preferred by the planner; a daypart order leaves it null. A target, not a promise — the pool/window is the eligibility.';
comment on column public.uw_contract_schedule_lines.stated_total is
  'The order''s own count for this line ("52 spots", "104 Drive Time"). Compared against the expansion on screen; a mismatch is a review warning for a traffic staffer, never silently resolved.';
comment on column public.uw_contract_schedule_lines.source_text is
  'The order''s wording for this line, verbatim. Kept for nuance; never interpreted as an executable rule.';
comment on column public.uw_contract_schedule_lines.cancelled_from is
  'Set with status = cancelled: demand on or after this date is void and active placements on or after it were cleared. Placements before it stand, as do their broadcast events.';

create index uw_contract_schedule_lines_pool_idx on public.uw_contract_schedule_lines (pool_id);
create index uw_contract_schedule_lines_flight_idx on public.uw_contract_schedule_lines (flight_id);

create trigger set_uw_contract_schedule_lines_updated_at
  before update on public.uw_contract_schedule_lines
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 7. Allocations (explicit_dates and week_grid quantities)
-- ============================================================================

create table public.uw_schedule_allocations (
  id uuid primary key default gen_random_uuid(),
  schedule_line_id uuid not null references public.uw_contract_schedule_lines (id) on delete cascade,
  period_kind public.uw_allocation_period_kind not null,
  period_start date not null,
  quantity integer not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint uw_schedule_allocations_quantity_check check (quantity >= 0),
  constraint uw_schedule_allocations_week_monday_check
    check (period_kind = 'day' or extract(isodow from period_start) = 1),
  constraint uw_schedule_allocations_unique unique (schedule_line_id, period_start)
);

comment on table public.uw_schedule_allocations is
  'One demand unit of an explicit_dates line (period_kind day: this date needs quantity credits) or a week_grid line (period_kind week: the Monday-started broadcast week needs quantity — zero weeks are real rows, matching the agency grid). Lines of the other two kinds have no rows here.';

create index uw_schedule_allocations_line_idx on public.uw_schedule_allocations (schedule_line_id, period_start);

alter table public.uw_schedule_allocations enable row level security;
grant select, insert, update, delete on public.uw_schedule_allocations to authenticated;

create policy uw_schedule_allocations_select on public.uw_schedule_allocations
  for select to authenticated
  using ((select private.has_underwriting_access((select auth.uid()))));
create policy uw_schedule_allocations_insert on public.uw_schedule_allocations
  for insert to authenticated
  with check ((select private.has_underwriting_access((select auth.uid()))));
create policy uw_schedule_allocations_update on public.uw_schedule_allocations
  for update to authenticated
  using ((select private.has_underwriting_access((select auth.uid()))))
  with check ((select private.has_underwriting_access((select auth.uid()))));
create policy uw_schedule_allocations_delete on public.uw_schedule_allocations
  for delete to authenticated
  using ((select private.has_underwriting_access((select auth.uid()))));

-- ============================================================================
-- 8. Placements, exceptions, makegoods: the demand unit each one serves
-- ============================================================================

alter table public.uw_scheduled_placements
  add column demand_period_start date not null,
  add column demand_period_end date not null,
  add column makegood_id uuid references public.uw_makegoods (id) on delete set null,
  add constraint uw_scheduled_placements_period_check check (demand_period_end >= demand_period_start);

comment on column public.uw_scheduled_placements.demand_period_start is
  'The contractual unit this placement consumes — the calendar day (fixed_days, explicit_dates) or the Monday-started week (weekly_quota, week_grid) — so per-period fulfillment is a count, not a guess. A makegood inherits the missed placement''s period.';
comment on column public.uw_scheduled_placements.makegood_id is
  'Set when this placement schedules a makegood (log_place_underwriting_credit''s p_makegood_id). Such a placement is exempt from the period quota — it replaces a unit — but not from the day cap.';

create index uw_scheduled_placements_period_idx
  on public.uw_scheduled_placements (schedule_line_id, demand_period_start)
  where status <> 'superseded';
create index uw_scheduled_placements_date_idx
  on public.uw_scheduled_placements (schedule_line_id, placement_date)
  where status <> 'superseded';

alter table public.uw_exceptions
  add column scheduled_placement_id uuid references public.uw_scheduled_placements (id) on delete set null,
  add column makegood_approval public.uw_makegood_approval not null default 'not_required',
  add column makegood_approval_note text,
  add column makegood_approval_at timestamptz,
  add column makegood_approval_by uuid references public.profiles (id) on delete set null;

comment on column public.uw_exceptions.makegood_approval is
  'not_required unless the contract says makegoods need agency approval; then pending until staff record approved/declined. A pending or declined exception''s makegood cannot be scheduled — enforced by log_place_underwriting_credit().';

alter table public.uw_makegoods
  add column demand_period_start date,
  add column demand_period_end date,
  add constraint uw_makegoods_period_check
    check (demand_period_end is null or (demand_period_start is not null and demand_period_end >= demand_period_start));

comment on column public.uw_makegoods.demand_period_start is
  'Copied from the missed placement when the makegood is created, so the replacement airing is attributed to the period the order missed.';

-- ============================================================================
-- 9. Helper functions
-- ============================================================================

-- The station's zone, in one SQL place (see the file header).
create or replace function public.uw_station_local_time(p_at timestamptz)
returns time
language sql
immutable
as $$
  select (p_at at time zone 'America/Chicago')::time;
$$;

revoke execute on function public.uw_station_local_time(timestamptz) from public, anon;
grant execute on function public.uw_station_local_time(timestamptz) to authenticated;

-- Which demand unit a date belongs to under a line's rule, and that unit's
-- quantity and per-day cap — the single SQL counterpart of
-- lib/underwriting/demand.ts's periodForDate(). eligible = false when the
-- date is outside the line, cancelled, on a wrong weekday, or (explicit /
-- grid) has no allocation. Week periods start on Monday, station-local
-- calendar dates (an air_date is already a date, so no zone math here).
create or replace function public.uw_line_period_for_date(
  p_line public.uw_contract_schedule_lines,
  p_date date
)
returns table (eligible boolean, period_start date, period_end date, quantity integer, day_cap integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dow integer := extract(dow from p_date)::integer;
  v_week_start date := p_date - ((extract(isodow from p_date)::integer) - 1);
  v_alloc public.uw_schedule_allocations;
begin
  eligible := false;
  period_start := null; period_end := null; quantity := null; day_cap := null;

  if p_date < p_line.start_date or (p_line.end_date is not null and p_date > p_line.end_date) then
    return next; return;
  end if;
  if p_line.status = 'cancelled' and p_line.cancelled_from is not null and p_date >= p_line.cancelled_from then
    return next; return;
  end if;

  case p_line.rule_kind
    when 'fixed_days' then
      if v_dow = any(p_line.days_of_week) then
        eligible := true;
        period_start := p_date; period_end := p_date;
        quantity := p_line.count_per_day; day_cap := p_line.count_per_day;
      end if;
    when 'weekly_quota' then
      if v_dow = any(p_line.days_of_week) then
        eligible := true;
        period_start := v_week_start; period_end := v_week_start + 6;
        quantity := p_line.quantity_per_week; day_cap := p_line.max_per_day;
      end if;
    when 'explicit_dates' then
      select * into v_alloc from public.uw_schedule_allocations
      where schedule_line_id = p_line.id and period_kind = 'day' and period_start = p_date;
      if found and v_alloc.quantity > 0 then
        eligible := true;
        period_start := p_date; period_end := p_date;
        quantity := v_alloc.quantity; day_cap := v_alloc.quantity;
      end if;
    when 'week_grid' then
      select * into v_alloc from public.uw_schedule_allocations
      where schedule_line_id = p_line.id and period_kind = 'week' and period_start = v_week_start;
      if found and v_alloc.quantity > 0 and v_dow = any(p_line.days_of_week) then
        eligible := true;
        period_start := v_week_start; period_end := v_week_start + 6;
        quantity := v_alloc.quantity; day_cap := p_line.max_per_day;
      end if;
  end case;

  return next;
end;
$$;

revoke execute on function public.uw_line_period_for_date(public.uw_contract_schedule_lines, date) from public, anon;
grant execute on function public.uw_line_period_for_date(public.uw_contract_schedule_lines, date) to authenticated;

-- Does a break on this program at this station-local time, on this weekday,
-- fall inside the pool? Any target matching is enough.
create or replace function public.uw_pool_matches(
  p_pool_id uuid,
  p_program_id uuid,
  p_local_time time,
  p_dow integer
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.uw_inventory_pool_targets t
    where t.pool_id = p_pool_id
      and (t.program_id is null or t.program_id = p_program_id)
      and (t.window_start is null or (p_local_time >= t.window_start and p_local_time < t.window_end))
      and (t.days_of_week is null or p_dow = any(t.days_of_week))
  );
$$;

revoke execute on function public.uw_pool_matches(uuid, uuid, time, integer) from public, anon, authenticated;

-- ============================================================================
-- 10. The Log boundary: candidate breaks and the guarded write
-- ============================================================================

create or replace function public.log_list_placeable_rundown_breaks(p_schedule_line_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.uw_contract_schedule_lines;
  v_contract public.uw_contracts;
  v_breaks jsonb;
begin
  if auth.uid() is null or not private.has_underwriting_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select * into v_line from public.uw_contract_schedule_lines where id = p_schedule_line_id;
  if not found then
    return jsonb_build_object('error', 'unknown_schedule_line');
  end if;
  select * into v_contract from public.uw_contracts where id = v_line.contract_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'break_id', b.id,
    'rundown_id', lr.id,
    'air_date', lr.air_date,
    'scheduled_at', b.scheduled_at,
    'minutes_of_day', (extract(hour from public.uw_station_local_time(b.scheduled_at)) * 60
                       + extract(minute from public.uw_station_local_time(b.scheduled_at)))::integer,
    'label', b.label,
    'program_name', lp.name,
    'remaining_seconds', b.available_duration_seconds - coalesce(occupied.total, 0),
    'last_item_id', last_item.id,
    'holds_this_contract', exists (
      select 1 from public.uw_scheduled_placements sp
      join public.log_rundown_items ci on ci.id = sp.log_rundown_item_id
      join public.uw_contract_schedule_lines sl on sl.id = sp.schedule_line_id
      where ci.break_id = b.id and sp.status <> 'superseded' and sl.contract_id = v_contract.id
    )
  ) order by b.scheduled_at), '[]'::jsonb)
  into v_breaks
  from public.log_rundown_breaks b
  join public.log_rundowns lr on lr.id = b.rundown_id
  join public.log_programs lp on lp.id = lr.program_id
  cross join lateral public.uw_line_period_for_date(v_line, lr.air_date) period
  left join lateral (
    select sum(i.planned_duration_seconds) as total
    from public.log_rundown_items i
    where i.break_id = b.id
  ) occupied on true
  left join lateral (
    select i.id
    from public.log_rundown_items i
    where i.break_id = b.id
    order by i.position desc
    limit 1
  ) last_item on true
  where 'underwriting_credit' = any(b.permitted_content_types)
    -- Only windows a producer marked (docs/log-slot-keyed-breaks-design.md §4).
    and b.local_opportunity_id is not null
    and period.eligible
    and (v_line.program_id is null or lr.program_id = v_line.program_id)
    and (v_line.pool_id is null or public.uw_pool_matches(
      v_line.pool_id, lr.program_id, public.uw_station_local_time(b.scheduled_at), extract(dow from lr.air_date)::integer))
    and (v_line.window_start is null or (
      public.uw_station_local_time(b.scheduled_at) >= v_line.window_start
      and public.uw_station_local_time(b.scheduled_at) < v_line.window_end));

  return jsonb_build_object('ok', true, 'breaks', v_breaks);
end;
$$;

comment on function public.log_list_placeable_rundown_breaks(uuid) is
  'Every marked-opportunity break a schedule line could place into: permitted for a credit, on an eligible date and weekday under the line''s rule, on the line''s program, inside its pool and window. Says nothing about quotas — the planner and log_place_underwriting_credit() do. Security definer: an underwriting-only caller has no RLS access to Log''s rundown tables.';

drop function if exists public.log_place_underwriting_credit(uuid, uuid, uuid, text);

create or replace function public.log_place_underwriting_credit(
  p_break_id uuid,
  p_schedule_line_id uuid,
  p_copy_id uuid,
  p_override_reason text default null,
  p_makegood_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_break public.log_rundown_breaks;
  v_rundown public.log_rundowns;
  v_program public.log_programs;
  v_line public.uw_contract_schedule_lines;
  v_contract public.uw_contracts;
  v_copy public.uw_copy;
  v_link public.uw_contract_copy;
  v_makegood public.uw_makegoods;
  v_exception public.uw_exceptions;
  v_period record;
  v_period_start date;
  v_period_end date;
  v_local_time time;
  v_dow integer;
  v_needs_override boolean;
  v_occupied integer;
  v_in_period integer;
  v_on_day integer;
  v_next_position integer;
  v_item_id uuid;
  v_placement_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;
  if not private.has_underwriting_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  -- Serialize every placement against one schedule line: two staff actions
  -- (or auto-fill and a manual pick) racing for the same demand unit wait
  -- here, and the second one sees the first's row in the counts below.
  select * into v_line from public.uw_contract_schedule_lines where id = p_schedule_line_id for update;
  if not found then
    return jsonb_build_object('error', 'unknown_schedule_line');
  end if;

  select * into v_contract from public.uw_contracts where id = v_line.contract_id;
  if v_contract.status <> 'active' then
    return jsonb_build_object('error', 'contract_not_active');
  end if;

  select * into v_break from public.log_rundown_breaks where id = p_break_id;
  if not found then
    return jsonb_build_object('error', 'unknown_break');
  end if;
  if not ('underwriting_credit' = any(v_break.permitted_content_types)) or v_break.local_opportunity_id is null then
    return jsonb_build_object('error', 'break_not_eligible');
  end if;

  select * into v_rundown from public.log_rundowns where id = v_break.rundown_id;
  select * into v_program from public.log_programs where id = v_rundown.program_id;
  v_local_time := public.uw_station_local_time(v_break.scheduled_at);
  v_dow := extract(dow from v_rundown.air_date)::integer;

  -- Contractual eligibility of this date under the line's rule.
  select * into v_period from public.uw_line_period_for_date(v_line, v_rundown.air_date);
  if not v_period.eligible then
    return jsonb_build_object('error', 'date_not_eligible');
  end if;
  if v_line.program_id is not null and v_line.program_id <> v_rundown.program_id then
    return jsonb_build_object('error', 'program_not_eligible');
  end if;
  if v_line.pool_id is not null and not public.uw_pool_matches(v_line.pool_id, v_rundown.program_id, v_local_time, v_dow) then
    return jsonb_build_object('error', 'pool_not_eligible');
  end if;
  if v_line.window_start is not null and not (v_local_time >= v_line.window_start and v_local_time < v_line.window_end) then
    return jsonb_build_object('error', 'outside_window');
  end if;

  -- One credit per contract per break — the same underwriter never runs
  -- back to back, and never twice in one avail.
  if exists (
    select 1 from public.uw_scheduled_placements sp
    join public.log_rundown_items ci on ci.id = sp.log_rundown_item_id
    join public.uw_contract_schedule_lines sl on sl.id = sp.schedule_line_id
    where ci.break_id = p_break_id and sp.status <> 'superseded' and sl.contract_id = v_contract.id
  ) then
    return jsonb_build_object('error', 'same_contract_in_break');
  end if;

  v_period_start := v_period.period_start;
  v_period_end := v_period.period_end;

  if p_makegood_id is null then
    select count(*) into v_in_period from public.uw_scheduled_placements
    where schedule_line_id = v_line.id and status <> 'superseded'
      and makegood_id is null and demand_period_start = v_period.period_start;
    if v_in_period >= v_period.quantity then
      return jsonb_build_object('error', 'period_quota_met');
    end if;
  else
    select * into v_makegood from public.uw_makegoods where id = p_makegood_id;
    if not found or v_makegood.schedule_line_id <> v_line.id then
      return jsonb_build_object('error', 'unknown_makegood');
    end if;
    if v_makegood.status <> 'scheduled' or v_makegood.scheduled_placement_id is not null then
      return jsonb_build_object('error', 'makegood_already_scheduled');
    end if;
    select * into v_exception from public.uw_exceptions where id = v_makegood.exception_id;
    if v_exception.makegood_approval in ('pending', 'declined') then
      return jsonb_build_object('error', 'makegood_needs_approval');
    end if;
    -- The replacement is attributed to the period the order missed.
    if v_makegood.demand_period_start is not null then
      v_period_start := v_makegood.demand_period_start;
      v_period_end := v_makegood.demand_period_end;
    end if;
  end if;

  select count(*) into v_on_day from public.uw_scheduled_placements
  where schedule_line_id = v_line.id and status <> 'superseded' and placement_date = v_rundown.air_date;
  if v_on_day >= v_period.day_cap then
    return jsonb_build_object('error', 'day_cap_met');
  end if;

  select * into v_copy from public.uw_copy where id = p_copy_id;
  if not found then
    return jsonb_build_object('error', 'unknown_copy');
  end if;
  select * into v_link from public.uw_contract_copy
  where contract_id = v_line.contract_id and copy_id = p_copy_id;
  if not found then
    return jsonb_build_object('error', 'copy_not_linked');
  end if;
  if v_link.flight_id is not null and v_link.flight_id is distinct from v_line.flight_id then
    return jsonb_build_object('error', 'copy_wrong_flight');
  end if;

  if v_copy.duration_seconds is null then
    return jsonb_build_object('error', 'copy_duration_unknown');
  end if;
  select coalesce(sum(planned_duration_seconds), 0) into v_occupied
    from public.log_rundown_items where break_id = p_break_id;
  if v_copy.duration_seconds > (v_break.available_duration_seconds - v_occupied) then
    return jsonb_build_object('error', 'too_long');
  end if;

  v_needs_override := v_copy.approval_status <> 'approved'
    or v_copy.effective_from > v_rundown.air_date
    or (v_copy.effective_to is not null and v_copy.effective_to < v_rundown.air_date);
  if v_needs_override then
    if p_override_reason is null or trim(p_override_reason) = '' then
      return jsonb_build_object('error', 'copy_needs_override');
    end if;
    if not private.is_underwriting_manager(auth.uid()) then
      return jsonb_build_object('error', 'override_requires_manager');
    end if;
  end if;

  select coalesce(max(position), 0) + 1 into v_next_position
    from public.log_rundown_items where break_id = p_break_id;

  insert into public.log_rundown_items (
    break_id, position, item_kind, underwriting_copy_id, planned_duration_seconds, placement_status
  ) values (
    p_break_id, v_next_position, 'underwriting_credit', p_copy_id, v_copy.duration_seconds, 'replaceable'
  )
  returning id into v_item_id;

  insert into public.uw_scheduled_placements (
    schedule_line_id, copy_id, log_rundown_item_id, placement_date, scheduled_at,
    program_id, program_name, break_label, status, override_reason, created_by,
    demand_period_start, demand_period_end, makegood_id
  ) values (
    p_schedule_line_id, p_copy_id, v_item_id, v_rundown.air_date, v_break.scheduled_at,
    v_rundown.program_id, v_program.name, v_break.label,
    'scheduled', case when v_needs_override then p_override_reason else null end, auth.uid(),
    v_period_start, v_period_end, p_makegood_id
  )
  returning id into v_placement_id;

  if p_makegood_id is not null then
    update public.uw_makegoods
    set scheduled_placement_id = v_placement_id, scheduled_for = v_break.scheduled_at
    where id = p_makegood_id;
  end if;

  return jsonb_build_object('ok', true, 'placement_id', v_placement_id, 'item_id', v_item_id,
    'period_start', v_period_start, 'period_end', v_period_end);
end;
$$;

comment on function public.log_place_underwriting_credit(uuid, uuid, uuid, text, uuid) is
  'The one write path for an underwriting credit into Log (manual, auto-fill, capability, makegood). Locks the schedule line, then checks: active contract; a marked, permitted break; the date eligible under the line''s rule (uw_line_period_for_date); program, pool and window; one credit per contract per break; the period''s quota (skipped for a makegood, which replaces a unit); the day cap; copy linked to the contract and, if flight-scoped, to this line''s flight; duration fit; approval/dates or a manager override. Writes the item, the placement with its demand period, and links the makegood.';

revoke execute on function public.log_place_underwriting_credit(uuid, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.log_place_underwriting_credit(uuid, uuid, uuid, text, uuid) to authenticated;

-- Clearing a makegood's placement frees the makegood to be scheduled again,
-- rather than leaving it pointing at a superseded row.
create or replace function public.log_clear_underwriting_credit(p_placement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_placement public.uw_scheduled_placements;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;
  if not private.has_underwriting_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select * into v_placement from public.uw_scheduled_placements where id = p_placement_id;
  if not found then
    return jsonb_build_object('error', 'unknown_placement');
  end if;
  if v_placement.status = 'superseded' then
    return jsonb_build_object('error', 'already_cleared');
  end if;

  delete from public.log_rundown_items where id = v_placement.log_rundown_item_id;

  update public.uw_scheduled_placements
  set status = 'superseded'
  where id = p_placement_id;

  if v_placement.makegood_id is not null then
    update public.uw_makegoods
    set scheduled_placement_id = null, scheduled_for = null
    where id = v_placement.makegood_id and status = 'scheduled';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================================
-- 11. Exceptions record their placement and the agency-approval state
-- ============================================================================

create or replace function public.uw_flag_exception_from_broadcast_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.log_rundown_items;
  v_placement public.uw_scheduled_placements;
  v_requires_approval boolean;
begin
  if new.outcome = 'aired_as_scheduled' then
    return new;
  end if;

  select * into v_item from public.log_rundown_items where id = new.rundown_item_id;
  if not found or v_item.item_kind <> 'underwriting_credit' then
    return new;
  end if;

  select * into v_placement
  from public.uw_scheduled_placements
  where log_rundown_item_id = new.rundown_item_id
    and status <> 'superseded'
  order by created_at desc
  limit 1;
  if not found then
    return new;
  end if;

  select c.makegood_requires_agency_approval into v_requires_approval
  from public.uw_contract_schedule_lines sl
  join public.uw_contracts c on c.id = sl.contract_id
  where sl.id = v_placement.schedule_line_id;

  insert into public.uw_exceptions (
    log_broadcast_event_id, schedule_line_id, scheduled_placement_id, original_scheduled_at,
    host_action, host_reason, makegood_approval
  ) values (
    new.id, v_placement.schedule_line_id, v_placement.id, v_placement.scheduled_at,
    new.outcome::text, new.reason::text,
    case when coalesce(v_requires_approval, false) then 'pending' else 'not_required' end
  )
  on conflict (log_broadcast_event_id) do nothing;

  return new;
end;
$$;

-- ============================================================================
-- 12. The pools every order on file names, seeded once
-- ============================================================================
-- Targets are seeded only where the mapping is unambiguous from Log's own
-- schedule; the rest are for traffic staff to map on /underwriting/pools.

insert into public.uw_inventory_pools (name, description) values
  ('AM Drive', 'Morning drive-time credits — Morning Edition.'),
  ('PM Drive', 'Afternoon drive-time credits — All Things Considered.'),
  ('Total Program Rotation', 'Run of schedule: any marked opportunity on any program.'),
  ('Weekend Edition', 'Weekend Edition Saturday or Sunday.'),
  ('Carpool', 'The Morning Edition Carpool segment (map its window here).'),
  ('Mid-day', 'Mid-day credits (map its programs and window here).')
on conflict (name) do nothing;

insert into public.uw_inventory_pool_targets (pool_id, program_id, window_start, window_end)
select p.id, lp.id, time '05:00', time '09:00'
from public.uw_inventory_pools p, public.log_programs lp
where p.name = 'AM Drive' and lp.name = 'Morning Edition';

insert into public.uw_inventory_pool_targets (pool_id, program_id, window_start, window_end)
select p.id, lp.id, time '15:00', time '17:00'
from public.uw_inventory_pools p, public.log_programs lp
where p.name = 'PM Drive' and lp.name = 'All Things Considered';

insert into public.uw_inventory_pool_targets (pool_id, program_id)
select p.id, lp.id
from public.uw_inventory_pools p, public.log_programs lp
where p.name = 'Weekend Edition' and lp.name in ('Weekend Edition Saturday', 'Weekend Edition Sunday');

insert into public.uw_inventory_pool_targets (pool_id, notes)
select p.id, 'Any marked opportunity on any program.'
from public.uw_inventory_pools p
where p.name = 'Total Program Rotation';
