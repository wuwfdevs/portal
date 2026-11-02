-- Underwriting & Traffic: frozen rundowns, and bumping a movable credit to
-- seat a constrained one (docs/underwriting-traffic-redesign.md §10).
--
-- Found by comparing the portal against RadioTraffic.com, WUWF's current
-- traffic system. Three gaps, one migration, because they share a boundary:
--
-- 1. Nothing stopped automation writing into a rundown that is live or
--    already submitted, or into a break that has already started. The
--    TypeScript planner skipped days before today; the SQL guard checked
--    nothing about the rundown's state at all. Now every boundary function
--    takes an `automated` flag (auto-fill, provisioning and bumping pass
--    true; a traffic staffer's own manual placement and a host's actions
--    stay unrestricted) and uw_automation_block() is the one place that
--    says why an automated write is refused: rundown_frozen, or
--    break_in_past. lib/underwriting/freeze.ts is its TypeScript twin —
--    keep them in step.
-- 2. Every placed credit was treated as fixed. A line's time_mode already
--    says which credits can move (window, preferred, any) and which cannot
--    (exact, opening, closing); a makegood placement and anything with a
--    recorded outcome are fixed too. log_bump_underwriting_credit() moves
--    one movable credit to another break in its own demand bucket so a
--    constrained unit can take its place — composed from the existing
--    clear and place functions inside one subtransaction, so the move
--    passes every contractual check log_place_underwriting_credit() makes
--    (bucket, day cap, one per contract per break, copy, duration, freeze)
--    or leaves nothing changed. The host's own
--    log_relocate_underwriting_credit() is deliberately not reused: it is
--    gated on Log access, stays inside one rundown, and skips those checks.
-- 3. log_list_placeable_rundown_breaks() now also reports each break's
--    rundown status and the items sitting in it (with the placement, line
--    and underwriter behind each credit), which is what the bump planner
--    (lib/underwriting/bump-plan.ts) needs to see who could make room.
--
-- Rundown provisioning gains one refusal: a rundown is never generated for
-- a date before the station's today.
--
-- Neither project holds a uw_scheduled_placements row as of 2026-09-25
-- (production's three live rundowns carry only placement-less imported
-- credits, which none of this touches), so nothing here migrates data.

-- ============================================================================
-- 1. Helpers
-- ============================================================================

create or replace function public.uw_station_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Chicago')::date;
$$;

revoke execute on function public.uw_station_today() from public, anon;
grant execute on function public.uw_station_today() to authenticated;

comment on function public.uw_station_today() is
  'The station''s current calendar date (America/Chicago) — the SQL twin of lib/log/timezone.ts''s stationTodayISO().';

-- Why an automated write may not touch this break, or null when it may.
-- lib/underwriting/freeze.ts's automationBlockFor() is the TypeScript twin.
create or replace function public.uw_automation_block(
  p_break public.log_rundown_breaks,
  p_rundown public.log_rundowns
)
returns text
language sql
stable
as $$
  select case
    when p_rundown.status in ('in_progress', 'submitted') then 'rundown_frozen'
    when p_break.scheduled_at <= now() then 'break_in_past'
    else null
  end;
$$;

revoke execute on function public.uw_automation_block(public.log_rundown_breaks, public.log_rundowns) from public, anon;
grant execute on function public.uw_automation_block(public.log_rundown_breaks, public.log_rundowns) to authenticated;

comment on function public.uw_automation_block(public.log_rundown_breaks, public.log_rundowns) is
  'Automation (auto-fill, provisioning, bumping) never adds, moves or clears a credit in a rundown that is in_progress or submitted, or in a break whose start has passed. Returns rundown_frozen, break_in_past, or null. Host actions and a traffic staffer''s manual placement are not automation.';

-- ============================================================================
-- 2. The listing: rundown status and the items in each break
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
    'rundown_status', lr.status,
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
    ),
    'items', coalesce(items.list, '[]'::jsonb)
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
  left join lateral (
    -- Every item in the break, credits carrying the placement, line and
    -- underwriter behind them (null for host content) — the bump planner's
    -- view of who could make room.
    select jsonb_agg(jsonb_build_object(
      'item_id', i.id,
      'position', i.position,
      'duration_seconds', coalesce(i.planned_duration_seconds, 0),
      'placement_id', sp.id,
      'schedule_line_id', sp.schedule_line_id,
      'contract_id', sl.contract_id,
      'underwriter_id', c.underwriter_id,
      'category_id', u.category_id,
      'time_mode', sl.time_mode,
      'service_level', sl.service_level,
      'makegood_id', sp.makegood_id,
      'bucket_id', sp.demand_bucket_id,
      'has_outcome', exists (
        select 1 from public.log_broadcast_events e where e.rundown_item_id = i.id
      )
    ) order by i.position) as list
    from public.log_rundown_items i
    left join public.uw_scheduled_placements sp
      on sp.log_rundown_item_id = i.id and sp.status <> 'superseded'
    left join public.uw_contract_schedule_lines sl on sl.id = sp.schedule_line_id
    left join public.uw_contracts c on c.id = sl.contract_id
    left join public.uw_underwriters u on u.id = c.underwriter_id
    where i.break_id = b.id
  ) items on true
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

revoke execute on function public.log_list_placeable_rundown_breaks(uuid) from public, anon;
grant execute on function public.log_list_placeable_rundown_breaks(uuid) to authenticated;

comment on function public.log_list_placeable_rundown_breaks(uuid) is
  'Every marked-opportunity break a schedule line could place into: permitted for a credit, on a date inside an active bucket with quantity (uw_bucket_for_date — dates, weekdays, cancellation), on the line''s program, inside its pool, satisfying its time rule (window or exact time) and, for an opening/closing line, being the rundown''s first/last such break. Each break names the bucket it would consume, its rundown''s status (a live or submitted rundown is frozen to automation) and the items already in it, with the placement, line and underwriter behind each credit. Says nothing about how many a bucket still needs — the planner and log_place_underwriting_credit() do. Security definer: an underwriting-only caller has no RLS access to Log''s rundown tables.';

-- ============================================================================
-- 3. Placing and clearing, with the automation flag
-- ============================================================================

drop function public.log_place_underwriting_credit(uuid, uuid, uuid, text, uuid);

create function public.log_place_underwriting_credit(
  p_break_id uuid,
  p_schedule_line_id uuid,
  p_copy_id uuid,
  p_override_reason text default null,
  p_makegood_id uuid default null,
  p_automated boolean default false
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
  v_block text;
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

  -- Automation never writes into a live or submitted rundown, or a break
  -- that has already started. A staffer's own manual placement may.
  if p_automated then
    v_block := public.uw_automation_block(v_break, v_rundown);
    if v_block is not null then
      return jsonb_build_object('error', v_block);
    end if;
  end if;

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

revoke execute on function public.log_place_underwriting_credit(uuid, uuid, uuid, text, uuid, boolean) from public, anon;
grant execute on function public.log_place_underwriting_credit(uuid, uuid, uuid, text, uuid, boolean) to authenticated;

comment on function public.log_place_underwriting_credit(uuid, uuid, uuid, text, uuid, boolean) is
  'The one write path for an underwriting credit into Log (manual, auto-fill, capability, makegood, bump). Locks the schedule line, then checks: the line is active under the contract''s current revision; active contract; a marked, permitted break; when p_automated, that the rundown is not live or submitted and the break has not started (uw_automation_block); the date inside an active bucket with quantity, on an eligible weekday (uw_bucket_for_date); program and pool; the time rule (window, exact time within uw_exact_time_tolerance) and, for an opening/closing line, that the break is the rundown''s first/last permitted marked break (uw_break_position_eligible); one credit per contract per break; the bucket''s quantity (skipped for a makegood, which replaces a unit — attributed to the missed bucket); the per-day cap when the order states one; copy linked to the contract and, if flight-scoped, to this line''s flight; duration fit; approval/dates or a manager override. Writes the item, the placement with its bucket, and links the makegood.';

drop function public.log_clear_underwriting_credit(uuid);

create function public.log_clear_underwriting_credit(
  p_placement_id uuid,
  p_automated boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_placement public.uw_scheduled_placements;
  v_item public.log_rundown_items;
  v_break public.log_rundown_breaks;
  v_rundown public.log_rundowns;
  v_block text;
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

  if p_automated and v_placement.log_rundown_item_id is not null then
    select * into v_item from public.log_rundown_items where id = v_placement.log_rundown_item_id;
    if found then
      select * into v_break from public.log_rundown_breaks where id = v_item.break_id;
      select * into v_rundown from public.log_rundowns where id = v_break.rundown_id;
      v_block := public.uw_automation_block(v_break, v_rundown);
      if v_block is not null then
        return jsonb_build_object('error', v_block);
      end if;
    end if;
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

revoke execute on function public.log_clear_underwriting_credit(uuid, boolean) from public, anon;
grant execute on function public.log_clear_underwriting_credit(uuid, boolean) to authenticated;

comment on function public.log_clear_underwriting_credit(uuid, boolean) is
  'Undoes a placement: deletes its Log item, marks the placement superseded, and unlinks its makegood. When p_automated, refuses a placement in a live or submitted rundown or a break that has started (uw_automation_block) — a staffer''s own clear is not automation.';

-- ============================================================================
-- 4. Bumping: move one movable credit so a constrained one can be seated
-- ============================================================================

create or replace function public.log_bump_underwriting_credit(
  p_placement_id uuid,
  p_destination_break_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_placement public.uw_scheduled_placements;
  v_item public.log_rundown_items;
  v_line public.uw_contract_schedule_lines;
  v_source_break public.log_rundown_breaks;
  v_source_rundown public.log_rundowns;
  v_dest_break public.log_rundown_breaks;
  v_dest_rundown public.log_rundowns;
  v_bucket public.uw_demand_buckets;
  v_block text;
  v_result jsonb;
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
  if v_placement.log_rundown_item_id is null then
    return jsonb_build_object('error', 'unknown_item');
  end if;
  select * into v_item from public.log_rundown_items where id = v_placement.log_rundown_item_id;
  if not found then
    return jsonb_build_object('error', 'unknown_item');
  end if;

  select * into v_line from public.uw_contract_schedule_lines where id = v_placement.schedule_line_id;

  -- Movable = a window, preferred or any line's fresh placement. A fixed
  -- position (exact, opening, closing) and a makegood never move.
  if v_line.time_mode in ('exact', 'opening', 'closing') or v_placement.makegood_id is not null then
    return jsonb_build_object('error', 'credit_fixed');
  end if;
  -- Any recorded outcome — aired, missed, moved by the host — pins it.
  if exists (select 1 from public.log_broadcast_events where rundown_item_id = v_item.id) then
    return jsonb_build_object('error', 'already_aired');
  end if;

  select * into v_source_break from public.log_rundown_breaks where id = v_item.break_id;
  select * into v_source_rundown from public.log_rundowns where id = v_source_break.rundown_id;
  v_block := public.uw_automation_block(v_source_break, v_source_rundown);
  if v_block is not null then
    return jsonb_build_object('error', v_block);
  end if;

  select * into v_dest_break from public.log_rundown_breaks where id = p_destination_break_id;
  if not found then
    return jsonb_build_object('error', 'unknown_break');
  end if;
  if v_dest_break.id = v_source_break.id then
    return jsonb_build_object('error', 'same_break');
  end if;
  select * into v_dest_rundown from public.log_rundowns where id = v_dest_break.rundown_id;
  v_block := public.uw_automation_block(v_dest_break, v_dest_rundown);
  if v_block is not null then
    return jsonb_build_object('error', v_block);
  end if;

  -- Never outside its own demand bucket: the move must consume the same
  -- unit of the order it consumes today.
  v_bucket := public.uw_bucket_for_date(v_line, v_dest_rundown.air_date);
  if v_bucket.id is null or v_bucket.id <> v_placement.demand_bucket_id then
    return jsonb_build_object('error', 'different_bucket');
  end if;

  -- Clear, then place, as one subtransaction: the placement runs every
  -- check log_place_underwriting_credit() makes (line, revision, contract,
  -- bucket quota — the cleared unit no longer counts — day cap, one per
  -- contract per break, copy, duration, and the freeze on the destination).
  -- A refusal raises, which rolls the clear back and returns its code.
  begin
    v_result := public.log_clear_underwriting_credit(p_placement_id, true);
    if v_result ? 'error' then
      raise exception using message = 'bump:' || (v_result->>'error');
    end if;
    v_result := public.log_place_underwriting_credit(
      p_destination_break_id, v_line.id, v_placement.copy_id, null, null, true);
    if v_result ? 'error' then
      raise exception using message = 'bump:' || (v_result->>'error');
    end if;
  exception
    when others then
      if sqlerrm like 'bump:%' then
        return jsonb_build_object('error', substr(sqlerrm, 6));
      end if;
      raise;
  end;

  return jsonb_build_object(
    'ok', true,
    'placement_id', v_result->>'placement_id',
    'item_id', v_result->>'item_id',
    'superseded_placement_id', p_placement_id,
    'from_break_id', v_source_break.id,
    'to_break_id', p_destination_break_id
  );
end;
$$;

revoke execute on function public.log_bump_underwriting_credit(uuid, uuid) from public, anon;
grant execute on function public.log_bump_underwriting_credit(uuid, uuid) to authenticated;

comment on function public.log_bump_underwriting_credit(uuid, uuid) is
  'Moves one movable credit (a window/preferred/any line''s fresh placement with no recorded outcome, never a makegood) to another break in its own demand bucket, so a constrained credit can take the room it leaves. Composed from log_clear_underwriting_credit() and log_place_underwriting_credit() with the automation flag inside one subtransaction: the move passes every contractual check or nothing changes. Refuses a frozen or past source or destination (uw_automation_block). Returns the new placement and item ids; the old placement is superseded.';

-- ============================================================================
-- 5. Provisioning never generates a rundown for a past date
-- ============================================================================

create or replace function public.log_generate_rundown_for_underwriting(
  p_program_id uuid,
  p_schedule_entry_id uuid,
  p_clock_version_id uuid,
  p_air_date date,
  p_shift_start_at timestamptz,
  p_shift_end_at timestamptz,
  p_break_drafts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_rundown_id uuid;
  v_draft jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;
  if not private.has_underwriting_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select id into v_existing_id from public.log_rundowns
  where program_id = p_program_id and air_date = p_air_date;
  if v_existing_id is not null then
    return jsonb_build_object(
      'ok', true,
      'rundown_id', v_existing_id,
      'already_existed', true,
      'breaks', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'break_id', b.id,
          'clock_slot_id', b.clock_slot_id,
          'hour_index', b.hour_index,
          'local_opportunity_id', b.local_opportunity_id,
          'permitted_content_types', b.permitted_content_types,
          'scheduled_at', b.scheduled_at,
          'available_duration_seconds', b.available_duration_seconds
        )), '[]'::jsonb)
        from public.log_rundown_breaks b
        where b.rundown_id = v_existing_id
      )
    );
  end if;

  -- Automation never provisions the past: a rundown for a date already gone
  -- could only ever be an as-aired record, and that is the host's.
  if p_air_date < public.uw_station_today() then
    return jsonb_build_object('error', 'air_date_in_past');
  end if;

  if not exists (select 1 from public.log_schedule where id = p_schedule_entry_id) then
    return jsonb_build_object('error', 'unknown_schedule_entry');
  end if;
  if not exists (select 1 from public.log_clock_versions where id = p_clock_version_id) then
    return jsonb_build_object('error', 'unknown_clock_version');
  end if;

  insert into public.log_rundowns (
    program_id, schedule_entry_id, clock_version_id, air_date, shift_start_at, shift_end_at, status, generated_at
  ) values (
    p_program_id, p_schedule_entry_id, p_clock_version_id, p_air_date, p_shift_start_at, p_shift_end_at, 'generated', now()
  )
  returning id into v_rundown_id;

  for v_draft in select * from jsonb_array_elements(p_break_drafts)
  loop
    -- scheduled_at, available_duration_seconds, network_rejoin_at, label and
    -- position are derived from the slot by log_derive_rundown_break_times();
    -- the draft's values are passed only because the columns are not null.
    insert into public.log_rundown_breaks (
      rundown_id, clock_slot_id, hour_index, local_opportunity_id, position, label, requirement,
      permitted_content_types, scheduled_at, available_duration_seconds, network_rejoin_at
    ) values (
      v_rundown_id,
      (v_draft->>'clock_slot_id')::uuid,
      (v_draft->>'hour_index')::integer,
      (v_draft->>'local_opportunity_id')::uuid,
      (v_draft->>'position')::integer,
      v_draft->>'label',
      (v_draft->>'requirement')::public.log_opportunity_requirement,
      (select coalesce(array_agg(x), '{}'::text[]) from jsonb_array_elements_text(v_draft->'permitted_content_types') as x),
      (v_draft->>'scheduled_at')::timestamptz,
      (v_draft->>'available_duration_seconds')::integer,
      (v_draft->>'network_rejoin_at')::timestamptz
    )
    on conflict (rundown_id, clock_slot_id, hour_index) do nothing;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'rundown_id', v_rundown_id,
    'already_existed', false,
    'breaks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'break_id', b.id,
        'clock_slot_id', b.clock_slot_id,
        'hour_index', b.hour_index,
        'local_opportunity_id', b.local_opportunity_id,
        'permitted_content_types', b.permitted_content_types,
        'scheduled_at', b.scheduled_at,
        'available_duration_seconds', b.available_duration_seconds
      )), '[]'::jsonb)
      from public.log_rundown_breaks b
      where b.rundown_id = v_rundown_id
    )
  );
end;
$$;

revoke execute on function public.log_generate_rundown_for_underwriting(uuid, uuid, uuid, date, timestamptz, timestamptz, jsonb) from public, anon;
grant execute on function public.log_generate_rundown_for_underwriting(uuid, uuid, uuid, date, timestamptz, timestamptz, jsonb) to authenticated;
