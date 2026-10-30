-- Underwriting: fix uw_line_period_for_date() for explicit_dates and
-- week_grid lines.
--
-- 20260925120000_underwriting_traffic_redesign.sql declared the function's
-- OUT columns period_start/quantity, and its allocation lookups then read
-- `where ... period_start = p_date` — which PL/pgSQL rejects as ambiguous
-- between the OUT variable and uw_schedule_allocations.period_start
-- ("column reference is ambiguous"). The fixed_days and weekly_quota
-- branches never touch the table, which is why the first rolled-back dry
-- run passed; the explicit_dates scenario on preview hit it. Same body,
-- with the table aliased and every column qualified.
--
-- Also from the same scenario run: uw_flag_exception_from_broadcast_event()
-- built makegood_approval with a bare CASE, which Postgres types as text and
-- refuses to insert into the enum column — so recording a missed credit
-- would have failed outright. The CASE is cast. Both fixes were applied to
-- preview on 2026-09-25 as this file was written (the function first, the
-- trigger a few minutes later); production gets the file whole.

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
      select a.* into v_alloc from public.uw_schedule_allocations a
      where a.schedule_line_id = p_line.id and a.period_kind = 'day' and a.period_start = p_date;
      if found and v_alloc.quantity > 0 then
        eligible := true;
        period_start := p_date; period_end := p_date;
        quantity := v_alloc.quantity; day_cap := v_alloc.quantity;
      end if;
    when 'week_grid' then
      select a.* into v_alloc from public.uw_schedule_allocations a
      where a.schedule_line_id = p_line.id and a.period_kind = 'week' and a.period_start = v_week_start;
      if found and v_alloc.quantity > 0 and v_dow = any(p_line.days_of_week) then
        eligible := true;
        period_start := v_week_start; period_end := v_week_start + 6;
        quantity := v_alloc.quantity; day_cap := p_line.max_per_day;
      end if;
  end case;

  return next;
end;
$$;

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
    (case when coalesce(v_requires_approval, false) then 'pending' else 'not_required' end)::public.uw_makegood_approval
  )
  on conflict (log_broadcast_event_id) do nothing;

  return new;
end;
$$;
