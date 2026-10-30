-- Bookings: three corrections to the capacity model (docs/bookings-design.md §22).
--
-- 1. The reserve share belongs to the labor class, not the plan. A class with no
--    share has no reserve, so every booking of it draws open capacity (student and
--    OPS crews, which partners pay for, have none). "None" (null) is not 0%.
-- 2. Plans are resolved by date. Several plans may be active at once provided
--    their dates do not overlap; a booking's plan is the one containing its date.
--    The one-active-plan index goes.
-- 3. A closed plan is final: its dates, label, airtime, capacity and resources
--    cannot change, it cannot be reopened, and nothing new books into it.
--
-- SQL never computes a price. bk_check_booking_labor() is lib/bookings/scheduling.ts's
-- classCapacity()/findRefusal() twin — keep them in step.

-- 1. A share per class ----------------------------------------------------------------------------

alter table public.bk_term_capacity add column reserve_share numeric(5, 4);
comment on column public.bk_term_capacity.reserve_share is
  'The class''s reserve: this share of net_hours, drawn by strategic bookings (0..1). Null means none — the class has no reserve and every booking of it draws open capacity. Not the same as 0.';

-- Each plan's share moves onto the classes WUWF contributes (not charged in a strategic
-- price); the classes partners pay for get none.
update public.bk_term_capacity c
set reserve_share = p.reserve_share
from public.bk_term_plans p, public.bk_labor_classes lc
where p.id = c.plan_id and lc.id = c.labor_class_id and lc.charged_in_strategic = false;

alter table public.bk_term_capacity
  add constraint bk_term_capacity_reserve_share check (reserve_share is null or (reserve_share >= 0 and reserve_share <= 1));

create or replace function public.bk_check_booking_labor(p_booking_id uuid, p_labor_class_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_booking public.bk_bookings;
  v_capacity public.bk_term_capacity;
  v_class text;
  v_day_hours numeric;
  v_day_cap numeric;
  v_has_reserve boolean;
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

  -- 5. Capacity for the pricing, counting this booking. Only a class with a share has
  -- a reserve; without one a strategic booking draws open capacity like any other.
  v_has_reserve := v_capacity.reserve_share is not null;
  v_reserve := case when v_has_reserve then v_capacity.net_hours * v_capacity.reserve_share else 0 end;
  select
    coalesce(sum(bl.hours) filter (where v_has_reserve and b.treatment = 'strategic'), 0),
    coalesce(sum(bl.hours) filter (where not (v_has_reserve and b.treatment = 'strategic')), 0)
  into v_strategic, v_nonstrategic
  from public.bk_booking_labor bl
  join public.bk_bookings b on b.id = bl.booking_id
  where b.plan_id = v_booking.plan_id and bl.labor_class_id = p_labor_class_id
    and public.bk_booking_is_live(b) and b.exception_reason is null;
  select coalesce(sum(hl.hours), 0) into v_held
  from public.bk_hold_labor hl
  join public.bk_holds h on h.id = hl.hold_id
  where h.plan_id = v_booking.plan_id and hl.labor_class_id = p_labor_class_id;

  if v_booking.treatment = 'strategic' and v_has_reserve then
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

alter table public.bk_term_plans drop column reserve_share;

-- 2 and 3. Plans by date; a closed plan is final ---------------------------------------------------

drop index if exists public.bk_term_plans_one_active;

create or replace function public.bk_guard_term_plan()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_other public.bk_term_plans;
begin
  if tg_op = 'UPDATE' and old.status = 'closed' then
    -- Only the notes of a closed term may change; the figures it was judged by may not.
    if (new.status, new.label, new.starts_on, new.ends_on, new.airtime_contributed_minutes_per_week)
       is distinct from
       (old.status, old.label, old.starts_on, old.ends_on, old.airtime_contributed_minutes_per_week) then
      raise exception 'A closed term plan is final. Add a new term plan instead.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- Several plans may be active together, but a date must belong to only one.
  if new.status = 'active' then
    select * into v_other from public.bk_term_plans p
    where p.id <> new.id and p.status = 'active'
      and p.starts_on <= new.ends_on and new.starts_on <= p.ends_on
    limit 1;
    if v_other.id is not null then
      raise exception 'Another active term plan, "%", overlaps these dates (% to %). Change its dates or close it first.',
        v_other.label, v_other.starts_on, v_other.ends_on
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
create trigger bk_term_plans_guard
  before insert or update on public.bk_term_plans
  for each row execute function public.bk_guard_term_plan();

-- A closed plan's capacity and resource rows are part of what it was judged by.
create or replace function public.bk_guard_closed_plan_children()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_plan_id uuid := case when tg_op = 'DELETE' then old.plan_id else new.plan_id end;
begin
  if exists (select 1 from public.bk_term_plans where id = v_plan_id and status = 'closed') then
    raise exception 'A closed term plan is final. Add a new term plan instead.'
      using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger bk_term_capacity_closed_guard
  before insert or update or delete on public.bk_term_capacity
  for each row execute function public.bk_guard_closed_plan_children();
create trigger bk_term_resources_closed_guard
  before insert or update or delete on public.bk_term_resources
  for each row execute function public.bk_guard_closed_plan_children();

-- The booking rule, with one addition ------------------------------------------------------------------------
-- Unchanged from 20261006140000 except that a new or moved booking is refused when its
-- plan is closed (§22.3). An update that leaves a live booking where it is — confirming
-- it, releasing it — returns before this point, so a closed term's existing dates can
-- still be confirmed or released.

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
  if v_plan.status = 'closed' then
    raise exception 'The term plan "%" is closed and final; nothing new books into it.', v_plan.label
      using errcode = 'check_violation';
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
