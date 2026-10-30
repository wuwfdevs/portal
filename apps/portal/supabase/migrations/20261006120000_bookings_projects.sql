-- Bookings: slice 3 — projects (2026-10-06).
--
-- docs/bookings-design.md §2.3–§2.5, §5 "Work", §6.4 and §9 item 3. A
-- request becomes a project that moves through five stages —
-- request → estimate → booked → delivered → settled — carrying its estimate
-- lines (priced from the rate card snapshot by the treatment derived from
-- facts on the project), its dates (bk_bookings rows, planned first, held
-- tentatively when the estimate is sent, confirmed when it is approved),
-- and its airtime commitments (recorded here, honored in Traffic or On Air,
-- never placed from this tool). docs/bookings-design.md §15 has the account;
-- this header is the summary.
--
--   * bk_partners — the unit or outside organization a project is for. The
--     Partners tab and agreements arrive in slice 5; the table comes now
--     because every project names a partner and the pricing derivation reads
--     its kind (an external partner is priced external, §2.2).
--   * bk_projects — one request, through five stages, with the Academic
--     Partnerships stage + disposition shape (a disposition keeps the stage
--     reached, frees every hold, and requires a reason). `agreement_id` is
--     not here yet: it arrives with bk_agreements in slice 5.
--   * bk_estimate_lines — a package, a labor class's hours, or a direct
--     expense. `unit_rate`/`amount` are written by TypeScript from the
--     version's rate card snapshot (SQL never computes a price); a package
--     line snapshots the package's hours per class and units per pool in
--     `labor_hours`/`resource_units` (per unit), so the estimate keeps what
--     it was priced from the way bk_rate_card_lines keeps the rate.
--   * bk_airtime_commitments — airings a week × seconds over a date range,
--     contributed from the envelope or paid, with where it is honored
--     (`traffic` → a uw_contracts id, `on_air` → a log_opportunity_assignments
--     id) once someone has placed it there.
--   * bk_project_events — the staff-visible timeline (ap_submission_events'
--     shape); privileged actions also log audit_events.
--   * bk_bookings.status gains 'planned': a project's date before its
--     estimate is sent. A planned date is not a hold — it is not live, takes
--     no window and no capacity, and the rule is not applied when it is
--     written; the screen runs the rule for it and shows the refusal and the
--     alternatives. bk_send_estimate() flips planned → tentative, at which
--     point the triggers check every date for real and a refusal rolls the
--     whole send back (§6.4: "the result lists the ones that fail… before
--     anything is held"). bk_booking_allowed() now re-checks an update unless
--     the booking was live and stays in place — so an expired tentative hold
--     is checked again when it is re-sent or confirmed.
--   * bk_institutional_airtime_honored() — the second §6.5 read, deferred
--     from slice 2 because it keys off commitments: what Traffic has
--     scheduled and On Air pins for each commitment, by external_ref.
--
-- Guards: bk_guard_project() (before update) keeps `settled` for finance and
-- a pricing override onto the reserve (priced_as → strategic with an
-- override recorded) for the executive — the rd_guard_post_curation() shape,
-- so the boundary holds however the table is written.

-- Enums ----------------------------------------------------------------------------------------------------------

create type public.bk_partner_kind as enum ('uwf_unit', 'external');
create type public.bk_requested as enum ('production', 'airtime', 'both');
create type public.bk_project_stage as enum ('request', 'estimate', 'booked', 'delivered', 'settled');
create type public.bk_project_disposition as enum ('deferred', 'declined', 'withdrawn');
create type public.bk_project_source as enum ('public', 'staff');
create type public.bk_editorial_review as enum ('not_needed', 'needed', 'cleared');
create type public.bk_estimate_line_kind as enum ('package', 'labor', 'expense');
create type public.bk_airtime_treatment as enum ('contributed', 'paid');
create type public.bk_airtime_honored_in as enum ('pending', 'traffic', 'on_air');

-- A project's date before its estimate is sent. Not live; see the header.
alter type public.bk_booking_status add value if not exists 'planned' before 'tentative';

-- Partners -------------------------------------------------------------------------------------------------------

create table public.bk_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind public.bk_partner_kind not null default 'uwf_unit',
  contact_name text,
  contact_email text,
  contact_phone text,
  -- The UWF index a recharge goes to unless the project says otherwise.
  default_funding_index text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint bk_partners_name_nonempty check (length(btrim(name)) > 0)
);
comment on table public.bk_partners is
  'A UWF unit or an outside organization WUWF produces for (docs/bookings-design.md §5). Agreements and reserved blocks arrive in slice 5.';
create unique index bk_partners_name_unique on public.bk_partners (lower(name));

-- Projects -------------------------------------------------------------------------------------------------------

create table public.bk_projects (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.bk_partners (id) on delete restrict,
  title text not null,
  description text,
  requested public.bk_requested not null default 'production',
  -- The lead's judgment that this is strategic or applied-learning work (§2.2); null until recorded.
  qualifies_strategic boolean,
  qualification_by uuid references public.profiles (id) on delete set null,
  -- Derived by lib/bookings/pricing.ts from facts on the project; stored so the estimate shows what it was priced as.
  priced_as public.bk_pricing_treatment,
  pricing_reason text,
  -- Set when the lead changed the derived treatment; a change onto the reserve needs the executive (guard trigger).
  pricing_overridden_by uuid references public.profiles (id) on delete set null,
  stage public.bk_project_stage not null default 'request',
  disposition public.bk_project_disposition,
  disposition_reason text,
  disposition_by uuid references public.profiles (id) on delete set null,
  disposition_at timestamptz,
  estimate_sent_at timestamptz,
  estimate_expires_at timestamptz,
  estimate_approved_at timestamptz,
  -- The version in use when the estimate was first priced; its bk_rate_card_lines are the rates.
  rate_model_version_id uuid references public.bk_rate_model_versions (id) on delete restrict,
  funding_index text,
  event_starts_on date,
  event_ends_on date,
  deliverables_due_on date,
  location text,
  contact_name text,
  contact_email text,
  contact_phone text,
  source public.bk_project_source not null default 'staff',
  editorial_review public.bk_editorial_review not null default 'not_needed',
  owner_id uuid references public.profiles (id) on delete set null,
  delivered_at timestamptz,
  -- At estimate approval: the modeled price minus the $500 convention per webcast event (TypeScript computes it).
  legacy_rate_delta numeric(12, 2),
  -- When an external project is declined for capacity: its estimate's margin.
  margin_foregone numeric(12, 2),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint bk_projects_title_nonempty check (length(btrim(title)) > 0),
  constraint bk_projects_event_dates check (
    event_starts_on is null or event_ends_on is null or event_ends_on >= event_starts_on
  ),
  constraint bk_projects_disposition_reason check (disposition is null or disposition_reason is not null),
  constraint bk_projects_disposition_pair check ((disposition is null) = (disposition_at is null))
);
comment on table public.bk_projects is
  'One request for production, airtime or both, through five stages (docs/bookings-design.md §2.3). A disposition keeps the stage reached and frees every hold. Pricing is derived (§2.2) and stored as priced_as with its reason.';
create index bk_projects_partner_idx on public.bk_projects (partner_id);
create index bk_projects_stage_idx on public.bk_projects (stage, disposition, created_at desc);
create index bk_projects_event_idx on public.bk_projects (event_starts_on);

create table public.bk_estimate_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.bk_projects (id) on delete cascade,
  kind public.bk_estimate_line_kind not null,
  package_id uuid references public.bk_service_packages (id) on delete restrict,
  labor_class_id uuid references public.bk_labor_classes (id) on delete restrict,
  label text not null,
  unit_label text not null,
  quantity numeric(10, 2) not null default 1,
  -- Written by TypeScript from the rate card snapshot by the project's treatment; SQL never computes a price.
  unit_rate numeric(12, 2) not null default 0,
  amount numeric(12, 2) not null default 0,
  -- Hours per labor class id and units per pool id, PER UNIT of the line — a package's parts as they were when priced.
  labor_hours jsonb not null default '{}'::jsonb,
  resource_units jsonb not null default '{}'::jsonb,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bk_estimate_lines_package check ((kind = 'package') = (package_id is not null)),
  constraint bk_estimate_lines_labor check ((kind = 'labor') = (labor_class_id is not null)),
  constraint bk_estimate_lines_quantity check (quantity > 0),
  constraint bk_estimate_lines_hours_object check (jsonb_typeof(labor_hours) = 'object'),
  constraint bk_estimate_lines_units_object check (jsonb_typeof(resource_units) = 'object')
);
comment on table public.bk_estimate_lines is
  'One line of a project''s estimate: a service package, a labor class''s hours, or a direct expense (docs/bookings-design.md §5). Rates come from the version''s card snapshot, written by lib/bookings/pricing.ts.';
create index bk_estimate_lines_project_idx on public.bk_estimate_lines (project_id, sort_order);

create table public.bk_airtime_commitments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.bk_projects (id) on delete cascade,
  airings_per_week integer not null,
  seconds integer not null,
  starts_on date not null,
  ends_on date,
  treatment public.bk_airtime_treatment not null default 'contributed',
  honored_in public.bk_airtime_honored_in not null default 'pending',
  -- A uw_contracts id (traffic) or a log_opportunity_assignments id (on_air); never a foreign key across the boundary.
  external_ref uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bk_airtime_commitments_airings check (airings_per_week > 0),
  constraint bk_airtime_commitments_seconds check (seconds > 0),
  constraint bk_airtime_commitments_dates check (ends_on is null or ends_on >= starts_on),
  constraint bk_airtime_commitments_ref check ((honored_in = 'pending') = (external_ref is null))
);
comment on table public.bk_airtime_commitments is
  'Airtime a project asks for (docs/bookings-design.md §2.5): airings a week × seconds over a date range, contributed from the envelope or paid. Placed in Traffic or On Air, never here; external_ref says where.';
create index bk_airtime_commitments_project_idx on public.bk_airtime_commitments (project_id);

create table public.bk_project_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.bk_projects (id) on delete cascade,
  kind text not null,
  actor_id uuid references public.profiles (id) on delete set null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
comment on table public.bk_project_events is
  'A project''s staff-visible timeline (the ap_submission_events shape). Privileged actions also log audit_events.';
create index bk_project_events_project_idx on public.bk_project_events (project_id, created_at);

-- Bookings now belong to projects.
alter table public.bk_bookings
  add constraint bk_bookings_project_fk
  foreign key (project_id) references public.bk_projects (id) on delete restrict;
comment on column public.bk_bookings.project_id is
  'The project this date belongs to; null for a booking made from the calendar itself.';

create trigger set_bk_partners_updated_at before update on public.bk_partners for each row execute function public.set_updated_at();
create trigger set_bk_projects_updated_at before update on public.bk_projects for each row execute function public.set_updated_at();
create trigger set_bk_estimate_lines_updated_at before update on public.bk_estimate_lines for each row execute function public.set_updated_at();
create trigger set_bk_airtime_commitments_updated_at before update on public.bk_airtime_commitments for each row execute function public.set_updated_at();

-- Project guard ---------------------------------------------------------------------------------------

create function public.bk_guard_project()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Settling is Finance's (§6.1); the stage is reached in slice 6, the rule holds from now.
  if new.stage = 'settled' and old.stage is distinct from 'settled'
     and not private.is_bookings_finance(auth.uid()) then
    raise exception 'Only Finance can mark a project settled.' using errcode = 'check_violation';
  end if;

  -- A pricing override that touches the reserve needs the executive (§2.2).
  if new.pricing_overridden_by is not null
     and new.priced_as = 'strategic'
     and (old.priced_as is distinct from 'strategic' or old.pricing_overridden_by is null)
     and not private.is_bookings_executive(auth.uid()) then
    raise exception 'Only the Executive Director can price a project as strategic against its derived treatment.'
      using errcode = 'check_violation';
  end if;

  -- A disposition records who and when; clearing it clears both.
  if new.disposition is not null and old.disposition is distinct from new.disposition then
    new.disposition_by := coalesce(new.disposition_by, auth.uid());
    new.disposition_at := coalesce(new.disposition_at, now());
  elsif new.disposition is null then
    new.disposition_by := null;
    new.disposition_at := null;
    new.disposition_reason := null;
  end if;

  if new.stage = 'delivered' and old.stage is distinct from 'delivered' then
    new.delivered_at := coalesce(new.delivered_at, now());
  end if;
  return new;
end;
$$;
create trigger bk_projects_guard
  before update on public.bk_projects
  for each row execute function public.bk_guard_project();

-- The booking rule, with planned dates --------------------------------------------------------------
-- Only two things change from 20261005160000: a planned date is not live and
-- is not checked when written, and an update is re-checked unless the
-- booking was live and stays in place. lib/bookings/scheduling.ts's
-- bookingIsLive() is the twin of bk_booking_is_live(); keep them in step.

create or replace function public.bk_booking_is_live(b public.bk_bookings)
returns boolean language sql immutable
as $$
  -- status::text so this body parses in the same transaction that added 'planned'.
  select b.status::text not in ('released', 'planned')
     and (b.status::text <> 'tentative' or b.expires_at is null or b.expires_at > now());
$$;

create or replace function public.bk_booking_allowed()
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

  -- A planned date (a project's, before its estimate is sent) is not a hold:
  -- it takes nothing, so nothing is checked. The screen runs the rule for it.
  if new.status = 'planned' then
    new.expires_at := null;
    return new;
  end if;

  -- An update that leaves a live booking where it is (confirming it, a label
  -- edit) is not re-checked: a later hold must not refuse to confirm a hold
  -- the estimate already placed. A planned date being sent, or an expired
  -- hold being revived, was not live and is checked.
  if tg_op = 'UPDATE'
     and public.bk_booking_is_live(old)
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

  -- A moved, sent or revived booking re-checks its labor rows.
  if tg_op = 'UPDATE' then
    for v_class in select labor_class_id from public.bk_booking_labor where booking_id = new.id loop
      perform public.bk_check_booking_labor(new.id, v_class);
    end loop;
  end if;
  return new;
end;
$$;

-- The estimate lifecycle ------------------------------------------------------------------------------
-- Security invoker: production's RLS applies to every row these touch. Each
-- is one transaction, so a date the rule refuses rolls the whole send back
-- and the trigger's own sentence reaches the screen.

/** Send (or re-send) a project's estimate: every planned date becomes a tentative hold until p_expires_at. */
create function public.bk_send_estimate(p_project_id uuid, p_expires_at timestamptz)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project public.bk_projects;
  v_lines integer;
  v_commitments integer;
  v_held integer;
begin
  select * into v_project from public.bk_projects where id = p_project_id for update;
  if v_project.id is null then return jsonb_build_object('error', 'not_found'); end if;
  if v_project.disposition is not null then return jsonb_build_object('error', 'closed'); end if;
  if v_project.stage not in ('request', 'estimate') then return jsonb_build_object('error', 'wrong_stage'); end if;
  select count(*) into v_lines from public.bk_estimate_lines where project_id = p_project_id;
  select count(*) into v_commitments from public.bk_airtime_commitments where project_id = p_project_id;
  if v_lines = 0 and v_commitments = 0 then return jsonb_build_object('error', 'nothing_to_send'); end if;
  if v_lines > 0 and v_project.priced_as is null then return jsonb_build_object('error', 'not_priced'); end if;

  -- Planned dates become holds; an earlier send's holds (live or expired) take the new expiry.
  update public.bk_bookings
     set status = 'tentative', expires_at = p_expires_at,
         treatment = coalesce(v_project.priced_as, treatment)
   where project_id = p_project_id and status in ('planned', 'tentative');
  get diagnostics v_held = row_count;

  update public.bk_projects
     set stage = 'estimate', estimate_sent_at = now(), estimate_expires_at = p_expires_at
   where id = p_project_id;
  return jsonb_build_object('ok', true, 'held', v_held);
end;
$$;

/** Approve a project's estimate: its tentative holds are confirmed and the project is booked. */
create function public.bk_approve_estimate(p_project_id uuid, p_legacy_rate_delta numeric default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project public.bk_projects;
  v_confirmed integer;
begin
  select * into v_project from public.bk_projects where id = p_project_id for update;
  if v_project.id is null then return jsonb_build_object('error', 'not_found'); end if;
  if v_project.disposition is not null then return jsonb_build_object('error', 'closed'); end if;
  if v_project.stage <> 'estimate' then return jsonb_build_object('error', 'wrong_stage'); end if;

  update public.bk_bookings
     set status = 'confirmed', expires_at = null
   where project_id = p_project_id and status = 'tentative';
  get diagnostics v_confirmed = row_count;

  update public.bk_projects
     set stage = 'booked', estimate_approved_at = now(), estimate_expires_at = null,
         legacy_rate_delta = coalesce(p_legacy_rate_delta, legacy_rate_delta)
   where id = p_project_id;
  return jsonb_build_object('ok', true, 'confirmed', v_confirmed);
end;
$$;

/** Defer, decline or withdraw a project: its holds are released and the stage it reached is kept. */
create function public.bk_set_project_disposition(
  p_project_id uuid,
  p_disposition public.bk_project_disposition,
  p_reason text,
  p_margin_foregone numeric default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project public.bk_projects;
  v_released integer;
begin
  if p_reason is null or length(btrim(p_reason)) = 0 then
    return jsonb_build_object('error', 'reason_required');
  end if;
  select * into v_project from public.bk_projects where id = p_project_id for update;
  if v_project.id is null then return jsonb_build_object('error', 'not_found'); end if;
  if v_project.stage in ('delivered', 'settled') then return jsonb_build_object('error', 'wrong_stage'); end if;

  update public.bk_bookings set status = 'released'
   where project_id = p_project_id and status in ('tentative', 'confirmed');
  get diagnostics v_released = row_count;

  update public.bk_projects
     set disposition = p_disposition, disposition_reason = btrim(p_reason),
         disposition_by = auth.uid(), disposition_at = now(),
         estimate_expires_at = null,
         margin_foregone = coalesce(p_margin_foregone, margin_foregone)
   where id = p_project_id;
  return jsonb_build_object('ok', true, 'released', v_released);
end;
$$;

revoke execute on function public.bk_send_estimate(uuid, timestamptz) from public, anon;
revoke execute on function public.bk_approve_estimate(uuid, numeric) from public, anon;
revoke execute on function public.bk_set_project_disposition(uuid, public.bk_project_disposition, text, numeric) from public, anon;
grant execute on function public.bk_send_estimate(uuid, timestamptz) to authenticated;
grant execute on function public.bk_approve_estimate(uuid, numeric) to authenticated;
grant execute on function public.bk_set_project_disposition(uuid, public.bk_project_disposition, text, numeric) to authenticated;

-- The airtime boundary (§6.5), second read ----------------------------------------------------------
-- What Traffic has scheduled and On Air pins for the plan's commitments, by
-- external_ref. Security definer because a Bookings member has no RLS access
-- to uw_* or the log_* tables; read only; places nothing.

create function public.bk_institutional_airtime_honored(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_plan public.bk_term_plans;
  v_as_of date;
  v_rows jsonb;
begin
  if auth.uid() is null or not private.has_bookings_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  select * into v_plan from public.bk_term_plans where id = p_plan_id;
  if v_plan.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  v_as_of := least(greatest(v_plan.starts_on, current_date), v_plan.ends_on);

  with commitments as (
    select c.*
    from public.bk_airtime_commitments c
    where c.honored_in <> 'pending'
      and c.starts_on <= v_plan.ends_on
      and (c.ends_on is null or c.ends_on >= v_plan.starts_on)
  ),
  traffic as (
    select c.id as commitment_id,
           ct.id as contract_id,
           ct.status::text as contract_status,
           u.name as underwriter_name,
           (select count(*) from public.uw_scheduled_placements sp
             join public.uw_contract_schedule_lines sl on sl.id = sp.schedule_line_id
            where sl.contract_id = ct.id
              and sp.status::text <> 'superseded'
              and sp.placement_date between v_plan.starts_on and v_plan.ends_on) as placements,
           (select coalesce(sum(sl.duration_seconds), 0) from public.uw_scheduled_placements sp
             join public.uw_contract_schedule_lines sl on sl.id = sp.schedule_line_id
            where sl.contract_id = ct.id
              and sp.status::text <> 'superseded'
              and sp.placement_date between v_plan.starts_on and v_plan.ends_on) as seconds
    from commitments c
    join public.uw_contracts ct on ct.id = c.external_ref
    join public.uw_underwriters u on u.id = ct.underwriter_id
    where c.honored_in = 'traffic'
  ),
  pins as (
    select c.id as commitment_id,
           a.id as assignment_id,
           a.active,
           ci.title as content_title,
           coalesce(
             nullif((select sum(cc.duration_seconds) from public.log_content_components cc
                      where cc.content_item_id = ci.id and cc.required), 0),
             ci.expected_duration_seconds, 0) as seconds,
           (select coalesce(sum(
               (case when a.hour_index is null then ceil(s.duration_minutes / 60.0)::integer else 1 end)
               * (case when cardinality(a.days_of_week) = 0
                       then (case when cardinality(s.days_of_week) = 0 then 7 else cardinality(s.days_of_week) end)
                       else (select count(*) from unnest(a.days_of_week) d
                              where cardinality(s.days_of_week) = 0 or d = any (s.days_of_week)) end)), 0)
              from public.log_schedule s
              join public.log_clock_versions v on v.clock_template_id = s.clock_template_id
             where v.id = o.clock_version_id
               and s.entry_type = 'recurring'
               and s.start_date <= v_as_of and (s.end_date is null or s.end_date >= v_as_of)
               and v.effective_from <= v_as_of and (v.effective_to is null or v.effective_to >= v_as_of)
           ) as airings_per_week
    from commitments c
    join public.log_opportunity_assignments a on a.id = c.external_ref
    join public.log_local_opportunities o on o.id = a.local_opportunity_id
    join public.log_content_items ci on ci.id = a.content_item_id
    where c.honored_in = 'on_air'
  )
  select coalesce(jsonb_agg(row_json order by commitment_id), '[]'::jsonb) into v_rows
  from (
    select t.commitment_id, jsonb_build_object(
      'commitment_id', t.commitment_id, 'honored_in', 'traffic', 'found', true,
      'label', t.underwriter_name, 'status', t.contract_status,
      'placements_in_term', t.placements, 'seconds_in_term', t.seconds) as row_json
    from traffic t
    union all
    select p.commitment_id, jsonb_build_object(
      'commitment_id', p.commitment_id, 'honored_in', 'on_air', 'found', true,
      'label', p.content_title, 'status', case when p.active then 'active' else 'inactive' end,
      'airings_per_week', p.airings_per_week, 'seconds', p.seconds) as row_json
    from pins p
    union all
    select c.id, jsonb_build_object(
      'commitment_id', c.id, 'honored_in', c.honored_in::text, 'found', false) as row_json
    from commitments c
    where not exists (select 1 from traffic t where t.commitment_id = c.id)
      and not exists (select 1 from pins p where p.commitment_id = c.id)
  ) rows;

  return jsonb_build_object('ok', true, 'as_of', v_as_of, 'commitments', v_rows);
end;
$$;
comment on function public.bk_institutional_airtime_honored(uuid) is
  'Bookings'' read of what Traffic has scheduled and On Air pins for the plan''s airtime commitments, by external_ref (docs/bookings-design.md §6.5). Security definer; read only; places nothing.';
revoke execute on function public.bk_institutional_airtime_honored(uuid) from public, anon;
grant execute on function public.bk_institutional_airtime_honored(uuid) to authenticated;

-- RLS ----------------------------------------------------------------------------------------------------------
-- Reads for every member. Partners, projects, lines, dates and commitments
-- are written by production staff, the director or the executive (§6.1);
-- finance is admitted to projects for the settled stage the guard keeps for
-- it. A planned date may be deleted (it is not a hold); nothing else is.

alter table public.bk_partners enable row level security;
alter table public.bk_projects enable row level security;
alter table public.bk_estimate_lines enable row level security;
alter table public.bk_airtime_commitments enable row level security;
alter table public.bk_project_events enable row level security;

grant select, insert, update on public.bk_partners to authenticated;
grant select, insert, update on public.bk_projects to authenticated;
grant select, insert, update, delete on public.bk_estimate_lines to authenticated;
grant select, insert, update, delete on public.bk_airtime_commitments to authenticated;
grant select, insert on public.bk_project_events to authenticated;
grant delete on public.bk_bookings to authenticated;

create policy bk_partners_select on public.bk_partners for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_partners_write on public.bk_partners for all to authenticated
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

create policy bk_projects_select on public.bk_projects for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_projects_insert on public.bk_projects for insert to authenticated
  with check (
    (select private.is_bookings_production((select auth.uid())))
    or (select private.is_bookings_director((select auth.uid())))
    or (select private.is_bookings_executive((select auth.uid())))
  );
create policy bk_projects_update on public.bk_projects for update to authenticated
  using (
    (select private.is_bookings_production((select auth.uid())))
    or (select private.is_bookings_director((select auth.uid())))
    or (select private.is_bookings_executive((select auth.uid())))
    or (select private.is_bookings_finance((select auth.uid())))
  )
  with check (
    (select private.is_bookings_production((select auth.uid())))
    or (select private.is_bookings_director((select auth.uid())))
    or (select private.is_bookings_executive((select auth.uid())))
    or (select private.is_bookings_finance((select auth.uid())))
  );

create policy bk_estimate_lines_select on public.bk_estimate_lines for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_estimate_lines_write on public.bk_estimate_lines for all to authenticated
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

create policy bk_airtime_commitments_select on public.bk_airtime_commitments for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_airtime_commitments_write on public.bk_airtime_commitments for all to authenticated
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

create policy bk_project_events_select on public.bk_project_events for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_project_events_insert on public.bk_project_events for insert to authenticated
  with check ((select private.has_bookings_access((select auth.uid()))) and actor_id = (select auth.uid()));

-- A planned date is a note on a project, not a hold; removing it removes nothing from the calendar.
create policy bk_bookings_delete_planned on public.bk_bookings for delete to authenticated
  using (
    status::text = 'planned'
    and (
      (select private.is_bookings_production((select auth.uid())))
      or (select private.is_bookings_director((select auth.uid())))
      or (select private.is_bookings_executive((select auth.uid())))
    )
  );
