-- Underwriting & Traffic: revisions, eligibility lines, demand buckets —
-- docs/underwriting-traffic-redesign.md, second pass (read its §9 first).
--
-- 20260925120000_underwriting_traffic_redesign.sql replaced the single
-- recurrence line with four typed rule kinds, each carrying its own
-- quantity arithmetic (uw_line_period_for_date). A deeper audit of the
-- archive (1,001 orders, six sponsors followed across years) showed the
-- rule kinds were still the wrong primitive: an order is "a quantity of
-- credits owed inside one or more periods, subject to eligibility", and
-- weekly quotas, every-other-week cadences, event phases, agency matrices
-- with dark weeks, and exact opening/closing positions are all just
-- different ways of writing that. This migration moves the boundary to
--
--   contract -> revision -> eligibility line -> demand buckets -> placement
--
--   1. uw_contract_revisions: schedule lines belong to a revision; one
--      revision per contract is current; a superseding revision retires
--      the old one's *future* demand without touching aired history.
--   2. uw_contract_schedule_lines becomes eligibility only: where a credit
--      may air (program, pool, eligible weekdays, a time_mode of any /
--      window / preferred / exact / slot), how many a day at most (nullable
--      — a cap is data from the order, never planner doctrine), whether it
--      is guaranteed or bonus weight, and the order's makegood policy
--      text. The entry shape the staffer typed (fixed days, N a week, N a
--      month, every N weeks, explicit dates, a week grid, a range total) is
--      kept as entry_kind + entry_spec for display and re-compilation, but
--      nothing schedules from it.
--   3. uw_demand_buckets: how many credits are owed in a period. Every
--      entry shape compiles to buckets (lib/underwriting/demand-compiler.ts)
--      and the scheduler asks one question — which active buckets are still
--      short, and which eligible breaks fall inside them.
--   4. Placements and makegoods reference the bucket they consume
--      (demand_bucket_id), replacing the period-start/end pair.
--   5. Log: log_local_opportunities.traffic_key — a stable semantic key
--      ("marketplace.opening", "science-friday.closing") a producer carries
--      forward when a new clock version is created, so an order's
--      "Opening Credit for Marketplace" constrains placement across clock
--      revisions without naming a clock-slot UUID. time_mode = slot on a
--      line means "only a break whose opportunity carries this key".
--   6. log_list_placeable_rundown_breaks() and log_place_underwriting_credit()
--      are rewritten to key on buckets and time modes. The guard still
--      locks the line and enforces the same limits the planner plans
--      against — now: current revision, active bucket with quantity left,
--      eligible weekday, program/pool, window / exact time / slot key,
--      per-day cap when the order states one, one credit per contract per
--      break, flight-scoped copy, a makegood's agency approval.
--
-- Test data: both projects hold zero uw_contracts rows on 2026-09-25 (the
-- first pass reset them and none were entered since), so this is a clean
-- rewrite with no compatibility scaffolding, per the brief's own
-- instruction. Underwriters, copy, and pools are untouched.

-- ============================================================================
-- 1. Reset
-- ============================================================================

delete from public.log_rundown_items i
using public.uw_scheduled_placements sp
where sp.log_rundown_item_id = i.id and sp.status <> 'superseded';

delete from public.uw_contracts;

drop table public.uw_schedule_allocations;
drop function public.uw_line_period_for_date(public.uw_contract_schedule_lines, date);

-- ============================================================================
-- 2. Enums
-- ============================================================================

create type public.uw_revision_status as enum ('draft', 'current', 'superseded', 'cancelled');
create type public.uw_schedule_entry_kind as enum (
  'fixed_days', 'weekly_quota', 'monthly_quota', 'every_n_weeks', 'explicit_dates', 'week_grid', 'range_total'
);
create type public.uw_time_mode as enum ('any', 'window', 'preferred', 'exact', 'slot');
create type public.uw_service_level as enum ('guaranteed', 'bonus');
create type public.uw_demand_bucket_status as enum ('active', 'superseded', 'cancelled');

-- ============================================================================
-- 3. Revisions
-- ============================================================================

create table public.uw_contract_revisions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.uw_contracts (id) on delete cascade,
  revision_label text,
  document_path text,
  received_at date,
  effective_from date not null,
  status public.uw_revision_status not null default 'draft',
  supersedes_revision_id uuid references public.uw_contract_revisions (id) on delete set null,
  notes text,
  activated_at timestamptz,
  activated_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uw_contract_revisions_contract_unique unique (id, contract_id)
);

comment on table public.uw_contract_revisions is
  'One version of a contract''s schedule. Exactly one is current per contract; a draft is being entered; a superseded one keeps its lines, buckets, placements and history read-only. Activating a draft supersedes the current revision''s buckets still open on the new revision''s effective date and clears the current revision''s placements from that date (docs/underwriting-traffic-redesign.md §9).';
comment on column public.uw_contract_revisions.effective_from is
  'The date this revision takes over. The old revision''s demand before it, and everything already aired, stays with the old revision.';
comment on column public.uw_contract_revisions.document_path is
  'The revised order or agreement page as received, in the underwriting-documents bucket — optional; the contract keeps the executed agreement.';

create unique index uw_contract_revisions_one_current_idx
  on public.uw_contract_revisions (contract_id) where status = 'current';
create index uw_contract_revisions_contract_idx on public.uw_contract_revisions (contract_id, created_at);

create trigger set_uw_contract_revisions_updated_at
  before update on public.uw_contract_revisions
  for each row execute function public.set_updated_at();

alter table public.uw_contract_revisions enable row level security;
grant select, insert, update on public.uw_contract_revisions to authenticated;

create policy uw_contract_revisions_select on public.uw_contract_revisions
  for select to authenticated
  using ((select private.has_underwriting_access((select auth.uid()))));
create policy uw_contract_revisions_insert on public.uw_contract_revisions
  for insert to authenticated
  with check ((select private.has_underwriting_access((select auth.uid()))));
create policy uw_contract_revisions_update on public.uw_contract_revisions
  for update to authenticated
  using ((select private.has_underwriting_access((select auth.uid()))))
  with check ((select private.has_underwriting_access((select auth.uid()))));

-- ============================================================================
-- 4. Schedule lines: eligibility only
-- ============================================================================

alter table public.uw_contract_schedule_lines
  drop constraint uw_contract_schedule_lines_rule_shape_check,
  drop column rule_kind,
  drop column count_per_day,
  drop column quantity_per_week,
  drop column is_bonus,
  drop column target_time,
  add column revision_id uuid not null references public.uw_contract_revisions (id) on delete cascade,
  add column entry_kind public.uw_schedule_entry_kind not null,
  add column entry_spec jsonb not null default '{}'::jsonb,
  add column time_mode public.uw_time_mode not null default 'any',
  add column preferred_time time,
  add column required_opportunity_key text,
  add column service_level public.uw_service_level not null default 'guaranteed',
  add column distribution_preference text,
  add column makegood_policy_text text,
  add constraint uw_contract_schedule_lines_revision_contract_fk
    foreign key (revision_id, contract_id) references public.uw_contract_revisions (id, contract_id) on delete cascade,
  add constraint uw_contract_schedule_lines_max_per_day_check
    check (max_per_day is null or max_per_day >= 1),
  add constraint uw_contract_schedule_lines_time_mode_check check (
    case time_mode
      when 'any' then true
      when 'window' then window_start is not null
      when 'preferred' then preferred_time is not null
      when 'exact' then preferred_time is not null
      when 'slot' then required_opportunity_key is not null
    end
  );

drop type public.uw_schedule_rule_kind;
drop type public.uw_allocation_period_kind;

comment on table public.uw_contract_schedule_lines is
  'Eligibility and placement constraints for one instruction of a contract revision — never a quantity. Where a credit may air (program and/or pool, eligible weekdays, a time mode), how many a day at most when the order says so, guaranteed or bonus. How many are owed, and when, is uw_demand_buckets. entry_kind/entry_spec record how the staffer entered it (compiled into buckets by lib/underwriting/demand-compiler.ts) for display and recompilation only.';
comment on column public.uw_contract_schedule_lines.days_of_week is
  'Eligible weekdays, 0=Sunday..6=Saturday. Empty means any day of the bucket''s period.';
comment on column public.uw_contract_schedule_lines.time_mode is
  'any: any marked opportunity the pool/program allows. window: inside window_start..window_end (station-local, end exclusive) — a hard limit. preferred: preferred_time ranks candidates, never excludes. exact: the break must start within uw_exact_time_tolerance() of preferred_time. slot: only a break whose local opportunity carries required_opportunity_key (Log''s traffic_key) — an opening/closing credit.';
comment on column public.uw_contract_schedule_lines.max_per_day is
  'A per-day cap the order states ("1 per day"). Null: no cap — several credits on one day are fine when the demand calls for it; the planner still spreads across eligible days.';
comment on column public.uw_contract_schedule_lines.service_level is
  'bonus: tracked and reported, but a miss is not owed a makegood unless the order says so, and the line never makes the contract read "behind".';
comment on column public.uw_contract_schedule_lines.distribution_preference is
  'A scheduler preference, not a constraint: "even" (default) spreads a bucket''s credits across its eligible days, least-loaded day first.';
comment on column public.uw_contract_schedule_lines.entry_spec is
  'The compiler input as entered, e.g. {"kind":"weekly_quota","quantity":4} or {"kind":"every_n_weeks","interval_weeks":2,"quantity":1} — see lib/underwriting/demand-compiler.ts. Re-compiling it reproduces the line''s buckets.';

create index uw_contract_schedule_lines_revision_idx on public.uw_contract_schedule_lines (revision_id);

-- ============================================================================
-- 5. Demand buckets
-- ============================================================================

create table public.uw_demand_buckets (
  id uuid primary key default gen_random_uuid(),
  schedule_line_id uuid not null references public.uw_contract_schedule_lines (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  quantity_required integer not null,
  status public.uw_demand_bucket_status not null default 'active',
  source_label text,
  superseded_by_revision_id uuid references public.uw_contract_revisions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uw_demand_buckets_period_check check (period_end >= period_start),
  constraint uw_demand_buckets_quantity_check check (quantity_required >= 0),
  constraint uw_demand_buckets_unique unique (schedule_line_id, period_start)
);

comment on table public.uw_demand_buckets is
  'How many credits a schedule line owes inside one period: a day (fixed days, explicit dates), a Monday-started week (weekly quota, a week grid — a dark week is a real row with quantity 0), a calendar month, or the whole range. The scheduler fills each active bucket to quantity_required and no further; log_place_underwriting_credit() refuses the extra. A revision supersedes the buckets still open on its effective date; a line cancellation cancels them.';
comment on column public.uw_demand_buckets.source_label is
  'Where this bucket came from, for the screen: "week of 1/26", "Oct 4 Opening Night", the grid column.';

create index uw_demand_buckets_line_idx on public.uw_demand_buckets (schedule_line_id, period_start);

-- Buckets of one line never overlap while active — the compiler guarantees
-- it and this trigger keeps a hand-written row honest.
create or replace function public.uw_guard_bucket_overlap()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'active' and exists (
    select 1 from public.uw_demand_buckets b
    where b.schedule_line_id = new.schedule_line_id
      and b.id <> new.id
      and b.status = 'active'
      and b.period_start <= new.period_end
      and b.period_end >= new.period_start
  ) then
    raise exception 'demand bucket % overlaps another active bucket of the same schedule line', new.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger uw_demand_buckets_no_overlap
  before insert or update on public.uw_demand_buckets
  for each row execute function public.uw_guard_bucket_overlap();

create trigger set_uw_demand_buckets_updated_at
  before update on public.uw_demand_buckets
  for each row execute function public.set_updated_at();

alter table public.uw_demand_buckets enable row level security;
grant select, insert, update, delete on public.uw_demand_buckets to authenticated;

create policy uw_demand_buckets_select on public.uw_demand_buckets
  for select to authenticated
  using ((select private.has_underwriting_access((select auth.uid()))));
create policy uw_demand_buckets_insert on public.uw_demand_buckets
  for insert to authenticated
  with check ((select private.has_underwriting_access((select auth.uid()))));
create policy uw_demand_buckets_update on public.uw_demand_buckets
  for update to authenticated
  using ((select private.has_underwriting_access((select auth.uid()))))
  with check ((select private.has_underwriting_access((select auth.uid()))));
-- Delete only for a draft revision's buckets — a bucket with a placement
-- can never be deleted (the placement's FK is restrict), and activation
-- drops a draft's pre-effective buckets rather than marking them.
create policy uw_demand_buckets_delete on public.uw_demand_buckets
  for delete to authenticated
  using ((select private.has_underwriting_access((select auth.uid()))));

-- ============================================================================
-- 6. Placements and makegoods consume a bucket
-- ============================================================================

alter table public.uw_scheduled_placements
  drop constraint uw_scheduled_placements_period_check,
  drop column demand_period_start,
  drop column demand_period_end,
  add column demand_bucket_id uuid not null references public.uw_demand_buckets (id) on delete restrict;

comment on column public.uw_scheduled_placements.demand_bucket_id is
  'The demand bucket this placement consumes. A makegood placement carries the missed placement''s bucket, so a miss and its replacement are one contractual credit, never two.';

drop index if exists public.uw_scheduled_placements_period_idx;
create index uw_scheduled_placements_bucket_idx
  on public.uw_scheduled_placements (demand_bucket_id) where status <> 'superseded';

alter table public.uw_makegoods
  drop constraint uw_makegoods_period_check,
  drop column demand_period_start,
  drop column demand_period_end,
  add column demand_bucket_id uuid references public.uw_demand_buckets (id) on delete set null;

comment on column public.uw_makegoods.demand_bucket_id is
  'Copied from the missed placement when the makegood is created — the bucket the replacement airing is attributed to.';

-- ============================================================================
-- 7. Log: a stable traffic key on local opportunities
-- ============================================================================

alter table public.log_local_opportunities
  add column traffic_key text,
  add constraint log_local_opportunities_traffic_key_check
    check (traffic_key is null or traffic_key ~ '^[a-z0-9][a-z0-9._-]{1,79}$');

comment on column public.log_local_opportunities.traffic_key is
  'A stable semantic key for this opportunity across clock versions — "marketplace.opening", "science-friday.closing", "five-corners.opening" — that Underwriting''s time_mode = slot lines target (uw_contract_schedule_lines.required_opportunity_key). Producers carry it forward when they mark the equivalent slot on a new clock version; unique within a version. Lowercase letters, digits, dots, dashes.';

create unique index log_local_opportunities_traffic_key_idx
  on public.log_local_opportunities (clock_version_id, traffic_key) where traffic_key is not null;

-- ============================================================================
-- 8. Helper functions
-- ============================================================================

-- How close a break's start must be to an exact-mode line's time. One place
-- in SQL, EXACT_TIME_TOLERANCE_MINUTES in lib/underwriting/eligibility.ts.
create or replace function public.uw_exact_time_tolerance()
returns interval
language sql
immutable
as $$ select interval '3 minutes'; $$;

revoke execute on function public.uw_exact_time_tolerance() from public, anon;
grant execute on function public.uw_exact_time_tolerance() to authenticated;

-- The active bucket of a line that a date falls in, with the line's own
-- weekday/date/cancellation eligibility applied — the SQL twin of
-- lib/underwriting/eligibility.ts's bucketForDate(). Null when the date is
-- not eligible or no active bucket with quantity covers it.
create or replace function public.uw_bucket_for_date(
  p_line public.uw_contract_schedule_lines,
  p_date date
)
returns public.uw_demand_buckets
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bucket public.uw_demand_buckets;
  v_dow integer := extract(dow from p_date)::integer;
begin
  if p_date < p_line.start_date or (p_line.end_date is not null and p_date > p_line.end_date) then
    return null;
  end if;
  if p_line.status = 'cancelled' and p_line.cancelled_from is not null and p_date >= p_line.cancelled_from then
    return null;
  end if;
  if array_length(p_line.days_of_week, 1) > 0 and not (v_dow = any(p_line.days_of_week)) then
    return null;
  end if;
  select b.* into v_bucket
  from public.uw_demand_buckets b
  where b.schedule_line_id = p_line.id
    and b.status = 'active'
    and b.quantity_required > 0
    and b.period_start <= p_date
    and b.period_end >= p_date
  order by b.period_start
  limit 1;
  if not found then
    return null;
  end if;
  return v_bucket;
end;
$$;

revoke execute on function public.uw_bucket_for_date(public.uw_contract_schedule_lines, date) from public, anon;
grant execute on function public.uw_bucket_for_date(public.uw_contract_schedule_lines, date) to authenticated;

-- Does a break starting at this station-local time, in an opportunity with
-- this traffic key, satisfy the line's time mode?
create or replace function public.uw_time_eligible(
  p_line public.uw_contract_schedule_lines,
  p_local_time time,
  p_traffic_key text
)
returns boolean
language sql
immutable
as $$
  select case p_line.time_mode
    when 'any' then true
    when 'preferred' then true
    when 'window' then p_local_time >= p_line.window_start and p_local_time < p_line.window_end
    when 'exact' then abs(extract(epoch from (p_local_time - p_line.preferred_time))) <= extract(epoch from public.uw_exact_time_tolerance())
    when 'slot' then p_traffic_key is not null and p_traffic_key = p_line.required_opportunity_key
  end;
$$;

revoke execute on function public.uw_time_eligible(public.uw_contract_schedule_lines, time, text) from public, anon;
grant execute on function public.uw_time_eligible(public.uw_contract_schedule_lines, time, text) to authenticated;

-- ============================================================================
-- 9. The Log boundary, rewritten for buckets
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
    'traffic_key', o.traffic_key,
    'bucket_id', bucket.id,
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
  join public.log_local_opportunities o on o.id = b.local_opportunity_id
  cross join lateral (select * from public.uw_bucket_for_date(v_line, lr.air_date)) bucket
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
    and bucket.id is not null
    and (v_line.program_id is null or lr.program_id = v_line.program_id)
    and (v_line.pool_id is null or public.uw_pool_matches(
      v_line.pool_id, lr.program_id, public.uw_station_local_time(b.scheduled_at), extract(dow from lr.air_date)::integer))
    and public.uw_time_eligible(v_line, public.uw_station_local_time(b.scheduled_at), o.traffic_key);

  return jsonb_build_object('ok', true, 'breaks', v_breaks);
end;
$$;

comment on function public.log_list_placeable_rundown_breaks(uuid) is
  'Every marked-opportunity break a schedule line could place into: permitted for a credit, on a date inside an active bucket with quantity (uw_bucket_for_date — dates, weekdays, cancellation), on the line''s program, inside its pool, and satisfying its time mode (window, exact time, or traffic key). Each break names the bucket it would consume. Says nothing about how many a bucket still needs — the planner and log_place_underwriting_credit() do. Security definer: an underwriting-only caller has no RLS access to Log''s rundown tables.';

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
  v_opportunity public.log_local_opportunities;
  v_line public.uw_contract_schedule_lines;
  v_revision public.uw_contract_revisions;
  v_contract public.uw_contracts;
  v_copy public.uw_copy;
  v_link public.uw_contract_copy;
  v_makegood public.uw_makegoods;
  v_exception public.uw_exceptions;
  v_bucket public.uw_demand_buckets;
  v_local_time time;
  v_dow integer;
  v_needs_override boolean;
  v_occupied integer;
  v_in_bucket integer;
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
  -- (or auto-fill and a manual pick) racing for the same bucket wait here,
  -- and the second one sees the first's row in the counts below.
  select * into v_line from public.uw_contract_schedule_lines where id = p_schedule_line_id for update;
  if not found then
    return jsonb_build_object('error', 'unknown_schedule_line');
  end if;
  if v_line.status <> 'active' then
    return jsonb_build_object('error', 'line_cancelled');
  end if;

  select * into v_revision from public.uw_contract_revisions where id = v_line.revision_id;
  if v_revision.status <> 'current' then
    return jsonb_build_object('error', 'revision_not_current');
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
  select * into v_opportunity from public.log_local_opportunities where id = v_break.local_opportunity_id;

  select * into v_rundown from public.log_rundowns where id = v_break.rundown_id;
  select * into v_program from public.log_programs where id = v_rundown.program_id;
  v_local_time := public.uw_station_local_time(v_break.scheduled_at);
  v_dow := extract(dow from v_rundown.air_date)::integer;

  -- Contractual eligibility of this date: an active bucket with quantity,
  -- an eligible weekday, inside the line's dates.
  v_bucket := public.uw_bucket_for_date(v_line, v_rundown.air_date);
  if v_bucket.id is null then
    return jsonb_build_object('error', 'date_not_eligible');
  end if;
  if v_line.program_id is not null and v_line.program_id <> v_rundown.program_id then
    return jsonb_build_object('error', 'program_not_eligible');
  end if;
  if v_line.pool_id is not null and not public.uw_pool_matches(v_line.pool_id, v_rundown.program_id, v_local_time, v_dow) then
    return jsonb_build_object('error', 'pool_not_eligible');
  end if;
  if not public.uw_time_eligible(v_line, v_local_time, v_opportunity.traffic_key) then
    return jsonb_build_object('error', case v_line.time_mode
      when 'window' then 'outside_window'
      when 'exact' then 'exact_time_mismatch'
      when 'slot' then 'slot_key_mismatch'
      else 'time_not_eligible' end);
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

  if p_makegood_id is null then
    select count(*) into v_in_bucket from public.uw_scheduled_placements
    where demand_bucket_id = v_bucket.id and status <> 'superseded' and makegood_id is null;
    if v_in_bucket >= v_bucket.quantity_required then
      return jsonb_build_object('error', 'bucket_quota_met');
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
    -- The replacement is attributed to the bucket the order missed.
    if v_makegood.demand_bucket_id is not null then
      select * into v_bucket from public.uw_demand_buckets where id = v_makegood.demand_bucket_id;
    end if;
  end if;

  if v_line.max_per_day is not null then
    select count(*) into v_on_day from public.uw_scheduled_placements
    where schedule_line_id = v_line.id and status <> 'superseded' and placement_date = v_rundown.air_date;
    if v_on_day >= v_line.max_per_day then
      return jsonb_build_object('error', 'day_cap_met');
    end if;
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
    demand_bucket_id, makegood_id
  ) values (
    p_schedule_line_id, p_copy_id, v_item_id, v_rundown.air_date, v_break.scheduled_at,
    v_rundown.program_id, v_program.name, v_break.label,
    'scheduled', case when v_needs_override then p_override_reason else null end, auth.uid(),
    v_bucket.id, p_makegood_id
  )
  returning id into v_placement_id;

  if p_makegood_id is not null then
    update public.uw_makegoods
    set scheduled_placement_id = v_placement_id, scheduled_for = v_break.scheduled_at
    where id = p_makegood_id;
  end if;

  return jsonb_build_object('ok', true, 'placement_id', v_placement_id, 'item_id', v_item_id,
    'bucket_id', v_bucket.id, 'period_start', v_bucket.period_start, 'period_end', v_bucket.period_end);
end;
$$;

comment on function public.log_place_underwriting_credit(uuid, uuid, uuid, text, uuid) is
  'The one write path for an underwriting credit into Log (manual, auto-fill, capability, makegood). Locks the schedule line, then checks: the line is active under the contract''s current revision; active contract; a marked, permitted break; the date inside an active bucket with quantity, on an eligible weekday (uw_bucket_for_date); program and pool; the time mode (window, exact time within uw_exact_time_tolerance, or traffic key); one credit per contract per break; the bucket''s quantity (skipped for a makegood, which replaces a unit — attributed to the missed bucket); the per-day cap when the order states one; copy linked to the contract and, if flight-scoped, to this line''s flight; duration fit; approval/dates or a manager override. Writes the item, the placement with its bucket, and links the makegood.';

-- log_clear_underwriting_credit() is unchanged: it keys on the placement
-- and its makegood, neither of which changed shape.
