-- Superseding a rundown that has not aired (docs/log-design.md, planned clock
-- changes).
--
-- A one-time change on the schedule (FPREN Phase I storm coverage, say) gives a
-- program's airing a different clock. A rundown generated before the change
-- was entered is pinned to the old clock and may already hold underwriting
-- credits. It is not deleted: deleting would cascade away its items, broadcast
-- events and exceptions, which is exactly the trace Traffic needs. Instead it
-- is marked superseded and a replacement is generated on the new clock.
--
--   1. log_rundowns.superseded_at, and one-live-rundown-per-date becomes a
--      partial unique index over the rundowns not superseded.
--   2. log_supersede_rundown(): program director only; refuses a rundown that
--      has started or has any recorded event; records every placed credit as
--      missed (special_coverage, management_correction), which raises an
--      exception through the existing trigger; marks the rundown superseded.
--   3. Readers that must not offer or reuse a superseded rundown:
--      uw_automation_block, log_list_placeable_rundown_breaks,
--      log_generate_rundown_for_underwriting, log_get_program_schedule_context.
--   4. A trigger refuses new items on a superseded rundown, whoever writes.
--   5. log_clear_underwriting_credit keeps the item on a superseded rundown.
--   6. log_schedule.entry_type narrows to recurring | override (holiday is
--      gone; the enum value remains but may not be stored).

-- 1. Column and index ---------------------------------------------------------

alter table public.log_rundowns add column superseded_at timestamptz;

comment on column public.log_rundowns.superseded_at is
  'Set when a rundown that had not aired was replaced by one on a different clock (log_supersede_rundown). The row, its items, events and exceptions stay as the record; it is hidden from Today, the DAD export and every placement list.';

alter table public.log_rundowns drop constraint log_rundowns_program_date_unique;

create unique index log_rundowns_program_date_live_key
  on public.log_rundowns (program_id, air_date)
  where superseded_at is null;

-- 2. Schedule entry types -----------------------------------------------------

alter table public.log_schedule
  add constraint log_schedule_entry_type_check
  check (entry_type in ('recurring', 'override'));

-- 3. Automation block ----------------------------------------------------------

create or replace function public.uw_automation_block(
  p_break public.log_rundown_breaks,
  p_rundown public.log_rundowns
)
returns text
language sql
stable
as $$
  select case
    when p_rundown.superseded_at is not null then 'rundown_superseded'
    when p_rundown.status in ('in_progress', 'submitted') then 'rundown_frozen'
    when p_break.scheduled_at <= now() then 'break_in_past'
    else null
  end;
$$;

comment on function public.uw_automation_block(public.log_rundown_breaks, public.log_rundowns) is
  'Automation (auto-fill, provisioning, bumping) never adds, moves or clears a credit in a rundown that is superseded, in_progress or submitted, or in a break whose start has passed. Returns rundown_superseded, rundown_frozen, break_in_past, or null. Host actions and a traffic staffer''s manual placement are not automation.';

-- 4. No new items on a superseded rundown --------------------------------------

create or replace function public.log_refuse_items_on_superseded_rundown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.log_rundown_breaks b
    join public.log_rundowns lr on lr.id = b.rundown_id
    where b.id = new.break_id and lr.superseded_at is not null
  ) then
    raise exception 'rundown_superseded: this rundown was replaced by one on another clock'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger log_rundown_items_refuse_superseded
  before insert on public.log_rundown_items
  for each row execute function public.log_refuse_items_on_superseded_rundown();

-- 5. Readers --------------------------------------------------------------------

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
    and lr.superseded_at is null
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
  where program_id = p_program_id and air_date = p_air_date and superseded_at is null;
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

create or replace function public.log_get_program_schedule_context(p_program_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule_entries jsonb;
  v_clock_versions jsonb;
  v_local_opportunities jsonb;
  v_opportunity_assignments jsonb;
  v_content_items jsonb;
  v_existing_rundown_dates jsonb;
begin
  if auth.uid() is null or not private.has_underwriting_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'clock_template_id', s.clock_template_id,
    'entry_type', s.entry_type,
    'days_of_week', s.days_of_week,
    'start_date', s.start_date,
    'end_date', s.end_date,
    'air_time', s.air_time,
    'duration_minutes', s.duration_minutes
  )), '[]'::jsonb)
  into v_schedule_entries
  from public.log_schedule s
  where s.program_id = p_program_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id,
    'clock_template_id', v.clock_template_id,
    'variant', v.variant,
    'effective_from', v.effective_from,
    'effective_to', v.effective_to
  )), '[]'::jsonb)
  into v_clock_versions
  from public.log_clock_versions v
  where v.clock_template_id in (select clock_template_id from public.log_schedule where program_id = p_program_id);

  -- Slot-keyed (restored from 20260809170000 — see this migration's own
  -- header): every opportunity's offset/duration/label/timing come from a
  -- join to its referenced network slot, since those columns don't exist on
  -- log_local_opportunities itself.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'clock_version_id', o.clock_version_id,
    'slot_id', cs.id,
    'slot_position', cs.position,
    'slot_label', cs.label,
    'requirement', o.requirement,
    'timing_mode', cs.timing_mode,
    'start_offset_seconds', cs.start_offset_seconds,
    'duration_seconds', cs.duration_seconds,
    'earliest_start_offset_seconds', cs.earliest_start_offset_seconds,
    'latest_start_offset_seconds', cs.latest_start_offset_seconds,
    'permitted_content_types', o.permitted_content_types
  )), '[]'::jsonb)
  into v_local_opportunities
  from public.log_local_opportunities o
  join public.log_clock_slots cs on cs.id = o.slot_id
  where o.active
    and o.clock_version_id in (
      select v.id from public.log_clock_versions v
      where v.clock_template_id in (select clock_template_id from public.log_schedule where program_id = p_program_id)
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'local_opportunity_id', a.local_opportunity_id,
    'content_item_id', a.content_item_id,
    'hour_index', a.hour_index,
    'days_of_week', a.days_of_week,
    'active', a.active
  )), '[]'::jsonb)
  into v_opportunity_assignments
  from public.log_opportunity_assignments a
  where a.active
    and a.local_opportunity_id in (
      select o.id from public.log_local_opportunities o
      where o.active
        and o.clock_version_id in (
          select v.id from public.log_clock_versions v
          where v.clock_template_id in (select clock_template_id from public.log_schedule where program_id = p_program_id)
        )
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ci.id,
    'expected_duration_seconds', ci.expected_duration_seconds,
    'components', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'component_type', c.component_type,
        'duration_seconds', c.duration_seconds,
        'required', c.required
      )), '[]'::jsonb)
      from public.log_content_components c
      where c.content_item_id = ci.id
    )
  )), '[]'::jsonb)
  into v_content_items
  from public.log_content_items ci
  where ci.id in (
    select a.content_item_id from public.log_opportunity_assignments a
    where a.active
      and a.local_opportunity_id in (
        select o.id from public.log_local_opportunities o
        where o.active
          and o.clock_version_id in (
            select v.id from public.log_clock_versions v
            where v.clock_template_id in (select clock_template_id from public.log_schedule where program_id = p_program_id)
          )
      )
  );

  select coalesce(jsonb_agg(r.air_date), '[]'::jsonb)
  into v_existing_rundown_dates
  from public.log_rundowns r
  where r.program_id = p_program_id and r.superseded_at is null;

  return jsonb_build_object(
    'ok', true,
    'schedule_entries', v_schedule_entries,
    'clock_versions', v_clock_versions,
    'local_opportunities', v_local_opportunities,
    'opportunity_assignments', v_opportunity_assignments,
    'content_items', v_content_items,
    'existing_rundown_dates', v_existing_rundown_dates
  );
end;
$$;

create or replace function public.log_clear_underwriting_credit(
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
  v_retired timestamptz;
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

  -- An item on a superseded rundown is the record of why a credit was lost
  -- (its missed event and exception hang off it, and deleting it would cascade
  -- them away). Cancelling or revising the order still ends the placement, but
  -- the item stays.
  select lr.superseded_at into v_retired
  from public.log_rundown_items i
  join public.log_rundown_breaks b on b.id = i.break_id
  join public.log_rundowns lr on lr.id = b.rundown_id
  where i.id = v_placement.log_rundown_item_id;
  if v_retired is null then
    delete from public.log_rundown_items where id = v_placement.log_rundown_item_id;
  end if;

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

-- 6. Superseding ----------------------------------------------------------------

create or replace function public.log_supersede_rundown(
  p_rundown_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rundown public.log_rundowns;
  v_item record;
  v_recorded integer := 0;
  v_note text;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;
  if not private.is_log_producer(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select * into v_rundown from public.log_rundowns where id = p_rundown_id for update;
  if not found then
    return jsonb_build_object('error', 'unknown_rundown');
  end if;
  if v_rundown.superseded_at is not null then
    return jsonb_build_object('error', 'already_superseded');
  end if;
  if v_rundown.status <> 'generated' or v_rundown.shift_start_at <= now() then
    return jsonb_build_object('error', 'rundown_started');
  end if;
  if exists (
    select 1
    from public.log_broadcast_events e
    join public.log_rundown_items i on i.id = e.rundown_item_id
    join public.log_rundown_breaks b on b.id = i.break_id
    where b.rundown_id = p_rundown_id
  ) then
    return jsonb_build_object('error', 'has_events');
  end if;

  v_note := 'Special clock: this rundown was replaced by one on another clock.'
    || case when nullif(btrim(coalesce(p_note, '')), '') is null then '' else ' ' || btrim(p_note) end;

  -- Every credit that was placed here is a credit that will not air as sold.
  -- The miss goes through the ordinary event path, so the existing trigger
  -- raises the exception; Traffic decides on a makegood or a waiver.
  for v_item in
    select i.id
    from public.log_rundown_items i
    join public.log_rundown_breaks b on b.id = i.break_id
    join public.uw_scheduled_placements sp
      on sp.log_rundown_item_id = i.id and sp.status <> 'superseded'
    where b.rundown_id = p_rundown_id and i.item_kind = 'underwriting_credit'
  loop
    insert into public.log_broadcast_events (
      rundown_item_id, outcome, confirmation_source, reason, notes, recorded_by
    ) values (
      v_item.id, 'missed', 'management_correction', 'special_coverage', v_note, auth.uid()
    );
    v_recorded := v_recorded + 1;
  end loop;

  update public.log_rundowns set superseded_at = now() where id = p_rundown_id;

  return jsonb_build_object(
    'ok', true,
    'program_id', v_rundown.program_id,
    'air_date', v_rundown.air_date,
    'credits_recorded', v_recorded
  );
end;
$$;

revoke execute on function public.log_supersede_rundown(uuid, text) from public, anon;
grant execute on function public.log_supersede_rundown(uuid, text) to authenticated;

comment on function public.log_supersede_rundown(uuid, text) is
  'Retires a rundown that has not started and has no recorded events, so one on a different clock can replace it. Program director only. Each placed underwriting credit is recorded as missed (special_coverage, management_correction), which raises an exception for Traffic to review; nothing is deleted. Security definer because a Log session cannot read Underwriting''s placements.';
