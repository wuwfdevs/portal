-- Bookings: university production work — capacity, rates, recovery. The
-- newest tool on the portal foundation, built from the "Bookings Tool" Design
-- canvas and its two sources, the University Production Partnerships
-- framework (revised) and WUWF_Production_Rate_Model_v0.1.xlsx. See
-- docs/bookings-design.md for the product and architecture rationale.
--
-- This migration is Slice 1 of its milestone 1 ("Rate model"): the tables
-- behind the Rates tab — versions, assumptions, resource pools, service
-- packages, the rate card snapshot, the asset inventory, and a change log —
-- plus the tool's access predicates and registry row. Capacity (term plans,
-- holds, bookings), projects, the public intake, partners and agreements,
-- and settlements follow in later slices, each with its own migration
-- (docs/bookings-design.md §9). Building all of §4's tables before the code
-- that uses them exists would be the speculative-schema mistake CLAUDE.md
-- warns against.
--
-- Load-bearing decisions, worth knowing before extending this:
--
--   1. Bookings is invite_only, like On Air and Traffic: a tool_access grant
--      is the ticket in. Roles stack on tool_access.tool_roles
--      (docs/broadcast-roles.md's shape): lead, director, finance, executive,
--      each a private.is_bookings_<role>() over private.has_tool_role(). A
--      member with no role reads everything.
--   2. SQL never computes a price. lib/bookings/rates.ts owns the rate math
--      (the v0.1 workbook is its test fixture); bk_rate_card_lines is a
--      snapshot that TypeScript writes when a version is put in use or
--      adopted, so an estimate priced later keeps the rate it was priced at.
--   3. A version whose status is adopted or superseded is frozen: its
--      assumptions, pools and packages cannot change (a guard trigger, not
--      just RLS). "Changing a value here never changes v0.1: a correction is
--      a new version" — the same reasoning as log_clock_versions.
--   4. Adoption is the executive's. bk_guard_version_transition() raises
--      unless private.is_bookings_executive() is the one moving status to
--      'adopted', and refuses to submit a version while any assumption or
--      pool still awaits validation — the adoption gate, enforced where the
--      write happens, mirroring rd_guard_post_curation().
--   5. Exactly one version is "in use" for estimates (a partial unique
--      index). v0.1 is seeded in use but not adopted: the workbook's own
--      "provisional" posture. Every figure from a non-adopted version is
--      labelled provisional on screen.
--
-- Tables are prefixed bk_ per CLAUDE.md's directory conventions.

create type public.bk_version_status as enum ('draft', 'submitted', 'adopted', 'superseded');

create type public.bk_validation_state as enum ('pending', 'validated', 'accepted_as_is');

create type public.bk_assumption_section as enum ('sourced', 'working');

create type public.bk_assumption_kind as enum ('shared_pool_line', 'webcast_pool_line', 'model_input');

create type public.bk_assumption_owner as enum ('finance', 'director', 'executive');

create type public.bk_pool_key as enum ('studio', 'field', 'live', 'edit');

create type public.bk_asset_funding as enum ('station', 'foundation_gift', 'grant_restricted', 'uwf');

create type public.bk_asset_burden as enum ('low', 'medium', 'high');

create type public.bk_asset_condition as enum ('good', 'fair', 'worn', 'out_of_service');

create type public.bk_rate_card_line_kind as enum ('package', 'labor');

-- Rate model versions -----------------------------------------------------------

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

-- Assumptions ------------------------------------------------------------------------

create table public.bk_assumptions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.bk_rate_model_versions (id) on delete cascade,
  section public.bk_assumption_section not null,
  kind public.bk_assumption_kind not null,
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
  constraint bk_assumptions_key_for_model_input
    check ((kind = 'model_input') = (key is not null))
);

comment on table public.bk_assumptions is
  'One input to a rate model version: a sourced budget line (summed into the shared or webcasting pool) or a keyed working assumption lib/bookings/rates.ts reads by key. Each row carries who must validate it and whether they have.';

create unique index bk_assumptions_version_key_idx
  on public.bk_assumptions (version_id, key) where key is not null;
create index bk_assumptions_version_idx on public.bk_assumptions (version_id, section, sort_order);

-- Resource pools -------------------------------------------------------------------------

create table public.bk_resource_pools (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.bk_rate_model_versions (id) on delete cascade,
  pool public.bk_pool_key not null,
  allocation_share numeric(6, 4) not null,
  available_units numeric(10, 2) not null,
  unit_label text not null,
  basis text,
  validation_state public.bk_validation_state not null default 'pending',
  validation_needed text,
  validation_note text,
  validated_at timestamptz,
  validated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint bk_resource_pools_version_pool_unique unique (version_id, pool),
  constraint bk_resource_pools_share_check check (allocation_share >= 0 and allocation_share <= 1),
  constraint bk_resource_pools_units_check check (available_units > 0)
);

comment on table public.bk_resource_pools is
  'The four production resource pools of a version — studio, field, live, edit — each with its share of the shared pool and its available units a year. Cost per unit is computed in TypeScript, never stored here.';

-- Service packages ------------------------------------------------------------------------

create table public.bk_service_packages (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.bk_rate_model_versions (id) on delete cascade,
  name text not null,
  unit_label text not null,
  professional_hours numeric(8, 2) not null default 0,
  student_hours numeric(8, 2) not null default 0,
  studio_units numeric(8, 2) not null default 0,
  field_units numeric(8, 2) not null default 0,
  live_units numeric(8, 2) not null default 0,
  edit_hours numeric(8, 2) not null default 0,
  webcast_ops_units numeric(8, 2) not null default 0,
  market_floor numeric(12, 2) not null default 0,
  historical_reference text,
  application_note text,
  notes text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bk_service_packages_nonnegative check (
    professional_hours >= 0 and student_hours >= 0 and studio_units >= 0 and field_units >= 0
    and live_units >= 0 and edit_hours >= 0 and webcast_ops_units >= 0 and market_floor >= 0
  )
);

comment on table public.bk_service_packages is
  'What each customer-facing package assumes: professional and student hours, units of each pool, webcast operations, and the editable external market floor. A project day is 8 professional hours, so a package''s professional hours are its draw on the capacity reserve.';

create index bk_service_packages_version_idx on public.bk_service_packages (version_id, sort_order);

-- Rate card snapshot --------------------------------------------------------------------------

create table public.bk_rate_card_lines (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.bk_rate_model_versions (id) on delete cascade,
  kind public.bk_rate_card_line_kind not null,
  package_id uuid references public.bk_service_packages (id) on delete set null,
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
  'The rate card as computed by lib/bookings/rates.ts when a version was put in use or adopted — a snapshot, so an estimate keeps the rate it was priced at. A labor line carries its loaded internal cost in incremental_rate and the typed planning rate in external_rate.';

create index bk_rate_card_lines_version_idx on public.bk_rate_card_lines (version_id, sort_order);

-- Asset inventory --------------------------------------------------------------------------------

create table public.bk_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tag text,
  pool public.bk_pool_key not null,
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
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint bk_assets_cost_check check (
    (acquisition_cost is null or acquisition_cost >= 0) and (annual_cost is null or annual_cost >= 0)
  )
);

comment on table public.bk_assets is
  'Major production assets by pool, acquisition cost and date, funding source, useful life, restrictions, maintenance burden and condition (framework §4). Not versioned: an inventory, whose pool/life/treatment become a pool''s cost per unit in a later rate model version.';

create index bk_assets_pool_idx on public.bk_assets (pool, active);

-- Change log --------------------------------------------------------------------------------------

create table public.bk_rate_model_events (
  id uuid primary key default gen_random_uuid(),
  version_id uuid references public.bk_rate_model_versions (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null,
  note text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.bk_rate_model_events is
  'The Rates tab''s change log: who changed what on a version and when. Append-only — select and insert only.';

create index bk_rate_model_events_version_idx on public.bk_rate_model_events (version_id, created_at desc);

-- updated_at maintenance ------------------------------------------------------------------------------

create trigger set_bk_assumptions_updated_at
  before update on public.bk_assumptions
  for each row execute function public.set_updated_at();
create trigger set_bk_resource_pools_updated_at
  before update on public.bk_resource_pools
  for each row execute function public.set_updated_at();
create trigger set_bk_service_packages_updated_at
  before update on public.bk_service_packages
  for each row execute function public.set_updated_at();
create trigger set_bk_assets_updated_at
  before update on public.bk_assets
  for each row execute function public.set_updated_at();

-- Authorization helpers ----------------------------------------------------------------------------------
-- In `private`, never `public` — see 20260724120000_private_authz_functions.sql.

create function private.has_bookings_access(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tool_access ta
    join public.tools t on t.id = ta.tool_id
    join public.profiles p on p.id = uid
    where ta.user_id = uid
      and t.key = 'bookings'
      and ta.revoked_at is null
      and p.account_status = 'active'
  );
$$;

create function private.is_bookings_lead(uid uuid)
returns boolean language sql security definer stable set search_path = public
as $$ select private.has_tool_role(uid, 'bookings', 'lead'); $$;

create function private.is_bookings_director(uid uuid)
returns boolean language sql security definer stable set search_path = public
as $$ select private.has_tool_role(uid, 'bookings', 'director'); $$;

create function private.is_bookings_finance(uid uuid)
returns boolean language sql security definer stable set search_path = public
as $$ select private.has_tool_role(uid, 'bookings', 'finance'); $$;

create function private.is_bookings_executive(uid uuid)
returns boolean language sql security definer stable set search_path = public
as $$ select private.has_tool_role(uid, 'bookings', 'executive'); $$;

revoke execute on function private.has_bookings_access(uuid) from public, anon;
revoke execute on function private.is_bookings_lead(uuid) from public, anon;
revoke execute on function private.is_bookings_director(uuid) from public, anon;
revoke execute on function private.is_bookings_finance(uuid) from public, anon;
revoke execute on function private.is_bookings_executive(uuid) from public, anon;
grant execute on function private.has_bookings_access(uuid) to authenticated;
grant execute on function private.is_bookings_lead(uuid) to authenticated;
grant execute on function private.is_bookings_director(uuid) to authenticated;
grant execute on function private.is_bookings_finance(uuid) to authenticated;
grant execute on function private.is_bookings_executive(uuid) to authenticated;

-- Guard triggers -------------------------------------------------------------------------------------------

-- A version's status transitions, in the shape of rd_guard_post_curation():
-- RLS admits finance's update; which transitions are legal, and who may
-- make the privileged one, is decided here.
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
        select 1 from public.bk_assumptions a
         where a.version_id = new.id and a.validation_state = 'pending'
        union all
        select 1 from public.bk_resource_pools r
         where r.version_id = new.id and r.validation_state = 'pending'
      ) pending;
      if v_pending > 0 then
        raise exception 'This version still has % input(s) awaiting validation.', v_pending
          using errcode = 'check_violation';
      end if;
      new.submitted_at := coalesce(new.submitted_at, now());
      new.submitted_by := coalesce(new.submitted_by, auth.uid());
    elsif old.status = 'submitted' and new.status = 'draft' then
      -- Reopened for more changes; nothing to check.
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
    -- Frozen: only in_use may still change (the adoption of a successor
    -- takes it out of use), everything else is history.
    if (new.label, new.notes, new.destination_index)
         is distinct from (old.label, old.notes, old.destination_index) then
      raise exception 'An adopted rate model version cannot be edited; a correction is a new version.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.bk_guard_version_transition() from public, anon, authenticated;

create trigger bk_rate_model_versions_guard_transition
  before update on public.bk_rate_model_versions
  for each row execute function public.bk_guard_version_transition();

-- Assumptions, pools and packages of a frozen version never change.
create function public.bk_guard_frozen_version()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_version uuid := coalesce(new.version_id, old.version_id);
  v_status public.bk_version_status;
begin
  select status into v_status from public.bk_rate_model_versions where id = v_version;
  if v_status in ('adopted', 'superseded') then
    raise exception 'Rate model version is adopted; a correction is a new version.'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.bk_guard_frozen_version() from public, anon, authenticated;

create trigger bk_assumptions_guard_frozen
  before insert or update or delete on public.bk_assumptions
  for each row execute function public.bk_guard_frozen_version();
create trigger bk_resource_pools_guard_frozen
  before insert or update or delete on public.bk_resource_pools
  for each row execute function public.bk_guard_frozen_version();
create trigger bk_service_packages_guard_frozen
  before insert or update or delete on public.bk_service_packages
  for each row execute function public.bk_guard_frozen_version();

-- Putting a version in use for estimates: one statement, so there is never a
-- moment with two or none. Security invoker — RLS (finance) still applies;
-- the function only gives the two updates atomicity. Adoption goes through
-- the guard trigger above, which sets in_use itself; this is for the
-- provisional case (a draft or submitted version used before adoption, as
-- v0.1 is).
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
  if v_status is null then
    return jsonb_build_object('error', 'unknown_version');
  end if;
  if v_status = 'superseded' then
    return jsonb_build_object('error', 'superseded');
  end if;

  update public.bk_rate_model_versions
     set in_use = false
   where in_use and id <> p_version_id;

  update public.bk_rate_model_versions
     set in_use = true
   where id = p_version_id and not in_use;
  get diagnostics v_count = row_count;

  return jsonb_build_object('ok', true, 'changed', v_count > 0);
end;
$$;

grant execute on function public.bk_set_version_in_use(uuid) to authenticated;

-- Adopting a version: the previous adopted version is superseded, the new
-- one adopted (the guard trigger checks the executive and sets in_use), in
-- one statement sequence. Security invoker for the same reason.
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
  if v_status is null then
    return jsonb_build_object('error', 'unknown_version');
  end if;
  if v_status <> 'submitted' then
    return jsonb_build_object('error', 'not_submitted');
  end if;

  update public.bk_rate_model_versions
     set status = 'superseded'
   where status = 'adopted' and id <> p_version_id;

  update public.bk_rate_model_versions
     set in_use = false
   where in_use and id <> p_version_id;

  update public.bk_rate_model_versions
     set status = 'adopted',
         destination_index = coalesce(p_destination_index, destination_index)
   where id = p_version_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.bk_adopt_version(uuid, text) to authenticated;

-- Row Level Security ----------------------------------------------------------------------------------------
-- Staff-only everywhere; no public surface in this slice. Reads for every
-- member; the rate model's writes for finance; the inventory for finance or
-- the director; the change log appended by any member about their own act.
-- Written in the (select ...) form the 2026-09-14 initplan convention asks
-- for, so each predicate runs once per statement.

alter table public.bk_rate_model_versions enable row level security;
alter table public.bk_assumptions enable row level security;
alter table public.bk_resource_pools enable row level security;
alter table public.bk_service_packages enable row level security;
alter table public.bk_rate_card_lines enable row level security;
alter table public.bk_assets enable row level security;
alter table public.bk_rate_model_events enable row level security;

grant select, insert, update on public.bk_rate_model_versions to authenticated;
grant select, insert, update, delete on public.bk_assumptions to authenticated;
grant select, insert, update on public.bk_resource_pools to authenticated;
grant select, insert, update, delete on public.bk_service_packages to authenticated;
grant select, insert, delete on public.bk_rate_card_lines to authenticated;
grant select, insert, update on public.bk_assets to authenticated;
grant select, insert on public.bk_rate_model_events to authenticated;

create policy bk_rate_model_versions_select on public.bk_rate_model_versions
  for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_rate_model_versions_insert on public.bk_rate_model_versions
  for insert to authenticated
  with check ((select private.is_bookings_finance((select auth.uid()))));
-- Finance or the executive may update; the guard trigger decides which
-- transition each may make.
create policy bk_rate_model_versions_update on public.bk_rate_model_versions
  for update to authenticated
  using (
    (select private.is_bookings_finance((select auth.uid())))
    or (select private.is_bookings_executive((select auth.uid())))
  )
  with check (
    (select private.is_bookings_finance((select auth.uid())))
    or (select private.is_bookings_executive((select auth.uid())))
  );

create policy bk_assumptions_select on public.bk_assumptions
  for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_assumptions_write on public.bk_assumptions
  for all to authenticated
  using ((select private.is_bookings_finance((select auth.uid()))))
  with check ((select private.is_bookings_finance((select auth.uid()))));

create policy bk_resource_pools_select on public.bk_resource_pools
  for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_resource_pools_write on public.bk_resource_pools
  for all to authenticated
  using ((select private.is_bookings_finance((select auth.uid()))))
  with check ((select private.is_bookings_finance((select auth.uid()))));

create policy bk_service_packages_select on public.bk_service_packages
  for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_service_packages_write on public.bk_service_packages
  for all to authenticated
  using ((select private.is_bookings_finance((select auth.uid()))))
  with check ((select private.is_bookings_finance((select auth.uid()))));

create policy bk_rate_card_lines_select on public.bk_rate_card_lines
  for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
-- The snapshot is written when a version is put in use (finance) or adopted
-- (executive); replaced whole, so delete is part of the same write.
create policy bk_rate_card_lines_write on public.bk_rate_card_lines
  for all to authenticated
  using (
    (select private.is_bookings_finance((select auth.uid())))
    or (select private.is_bookings_executive((select auth.uid())))
  )
  with check (
    (select private.is_bookings_finance((select auth.uid())))
    or (select private.is_bookings_executive((select auth.uid())))
  );

create policy bk_assets_select on public.bk_assets
  for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_assets_write on public.bk_assets
  for all to authenticated
  using (
    (select private.is_bookings_finance((select auth.uid())))
    or (select private.is_bookings_director((select auth.uid())))
  )
  with check (
    (select private.is_bookings_finance((select auth.uid())))
    or (select private.is_bookings_director((select auth.uid())))
  );

create policy bk_rate_model_events_select on public.bk_rate_model_events
  for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_rate_model_events_insert on public.bk_rate_model_events
  for insert to authenticated
  with check (
    (select private.has_bookings_access((select auth.uid())))
    and actor_id = (select auth.uid())
  );

-- The tool's members may write audit rows (adoption, in-use changes). Without
-- this, logAuditEvent() from a Bookings-only user is dropped by RLS — the
-- failure mode CLAUDE.md warns about.
create policy audit_events_insert_bookings on public.audit_events
  for insert to authenticated
  with check (
    (select private.has_bookings_access((select auth.uid())))
    and actor_id = (select auth.uid())
  );

-- Registry row ----------------------------------------------------------------------------------------------------
-- Upsert rather than update, per the audience-listening/remote-interview
-- lesson: a bare update silently no-ops on a project whose seed never ran.

insert into public.tools (key, name, description, route, status, enabled, default_access, sort_order)
values (
  'bookings',
  'Bookings',
  'University production work: capacity, rates, and cost recovery — the rate model, the term plan, requests and estimates.',
  '/bookings',
  'available',
  true,
  'invite_only',
  11
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  route = excluded.route,
  status = excluded.status,
  enabled = excluded.enabled;

-- Seed: rate model v0.1 ----------------------------------------------------------------------------------------------
-- The workbook, row for row (WUWF_Production_Rate_Model_v0.1.xlsx, September
-- 2026). Planning outputs, not approved rates: seeded in use but not adopted,
-- so every figure labels itself provisional until Finance validates each
-- assumption and the Executive Director adopts. lib/bookings/rates.test.ts
-- carries the same values as its fixture. Guarded so a re-run is a no-op.

do $$
declare
  v_version uuid;
begin
  if exists (select 1 from public.bk_rate_model_versions where label = 'v0.1') then
    return;
  end if;

  insert into public.bk_rate_model_versions (label, status, in_use, notes)
  values (
    'v0.1',
    'draft',
    true,
    'Provisional rate model from the September 2026 discussion draft. Planning outputs that test the architecture and expose which assumptions move the price; not approved rates.'
  )
  returning id into v_version;

  -- Sourced current cost inputs (FY26–27 operating and auxiliary budgets).
  insert into public.bk_assumptions
    (version_id, section, kind, key, label, value, unit, basis, source_url, notes, owner, validation_state, validation_needed, sort_order)
  values
    (v_version, 'sourced', 'shared_pool_line', null, 'Broadcast / production equipment contingency', 7000, 'per year',
     'FY26–27 budget line', 'https://docs.google.com/spreadsheets/d/1xVDt4rE2DWiiDv_KicCuth9FQs6K69CW/edit',
     'Not an asset inventory.', 'finance', 'validated', 'Current budget', 10),
    (v_version, 'sourced', 'shared_pool_line', null, 'Editing computer and accessories', 3200, 'per year',
     'FY26–27 budget line', 'https://docs.google.com/spreadsheets/d/1xVDt4rE2DWiiDv_KicCuth9FQs6K69CW/edit',
     null, 'finance', 'validated', 'Current budget', 20),
    (v_version, 'sourced', 'shared_pool_line', null, 'Software acquisitions and upgrades', 2000, 'per year',
     'FY26–27 Engineering & Technical', 'https://docs.google.com/spreadsheets/d/1xVDt4rE2DWiiDv_KicCuth9FQs6K69CW/edit',
     null, 'finance', 'validated', 'Current budget', 30),
    (v_version, 'sourced', 'shared_pool_line', null, 'Hardware', 2000, 'per year',
     'FY26–27 Engineering & Technical', 'https://docs.google.com/spreadsheets/d/1xVDt4rE2DWiiDv_KicCuth9FQs6K69CW/edit',
     null, 'finance', 'validated', 'Current budget', 40),
    (v_version, 'sourced', 'shared_pool_line', null, 'Adobe Creative Cloud', 1740, 'per year',
     'Current station budget', 'https://docs.google.com/spreadsheets/d/1xVDt4rE2DWiiDv_KicCuth9FQs6K69CW/edit',
     'The production share must be validated.', 'finance', 'pending', 'Validate the production share', 50),
    (v_version, 'sourced', 'webcast_pool_line', null, 'Webcasting operating pool', 6500, 'per year',
     'FY26–27 budget: $1,000 livestream + $5,500 misc. webcasting/UBIT', 'https://docs.google.com/spreadsheets/d/1xVDt4rE2DWiiDv_KicCuth9FQs6K69CW/edit',
     null, 'finance', 'validated', 'Current budget', 60),
    (v_version, 'sourced', 'model_input', 'assessment_share', 'New Ventures administrative assessment', 0.0671, 'of revenue',
     'FY26–27 auxiliary budget states a 6.71% admin fee', 'https://docs.google.com/spreadsheets/d/1-cNoWd4p9MhDnFEGASl5afnN1TiRVfpz/edit',
     null, 'finance', 'validated', 'Current budget', 70);

  -- Working assumptions — validate before adoption.
  insert into public.bk_assumptions
    (version_id, section, kind, key, label, value, unit, basis, notes, owner, validation_state, validation_needed, sort_order)
  values
    (v_version, 'working', 'model_input', 'pro_salary', 'Production lead annual salary', 65000, 'per year',
     'WUWF working staffing assumption', 'Used only to model recoverable professional labor.', 'finance', 'pending', 'Confirm with HR', 10),
    (v_version, 'working', 'model_input', 'pro_fringe_share', 'Professional fringe / load', 0.35, 'of salary',
     'Provisional', 'Replace with the UWF-approved loaded-cost treatment.', 'finance', 'pending', 'Confirm with Budget / HR', 20),
    (v_version, 'working', 'model_input', 'paid_hours', 'Annual paid hours', 2080, 'hours',
     'Standard planning convention', null, 'finance', 'pending', 'Confirm the divisor UWF uses', 30),
    (v_version, 'working', 'model_input', 'student_wage', 'Student / OPS base wage', 15, 'per hour',
     'Provisional', null, 'finance', 'pending', 'Confirm the current payroll rate', 40),
    (v_version, 'working', 'model_input', 'student_load_share', 'Student / OPS payroll load', 0.08, 'of wage',
     'Provisional', null, 'finance', 'pending', 'Confirm with Budget / HR', 50),
    (v_version, 'working', 'model_input', 'external_margin_share', 'External target contribution margin', 0.25, 'of price',
     'Management assumption', 'Used to calculate the cost-based external floor.', 'executive', 'pending', 'Set by WUWF', 60),
    (v_version, 'working', 'model_input', 'baseline_share', 'Baseline institutional envelope', 0.15, 'of net capacity',
     'WUWF pilot planning assumption', 'Protected aggregate capacity outside incremental professional cost recovery.', 'executive', 'pending', 'Review after one semester', 70),
    (v_version, 'working', 'model_input', 'net_capacity_days', 'Net schedulable production capacity', 100, 'project days / yr',
     'Provisional planning input', 'Defined after core WUWF work, leave, maintenance and contingency.', 'director', 'pending', 'Replace with a capacity study', 80),
    (v_version, 'working', 'model_input', 'webcast_volume', 'Annual webcast planning volume', 20, 'events / yr',
     'Provisional planning input', 'Allocates the annual webcasting operating pool.', 'director', 'pending', 'Replace with a forecast', 90),
    (v_version, 'working', 'model_input', 'student_external_rate', 'Student / OPS labor, external planning rate', 25, 'per hour',
     'Planning rate on the rate card', 'The external planning rate for student/OPS labor beyond a package.', 'executive', 'pending', 'Set by WUWF', 100),
    (v_version, 'working', 'model_input', 'pro_external_rate', 'Professional labor, external planning rate', 65, 'per hour',
     'Planning rate on the rate card', 'The external planning rate for professional labor beyond the envelope.', 'executive', 'pending', 'Set by WUWF', 110);

  -- Resource pools: a provisional split of the shared pool and provisional units.
  insert into public.bk_resource_pools
    (version_id, pool, allocation_share, available_units, unit_label, basis, validation_state, validation_needed)
  values
    (v_version, 'studio', 0.35, 120, 'half-day', 'Provisional split and capacity', 'pending',
     'Replace the allocation with the asset inventory and the units with a booking analysis'),
    (v_version, 'field', 0.25, 80, 'day', 'Provisional split and capacity', 'pending',
     'Replace the allocation with the asset inventory and the units with a booking analysis'),
    (v_version, 'live', 0.30, 60, 'day', 'Provisional split and capacity', 'pending',
     'Replace the allocation with the asset inventory and the units with a booking analysis'),
    (v_version, 'edit', 0.10, 400, 'hour', 'Provisional split and capacity', 'pending',
     'Replace the allocation with the asset inventory and the units with a booking analysis');

  -- Service packages.
  insert into public.bk_service_packages
    (version_id, name, unit_label, professional_hours, student_hours, studio_units, field_units, live_units, edit_hours, webcast_ops_units, market_floor, historical_reference, application_note, notes, sort_order)
  values
    (v_version, 'Studio access', 'half-day', 1, 2, 1, 0, 0, 0, 0, 250,
     '$300–$500 Athletics studio rental (2017–18)',
     'Strategic rate only if professional time counts against the baseline envelope.',
     'Low-impact use may be waived where policy permits and no material cost or displacement occurs.', 10),
    (v_version, 'Studio access', 'full day', 2, 3, 2, 0, 0, 0, 0, 450,
     'No reliable current benchmark',
     'Recurring reservations should be governed by an annual capacity agreement.',
     null, 20),
    (v_version, 'Basic event webcast', 'event', 5, 10, 0, 0, 1, 0, 1, 1000,
     '$500/event legacy internal rate',
     'Use for an ordinary standard-scope institutional webcast.',
     'Working package: standard crew and gear; scope limits to be defined.', 30),
    (v_version, 'Enhanced multicamera webcast', 'event', 8, 32, 1, 0, 1.5, 0, 1, 1800,
     'No historical complexity-based tier',
     'Use when crew, gear or scope exceed the basic webcast definition.',
     'Larger crew and production package.', 40),
    (v_version, 'Field production', 'half-day', 4, 8, 0, 0.5, 0, 0, 0, 500,
     'No direct historical comparator',
     'Standard field package; direct travel and specialty costs extra.',
     null, 50),
    (v_version, 'Field production', 'full day', 8, 16, 0, 1, 0, 0, 0, 900,
     'No direct historical comparator',
     'Standard field package; direct travel and specialty costs extra.',
     null, 60),
    (v_version, 'Post-production / editing', 'hour', 1, 0, 0, 0, 0, 1, 0, 75,
     'External studio sessions historically $125–$250',
     'Professional time inside the baseline may be subsidized; otherwise use the incremental rate.',
     'Professional editing hour; the strategic rate reflects resource cost only when professional time is inside the envelope.', 70);

  insert into public.bk_rate_model_events (version_id, actor_id, kind, note)
  values (v_version, null, 'seeded', 'Version v0.1 seeded from WUWF_Production_Rate_Model_v0.1.xlsx (September 2026 discussion draft) and put in use, provisionally.');
end;
$$;
