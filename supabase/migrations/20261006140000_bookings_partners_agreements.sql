-- Bookings: slice 5 — partners and agreements (2026-10-06).
--
-- docs/bookings-design.md §2.2 (the agreement row of the pricing table), §2.6,
-- §3E/§3H, §5 "Partners", §6.4 step 2 and §9 item 5. A partner (bk_partners,
-- brought forward in slice 3) may hold an agreement — a standing arrangement
-- with a reserve share, funded student hours, reserved blocks on the calendar,
-- deadlines and an airtime allowance — that the executive approves after
-- seeing its draw. docs/bookings-design.md §17 has the account; this header is
-- the summary.
--
--   * bk_agreements — the terms: dates, status (draft → active → ended), the
--     professional hours of the reserve the agreement may draw
--     (reserve_hours_allocated), the student hours it funds, the booking and
--     release deadlines for its reserved blocks, an airtime allowance in
--     minutes a week, the narrative fields the framework names, who approved
--     it and when, and the signed document's path in the private
--     bookings-documents bucket (uw_contracts.agreement_document_path's shape).
--   * bk_reserved_blocks — a window of one pool held for the agreement's
--     partner on one date. `project_id`/`booking_id` are set when a project
--     under the agreement attaches the block (bk_attach_reserved_block()).
--     A block nobody attached by `date − release_deadline_days` **reads as
--     released at query time** unless the director kept it (kept_by) — no
--     scheduled job; bk_reserved_block_reserves() is the one SQL reading and
--     lib/bookings/agreements.ts's reservedBlockState() its twin.
--   * bk_projects.agreement_id — the agreement a project is priced and
--     scheduled under; bk_guard_project() refuses one belonging to another
--     partner. bk_service_packages.agreement_id — a bespoke package scoped to
--     one agreement (an OUR Voices episode, §2.6), offered only to projects
--     under it.
--   * The booking rule gains §6.4 step 2: a window a live reserved block
--     holds for another partner is not available until that block's release
--     deadline. A reserving block takes one of the window's concurrent units
--     the way a hold does; the refusal names the partner and the deadline.
--     lib/bookings/scheduling.ts's findRefusal() is the twin — keep them in
--     step.
--   * bk_set_project_disposition() also detaches the project's reserved
--     blocks (releasing each block's own date, even one still planned), so a
--     withdrawn project's block is the partner's again.
--
-- Guards (the rd_guard_post_curation() shape, so the boundary holds however
-- the table is written): bk_guard_agreement() keeps approval (draft → active)
-- for the executive and ending for the director or the executive, and
-- freezes an active agreement's terms to the executive; bk_guard_reserved_block()
-- keeps `kept_by` for the director or the executive and refuses a block
-- outside its agreement's dates or on an ended agreement. SQL still never
-- computes a price.

-- Enums ----------------------------------------------------------------------------------------------------------

create type public.bk_agreement_status as enum ('draft', 'active', 'ended');

-- Agreements -----------------------------------------------------------------------------------------------------

create table public.bk_agreements (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.bk_partners (id) on delete restrict,
  label text not null,
  starts_on date not null,
  ends_on date not null,
  status public.bk_agreement_status not null default 'draft',
  -- Professional hours of the term's reserve this agreement may draw (§2.2: "its allocated reserve share first").
  reserve_hours_allocated numeric(8, 2) not null default 0,
  -- Student / OPS hours the partner funds; checked in TypeScript, never a hard refusal (§6.4).
  funded_student_hours numeric(8, 2) not null default 0,
  expected_volume text,
  -- A reserved block must be attached to a project this many days before its date…
  booking_deadline_days integer not null default 14,
  -- …and reads as released this many days before its date when nobody has (and the director didn't keep it).
  release_deadline_days integer not null default 7,
  blackout_notes text,
  direct_cost_treatment text,
  capital_notes text,
  beyond_envelope_note text,
  -- The airtime allowance, in contributed minutes a week, this agreement carries (§2.5).
  airtime_minutes_per_week integer not null default 0,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  ended_at timestamptz,
  -- The signed agreement in the private bookings-documents bucket.
  document_path text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint bk_agreements_label_nonempty check (length(btrim(label)) > 0),
  constraint bk_agreements_dates check (ends_on >= starts_on),
  constraint bk_agreements_reserve_nonnegative check (reserve_hours_allocated >= 0),
  constraint bk_agreements_student_nonnegative check (funded_student_hours >= 0),
  constraint bk_agreements_deadlines check (booking_deadline_days >= 0 and release_deadline_days >= 0),
  constraint bk_agreements_airtime_nonnegative check (airtime_minutes_per_week >= 0),
  constraint bk_agreements_approval_pair check ((approved_at is null) = (approved_by is null)),
  constraint bk_agreements_active_approved check (status <> 'active' or approved_at is not null)
);
comment on table public.bk_agreements is
  'A partner''s standing arrangement (docs/bookings-design.md §5 "Partners"): a reserve share in professional hours, funded student hours, reserved blocks, deadlines and an airtime allowance. Approved by the executive (bk_guard_agreement()).';
create index bk_agreements_partner_idx on public.bk_agreements (partner_id, starts_on desc);
create index bk_agreements_status_idx on public.bk_agreements (status);

create table public.bk_reserved_blocks (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.bk_agreements (id) on delete cascade,
  pool_id uuid not null references public.bk_pools (id) on delete restrict,
  date date not null,
  window_start time not null,
  window_end time not null,
  -- The project that took the block, and the booking bk_attach_reserved_block() wrote for it.
  project_id uuid references public.bk_projects (id) on delete set null,
  booking_id uuid references public.bk_bookings (id) on delete set null,
  -- Released by hand; a block past its release deadline with no project and no kept_by reads as released without this.
  released_at timestamptz,
  -- The director keeps an unbooked block past its release deadline.
  kept_by uuid references public.profiles (id) on delete set null,
  kept_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint bk_reserved_blocks_window check (window_end > window_start),
  constraint bk_reserved_blocks_kept_pair check ((kept_by is null) = (kept_at is null)),
  constraint bk_reserved_blocks_booking_needs_project check (booking_id is null or project_id is not null)
);
comment on table public.bk_reserved_blocks is
  'A window of one pool held for an agreement''s partner on one date (docs/bookings-design.md §5). Reserves the window for other partners until its release deadline (bk_reserved_block_reserves()); attached to a project by bk_attach_reserved_block().';
create index bk_reserved_blocks_agreement_idx on public.bk_reserved_blocks (agreement_id, date);
create index bk_reserved_blocks_pool_date_idx on public.bk_reserved_blocks (pool_id, date);
create index bk_reserved_blocks_project_idx on public.bk_reserved_blocks (project_id) where project_id is not null;

alter table public.bk_projects
  add column agreement_id uuid references public.bk_agreements (id) on delete set null;
comment on column public.bk_projects.agreement_id is
  'The agreement this project is priced and scheduled under (docs/bookings-design.md §2.2); must belong to the project''s partner (bk_guard_project()).';
create index bk_projects_agreement_idx on public.bk_projects (agreement_id) where agreement_id is not null;

alter table public.bk_service_packages
  add column agreement_id uuid references public.bk_agreements (id) on delete set null;
comment on column public.bk_service_packages.agreement_id is
  'A bespoke package scoped to one agreement (an OUR Voices episode, docs/bookings-design.md §2.6); offered only to projects under that agreement. Null is the ordinary card.';

create trigger set_bk_agreements_updated_at
  before update on public.bk_agreements
  for each row execute function public.set_updated_at();

-- The station's calendar date, for a deadline that reads at query time. lib/log/timezone.ts's STATION_TIME_ZONE.
create function public.bk_station_today()
returns date language sql stable
as $$ select (now() at time zone 'America/Chicago')::date; $$;

-- Release-at-read ---------------------------------------------------------------------------------------------
-- A block reserves its window while it is not released by hand and either a
-- project took it, the director kept it, or its release deadline has not
-- passed. lib/bookings/agreements.ts's reservedBlockState() is the twin.

create function public.bk_reserved_block_reserves(b public.bk_reserved_blocks, p_release_deadline_days integer)
returns boolean language sql stable
as $$
  select b.released_at is null
     and (b.project_id is not null
          or b.kept_by is not null
          or public.bk_station_today() <= b.date - greatest(p_release_deadline_days, 0));
$$;

-- Guards -------------------------------------------------------------------------------------------------------

create function public.bk_guard_agreement()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'active' then
      if old.status <> 'draft' then
        raise exception 'An ended agreement is not reopened; draft a new one.' using errcode = 'check_violation';
      end if;
      if not private.is_bookings_executive(auth.uid()) then
        raise exception 'Only the Executive Director approves an agreement.' using errcode = 'check_violation';
      end if;
      new.approved_by := coalesce(new.approved_by, auth.uid());
      new.approved_at := coalesce(new.approved_at, now());
    elsif new.status = 'ended' then
      if not (private.is_bookings_director(auth.uid()) or private.is_bookings_executive(auth.uid())) then
        raise exception 'Only the Director of Operations or the Executive Director ends an agreement.'
          using errcode = 'check_violation';
      end if;
      new.ended_at := coalesce(new.ended_at, now());
    elsif new.status = 'draft' then
      raise exception 'An approved agreement does not go back to draft.' using errcode = 'check_violation';
    end if;
  end if;

  -- The executive approved these terms; only the executive changes them afterwards.
  if old.status <> 'draft'
     and (new.starts_on, new.ends_on, new.reserve_hours_allocated, new.funded_student_hours,
          new.booking_deadline_days, new.release_deadline_days, new.airtime_minutes_per_week)
         is distinct from
         (old.starts_on, old.ends_on, old.reserve_hours_allocated, old.funded_student_hours,
          old.booking_deadline_days, old.release_deadline_days, old.airtime_minutes_per_week)
     and not private.is_bookings_executive(auth.uid()) then
    raise exception 'The terms of an approved agreement change only with the Executive Director.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger bk_agreements_guard
  before update on public.bk_agreements
  for each row execute function public.bk_guard_agreement();

create function public.bk_guard_reserved_block()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_agreement public.bk_agreements;
  v_partner uuid;
begin
  select * into v_agreement from public.bk_agreements where id = new.agreement_id;
  if v_agreement.id is null then
    raise exception 'That agreement no longer exists.' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' and v_agreement.status = 'ended' then
    raise exception 'An ended agreement takes no new reserved blocks.' using errcode = 'check_violation';
  end if;
  if new.date < v_agreement.starts_on or new.date > v_agreement.ends_on then
    raise exception 'The block is outside the agreement (% to %).', v_agreement.starts_on, v_agreement.ends_on
      using errcode = 'check_violation';
  end if;

  -- Keeping a block is the director's (§6.1).
  if new.kept_by is not null and (tg_op = 'INSERT' or old.kept_by is null) then
    if not (private.is_bookings_director(auth.uid()) or private.is_bookings_executive(auth.uid())) then
      raise exception 'Only the Director of Operations keeps a reserved block past its deadline.'
        using errcode = 'check_violation';
    end if;
    new.kept_at := coalesce(new.kept_at, now());
  elsif new.kept_by is null then
    new.kept_at := null;
  end if;

  -- The project that takes a block is the agreement's partner's.
  if new.project_id is not null then
    select partner_id into v_partner from public.bk_projects where id = new.project_id;
    if v_partner is distinct from v_agreement.partner_id then
      raise exception 'The block belongs to another partner''s agreement.' using errcode = 'check_violation';
    end if;
  else
    new.booking_id := null;
  end if;
  return new;
end;
$$;
create trigger bk_reserved_blocks_guard
  before insert or update on public.bk_reserved_blocks
  for each row execute function public.bk_guard_reserved_block();

-- The project guard gains the agreement's partner check.
create or replace function public.bk_guard_project()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_partner uuid;
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

  -- An agreement is the project's partner's (slice 5).
  if new.agreement_id is not null
     and (new.agreement_id is distinct from old.agreement_id or new.partner_id is distinct from old.partner_id) then
    select partner_id into v_partner from public.bk_agreements where id = new.agreement_id;
    if v_partner is distinct from new.partner_id then
      raise exception 'That agreement belongs to another partner.' using errcode = 'check_violation';
    end if;
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

-- The booking rule, with step 2 ----------------------------------------------------------------------------
-- Unchanged from 20261006120000 except that a reserved block another
-- partner's active agreement still holds on the window counts as one of its
-- concurrent units, and is the refusal named when the window is full.

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
  v_partner uuid;
  v_block record;
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

  -- 2. Reserved for another partner? A block an active agreement still holds
  -- on an overlapping window, for a partner other than this booking's, takes
  -- one of the window's units until its release deadline.
  if new.project_id is not null then
    select partner_id into v_partner from public.bk_projects where id = new.project_id;
  end if;
  select rb.id, rb.date, a.release_deadline_days, a.label as agreement_label, p.name as partner_name
    into v_block
  from public.bk_reserved_blocks rb
  join public.bk_agreements a on a.id = rb.agreement_id
  join public.bk_partners p on p.id = a.partner_id
  where a.status = 'active'
    and rb.pool_id = new.pool_id and rb.date = new.date
    and rb.window_start < new.window_end and rb.window_end > new.window_start
    and public.bk_reserved_block_reserves(rb, a.release_deadline_days)
    and (v_partner is null or a.partner_id <> v_partner)
    and (rb.booking_id is null or rb.booking_id <> new.id)
  order by rb.window_start limit 1;

  -- 1, 2 and 3. The window's concurrent units: holds, live bookings and reserving blocks that overlap.
  select count(*) into v_taken from (
    select 1 from public.bk_holds h
    where h.plan_id = new.plan_id and h.pool_id = new.pool_id and h.date = new.date
      and h.window_start < new.window_end and h.window_end > new.window_start
    union all
    select 1 from public.bk_bookings o
    where o.plan_id = new.plan_id and o.id <> new.id and o.pool_id = new.pool_id and o.date = new.date
      and public.bk_booking_is_live(o)
      and o.window_start < new.window_end and o.window_end > new.window_start
    union all
    select 1 from public.bk_reserved_blocks rb
    join public.bk_agreements a on a.id = rb.agreement_id
    where a.status = 'active'
      and rb.pool_id = new.pool_id and rb.date = new.date
      and rb.window_start < new.window_end and rb.window_end > new.window_start
      and public.bk_reserved_block_reserves(rb, a.release_deadline_days)
      and (v_partner is null or a.partner_id <> v_partner)
      -- A block that already has its own live booking is counted once, as that booking.
      and (rb.booking_id is null or not exists (
            select 1 from public.bk_bookings ob where ob.id = rb.booking_id and public.bk_booking_is_live(ob)))
      and (rb.booking_id is null or rb.booking_id <> new.id)
  ) taken;
  if v_taken >= v_resource.concurrent_units then
    if v_block.id is not null then
      raise exception 'Reserved for % under "%" until % (its release deadline).',
        v_block.partner_name, v_block.agreement_label,
        v_block.date - greatest(v_block.release_deadline_days, 0)
        using errcode = 'check_violation';
    end if;
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

-- Attaching a block (§3E) ----------------------------------------------------------------------------------
-- Security invoker: production's RLS applies. One transaction: the block
-- takes the project, and the project gets a booking on the block's window
-- in the state its estimate is in (planned before the estimate is sent,
-- tentative while it is out, confirmed once booked). The rule's triggers
-- check the booking as any other — step 2 passes, since the block is this
-- partner's.

create function public.bk_attach_reserved_block(p_block_id uuid, p_project_id uuid, p_labor jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_block public.bk_reserved_blocks;
  v_agreement public.bk_agreements;
  v_project public.bk_projects;
  v_partner public.bk_partners;
  v_plan public.bk_term_plans;
  v_status public.bk_booking_status;
  v_booking uuid;
  v_row jsonb;
begin
  select * into v_block from public.bk_reserved_blocks where id = p_block_id for update;
  if v_block.id is null then return jsonb_build_object('error', 'not_found'); end if;
  if v_block.released_at is not null then return jsonb_build_object('error', 'released'); end if;
  if v_block.project_id is not null then return jsonb_build_object('error', 'taken'); end if;
  select * into v_agreement from public.bk_agreements where id = v_block.agreement_id;
  if v_agreement.status <> 'active' then return jsonb_build_object('error', 'agreement_not_active'); end if;
  if not public.bk_reserved_block_reserves(v_block, v_agreement.release_deadline_days) then
    return jsonb_build_object('error', 'past_deadline');
  end if;

  select * into v_project from public.bk_projects where id = p_project_id for update;
  if v_project.id is null then return jsonb_build_object('error', 'project_not_found'); end if;
  if v_project.disposition is not null then return jsonb_build_object('error', 'closed'); end if;
  if v_project.partner_id <> v_agreement.partner_id then return jsonb_build_object('error', 'other_partner'); end if;
  if v_project.stage in ('delivered', 'settled') then return jsonb_build_object('error', 'wrong_stage'); end if;
  if v_project.agreement_id is not null and v_project.agreement_id <> v_agreement.id then
    return jsonb_build_object('error', 'other_agreement');
  end if;
  select * into v_partner from public.bk_partners where id = v_project.partner_id;

  select * into v_plan from public.bk_term_plans
  where status = 'active' and v_block.date between starts_on and ends_on;
  if v_plan.id is null then return jsonb_build_object('error', 'no_plan'); end if;

  v_status := case
    when v_project.stage = 'booked' then 'confirmed'::public.bk_booking_status
    when v_project.stage = 'estimate' and v_project.estimate_sent_at is not null then 'tentative'::public.bk_booking_status
    else 'planned'::public.bk_booking_status
  end;

  insert into public.bk_bookings
    (plan_id, project_id, pool_id, date, window_start, window_end, treatment, status, expires_at, label, notes, created_by)
  values (
    v_plan.id, v_project.id, v_block.pool_id, v_block.date, v_block.window_start, v_block.window_end,
    coalesce(v_project.priced_as, 'incremental'), v_status,
    case when v_status = 'tentative' then v_project.estimate_expires_at else null end,
    coalesce(v_partner.name, 'Partner') || ': ' || v_project.title,
    'Reserved block under "' || v_agreement.label || '"', auth.uid()
  ) returning id into v_booking;
  for v_row in select * from jsonb_array_elements(coalesce(p_labor, '[]'::jsonb)) loop
    if (v_row->>'hours')::numeric > 0 then
      insert into public.bk_booking_labor (booking_id, labor_class_id, hours)
      values (v_booking, (v_row->>'labor_class_id')::uuid, (v_row->>'hours')::numeric);
    end if;
  end loop;

  update public.bk_reserved_blocks set project_id = v_project.id, booking_id = v_booking where id = v_block.id;
  if v_project.agreement_id is null then
    update public.bk_projects set agreement_id = v_agreement.id where id = v_project.id;
  end if;
  return jsonb_build_object('ok', true, 'booking_id', v_booking, 'status', v_status::text);
end;
$$;

-- A disposition hands the project's reserved blocks back to the partner.
create or replace function public.bk_set_project_disposition(
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

  -- A reserved block's own date goes too, even while still planned: the block
  -- is the partner's again, and a lingering planned date would double up if
  -- the request were reopened and the block taken a second time.
  update public.bk_bookings b set status = 'released'
    from public.bk_reserved_blocks rb
   where rb.booking_id = b.id and rb.project_id = p_project_id and b.status <> 'released';
  update public.bk_reserved_blocks set project_id = null, booking_id = null
   where project_id = p_project_id;

  update public.bk_projects
     set disposition = p_disposition, disposition_reason = btrim(p_reason),
         disposition_by = auth.uid(), disposition_at = now(),
         estimate_expires_at = null,
         margin_foregone = coalesce(p_margin_foregone, margin_foregone)
   where id = p_project_id;
  return jsonb_build_object('ok', true, 'released', v_released);
end;
$$;

-- A package may be scoped to an agreement.
create or replace function public.bk_save_package(p_package jsonb, p_labor jsonb, p_resources jsonb)
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
      (version_id, name, unit_label, market_floor, historical_reference, application_note, notes, sort_order, agreement_id)
    values (
      (p_package->>'version_id')::uuid, p_package->>'name', p_package->>'unit_label',
      coalesce((p_package->>'market_floor')::numeric, 0), p_package->>'historical_reference',
      p_package->>'application_note', p_package->>'notes', coalesce((p_package->>'sort_order')::integer, 1000),
      nullif(p_package->>'agreement_id', '')::uuid
    ) returning id into v_id;
  else
    update public.bk_service_packages
       set name = p_package->>'name', unit_label = p_package->>'unit_label',
           market_floor = coalesce((p_package->>'market_floor')::numeric, 0),
           historical_reference = p_package->>'historical_reference',
           application_note = p_package->>'application_note', notes = p_package->>'notes',
           agreement_id = nullif(p_package->>'agreement_id', '')::uuid
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

revoke execute on function public.bk_attach_reserved_block(uuid, uuid, jsonb) from public, anon;
grant execute on function public.bk_attach_reserved_block(uuid, uuid, jsonb) to authenticated;
revoke execute on function public.bk_reserved_block_reserves(public.bk_reserved_blocks, integer) from public, anon;
grant execute on function public.bk_reserved_block_reserves(public.bk_reserved_blocks, integer) to authenticated;
revoke execute on function public.bk_station_today() from public, anon;
grant execute on function public.bk_station_today() to authenticated;

-- RLS ------------------------------------------------------------------------------------------------------------
-- Reads for every member. An agreement is drafted and edited by production
-- staff, the director or the executive (the partner-writing set); approval
-- and the frozen terms are the guard's. A draft may be deleted. Reserved
-- blocks are the director's or the executive's to add and remove; production
-- updates one to attach it (the guard keeps `kept_by` for the director).

alter table public.bk_agreements enable row level security;
alter table public.bk_reserved_blocks enable row level security;

grant select, insert, update, delete on public.bk_agreements to authenticated;
grant select, insert, update, delete on public.bk_reserved_blocks to authenticated;

create policy bk_agreements_select on public.bk_agreements for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_agreements_insert on public.bk_agreements for insert to authenticated
  with check (
    (select private.is_bookings_production((select auth.uid())))
    or (select private.is_bookings_director((select auth.uid())))
    or (select private.is_bookings_executive((select auth.uid())))
  );
create policy bk_agreements_update on public.bk_agreements for update to authenticated
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
create policy bk_agreements_delete_draft on public.bk_agreements for delete to authenticated
  using (
    status = 'draft'
    and (
      (select private.is_bookings_production((select auth.uid())))
      or (select private.is_bookings_director((select auth.uid())))
      or (select private.is_bookings_executive((select auth.uid())))
    )
  );

create policy bk_reserved_blocks_select on public.bk_reserved_blocks for select to authenticated
  using ((select private.has_bookings_access((select auth.uid()))));
create policy bk_reserved_blocks_insert on public.bk_reserved_blocks for insert to authenticated
  with check (
    (select private.is_bookings_director((select auth.uid())))
    or (select private.is_bookings_executive((select auth.uid())))
  );
create policy bk_reserved_blocks_update on public.bk_reserved_blocks for update to authenticated
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
create policy bk_reserved_blocks_delete on public.bk_reserved_blocks for delete to authenticated
  using (
    project_id is null
    and (
      (select private.is_bookings_director((select auth.uid())))
      or (select private.is_bookings_executive((select auth.uid())))
    )
  );

-- Storage: the signed agreement ------------------------------------------------------------------------------
-- The underwriting-documents shape (20260808200000): a private bucket, PDF or
-- an image, members read and write. The object path is
-- `<agreement id>/agreement.<ext>`, upserted, so a corrected upload replaces
-- the document in place.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bookings-documents',
  'bookings-documents',
  false,
  52428800, -- 50 MiB — a signed agreement, not media
  array['application/pdf', 'image/png', 'image/jpeg']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy bookings_documents_select on storage.objects
  for select to authenticated
  using (bucket_id = 'bookings-documents' and (select private.has_bookings_access((select auth.uid()))));

create policy bookings_documents_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'bookings-documents'
    and (
      (select private.is_bookings_production((select auth.uid())))
      or (select private.is_bookings_director((select auth.uid())))
      or (select private.is_bookings_executive((select auth.uid())))
    )
  );

create policy bookings_documents_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'bookings-documents'
    and (
      (select private.is_bookings_production((select auth.uid())))
      or (select private.is_bookings_director((select auth.uid())))
      or (select private.is_bookings_executive((select auth.uid())))
    )
  )
  with check (
    bucket_id = 'bookings-documents'
    and (
      (select private.is_bookings_production((select auth.uid())))
      or (select private.is_bookings_director((select auth.uid())))
      or (select private.is_bookings_executive((select auth.uid())))
    )
  );
