-- Bookings: refinement pass, slice C — model corrections (2026-10-07).
--
-- docs/bookings-design.md §20. Additive: nothing applied earlier is rewritten.
-- Every new cost input defaults to zero or blank so the v0.1 workbook's rates
-- come out unchanged, and none of the new fields adds a submission gate
-- (bk_guard_version_transition() is untouched). SQL never computes a price;
-- lib/bookings/rates.ts and capital.ts do.
--
--   §20.1 practical capacity — bk_resource_pools.units_basis flags a pool whose
--         units are a volume forecast (the webcast pool's 20 events) rather
--         than a practical capacity; the v0.1 wording that asked for "a booking
--         analysis" now asks for the practical capacity.
--   §20.2 overhead — a budget line can be general overhead, kept out of every
--         pool's per-unit allocation; the recovery decision is recorded text.
--   §20.3 capital and maintenance — assets gain replacement_cost and
--         annual_maintenance; a version's pool row snapshots what the register
--         adds (capital_annual, maintenance_annual, asset_basis).
--   §20.4 double-count check — a budget line can say which pool, and which
--         assets, it already funds for replacement.
--   §20.5 market ceiling — an optional ceiling per package, snapshotted on the card.
--   §20.6 recipes — an estimate line keeps the standard recipe it started from
--         and the reason for any adjustment; the card snapshot gains the unit
--         costs an adjusted line is priced from.
--   §20.7 review status on package hours and market floors (no gate).
--   §20.8 assumed versus observed — bk_hours_used and bk_booking_events.

-- Practical capacity, overhead, capital -------------------------------------------------------------

alter table public.bk_resource_pools
  add column units_basis text not null default 'practical_capacity',
  add column capital_annual numeric not null default 0,
  add column maintenance_annual numeric not null default 0,
  add column asset_basis jsonb not null default '[]'::jsonb,
  add column asset_refreshed_at timestamptz,
  add constraint bk_resource_pools_units_basis check (units_basis in ('practical_capacity', 'volume_forecast')),
  add constraint bk_resource_pools_capital_nonnegative check (capital_annual >= 0 and maintenance_annual >= 0),
  add constraint bk_resource_pools_asset_basis_array check (jsonb_typeof(asset_basis) = 'array');

comment on column public.bk_resource_pools.available_units is
  'The pool''s PRACTICAL CAPACITY: the realistic units it can deliver in a year after normal downtime and constraints. Not expected bookings, and never a utilization figure; a unit cost divides by it so low demand cannot raise a price (docs/bookings-design.md §20.1).';
comment on column public.bk_resource_pools.units_basis is
  'practical_capacity, or volume_forecast for a pool whose units are a forecast of demand that needs replacing with a practical capacity. A review flag only; it gates nothing.';
comment on column public.bk_resource_pools.capital_annual is
  'Snapshot from the asset register: Σ replacement_cost ÷ useful_life_years over the active assets on this pool (less any a budget line explicitly funds). Economic capital consumption, not accounting depreciation. Zero when blank.';
comment on column public.bk_resource_pools.maintenance_annual is
  'Snapshot from the asset register: Σ annual_maintenance over the active assets on this pool. Zero when blank.';
comment on column public.bk_resource_pools.asset_basis is
  'The assets the two snapshots above came from: [{assetId, name, capital, maintenance, coveredBy}]. Written by "Refresh from the asset register" on a draft version.';

alter table public.bk_assets
  add column replacement_cost numeric,
  add column annual_maintenance numeric,
  add constraint bk_assets_replacement_nonnegative check (replacement_cost is null or replacement_cost >= 0),
  add constraint bk_assets_maintenance_nonnegative check (annual_maintenance is null or annual_maintenance >= 0);

comment on column public.bk_assets.replacement_cost is
  'What it would cost to replace the asset now. Blank adds zero to a pool''s annual cost.';
comment on column public.bk_assets.annual_maintenance is
  'Annual maintenance dollars. Blank adds zero to a pool''s annual cost.';
comment on column public.bk_assets.useful_life_years is
  'The realistic useful life — how long the asset will really serve before it must be replaced — not an accounting depreciation schedule.';

alter table public.bk_assumptions
  add column overhead boolean not null default false,
  add column funds_pool_id uuid references public.bk_pools (id) on delete restrict,
  add constraint bk_assumptions_overhead_for_pool_line check (kind = 'pool_line' or not overhead),
  add constraint bk_assumptions_funds_for_pool_line check (kind = 'pool_line' or funds_pool_id is null),
  add constraint bk_assumptions_overhead_funds check (not overhead or funds_pool_id is null);

comment on column public.bk_assumptions.overhead is
  'General overhead: kept out of every pool''s per-unit allocation and shown apart on the Rates tab. Whether and how it is recovered is a recorded decision (bk_rate_model_versions.overhead_decision), with no default math.';
comment on column public.bk_assumptions.funds_pool_id is
  'The pool whose replacement this budget line already funds. With bk_assumption_assets it drives the advisory double-count check; a cost is excluded only where assets are named.';

create table public.bk_assumption_assets (
  assumption_id uuid not null references public.bk_assumptions (id) on delete cascade,
  asset_id uuid not null references public.bk_assets (id) on delete restrict,
  primary key (assumption_id, asset_id)
);
comment on table public.bk_assumption_assets is
  'The specific assets a budget line already funds for replacement. Naming an asset here is the explicit linkage that leaves it out of the pool''s capital set-aside (docs/bookings-design.md §20.4).';

alter table public.bk_rate_model_versions
  add column overhead_decision text;
comment on column public.bk_rate_model_versions.overhead_decision is
  'A recorded decision, in Finance''s words, on whether and how general overhead is recovered. Nothing reads it; there is no default math.';

-- Market ceiling, review status ---------------------------------------------------------------------

alter table public.bk_service_packages
  add column market_ceiling numeric,
  add column hours_validation_state public.bk_validation_state not null default 'pending',
  add column hours_validation_note text,
  add column floor_validation_state public.bk_validation_state not null default 'pending',
  add column floor_validation_note text,
  add constraint bk_service_packages_ceiling check (market_ceiling is null or market_ceiling >= market_floor);

comment on column public.bk_service_packages.market_ceiling is
  'An optional market ceiling. A modeled rate above it raises a review flag and an Above market badge; it never caps the price (docs/bookings-design.md §20.5).';
comment on column public.bk_service_packages.hours_validation_state is
  'Review status of the package''s hours (its recipe). Shown on the Rates tab; adds no submission gate.';
comment on column public.bk_service_packages.floor_validation_state is
  'Review status of the package''s market floor. Shown on the Rates tab; adds no submission gate.';

alter table public.bk_rate_card_lines
  add column market_ceiling numeric;

-- The card snapshot's unit costs: what an adjusted package line is priced from.
create table public.bk_rate_card_unit_costs (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.bk_rate_model_versions (id) on delete cascade,
  kind text not null,
  labor_class_id uuid references public.bk_labor_classes (id) on delete set null,
  pool_id uuid references public.bk_pools (id) on delete set null,
  name text not null,
  -- A class's exact loaded hourly cost, or a pool's exact cost per unit.
  unit_cost numeric not null,
  -- A class: whether its hours are charged in a strategic price.
  charged_in_strategic boolean,
  snapshotted_at timestamptz not null default now(),
  constraint bk_rate_card_unit_costs_kind check (
    (kind = 'labor' and labor_class_id is not null and pool_id is null and charged_in_strategic is not null)
    or (kind = 'pool' and pool_id is not null and labor_class_id is null)
  )
);
create index bk_rate_card_unit_costs_version_idx on public.bk_rate_card_unit_costs (version_id);
comment on table public.bk_rate_card_unit_costs is
  'Each labor class''s exact loaded hourly cost and each pool''s exact cost per unit as of the card snapshot, so a package line adjusted on a project (§20.6) is priced and costed from the version it started on.';

-- Recipes -------------------------------------------------------------------------------------------

alter table public.bk_estimate_lines
  add column recipe_labor_hours jsonb,
  add column recipe_resource_units jsonb,
  add column adjustment_reason text,
  add constraint bk_estimate_lines_recipe_objects check (
    (recipe_labor_hours is null or jsonb_typeof(recipe_labor_hours) = 'object')
    and (recipe_resource_units is null or jsonb_typeof(recipe_resource_units) = 'object')
  ),
  add constraint bk_estimate_lines_adjustment check (
    adjustment_reason is null
    or (kind = 'package' and recipe_labor_hours is not null and recipe_resource_units is not null)
  );

comment on column public.bk_estimate_lines.recipe_labor_hours is
  'The package''s standard hours per labor class when the line was added. labor_hours is what this project uses; they differ only under adjustment_reason.';
comment on column public.bk_estimate_lines.recipe_resource_units is
  'The package''s standard units per pool when the line was added.';
comment on column public.bk_estimate_lines.adjustment_reason is
  'Why this line''s hours, units or crew differ from the standard recipe. A project-level override: it never changes the package or the rate model version.';

-- The ceiling is written by the Rates tab's package action after bk_save_package(), not by the
-- function: replacing it would restate a body that contains a `delete`, which the migration tooling
-- holds for a confirmation a non-interactive session cannot give.

-- Assumed versus observed ---------------------------------------------------------------------------

create table public.bk_hours_used (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.bk_projects (id) on delete cascade,
  kind text not null,
  labor_class_id uuid references public.bk_labor_classes (id) on delete restrict,
  pool_id uuid references public.bk_pools (id) on delete restrict,
  planned numeric not null default 0,
  used numeric not null,
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid references public.profiles (id) on delete set null,
  constraint bk_hours_used_kind check (
    (kind = 'labor' and labor_class_id is not null and pool_id is null)
    or (kind = 'units' and pool_id is not null and labor_class_id is null)
  ),
  constraint bk_hours_used_nonnegative check (planned >= 0 and used >= 0)
);
create unique index bk_hours_used_labor_idx on public.bk_hours_used (project_id, labor_class_id) where kind = 'labor';
create unique index bk_hours_used_units_idx on public.bk_hours_used (project_id, pool_id) where kind = 'units';
comment on table public.bk_hours_used is
  'What a delivered project actually used, confirmed by production staff against what the estimate planned: hours per labor class and units per pool. Feeds the term report''s assumed-versus-observed view and the next rate model version; never reprices the estimate (docs/bookings-design.md §3F, §20.8).';

create table public.bk_booking_events (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.bk_term_plans (id) on delete set null,
  project_id uuid references public.bk_projects (id) on delete cascade,
  pool_id uuid references public.bk_pools (id) on delete set null,
  date date,
  kind text not null,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint bk_booking_events_kind check (kind in ('refused', 'released'))
);
create index bk_booking_events_pool_idx on public.bk_booking_events (pool_id, kind);
comment on table public.bk_booking_events is
  'Refusals by the booking rule and live dates later released, by resource — read-only input to the term report''s assumed-versus-observed view (§20.8). Feeds nothing automatically.';

-- Guards and RLS ------------------------------------------------------------------------------------

create function public.bk_guard_frozen_assumption_asset()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status public.bk_version_status;
begin
  select v.status into v_status
  from public.bk_assumptions a
  join public.bk_rate_model_versions v on v.id = a.version_id
  where a.id = coalesce(new.assumption_id, old.assumption_id);
  if v_status in ('adopted', 'superseded') then
    raise exception 'Rate model version is adopted; a correction is a new version.'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger bk_assumption_assets_guard_frozen
  before insert or update or delete on public.bk_assumption_assets
  for each row execute function public.bk_guard_frozen_assumption_asset();

alter table public.bk_assumption_assets enable row level security;
alter table public.bk_rate_card_unit_costs enable row level security;
alter table public.bk_hours_used enable row level security;
alter table public.bk_booking_events enable row level security;

create policy bk_assumption_assets_select on public.bk_assumption_assets for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_assumption_assets_write on public.bk_assumption_assets for all to authenticated
  using ((select private.is_bookings_finance((select auth.uid()))))
  with check ((select private.is_bookings_finance((select auth.uid()))));

create policy bk_rate_card_unit_costs_select on public.bk_rate_card_unit_costs for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_rate_card_unit_costs_write on public.bk_rate_card_unit_costs for all to authenticated
  using ((select private.is_bookings_finance((select auth.uid()))) or (select private.is_bookings_executive((select auth.uid()))))
  with check ((select private.is_bookings_finance((select auth.uid()))) or (select private.is_bookings_executive((select auth.uid()))));

create policy bk_hours_used_select on public.bk_hours_used for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_hours_used_write on public.bk_hours_used for all to authenticated
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

create policy bk_booking_events_select on public.bk_booking_events for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_booking_events_insert on public.bk_booking_events for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (select private.is_bookings_production((select auth.uid())))
      or (select private.is_bookings_director((select auth.uid())))
      or (select private.is_bookings_executive((select auth.uid())))
    )
  );

-- The v0.1 rows ------------------------------------------------------------------------------------
-- The version is a draft, so its wording is editable. The allocated pools' units were seeded with an
-- instruction to replace them "with a booking analysis"; that is demand, which a unit cost must never
-- divide by. The webcast pool's 20 events is a volume forecast — the number is kept, flagged.

with v01 as (
  select r.id, p.costing, p.key
    from public.bk_resource_pools r
    join public.bk_pools p on p.id = r.pool_id
    join public.bk_rate_model_versions v on v.id = r.version_id
   where v.label = 'v0.1'
)
update public.bk_resource_pools r
   set validation_needed = case
         when v01.key = 'webcast'
           then 'Replace the 20-event volume forecast with the practical capacity: how many events a year the webcast setup could realistically support after normal downtime and constraints.'
         else 'Replace the allocation with the asset inventory, and the units with the practical capacity: the realistic units this resource can deliver in a year after normal downtime and constraints — never expected bookings.'
       end,
       units_basis = case when v01.key = 'webcast' then 'volume_forecast' else r.units_basis end,
       basis = case
         when v01.key = 'webcast'
           then 'Provisional planning volume: 20 events a year allocate the webcasting operating pool. This is a volume forecast, not a practical capacity.'
         else r.basis
       end
  from v01
 where r.id = v01.id;
