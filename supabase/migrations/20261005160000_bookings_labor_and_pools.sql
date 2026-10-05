-- Bookings: slice 2b — labor classes and pools as data (2026-10-05).
--
-- A sanity check before slice 3 found that slices 1 and 2 had baked two
-- fixed things into the schema that WUWF will outgrow: ONE professional
-- (one salary, one loaded rate, one "lead's day" of eight hours) and FOUR
-- resource pools (a SQL enum, with one fixed column per pool on every
-- service package). Both projects held only the seeded v0.1 rate model —
-- no grants, no assets, no term plan, no booking — so this is a clean
-- rewrite rather than a patch, the same call 20260925150000 made for
-- Traffic. docs/bookings-design.md §14 has the account; this
-- header is the summary.
--
--   * bk_labor_classes (catalog) + bk_labor_rates (per version): a class of
--     labor — the production lead, a student/OPS crew member, later a second
--     producer or an engineer — with its pay basis (salaried or hourly), load,
--     paid hours and external planning rate. `charged_in_strategic` says
--     whether the class's hours are charged in a strategic (baseline-funded)
--     price: students yes, professionals no. Data, not doctrine.
--   * bk_pools (catalog) + bk_resource_pools (per version): a pool with its
--     own key, name, unit and default windows, and a costing basis — a share
--     of the shared production pool (`allocated`), or its own budget lines
--     (`own_lines`). Webcasting is now just an own-lines pool whose units are
--     events, not a special case with its own line kind, volume input and
--     package column.
--   * bk_package_labor / bk_package_resources replace the fixed columns on
--     bk_service_packages.
--   * The term plan's capacity is per labor class (bk_term_capacity: net
--     hours, headcount, hours per person per day); the rate model no longer
--     carries a copy of capacity (net_capacity_days / baseline_share are gone
--     — the term plan is the one place). Bookings and holds carry hours per
--     class (bk_booking_labor / bk_hold_labor). A term resource gains
--     concurrent_units, so a pool with two field kits takes two bookings in
--     one window.
--   * The `lead` role is renamed `production` — anyone on the production
--     staff who estimates, books and confirms hours — so the role no longer
--     names one position either.
--
-- The booking rule is unchanged in substance (docs/bookings-design.md §6.4)
-- and still runs where the write happens; it is now split between a before
-- trigger on bk_bookings (pool checks) and a trigger on bk_booking_labor
-- (per-class day and capacity), with bk_create_booking()/bk_create_hold()
-- writing a parent and its labor rows in one transaction so a refusal rolls
-- the whole booking back. lib/bookings/scheduling.ts is the TypeScript twin.
-- SQL still never computes a price.

-- Drop slices 1 and 2 ---------------------------------------------------------------------------------

drop function if exists public.bk_university_avails_per_week(uuid);
drop function if exists public.bk_booking_allowed() cascade;
drop function if exists public.bk_set_version_in_use(uuid);
drop function if exists public.bk_adopt_version(uuid, text);
drop function if exists public.bk_guard_version_transition() cascade;
drop function if exists public.bk_guard_frozen_version() cascade;

drop table if exists public.bk_bookings cascade;
drop table if exists public.bk_holds cascade;
drop table if exists public.bk_blackouts cascade;
drop table if exists public.bk_term_resources cascade;
drop table if exists public.bk_term_plans cascade;
drop table if exists public.bk_rate_model_events cascade;
drop table if exists public.bk_assets cascade;
drop table if exists public.bk_rate_card_lines cascade;
drop table if exists public.bk_service_packages cascade;
drop table if exists public.bk_resource_pools cascade;
drop table if exists public.bk_assumptions cascade;
drop table if exists public.bk_rate_model_versions cascade;

drop type if exists public.bk_pool_key;
drop type if exists public.bk_assumption_kind;

drop function if exists private.is_bookings_lead(uuid);
create function private.is_bookings_production(uid uuid)
returns boolean language sql security definer stable set search_path = public
as $$ select private.has_tool_role(uid, 'bookings', 'production'); $$;
revoke execute on function private.is_bookings_production(uuid) from public, anon;
grant execute on function private.is_bookings_production(uuid) to authenticated;

-- Enums ----------------------------------------------------------------------------------------------------------

create type public.bk_assumption_kind as enum ('pool_line', 'model_input');
create type public.bk_pay_basis as enum ('salaried', 'hourly');
create type public.bk_pool_costing as enum ('allocated', 'own_lines');

-- Catalogs -------------------------------------------------------------------------------------------------------
-- Unversioned, like the asset inventory: a class or a pool is the same thing
-- across versions, and only its figures (bk_labor_rates, bk_resource_pools)
-- are versioned. Retire with `active`, never delete — versions, packages,
-- bookings and assets reference them.

create table public.bk_labor_classes (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  pay_basis public.bk_pay_basis not null,
  -- Whether this class's hours are charged in a strategic (baseline-funded) price.
  charged_in_strategic boolean not null default true,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bk_labor_classes_key_shape check (key ~ '^[a-z][a-z0-9_]*$')
);
comment on table public.bk_labor_classes is
  'A class of production labor — the production lead, student/OPS crew, later a second producer or an engineer. Unversioned; its pay figures live per version in bk_labor_rates.';

create table public.bk_pools (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  unit_label text not null,
  costing public.bk_pool_costing not null default 'allocated',
  -- The windows a booking on this pool may take, as lib/bookings/scheduling.ts's parseWindows() reads them.
  default_windows jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bk_pools_key_shape check (key ~ '^[a-z][a-z0-9_]*$'),
  constraint bk_pools_windows_array check (jsonb_typeof(default_windows) = 'array')
);
comment on table public.bk_pools is
  'A production resource pool (studio, field, live, edit, webcast, …). Costed either as a share of the shared production pool or from its own budget lines. Unversioned; its share and units live per version in bk_resource_pools.';

-- Rate model versions --------------------------------------------------------------------------------

create table public.bk_rate_model_versions (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  status public.bk_version_status not null default 'draft',
  in_use boolean not null default false,
  notes text,
  destination_index text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz,
  submitted_by uuid references public.profiles (id) on delete set null,
  adopted_at timestamptz,
  adopted_by uuid references public.profiles (id) on delete set null,
  superseded_at timestamptz,
  constraint bk_rate_model_versions_label_unique unique (label)
);
comment on table public.bk_rate_model_versions is
  'One version of the production rate model (docs/bookings-design.md §5). Draft → submitted → adopted → superseded; exactly one version is in use for estimates. destination_index is the Budget/Controller''s recharge destination, recorded at adoption.';
create unique index bk_rate_model_versions_in_use_idx
  on public.bk_rate_model_versions (in_use) where in_use;

-- Assumptions: budget lines (the shared pool's, or one own-lines pool's) and
-- the two model inputs the rate math still reads directly.
create table public.bk_assumptions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.bk_rate_model_versions (id) on delete cascade,
  section public.bk_assumption_section not null,
  kind public.bk_assumption_kind not null,
  -- pool_line: null means a line in the shared production pool; set means that pool's own line.
  pool_id uuid references public.bk_pools (id) on delete restrict,
  -- model_input: external_margin_share | assessment_share.
  key text,
  label text not null,
  value numeric(14, 4) not null,
  unit text not null,
  basis text,
  source_url text,
  notes text,
  owner public.bk_assumption_owner not null default 'finance',
  validation_state public.bk_validation_state not null default 'pending',
  validation_needed text,
  validation_note text,
  validated_at timestamptz,
  validated_by uuid references public.profiles (id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bk_assumptions_key_for_model_input check ((kind = 'model_input') = (key is not null)),
  constraint bk_assumptions_pool_for_pool_line check (kind = 'pool_line' or pool_id is null)
);
create index bk_assumptions_version_idx on public.bk_assumptions (version_id, section, sort_order);

create table public.bk_labor_rates (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.bk_rate_model_versions (id) on delete cascade,
  labor_class_id uuid not null references public.bk_labor_classes (id) on delete restrict,
  -- Salaried: annual_salary × (1 + load_share) ÷ paid_hours. Hourly: hourly_wage × (1 + load_share).
  annual_salary numeric(12, 2),
  hourly_wage numeric(8, 2),
  load_share numeric(6, 4) not null default 0,
  paid_hours numeric(8, 2),
  -- The planning rate on the card for this class's hours beyond a package.
  external_rate numeric(10, 2) not null default 0,
  basis text,
  validation_state public.bk_validation_state not null default 'pending',
  validation_needed text,
  validation_note text,
  validated_at timestamptz,
  validated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint bk_labor_rates_version_class_unique unique (version_id, labor_class_id),
  constraint bk_labor_rates_nonnegative check (
    coalesce(annual_salary, 0) >= 0 and coalesce(hourly_wage, 0) >= 0 and load_share >= 0
    and coalesce(paid_hours, 0) >= 0 and external_rate >= 0
  )
);
comment on table public.bk_labor_rates is
  'A labor class''s pay figures on one rate model version. Which of salary/paid hours or wage applies follows the class''s pay_basis.';

create table public.bk_resource_pools (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.bk_rate_model_versions (id) on delete cascade,
  pool_id uuid not null references public.bk_pools (id) on delete restrict,
  -- Allocated pools only: this pool's share of the shared production pool.
  allocation_share numeric(6, 4),
  available_units numeric(10, 2) not null,
  basis text,
  validation_state public.bk_validation_state not null default 'pending',
  validation_needed text,
  validation_note text,
  validated_at timestamptz,
  validated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint bk_resource_pools_version_pool_unique unique (version_id, pool_id),
  constraint bk_resource_pools_share_check check (allocation_share is null or (allocation_share >= 0 and allocation_share <= 1)),
  constraint bk_resource_pools_units_check check (available_units > 0)
);

create table public.bk_service_packages (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.bk_rate_model_versions (id) on delete cascade,
  name text not null,
  unit_label text not null,
  market_floor numeric(12, 2) not null default 0,
  historical_reference text,
  application_note text,
  notes text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bk_service_packages_floor_nonnegative check (market_floor >= 0)
);

create table public.bk_package_labor (
  package_id uuid not null references public.bk_service_packages (id) on delete cascade,
  labor_class_id uuid not null references public.bk_labor_classes (id) on delete restrict,
  hours numeric(8, 2) not null,
  primary key (package_id, labor_class_id),
  constraint bk_package_labor_nonnegative check (hours >= 0)
);

create table public.bk_package_resources (
  package_id uuid not null references public.bk_service_packages (id) on delete cascade,
  pool_id uuid not null references public.bk_pools (id) on delete restrict,
  units numeric(8, 2) not null,
  primary key (package_id, pool_id),
  constraint bk_package_resources_nonnegative check (units >= 0)
);

create table public.bk_rate_card_lines (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.bk_rate_model_versions (id) on delete cascade,
  kind public.bk_rate_card_line_kind not null,
  package_id uuid references public.bk_service_packages (id) on delete set null,
  labor_class_id uuid references public.bk_labor_classes (id) on delete set null,
  line_key text not null,
  name text not null,
  unit_label text not null,
  strategic_rate numeric(12, 2),
  incremental_rate numeric(12, 2),
  external_rate numeric(12, 2) not null,
  strategic_cost numeric(12, 2),
  incremental_cost numeric(12, 2),
  external_grossed_cost numeric(12, 2),
  market_floor numeric(12, 2),
  historical_reference text,
  application_note text,
  sort_order integer not null default 0,
  snapshotted_at timestamptz not null default now()
);
comment on table public.bk_rate_card_lines is
  'The rate card as computed when a version was put in use or adopted — a snapshot TypeScript writes (lib/bookings/rate-card-snapshot.ts), so an estimate keeps the rate it was priced at. SQL never computes a price.';
create index bk_rate_card_lines_version_idx on public.bk_rate_card_lines (version_id, sort_order);

create table public.bk_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tag text,
  pool_id uuid not null references public.bk_pools (id) on delete restrict,
  acquired_on date,
  acquisition_cost numeric(12, 2),
  annual_cost numeric(12, 2),
  funding public.bk_asset_funding not null default 'station',
  useful_life_years numeric(4, 1),
  restrictions text,
  maintenance_burden public.bk_asset_burden not null default 'low',
  condition public.bk_asset_condition not null default 'good',
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
comment on table public.bk_assets is
  'The major production assets by pool (docs/bookings-design.md §5): an inventory, not a model. Out of service rather than deleted; changes a rate only through a later version.';

create table public.bk_rate_model_events (
  id uuid primary key default gen_random_uuid(),
  version_id uuid references public.bk_rate_model_versions (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null,
  note text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index bk_rate_model_events_version_idx on public.bk_rate_model_events (version_id, created_at desc);

-- Capacity ---------------------------------------------------------------------------------------------------

create table public.bk_term_plans (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  starts_on date not null,
  ends_on date not null,
  -- The station's contribution, as a share of each tracked class's net hours (the framework's 15%).
  reserve_share numeric(5, 4) not null default 0.15,
  -- The airtime envelope: university-eligible avail minutes a week the station contributes (§2.5).
  airtime_contributed_minutes_per_week integer not null default 0,
  status public.bk_term_plan_status not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint bk_term_plans_dates check (ends_on >= starts_on),
  constraint bk_term_plans_reserve_share check (reserve_share >= 0 and reserve_share <= 1),
  constraint bk_term_plans_airtime_nonnegative check (airtime_contributed_minutes_per_week >= 0)
);
comment on table public.bk_term_plans is
  'One term''s production and airtime envelopes (docs/bookings-design.md §8). Capacity is per labor class in bk_term_capacity; this row holds the dates, the reserve share and the airtime envelope.';
create unique index bk_term_plans_one_active on public.bk_term_plans (status) where status = 'active';

create table public.bk_term_capacity (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.bk_term_plans (id) on delete cascade,
  labor_class_id uuid not null references public.bk_labor_classes (id) on delete restrict,
  -- Net schedulable hours of this class for the term (a project day is 8 of a professional's).
  net_hours numeric(8, 2) not null default 0,
  headcount integer not null default 1,
  hours_per_person_day numeric(4, 2) not null default 8,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bk_term_capacity_plan_class unique (plan_id, labor_class_id),
  constraint bk_term_capacity_net_nonnegative check (net_hours >= 0),
  constraint bk_term_capacity_headcount check (headcount >= 1),
  constraint bk_term_capacity_day check (hours_per_person_day > 0 and hours_per_person_day <= 24)
);
comment on table public.bk_term_capacity is
  'A labor class''s capacity in one term: net hours, how many people, and each person''s hours a day. A class with no row is not capacity-checked (student hours are checked against agreements, slice 5).';

create table public.bk_term_resources (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.bk_term_plans (id) on delete cascade,
  pool_id uuid not null references public.bk_pools (id) on delete restrict,
  available_units numeric(8, 2) not null default 0,
  -- How many bookings or holds the pool takes in one window (two field kits = 2).
  concurrent_units integer not null default 1,
  windows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bk_term_resources_plan_pool unique (plan_id, pool_id),
  constraint bk_term_resources_units_nonnegative check (available_units >= 0),
  constraint bk_term_resources_concurrent check (concurrent_units >= 1),
  constraint bk_term_resources_windows_array check (jsonb_typeof(windows) = 'array')
);

create table public.bk_blackouts (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.bk_term_plans (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  -- Null means every pool.
  pool_ids uuid[],
  reason text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint bk_blackouts_dates check (ends_on >= starts_on),
  constraint bk_blackouts_pools_nonempty check (pool_ids is null or cardinality(pool_ids) > 0)
);
create index bk_blackouts_plan_idx on public.bk_blackouts (plan_id, starts_on);

create table public.bk_holds (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.bk_term_plans (id) on delete cascade,
  -- Null holds only labor (a day of core work away from every pool).
  pool_id uuid references public.bk_pools (id) on delete restrict,
  date date not null,
  window_start time not null,
  window_end time not null,
  kind public.bk_hold_kind not null default 'core',
  label text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint bk_holds_window check (window_end > window_start)
);
create index bk_holds_plan_date_idx on public.bk_holds (plan_id, date);

create table public.bk_hold_labor (
  hold_id uuid not null references public.bk_holds (id) on delete cascade,
  labor_class_id uuid not null references public.bk_labor_classes (id) on delete restrict,
  hours numeric(6, 2) not null,
  primary key (hold_id, labor_class_id),
  constraint bk_hold_labor_nonnegative check (hours >= 0)
);

create table public.bk_bookings (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.bk_term_plans (id) on delete cascade,
  -- A bare uuid until slice 3 adds bk_projects and the foreign key.
  project_id uuid,
  pool_id uuid not null references public.bk_pools (id) on delete restrict,
  date date not null,
  window_start time not null,
  window_end time not null,
  units numeric(6, 2) not null default 1,
  treatment public.bk_pricing_treatment not null,
  status public.bk_booking_status not null default 'tentative',
  expires_at timestamptz,
  released_at timestamptz,
  label text not null,
  notes text,
  exception_by uuid references public.profiles (id) on delete set null,
  exception_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint bk_bookings_window check (window_end > window_start),
  constraint bk_bookings_units_positive check (units > 0),
  constraint bk_bookings_exception_pair check ((exception_by is null) = (exception_reason is null))
);
comment on table public.bk_bookings is
  'A partner''s hold on one window of one pool (docs/bookings-design.md §6.4), with its hours per labor class in bk_booking_labor. Tentative holds count as taken; released ones are history.';
create index bk_bookings_plan_date_idx on public.bk_bookings (plan_id, date);
create index bk_bookings_project_idx on public.bk_bookings (project_id) where project_id is not null;

create table public.bk_booking_labor (
  booking_id uuid not null references public.bk_bookings (id) on delete cascade,
  labor_class_id uuid not null references public.bk_labor_classes (id) on delete restrict,
  hours numeric(6, 2) not null,
  primary key (booking_id, labor_class_id),
  constraint bk_booking_labor_nonnegative check (hours >= 0)
);

-- updated_at maintenance -------------------------------------------------------------------------------

create trigger set_bk_labor_classes_updated_at before update on public.bk_labor_classes for each row execute function public.set_updated_at();
create trigger set_bk_pools_updated_at before update on public.bk_pools for each row execute function public.set_updated_at();
create trigger set_bk_assumptions_updated_at before update on public.bk_assumptions for each row execute function public.set_updated_at();
create trigger set_bk_labor_rates_updated_at before update on public.bk_labor_rates for each row execute function public.set_updated_at();
create trigger set_bk_resource_pools_updated_at before update on public.bk_resource_pools for each row execute function public.set_updated_at();
create trigger set_bk_service_packages_updated_at before update on public.bk_service_packages for each row execute function public.set_updated_at();
create trigger set_bk_assets_updated_at before update on public.bk_assets for each row execute function public.set_updated_at();
create trigger set_bk_term_plans_updated_at before update on public.bk_term_plans for each row execute function public.set_updated_at();
create trigger set_bk_term_capacity_updated_at before update on public.bk_term_capacity for each row execute function public.set_updated_at();
create trigger set_bk_term_resources_updated_at before update on public.bk_term_resources for each row execute function public.set_updated_at();
create trigger set_bk_bookings_updated_at before update on public.bk_bookings for each row execute function public.set_updated_at();

-- Rate model guards (unchanged from slice 1) -------------------------------------------------------------

create function public.bk_guard_version_transition()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_pending integer;
begin
  if new.status is distinct from old.status then
    if old.status = 'draft' and new.status = 'submitted' then
      select count(*) into v_pending
      from (
        select 1 from public.bk_assumptions a where a.version_id = new.id and a.validation_state = 'pending'
        union all
        select 1 from public.bk_resource_pools r where r.version_id = new.id and r.validation_state = 'pending'
        union all
        select 1 from public.bk_labor_rates l where l.version_id = new.id and l.validation_state = 'pending'
      ) pending;
      if v_pending > 0 then
        raise exception 'This version still has % input(s) awaiting validation.', v_pending
          using errcode = 'check_violation';
      end if;
      new.submitted_at := coalesce(new.submitted_at, now());
      new.submitted_by := coalesce(new.submitted_by, auth.uid());
    elsif old.status = 'submitted' and new.status = 'draft' then
      new.submitted_at := null;
      new.submitted_by := null;
    elsif old.status = 'submitted' and new.status = 'adopted' then
      if not private.is_bookings_executive(auth.uid()) then
        raise exception 'Only the Executive Director can adopt a rate card version.'
          using errcode = 'check_violation';
      end if;
      new.adopted_at := coalesce(new.adopted_at, now());
      new.adopted_by := coalesce(new.adopted_by, auth.uid());
      new.in_use := true;
    elsif old.status = 'adopted' and new.status = 'superseded' then
      if not private.is_bookings_executive(auth.uid()) then
        raise exception 'Only the Executive Director can supersede an adopted rate card version.'
          using errcode = 'check_violation';
      end if;
      new.superseded_at := coalesce(new.superseded_at, now());
      new.in_use := false;
    else
      raise exception 'A rate model version cannot move from % to %.', old.status, new.status
        using errcode = 'check_violation';
    end if;
  elsif old.status in ('adopted', 'superseded') then
    if (new.label, new.notes, new.destination_index)
         is distinct from (old.label, old.notes, old.destination_index) then
      raise exception 'An adopted rate model version cannot be edited; a correction is a new version.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
create trigger bk_rate_model_versions_guard_transition
  before update on public.bk_rate_model_versions
  for each row execute function public.bk_guard_version_transition();

-- Frozen versions: the version id is on the row, or on the package the row belongs to.
create function public.bk_guard_frozen_version()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_version uuid;
  v_status public.bk_version_status;
begin
  if tg_table_name in ('bk_package_labor', 'bk_package_resources') then
    select p.version_id into v_version
    from public.bk_service_packages p
    where p.id = coalesce(new.package_id, old.package_id);
  else
    v_version := coalesce(new.version_id, old.version_id);
  end if;
  select status into v_status from public.bk_rate_model_versions where id = v_version;
  if v_status in ('adopted', 'superseded') then
    raise exception 'Rate model version is adopted; a correction is a new version.'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger bk_assumptions_guard_frozen before insert or update or delete on public.bk_assumptions for each row execute function public.bk_guard_frozen_version();
create trigger bk_labor_rates_guard_frozen before insert or update or delete on public.bk_labor_rates for each row execute function public.bk_guard_frozen_version();
create trigger bk_resource_pools_guard_frozen before insert or update or delete on public.bk_resource_pools for each row execute function public.bk_guard_frozen_version();
create trigger bk_service_packages_guard_frozen before insert or update or delete on public.bk_service_packages for each row execute function public.bk_guard_frozen_version();
create trigger bk_package_labor_guard_frozen before insert or update or delete on public.bk_package_labor for each row execute function public.bk_guard_frozen_version();
create trigger bk_package_resources_guard_frozen before insert or update or delete on public.bk_package_resources for each row execute function public.bk_guard_frozen_version();

create function public.bk_set_version_in_use(p_version_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status public.bk_version_status;
  v_count integer;
begin
  select status into v_status from public.bk_rate_model_versions where id = p_version_id;
  if v_status is null then return jsonb_build_object('error', 'unknown_version'); end if;
  if v_status = 'superseded' then return jsonb_build_object('error', 'superseded'); end if;
  update public.bk_rate_model_versions set in_use = false where in_use and id <> p_version_id;
  update public.bk_rate_model_versions set in_use = true where id = p_version_id and not in_use;
  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'changed', v_count > 0);
end;
$$;

create function public.bk_adopt_version(p_version_id uuid, p_destination_index text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status public.bk_version_status;
begin
  select status into v_status from public.bk_rate_model_versions where id = p_version_id;
  if v_status is null then return jsonb_build_object('error', 'unknown_version'); end if;
  if v_status <> 'submitted' then return jsonb_build_object('error', 'not_submitted'); end if;
  update public.bk_rate_model_versions set status = 'superseded' where status = 'adopted' and id <> p_version_id;
  update public.bk_rate_model_versions set in_use = false where in_use and id <> p_version_id;
  update public.bk_rate_model_versions
     set status = 'adopted', destination_index = coalesce(p_destination_index, destination_index)
   where id = p_version_id;
  return jsonb_build_object('ok', true);
end;
$$;

/** One call creates a version's package with its labor and resource rows. Security invoker; finance's RLS applies. */
create function public.bk_save_package(p_package jsonb, p_labor jsonb, p_resources jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := nullif(p_package->>'id', '')::uuid;
  v_row jsonb;
begin
  if v_id is null then
    insert into public.bk_service_packages
      (version_id, name, unit_label, market_floor, historical_reference, application_note, notes, sort_order)
    values (
      (p_package->>'version_id')::uuid, p_package->>'name', p_package->>'unit_label',
      coalesce((p_package->>'market_floor')::numeric, 0), p_package->>'historical_reference',
      p_package->>'application_note', p_package->>'notes', coalesce((p_package->>'sort_order')::integer, 1000)
    ) returning id into v_id;
  else
    update public.bk_service_packages
       set name = p_package->>'name', unit_label = p_package->>'unit_label',
           market_floor = coalesce((p_package->>'market_floor')::numeric, 0),
           historical_reference = p_package->>'historical_reference',
           application_note = p_package->>'application_note', notes = p_package->>'notes'
     where id = v_id;
    if not found then return jsonb_build_object('error', 'unknown_package'); end if;
    delete from public.bk_package_labor where package_id = v_id;
    delete from public.bk_package_resources where package_id = v_id;
  end if;
  for v_row in select * from jsonb_array_elements(coalesce(p_labor, '[]'::jsonb)) loop
    if (v_row->>'hours')::numeric > 0 then
      insert into public.bk_package_labor (package_id, labor_class_id, hours)
      values (v_id, (v_row->>'labor_class_id')::uuid, (v_row->>'hours')::numeric);
    end if;
  end loop;
  for v_row in select * from jsonb_array_elements(coalesce(p_resources, '[]'::jsonb)) loop
    if (v_row->>'units')::numeric > 0 then
      insert into public.bk_package_resources (package_id, pool_id, units)
      values (v_id, (v_row->>'pool_id')::uuid, (v_row->>'units')::numeric);
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- The booking rule ------------------------------------------------------------------------------------
-- docs/bookings-design.md §6.4, run where the write happens. Pool checks on
-- bk_bookings (blacked out, held, the window's concurrent units taken);
-- per-class checks on bk_booking_labor (the class's day across its headcount;
-- its capacity for the treatment — strategic draws the class's reserve,
-- incremental and external its open hours = net − reserve − held − other
-- bookings). lib/bookings/scheduling.ts is the twin; keep them in step.

create function public.bk_booking_is_live(b public.bk_bookings)
returns boolean language sql immutable
as $$
  select b.status <> 'released'
     and (b.status <> 'tentative' or b.expires_at is null or b.expires_at > now());
$$;

create function public.bk_check_booking_labor(p_booking_id uuid, p_labor_class_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_booking public.bk_bookings;
  v_plan public.bk_term_plans;
  v_capacity public.bk_term_capacity;
  v_class text;
  v_day_hours numeric;
  v_day_cap numeric;
  v_reserve numeric;
  v_strategic numeric;
  v_nonstrategic numeric;
  v_held numeric;
  v_open numeric;
begin
  select * into v_booking from public.bk_bookings where id = p_booking_id;
  if v_booking.id is null or not public.bk_booking_is_live(v_booking) or v_booking.exception_reason is not null then
    return;
  end if;
  select * into v_capacity from public.bk_term_capacity
   where plan_id = v_booking.plan_id and labor_class_id = p_labor_class_id;
  if v_capacity.id is null then
    return; -- a class the term plan does not track is not capacity-checked
  end if;
  select * into v_plan from public.bk_term_plans where id = v_booking.plan_id;
  select name into v_class from public.bk_labor_classes where id = p_labor_class_id;

  -- 4. Room in the class's day (headcount × hours a day), counting this booking.
  select coalesce(sum(hours), 0) into v_day_hours
  from (
    select bl.hours
    from public.bk_booking_labor bl
    join public.bk_bookings b on b.id = bl.booking_id
    where b.plan_id = v_booking.plan_id and b.date = v_booking.date
      and bl.labor_class_id = p_labor_class_id
      and public.bk_booking_is_live(b) and b.exception_reason is null
    union all
    select hl.hours
    from public.bk_hold_labor hl
    join public.bk_holds h on h.id = hl.hold_id
    where h.plan_id = v_booking.plan_id and h.date = v_booking.date and hl.labor_class_id = p_labor_class_id
  ) day;
  v_day_cap := v_capacity.headcount * v_capacity.hours_per_person_day;
  if v_day_hours > v_day_cap then
    raise exception '% on %: % of % hours are already spoken for, so this does not fit the day.',
      v_class, v_booking.date, v_day_hours, v_day_cap
      using errcode = 'check_violation';
  end if;

  -- 5. Capacity for the pricing, counting this booking.
  v_reserve := v_capacity.net_hours * v_plan.reserve_share;
  select
    coalesce(sum(bl.hours) filter (where b.treatment = 'strategic'), 0),
    coalesce(sum(bl.hours) filter (where b.treatment <> 'strategic'), 0)
  into v_strategic, v_nonstrategic
  from public.bk_booking_labor bl
  join public.bk_bookings b on b.id = bl.booking_id
  where b.plan_id = v_booking.plan_id and bl.labor_class_id = p_labor_class_id
    and public.bk_booking_is_live(b) and b.exception_reason is null;
  select coalesce(sum(hl.hours), 0) into v_held
  from public.bk_hold_labor hl
  join public.bk_holds h on h.id = hl.hold_id
  where h.plan_id = v_booking.plan_id and hl.labor_class_id = p_labor_class_id;

  if v_booking.treatment = 'strategic' then
    if v_strategic > v_reserve then
      raise exception 'The % reserve (% of % hours) cannot take this strategic booking; % hours would be drawn.',
        v_class, v_reserve, v_capacity.net_hours, v_strategic
        using errcode = 'check_violation';
    end if;
  else
    v_open := v_capacity.net_hours - v_reserve - v_held - v_nonstrategic;
    if v_open < 0 then
      raise exception 'Open % capacity is short by % hours for this % booking.',
        v_class, -v_open, v_booking.treatment
        using errcode = 'check_violation';
    end if;
  end if;
end;
$$;

create function public.bk_booking_allowed()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_plan public.bk_term_plans;
  v_resource public.bk_term_resources;
  v_blackout public.bk_blackouts;
  v_hold public.bk_holds;
  v_taken integer;
  v_class uuid;
begin
  if new.status = 'released' then
    new.released_at := coalesce(new.released_at, now());
    return new;
  end if;
  new.released_at := null;

  -- An update that leaves the booking where it is (confirming it, a label
  -- edit) is not re-checked: a later hold must not refuse to confirm a hold
  -- the estimate already placed.
  if tg_op = 'UPDATE'
     and old.status <> 'released'
     and (new.plan_id, new.pool_id, new.date, new.window_start, new.window_end, new.treatment)
         is not distinct from
         (old.plan_id, old.pool_id, old.date, old.window_start, old.window_end, old.treatment) then
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
  select * into v_resource from public.bk_term_resources r where r.plan_id = new.plan_id and r.pool_id = new.pool_id;
  if v_resource.id is null then
    raise exception 'The term plan has no resource for that pool.' using errcode = 'check_violation';
  end if;

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
  select * into v_blackout from public.bk_blackouts b
  where b.plan_id = new.plan_id and new.date between b.starts_on and b.ends_on
    and (b.pool_ids is null or new.pool_id = any (b.pool_ids))
  order by b.starts_on limit 1;
  if v_blackout.id is not null then
    raise exception 'Blacked out: % (% to %).', v_blackout.reason, v_blackout.starts_on, v_blackout.ends_on
      using errcode = 'check_violation';
  end if;

  -- 1 and 3. The window's concurrent units: holds and live bookings on the pool that overlap.
  select count(*) into v_taken from (
    select 1 from public.bk_holds h
    where h.plan_id = new.plan_id and h.pool_id = new.pool_id and h.date = new.date
      and h.window_start < new.window_end and h.window_end > new.window_start
    union all
    select 1 from public.bk_bookings o
    where o.plan_id = new.plan_id and o.id <> new.id and o.pool_id = new.pool_id and o.date = new.date
      and public.bk_booking_is_live(o)
      and o.window_start < new.window_end and o.window_end > new.window_start
  ) taken;
  if v_taken >= v_resource.concurrent_units then
    select * into v_hold from public.bk_holds h
    where h.plan_id = new.plan_id and h.pool_id = new.pool_id and h.date = new.date
      and h.window_start < new.window_end and h.window_end > new.window_start
    order by h.window_start limit 1;
    if v_hold.id is not null and v_resource.concurrent_units = 1 then
      raise exception 'Held for WUWF on %: % (% to %).', new.date, v_hold.label, v_hold.window_start, v_hold.window_end
        using errcode = 'check_violation';
    end if;
    raise exception 'The window on % is taken: % of % on this pool already booked or held.',
      new.date, v_taken, v_resource.concurrent_units
      using errcode = 'check_violation';
  end if;

  -- A moved booking re-checks its labor rows against the new date.
  if tg_op = 'UPDATE' then
    for v_class in select labor_class_id from public.bk_booking_labor where booking_id = new.id loop
      perform public.bk_check_booking_labor(new.id, v_class);
    end loop;
  end if;
  return new;
end;
$$;
create trigger bk_bookings_allowed
  before insert or update on public.bk_bookings
  for each row execute function public.bk_booking_allowed();

create function public.bk_booking_labor_allowed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.bk_check_booking_labor(new.booking_id, new.labor_class_id);
  return new;
end;
$$;
create trigger bk_booking_labor_allowed
  after insert or update on public.bk_booking_labor
  for each row execute function public.bk_booking_labor_allowed();

-- One transaction for a booking and its labor rows: a refusal of any part rolls back the whole booking.
create function public.bk_create_booking(p_booking jsonb, p_labor jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_row jsonb;
begin
  insert into public.bk_bookings
    (plan_id, project_id, pool_id, date, window_start, window_end, units, treatment, status, expires_at,
     label, notes, exception_reason, exception_by, created_by)
  values (
    (p_booking->>'plan_id')::uuid, nullif(p_booking->>'project_id', '')::uuid, (p_booking->>'pool_id')::uuid,
    (p_booking->>'date')::date, (p_booking->>'window_start')::time, (p_booking->>'window_end')::time,
    coalesce((p_booking->>'units')::numeric, 1), (p_booking->>'treatment')::public.bk_pricing_treatment,
    coalesce((p_booking->>'status')::public.bk_booking_status, 'tentative'),
    nullif(p_booking->>'expires_at', '')::timestamptz, p_booking->>'label', p_booking->>'notes',
    nullif(p_booking->>'exception_reason', ''),
    case when nullif(p_booking->>'exception_reason', '') is null then null else auth.uid() end,
    auth.uid()
  ) returning id into v_id;
  for v_row in select * from jsonb_array_elements(coalesce(p_labor, '[]'::jsonb)) loop
    if (v_row->>'hours')::numeric > 0 then
      insert into public.bk_booking_labor (booking_id, labor_class_id, hours)
      values (v_id, (v_row->>'labor_class_id')::uuid, (v_row->>'hours')::numeric);
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create function public.bk_create_hold(p_hold jsonb, p_labor jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_row jsonb;
begin
  insert into public.bk_holds (plan_id, pool_id, date, window_start, window_end, kind, label, created_by)
  values (
    (p_hold->>'plan_id')::uuid, nullif(p_hold->>'pool_id', '')::uuid, (p_hold->>'date')::date,
    (p_hold->>'window_start')::time, (p_hold->>'window_end')::time,
    coalesce((p_hold->>'kind')::public.bk_hold_kind, 'core'), p_hold->>'label', auth.uid()
  ) returning id into v_id;
  for v_row in select * from jsonb_array_elements(coalesce(p_labor, '[]'::jsonb)) loop
    if (v_row->>'hours')::numeric > 0 then
      insert into public.bk_hold_labor (hold_id, labor_class_id, hours)
      values (v_id, (v_row->>'labor_class_id')::uuid, (v_row->>'hours')::numeric);
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke execute on function public.bk_save_package(jsonb, jsonb, jsonb) from public, anon;
revoke execute on function public.bk_create_booking(jsonb, jsonb) from public, anon;
revoke execute on function public.bk_create_hold(jsonb, jsonb) from public, anon;
revoke execute on function public.bk_set_version_in_use(uuid) from public, anon;
revoke execute on function public.bk_adopt_version(uuid, text) from public, anon;
grant execute on function public.bk_save_package(jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.bk_create_booking(jsonb, jsonb) to authenticated;
grant execute on function public.bk_create_hold(jsonb, jsonb) to authenticated;
grant execute on function public.bk_set_version_in_use(uuid) to authenticated;
grant execute on function public.bk_adopt_version(uuid, text) to authenticated;

-- The airtime boundary (§6.5), read side — unchanged from slice 2 ----------------------------------

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
    where v.effective_from <= v_as_of and (v.effective_to is null or v.effective_to >= v_as_of)
    order by e.id, v.effective_from desc
  ),
  opportunities as (
    select e.id as entry_id, e.program_id, e.days, e.day_set, e.hours, o.id as opportunity_id, cs.duration_seconds
    from entries e
    join versions v on v.entry_id = e.id
    join public.log_local_opportunities o on o.clock_version_id = v.version_id and o.active
    join public.log_clock_slots cs on cs.id = o.slot_id
    where 'university_announcement' = any (o.permitted_content_types)
  ),
  pins as (
    select op.entry_id, a.id as assignment_id,
           (case when a.hour_index is null then op.hours else 1 end)
             * (case when cardinality(a.days_of_week) = 0 then op.days
                     else (select count(*) from unnest(a.days_of_week) d where d = any (op.day_set)) end) as occurrences,
           coalesce(
             nullif((select sum(c.duration_seconds) from public.log_content_components c where c.content_item_id = ci.id and c.required), 0),
             ci.expected_duration_seconds, 0) as seconds
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
    select pe.program_id, pr.name, sum(pe.avails)::integer as avails,
           round(sum(pe.seconds) / 60.0, 1) as minutes, round(sum(pe.pinned_seconds) / 60.0, 1) as pinned_minutes
    from per_entry pe
    join public.log_programs pr on pr.id = pe.program_id
    group by pe.program_id, pr.name
    having sum(pe.avails) > 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'program_id', program_id, 'name', name, 'avails_per_week', avails,
    'minutes_per_week', minutes, 'pinned_minutes_per_week', pinned_minutes) order by name), '[]'::jsonb)
  into v_programs from per_program;

  return jsonb_build_object('ok', true, 'as_of', v_as_of, 'programs', v_programs);
end;
$$;
comment on function public.bk_university_avails_per_week(uuid) is
  'Bookings'' read of On Air''s clocks (docs/bookings-design.md §6.5): university-eligible avails and minutes a week, per program, with the minutes their pinned content already takes. Security definer; read only; places nothing.';
revoke execute on function public.bk_university_avails_per_week(uuid) from public, anon;
grant execute on function public.bk_university_avails_per_week(uuid) to authenticated;

-- RLS ----------------------------------------------------------------------------------------------------------

alter table public.bk_labor_classes enable row level security;
alter table public.bk_pools enable row level security;
alter table public.bk_rate_model_versions enable row level security;
alter table public.bk_assumptions enable row level security;
alter table public.bk_labor_rates enable row level security;
alter table public.bk_resource_pools enable row level security;
alter table public.bk_service_packages enable row level security;
alter table public.bk_package_labor enable row level security;
alter table public.bk_package_resources enable row level security;
alter table public.bk_rate_card_lines enable row level security;
alter table public.bk_assets enable row level security;
alter table public.bk_rate_model_events enable row level security;
alter table public.bk_term_plans enable row level security;
alter table public.bk_term_capacity enable row level security;
alter table public.bk_term_resources enable row level security;
alter table public.bk_blackouts enable row level security;
alter table public.bk_holds enable row level security;
alter table public.bk_hold_labor enable row level security;
alter table public.bk_bookings enable row level security;
alter table public.bk_booking_labor enable row level security;

grant select, insert, update on public.bk_labor_classes to authenticated;
grant select, insert, update on public.bk_pools to authenticated;
grant select, insert, update on public.bk_rate_model_versions to authenticated;
grant select, insert, update, delete on public.bk_assumptions to authenticated;
grant select, insert, update, delete on public.bk_labor_rates to authenticated;
grant select, insert, update, delete on public.bk_resource_pools to authenticated;
grant select, insert, update, delete on public.bk_service_packages to authenticated;
grant select, insert, update, delete on public.bk_package_labor to authenticated;
grant select, insert, update, delete on public.bk_package_resources to authenticated;
grant select, insert, delete on public.bk_rate_card_lines to authenticated;
grant select, insert, update on public.bk_assets to authenticated;
grant select, insert on public.bk_rate_model_events to authenticated;
grant select, insert, update on public.bk_term_plans to authenticated;
grant select, insert, update, delete on public.bk_term_capacity to authenticated;
grant select, insert, update, delete on public.bk_term_resources to authenticated;
grant select, insert, update, delete on public.bk_blackouts to authenticated;
grant select, insert, update, delete on public.bk_holds to authenticated;
grant select, insert, update, delete on public.bk_hold_labor to authenticated;
grant select, insert, update on public.bk_bookings to authenticated;
grant select, insert, update, delete on public.bk_booking_labor to authenticated;

-- Catalogs: finance or the director keeps them (a pool is the director's resource, priced by finance).
create policy bk_labor_classes_select on public.bk_labor_classes for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_labor_classes_write on public.bk_labor_classes for all to authenticated
  using ((select private.is_bookings_finance((select auth.uid()))) or (select private.is_bookings_director((select auth.uid()))))
  with check ((select private.is_bookings_finance((select auth.uid()))) or (select private.is_bookings_director((select auth.uid()))));
create policy bk_pools_select on public.bk_pools for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_pools_write on public.bk_pools for all to authenticated
  using ((select private.is_bookings_finance((select auth.uid()))) or (select private.is_bookings_director((select auth.uid()))))
  with check ((select private.is_bookings_finance((select auth.uid()))) or (select private.is_bookings_director((select auth.uid()))));

-- Rate model: finance writes; the executive is admitted to versions and the card snapshot.
create policy bk_rate_model_versions_select on public.bk_rate_model_versions for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_rate_model_versions_insert on public.bk_rate_model_versions for insert to authenticated
  with check ((select private.is_bookings_finance((select auth.uid()))));
create policy bk_rate_model_versions_update on public.bk_rate_model_versions for update to authenticated
  using ((select private.is_bookings_finance((select auth.uid()))) or (select private.is_bookings_executive((select auth.uid()))))
  with check ((select private.is_bookings_finance((select auth.uid()))) or (select private.is_bookings_executive((select auth.uid()))));

create policy bk_assumptions_select on public.bk_assumptions for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_assumptions_write on public.bk_assumptions for all to authenticated
  using ((select private.is_bookings_finance((select auth.uid()))))
  with check ((select private.is_bookings_finance((select auth.uid()))));
create policy bk_labor_rates_select on public.bk_labor_rates for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_labor_rates_write on public.bk_labor_rates for all to authenticated
  using ((select private.is_bookings_finance((select auth.uid()))))
  with check ((select private.is_bookings_finance((select auth.uid()))));
create policy bk_resource_pools_select on public.bk_resource_pools for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_resource_pools_write on public.bk_resource_pools for all to authenticated
  using ((select private.is_bookings_finance((select auth.uid()))))
  with check ((select private.is_bookings_finance((select auth.uid()))));
create policy bk_service_packages_select on public.bk_service_packages for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_service_packages_write on public.bk_service_packages for all to authenticated
  using ((select private.is_bookings_finance((select auth.uid()))))
  with check ((select private.is_bookings_finance((select auth.uid()))));
create policy bk_package_labor_select on public.bk_package_labor for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_package_labor_write on public.bk_package_labor for all to authenticated
  using ((select private.is_bookings_finance((select auth.uid()))))
  with check ((select private.is_bookings_finance((select auth.uid()))));
create policy bk_package_resources_select on public.bk_package_resources for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_package_resources_write on public.bk_package_resources for all to authenticated
  using ((select private.is_bookings_finance((select auth.uid()))))
  with check ((select private.is_bookings_finance((select auth.uid()))));
create policy bk_rate_card_lines_select on public.bk_rate_card_lines for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_rate_card_lines_write on public.bk_rate_card_lines for all to authenticated
  using ((select private.is_bookings_finance((select auth.uid()))) or (select private.is_bookings_executive((select auth.uid()))))
  with check ((select private.is_bookings_finance((select auth.uid()))) or (select private.is_bookings_executive((select auth.uid()))));
create policy bk_assets_select on public.bk_assets for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_assets_write on public.bk_assets for all to authenticated
  using ((select private.is_bookings_finance((select auth.uid()))) or (select private.is_bookings_director((select auth.uid()))))
  with check ((select private.is_bookings_finance((select auth.uid()))) or (select private.is_bookings_director((select auth.uid()))));
create policy bk_rate_model_events_select on public.bk_rate_model_events for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_rate_model_events_insert on public.bk_rate_model_events for insert to authenticated
  with check ((select private.has_bookings_access((select auth.uid()))) and actor_id = (select auth.uid()));

-- Capacity: the plan, its capacity, resources, blackouts and holds are the
-- director's; a booking is production's, the director's, or the executive's.
create policy bk_term_plans_select on public.bk_term_plans for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_term_plans_write on public.bk_term_plans for all to authenticated
  using ((select private.is_bookings_director((select auth.uid()))))
  with check ((select private.is_bookings_director((select auth.uid()))));
create policy bk_term_capacity_select on public.bk_term_capacity for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_term_capacity_write on public.bk_term_capacity for all to authenticated
  using ((select private.is_bookings_director((select auth.uid()))))
  with check ((select private.is_bookings_director((select auth.uid()))));
create policy bk_term_resources_select on public.bk_term_resources for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_term_resources_write on public.bk_term_resources for all to authenticated
  using ((select private.is_bookings_director((select auth.uid()))))
  with check ((select private.is_bookings_director((select auth.uid()))));
create policy bk_blackouts_select on public.bk_blackouts for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_blackouts_write on public.bk_blackouts for all to authenticated
  using ((select private.is_bookings_director((select auth.uid()))))
  with check ((select private.is_bookings_director((select auth.uid()))));
create policy bk_holds_select on public.bk_holds for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_holds_write on public.bk_holds for all to authenticated
  using ((select private.is_bookings_director((select auth.uid()))))
  with check ((select private.is_bookings_director((select auth.uid()))));
create policy bk_hold_labor_select on public.bk_hold_labor for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_hold_labor_write on public.bk_hold_labor for all to authenticated
  using ((select private.is_bookings_director((select auth.uid()))))
  with check ((select private.is_bookings_director((select auth.uid()))));
create policy bk_bookings_select on public.bk_bookings for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_bookings_insert on public.bk_bookings for insert to authenticated
  with check (
    (select private.is_bookings_production((select auth.uid())))
    or (select private.is_bookings_director((select auth.uid())))
    or (select private.is_bookings_executive((select auth.uid())))
  );
create policy bk_bookings_update on public.bk_bookings for update to authenticated
  using (
    (select private.is_bookings_production((select auth.uid())))
    or (select private.is_bookings_director((select auth.uid())))
    or (select private.is_bookings_executive((select auth.uid())))
  )
  with check (
    (select private.is_bookings_production((select auth.uid())))
    or (select private.is_bookings_director((select auth.uid())))
    or (select private.is_bookings_executive((select auth.uid())))
  );
create policy bk_booking_labor_select on public.bk_booking_labor for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_booking_labor_write on public.bk_booking_labor for all to authenticated
  using (
    (select private.is_bookings_production((select auth.uid())))
    or (select private.is_bookings_director((select auth.uid())))
    or (select private.is_bookings_executive((select auth.uid())))
  )
  with check (
    (select private.is_bookings_production((select auth.uid())))
    or (select private.is_bookings_director((select auth.uid())))
    or (select private.is_bookings_executive((select auth.uid())))
  );

-- Seed: catalogs and rate model v0.1 -----------------------------------------------------------------
-- The workbook, row for row (WUWF_Production_Rate_Model_v0.1.xlsx) in the new
-- shape: two labor classes, five pools (webcast as an own-lines pool whose
-- units are events), seven packages. lib/bookings/rates.test.ts carries the
-- same values; every figure must still reproduce.

insert into public.bk_labor_classes (key, name, pay_basis, charged_in_strategic, sort_order) values
  ('production_lead', 'Production lead', 'salaried', false, 10),
  ('student', 'Student / OPS', 'hourly', true, 20);

insert into public.bk_pools (key, name, unit_label, costing, default_windows, sort_order) values
  ('studio', 'Studio / control room', 'half-day', 'allocated',
   '[{"key":"am","label":"Morning","start":"08:00","end":"12:00"},{"key":"pm","label":"Afternoon","start":"13:00","end":"17:00"},{"key":"full","label":"Full day","start":"08:00","end":"17:00"},{"key":"evening","label":"Evening","start":"17:00","end":"21:00"}]'::jsonb, 10),
  ('field', 'Field video package', 'day', 'allocated',
   '[{"key":"day","label":"Day","start":"08:00","end":"17:00"}]'::jsonb, 20),
  ('live', 'Live / multicamera package', 'day', 'allocated',
   '[{"key":"day","label":"Day","start":"08:00","end":"17:00"}]'::jsonb, 30),
  ('edit', 'Edit suite / post-production', 'hour', 'allocated',
   '[{"key":"am","label":"Morning","start":"08:00","end":"12:00"},{"key":"pm","label":"Afternoon","start":"13:00","end":"17:00"}]'::jsonb, 40),
  ('webcast', 'Webcast operations', 'event', 'own_lines', '[]'::jsonb, 50);

do $$
declare
  v_version uuid;
  v_lead uuid := (select id from public.bk_labor_classes where key = 'production_lead');
  v_student uuid := (select id from public.bk_labor_classes where key = 'student');
  v_studio uuid := (select id from public.bk_pools where key = 'studio');
  v_field uuid := (select id from public.bk_pools where key = 'field');
  v_live uuid := (select id from public.bk_pools where key = 'live');
  v_edit uuid := (select id from public.bk_pools where key = 'edit');
  v_webcast uuid := (select id from public.bk_pools where key = 'webcast');
  v_src text := 'https://docs.google.com/spreadsheets/d/1xVDt4rE2DWiiDv_KicCuth9FQs6K69CW/edit';
  v_pkg uuid;
begin
  insert into public.bk_rate_model_versions (label, status, in_use, notes)
  values ('v0.1', 'draft', true,
    'Provisional rate model from the September 2026 discussion draft. Planning outputs that test the architecture and expose which assumptions move the price; not approved rates.')
  returning id into v_version;

  insert into public.bk_assumptions
    (version_id, section, kind, pool_id, key, label, value, unit, basis, source_url, notes, owner, validation_state, validation_needed, sort_order)
  values
    (v_version, 'sourced', 'pool_line', null, null, 'Broadcast / production equipment contingency', 7000, 'per year', 'FY26–27 budget line', v_src, 'Not an asset inventory.', 'finance', 'validated', 'Current budget', 10),
    (v_version, 'sourced', 'pool_line', null, null, 'Editing computer and accessories', 3200, 'per year', 'FY26–27 budget line', v_src, null, 'finance', 'validated', 'Current budget', 20),
    (v_version, 'sourced', 'pool_line', null, null, 'Software acquisitions and upgrades', 2000, 'per year', 'FY26–27 Engineering & Technical', v_src, null, 'finance', 'validated', 'Current budget', 30),
    (v_version, 'sourced', 'pool_line', null, null, 'Hardware', 2000, 'per year', 'FY26–27 Engineering & Technical', v_src, null, 'finance', 'validated', 'Current budget', 40),
    (v_version, 'sourced', 'pool_line', null, null, 'Adobe Creative Cloud', 1740, 'per year', 'Current station budget', v_src, 'The production share must be validated.', 'finance', 'pending', 'Validate the production share', 50),
    (v_version, 'sourced', 'pool_line', v_webcast, null, 'Webcasting operating pool', 6500, 'per year', 'FY26–27 budget: $1,000 livestream + $5,500 misc. webcasting/UBIT', v_src, null, 'finance', 'validated', 'Current budget', 60),
    (v_version, 'sourced', 'model_input', null, 'assessment_share', 'New Ventures administrative assessment', 0.0671, 'of revenue', 'FY26–27 auxiliary budget states a 6.71% admin fee', 'https://docs.google.com/spreadsheets/d/1-cNoWd4p9MhDnFEGASl5afnN1TiRVfpz/edit', null, 'finance', 'validated', 'Current budget', 70),
    (v_version, 'working', 'model_input', null, 'external_margin_share', 'External target contribution margin', 0.25, 'of price', 'Management assumption', 'Used to calculate the cost-based external floor.', 'executive', 'pending', 'Set by WUWF', 10);

  insert into public.bk_labor_rates
    (version_id, labor_class_id, annual_salary, hourly_wage, load_share, paid_hours, external_rate, basis, validation_state, validation_needed)
  values
    (v_version, v_lead, 65000, null, 0.35, 2080, 65, 'WUWF working staffing assumption: $65,000 salary, 35% fringe, 2,080 paid hours; $65/hr external planning rate', 'pending', 'Confirm salary and the loaded-cost treatment with Budget / HR; the external rate is set by WUWF'),
    (v_version, v_student, null, 15, 0.08, null, 25, 'Provisional: $15/hr base wage, 8% payroll load; $25/hr external planning rate', 'pending', 'Confirm the current payroll rate and load; the external rate is set by WUWF');

  insert into public.bk_resource_pools
    (version_id, pool_id, allocation_share, available_units, basis, validation_state, validation_needed)
  values
    (v_version, v_studio, 0.35, 120, 'Provisional split and capacity', 'pending', 'Replace the allocation with the asset inventory and the units with a booking analysis'),
    (v_version, v_field, 0.25, 80, 'Provisional split and capacity', 'pending', 'Replace the allocation with the asset inventory and the units with a booking analysis'),
    (v_version, v_live, 0.30, 60, 'Provisional split and capacity', 'pending', 'Replace the allocation with the asset inventory and the units with a booking analysis'),
    (v_version, v_edit, 0.10, 400, 'Provisional split and capacity', 'pending', 'Replace the allocation with the asset inventory and the units with a booking analysis'),
    (v_version, v_webcast, null, 20, 'Provisional planning volume: 20 events a year allocate the webcasting operating pool', 'pending', 'Replace with a forecast');

  -- Packages: (name, unit, lead hrs, student hrs, studio, field, live, edit, webcast, floor, history, applies, notes, sort)
  insert into public.bk_service_packages (version_id, name, unit_label, market_floor, historical_reference, application_note, notes, sort_order)
  values (v_version, 'Studio access', 'half-day', 250, '$300–$500 Athletics studio rental (2017–18)',
    'Strategic rate only if professional time counts against the baseline envelope.',
    'Low-impact use may be waived where policy permits and no material cost or displacement occurs.', 10) returning id into v_pkg;
  insert into public.bk_package_labor values (v_pkg, v_lead, 1), (v_pkg, v_student, 2);
  insert into public.bk_package_resources values (v_pkg, v_studio, 1);

  insert into public.bk_service_packages (version_id, name, unit_label, market_floor, historical_reference, application_note, notes, sort_order)
  values (v_version, 'Studio access', 'full day', 450, 'No reliable current benchmark',
    'Recurring reservations should be governed by an annual capacity agreement.', null, 20) returning id into v_pkg;
  insert into public.bk_package_labor values (v_pkg, v_lead, 2), (v_pkg, v_student, 3);
  insert into public.bk_package_resources values (v_pkg, v_studio, 2);

  insert into public.bk_service_packages (version_id, name, unit_label, market_floor, historical_reference, application_note, notes, sort_order)
  values (v_version, 'Basic event webcast', 'event', 1000, '$500/event legacy internal rate',
    'Use for an ordinary standard-scope institutional webcast.',
    'Working package: standard crew and gear; scope limits to be defined.', 30) returning id into v_pkg;
  insert into public.bk_package_labor values (v_pkg, v_lead, 5), (v_pkg, v_student, 10);
  insert into public.bk_package_resources values (v_pkg, v_live, 1), (v_pkg, v_webcast, 1);

  insert into public.bk_service_packages (version_id, name, unit_label, market_floor, historical_reference, application_note, notes, sort_order)
  values (v_version, 'Enhanced multicamera webcast', 'event', 1800, 'No historical complexity-based tier',
    'Use when crew, gear or scope exceed the basic webcast definition.', 'Larger crew and production package.', 40) returning id into v_pkg;
  insert into public.bk_package_labor values (v_pkg, v_lead, 8), (v_pkg, v_student, 32);
  insert into public.bk_package_resources values (v_pkg, v_studio, 1), (v_pkg, v_live, 1.5), (v_pkg, v_webcast, 1);

  insert into public.bk_service_packages (version_id, name, unit_label, market_floor, historical_reference, application_note, notes, sort_order)
  values (v_version, 'Field production', 'half-day', 500, 'No direct historical comparator',
    'Standard field package; direct travel and specialty costs extra.', null, 50) returning id into v_pkg;
  insert into public.bk_package_labor values (v_pkg, v_lead, 4), (v_pkg, v_student, 8);
  insert into public.bk_package_resources values (v_pkg, v_field, 0.5);

  insert into public.bk_service_packages (version_id, name, unit_label, market_floor, historical_reference, application_note, notes, sort_order)
  values (v_version, 'Field production', 'full day', 900, 'No direct historical comparator',
    'Standard field package; direct travel and specialty costs extra.', null, 60) returning id into v_pkg;
  insert into public.bk_package_labor values (v_pkg, v_lead, 8), (v_pkg, v_student, 16);
  insert into public.bk_package_resources values (v_pkg, v_field, 1);

  insert into public.bk_service_packages (version_id, name, unit_label, market_floor, historical_reference, application_note, notes, sort_order)
  values (v_version, 'Post-production / editing', 'hour', 75, 'External studio sessions historically $125–$250',
    'Professional time inside the baseline may be subsidized; otherwise use the incremental rate.',
    'Professional editing hour; the strategic rate reflects resource cost only when professional time is inside the envelope.', 70) returning id into v_pkg;
  insert into public.bk_package_labor values (v_pkg, v_lead, 1);
  insert into public.bk_package_resources values (v_pkg, v_edit, 1);

  insert into public.bk_rate_model_events (version_id, actor_id, kind, note)
  values (v_version, null, 'seeded', 'Version v0.1 seeded from WUWF_Production_Rate_Model_v0.1.xlsx (September 2026 discussion draft) and put in use, provisionally. Re-seeded 2026-10-05 with labor classes and pools as data.');
end;
$$;
