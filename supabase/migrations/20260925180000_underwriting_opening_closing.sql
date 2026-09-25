-- Underwriting & Traffic: opening/closing credits are derived from the
-- clock, not labelled on it.
--
-- 20260925150000_underwriting_demand_buckets.sql expressed an order's
-- "Opening Credit for Marketplace" as a time_mode = 'slot' line targeting
-- a traffic_key a Log producer typed onto the opportunity and had to
-- retype on every new clock version. Reviewed the same day: the opening
-- and closing credit of a program are simply the first and last
-- underwriting-permitted marked opportunity of its clock — every such
-- credit in the archive (Marketplace opening, Science Friday closing,
-- Living on Earth closing, Five Corners opening) means exactly that, and
-- a derived position needs nothing entered in Log and survives a new
-- clock version on its own. The order still has to say which it bought,
-- so the line keeps a time rule: 'opening' or 'closing' replace 'slot',
-- resolved against the rundown's marked breaks at listing and placement
-- time (uw_break_position_eligible). The traffic key is dropped
-- altogether; a named mid-program feature (Wild Birds' BirdNote at 7:42)
-- is an exact-time line, which the exact mode already covers.
--
-- Both projects held zero uw_contracts rows on 2026-09-25 (the same clean
-- state the bucket migration rewrote), so the enum is recreated rather
-- than migrated.

-- 1. Log: no traffic key.
drop index if exists public.log_local_opportunities_traffic_key_idx;
alter table public.log_local_opportunities
  drop constraint if exists log_local_opportunities_traffic_key_check,
  drop column traffic_key;

-- 2. The line: opening | closing instead of slot + required_opportunity_key.
alter table public.uw_contract_schedule_lines
  drop constraint uw_contract_schedule_lines_time_mode_check,
  drop column required_opportunity_key;

drop function public.uw_time_eligible(public.uw_contract_schedule_lines, time, text);

alter type public.uw_time_mode rename to uw_time_mode_old;
create type public.uw_time_mode as enum ('any', 'window', 'preferred', 'exact', 'opening', 'closing');
alter table public.uw_contract_schedule_lines
  alter column time_mode drop default,
  alter column time_mode type public.uw_time_mode using (time_mode::text::public.uw_time_mode),
  alter column time_mode set default 'any';
drop type public.uw_time_mode_old;

alter table public.uw_contract_schedule_lines
  add constraint uw_contract_schedule_lines_time_mode_check check (
    case time_mode
      when 'any' then true
      when 'window' then window_start is not null
      when 'preferred' then preferred_time is not null
      when 'exact' then preferred_time is not null
      when 'opening' then true
      when 'closing' then true
    end
  );

comment on column public.uw_contract_schedule_lines.time_mode is
  'any: any marked opportunity the pool/program allows. window: inside window_start..window_end (station-local, end exclusive) — a hard limit. preferred: preferred_time ranks candidates, never excludes. exact: the break must start within uw_exact_time_tolerance() of preferred_time. opening / closing: only the first / last underwriting-permitted marked break of the rundown — the program''s opening or closing credit, derived from the clock, never labelled on it (uw_break_position_eligible).';

-- 3. Helpers: time rules that depend only on the clock time, and the
-- position rule that depends on the rundown's other breaks.
create or replace function public.uw_time_eligible(
  p_line public.uw_contract_schedule_lines,
  p_local_time time
)
returns boolean
language sql
immutable
as $$
  select case p_line.time_mode
    when 'any' then true
    when 'preferred' then true
    when 'opening' then true
    when 'closing' then true
    when 'window' then p_local_time >= p_line.window_start and p_local_time < p_line.window_end
    when 'exact' then abs(extract(epoch from (p_local_time - p_line.preferred_time))) <= extract(epoch from public.uw_exact_time_tolerance())
  end;
$$;

revoke execute on function public.uw_time_eligible(public.uw_contract_schedule_lines, time) from public, anon;
grant execute on function public.uw_time_eligible(public.uw_contract_schedule_lines, time) to authenticated;

-- Is this break the rundown's opening (first) or closing (last)
-- underwriting-permitted marked break? For any other time mode, true. The
-- comparison is against the rundown — a multi-hour shift's opening credit
-- is its first hour's first avail, its closing credit the last hour's last.
create or replace function public.uw_break_position_eligible(
  p_line public.uw_contract_schedule_lines,
  p_break public.log_rundown_breaks
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_line.time_mode
    when 'opening' then not exists (
      select 1 from public.log_rundown_breaks o
      where o.rundown_id = p_break.rundown_id
        and o.id <> p_break.id
        and o.local_opportunity_id is not null
        and 'underwriting_credit' = any(o.permitted_content_types)
        and o.scheduled_at < p_break.scheduled_at
    )
    when 'closing' then not exists (
      select 1 from public.log_rundown_breaks o
      where o.rundown_id = p_break.rundown_id
        and o.id <> p_break.id
        and o.local_opportunity_id is not null
        and 'underwriting_credit' = any(o.permitted_content_types)
        and o.scheduled_at > p_break.scheduled_at
    )
    else true
  end;
$$;

revoke execute on function public.uw_break_position_eligible(public.uw_contract_schedule_lines, public.log_rundown_breaks) from public, anon;
grant execute on function public.uw_break_position_eligible(public.uw_contract_schedule_lines, public.log_rundown_breaks) to authenticated;

-- 4. The Log boundary, without the key and with the position rule.
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
    and b.local_opportunity_id is not null
    and bucket.id is not null
    and (v_line.program_id is null or lr.program_id = v_line.program_id)
    and (v_line.pool_id is null or public.uw_pool_matches(
      v_line.pool_id, lr.program_id, public.uw_station_local_time(b.scheduled_at), extract(dow from lr.air_date)::integer))
    and public.uw_time_eligible(v_line, public.uw_station_local_time(b.scheduled_at))
    and public.uw_break_position_eligible(v_line, b);

  return jsonb_build_object('ok', true, 'breaks', v_breaks);
end;
$$;

comment on function public.log_list_placeable_rundown_breaks(uuid) is
  'Every marked-opportunity break a schedule line could place into: permitted for a credit, on a date inside an active bucket with quantity (uw_bucket_for_date — dates, weekdays, cancellation), on the line''s program, inside its pool, satisfying its time rule (window or exact time) and, for an opening/closing line, being the rundown''s first/last such break. Each break names the bucket it would consume. Says nothing about how many a bucket still needs — the planner and log_place_underwriting_credit() do. Security definer: an underwriting-only caller has no RLS access to Log''s rundown tables.';

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

  select * into v_rundown from public.log_rundowns where id = v_break.rundown_id;
  select * into v_program from public.log_programs where id = v_rundown.program_id;
  v_local_time := public.uw_station_local_time(v_break.scheduled_at);
  v_dow := extract(dow from v_rundown.air_date)::integer;

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
  if not public.uw_time_eligible(v_line, v_local_time) then
    return jsonb_build_object('error', case v_line.time_mode
      when 'window' then 'outside_window'
      when 'exact' then 'exact_time_mismatch'
      else 'time_not_eligible' end);
  end if;
  if not public.uw_break_position_eligible(v_line, v_break) then
    return jsonb_build_object('error', case v_line.time_mode
      when 'opening' then 'not_opening_break'
      else 'not_closing_break' end);
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
  'The one write path for an underwriting credit into Log (manual, auto-fill, capability, makegood). Locks the schedule line, then checks: the line is active under the contract''s current revision; active contract; a marked, permitted break; the date inside an active bucket with quantity, on an eligible weekday (uw_bucket_for_date); program and pool; the time rule (window, exact time within uw_exact_time_tolerance) and, for an opening/closing line, that the break is the rundown''s first/last permitted marked break (uw_break_position_eligible); one credit per contract per break; the bucket''s quantity (skipped for a makegood, which replaces a unit — attributed to the missed bucket); the per-day cap when the order states one; copy linked to the contract and, if flight-scoped, to this line''s flight; duration fit; approval/dates or a manager override. Writes the item, the placement with its bucket, and links the makegood.';
