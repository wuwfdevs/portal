-- Log: rundown breaks keyed to clock slots — docs/log-slot-keyed-breaks-design.md.
--
-- A break is one occurrence of one clock slot, identified by
-- (rundown_id, clock_slot_id, hour_index). Its times come from the slot:
-- scheduled_at, available_duration_seconds, network_rejoin_at, label and
-- position stay stored columns (every reader keeps working unchanged), but
-- log_derive_rundown_break_times() computes them on every insert and update
-- from the rundown's shift start, the slot, the hour and — for a floating
-- slot only — landing_offset_seconds. A caller-supplied value is
-- overwritten, never trusted. This replaces the old identity (a local
-- opportunity plus an instant, or for imported breaks an instant alone) and
-- the time-based dedup built around it.
--
-- Data, per the design doc's §5 (decided 2026-09-24):
--   1. Every rundown dated before 2026-09-24 is deleted rather than
--      migrated. The delete cascades to breaks, items and broadcast events;
--      in production nothing in Underwriting references them (no
--      placements, exceptions, makegoods or affidavits). In preview,
--      uw_scheduled_placements rows left by auto-fill testing lose their
--      log_rundown_item_id (on delete set null, the FK's existing rule).
--   2. The remaining breaks are mapped to a slot occurrence: an opportunity
--      break by its opportunity's slot; a break without one by the same
--      lookup the import uses — a fixed slot starting within 15s, else a
--      floating slot's window, else a short slot it falls inside. A break
--      with items that maps to nothing stops the migration; an empty one is
--      deleted.
--   3. Breaks that now share a key are merged: items move (keeping their
--      ids, so broadcast events and placements follow) into one survivor.
--   4. Empty breaks on unmarked slots are deleted.
--
-- Also: log_generate_rundown_for_underwriting() writes the new key,
-- log_get_program_schedule_context() returns each opportunity's slot_id,
-- and log_list_placeable_rundown_breaks() offers only opportunity breaks
-- (design doc §4).

-- 1. Delete rundowns before 2026-09-24 ---------------------------------------

delete from public.log_rundowns where air_date < date '2026-09-24';

-- 2. New columns ---------------------------------------------------------------

alter table public.log_rundown_breaks
  add column clock_slot_id uuid references public.log_clock_slots (id) on delete restrict,
  add column hour_index integer,
  add column landing_offset_seconds integer;

comment on column public.log_rundown_breaks.clock_slot_id is
  'The clock slot this break is one occurrence of. With hour_index, the break''s identity. See docs/log-slot-keyed-breaks-design.md.';
comment on column public.log_rundown_breaks.hour_index is
  'Which repetition of the clock within the rundown''s shift (0 = the first hour).';
comment on column public.log_rundown_breaks.landing_offset_seconds is
  'Floating slots only: where the break landed that day, in seconds from the top of its hour, within the slot''s earliest/latest window. Null means the earliest start.';

-- 3. Map every remaining break to a slot occurrence --------------------------

do $$
declare
  v record;
  v_match record;
  v_nominal integer;
  v_hour integer;
  v_landing integer;
begin
  create temp table _occ on commit drop as
  select
    s.id as slot_id,
    s.clock_version_id,
    s.timing_mode,
    s.duration_seconds,
    coalesce(s.earliest_start_offset_seconds, s.start_offset_seconds, 0) as earliest,
    coalesce(s.latest_start_offset_seconds, s.start_offset_seconds, 0) as latest,
    h as hour_index,
    h * 3600 + case when s.timing_mode = 'float'
      then coalesce(s.earliest_start_offset_seconds, s.start_offset_seconds, 0)
      else coalesce(s.start_offset_seconds, 0) end as start_at,
    h * 3600 + coalesce(s.latest_start_offset_seconds, s.start_offset_seconds, 0) as latest_at,
    o.id as opportunity_id
  from public.log_clock_slots s
  cross join generate_series(0, 23) as h
  left join public.log_local_opportunities o on o.slot_id = s.id and o.active;

  for v in
    select
      b.id,
      b.local_opportunity_id,
      b.available_duration_seconds as w,
      extract(epoch from b.scheduled_at - r.shift_start_at)::integer as e,
      r.clock_version_id,
      greatest(1, ceil(extract(epoch from r.shift_end_at - r.shift_start_at) / 3600.0))::integer as hours,
      exists (select 1 from public.log_rundown_items i where i.break_id = b.id) as has_items
    from public.log_rundown_breaks b
    join public.log_rundowns r on r.id = b.rundown_id
  loop
    v_landing := null;

    if v.local_opportunity_id is not null then
      select s.* into v_match
      from public.log_local_opportunities o
      join public.log_clock_slots s on s.id = o.slot_id
      where o.id = v.local_opportunity_id;
      v_nominal := case when v_match.timing_mode = 'float'
        then coalesce(v_match.earliest_start_offset_seconds, v_match.start_offset_seconds, 0)
        else coalesce(v_match.start_offset_seconds, 0) end;
      v_hour := greatest(0, round((v.e - v_nominal) / 3600.0)::integer);
      if v_match.timing_mode = 'float' and v.e - v_hour * 3600 <> v_nominal then
        v_landing := v.e - v_hour * 3600;
      end if;
      update public.log_rundown_breaks
      set clock_slot_id = v_match.id, hour_index = v_hour, landing_offset_seconds = v_landing
      where id = v.id;
      continue;
    end if;

    -- a. a fixed slot starting within 15s
    select * into v_match from _occ o
    where o.clock_version_id = v.clock_version_id and o.hour_index < v.hours
      and o.timing_mode = 'fixed' and abs(o.start_at - v.e) <= 15
      and (o.opportunity_id is not null or o.duration_seconds <= greatest(2 * v.w, v.w + 60))
    order by abs(o.start_at - v.e), (o.opportunity_id is null)
    limit 1;

    -- b. a floating slot whose window the break falls in
    if not found then
      select * into v_match from _occ o
      where o.clock_version_id = v.clock_version_id and o.hour_index < v.hours
        and o.timing_mode = 'float' and v.e between o.start_at - 15 and o.latest_at + 15
      order by abs(o.start_at - v.e)
      limit 1;
      if found then
        v_landing := least(greatest(v.e - v_match.hour_index * 3600, v_match.earliest), v_match.latest);
        if v_landing = v_match.earliest then v_landing := null; end if;
      end if;
    end if;

    -- c. a short fixed slot the break falls inside
    if not found then
      select * into v_match from _occ o
      where o.clock_version_id = v.clock_version_id and o.hour_index < v.hours
        and o.timing_mode = 'fixed' and o.start_at <= v.e and v.e < o.start_at + o.duration_seconds
        and (o.opportunity_id is not null or o.duration_seconds <= greatest(2 * v.w, v.w + 60))
      order by (o.opportunity_id is null), o.duration_seconds
      limit 1;
    end if;

    if not found then
      if v.has_items then
        raise exception 'log_rundown_breaks %: holds items but matches no clock slot', v.id;
      end if;
      delete from public.log_rundown_breaks where id = v.id;
      continue;
    end if;

    update public.log_rundown_breaks
    set clock_slot_id = v_match.slot_id,
        hour_index = v_match.hour_index,
        landing_offset_seconds = v_landing,
        local_opportunity_id = v_match.opportunity_id
    where id = v.id;
  end loop;
end;
$$;

-- 4. Merge breaks that now share a key ----------------------------------------

do $$
declare
  g record;
  v_survivor uuid;
  v_other record;
  v_next integer;
begin
  for g in
    select rundown_id, clock_slot_id, hour_index
    from public.log_rundown_breaks
    group by rundown_id, clock_slot_id, hour_index
    having count(*) > 1
  loop
    -- Keep the break with the most items; ties to the earliest.
    select b.id into v_survivor
    from public.log_rundown_breaks b
    where b.rundown_id = g.rundown_id and b.clock_slot_id = g.clock_slot_id and b.hour_index = g.hour_index
    order by (select count(*) from public.log_rundown_items i where i.break_id = b.id) desc, b.scheduled_at, b.id
    limit 1;

    for v_other in
      select b.id from public.log_rundown_breaks b
      where b.rundown_id = g.rundown_id and b.clock_slot_id = g.clock_slot_id and b.hour_index = g.hour_index
        and b.id <> v_survivor
      order by b.scheduled_at, b.id
    loop
      select coalesce(max(position), 0) into v_next from public.log_rundown_items where break_id = v_survivor;
      update public.log_rundown_items
      set break_id = v_survivor, position = v_next + position
      where break_id = v_other.id;
      delete from public.log_rundown_breaks where id = v_other.id;
    end loop;
  end loop;
end;
$$;

-- 5. Empty breaks on unmarked slots are deleted --------------------------------

delete from public.log_rundown_breaks b
where b.local_opportunity_id is null
  and not exists (select 1 from public.log_rundown_items i where i.break_id = b.id);

-- 6. The key, and times derived from the slot ----------------------------------

alter table public.log_rundown_breaks
  alter column clock_slot_id set not null,
  alter column hour_index set not null,
  add constraint log_rundown_breaks_hour_index_check check (hour_index >= 0),
  drop constraint log_rundown_breaks_unique_occurrence,
  add constraint log_rundown_breaks_slot_occurrence_key unique (rundown_id, clock_slot_id, hour_index);

drop index public.log_rundown_breaks_imported_unique;

create index log_rundown_breaks_clock_slot_idx on public.log_rundown_breaks (clock_slot_id);

comment on constraint log_rundown_breaks_slot_occurrence_key on public.log_rundown_breaks is
  'A break is one occurrence of one clock slot. See docs/log-slot-keyed-breaks-design.md.';

create or replace function public.log_derive_rundown_break_times()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rundown public.log_rundowns;
  v_slot public.log_clock_slots;
  v_start integer;
  v_rejoin integer;
begin
  select * into v_rundown from public.log_rundowns where id = new.rundown_id;
  if not found then
    raise exception 'log_rundown_breaks: rundown % does not exist', new.rundown_id;
  end if;

  -- An opportunity identifies its slot on its own.
  if new.clock_slot_id is null and new.local_opportunity_id is not null then
    select slot_id into new.clock_slot_id
    from public.log_local_opportunities where id = new.local_opportunity_id;
  end if;
  if new.clock_slot_id is null then
    raise exception 'log_rundown_breaks: clock_slot_id is required';
  end if;

  select * into v_slot from public.log_clock_slots where id = new.clock_slot_id;
  if not found or v_slot.clock_version_id <> v_rundown.clock_version_id then
    raise exception 'log_rundown_breaks: slot % is not on this rundown''s clock version', new.clock_slot_id;
  end if;

  if new.local_opportunity_id is null then
    select id into new.local_opportunity_id
    from public.log_local_opportunities where slot_id = new.clock_slot_id and active;
  elsif not exists (
    select 1 from public.log_local_opportunities
    where id = new.local_opportunity_id and slot_id = new.clock_slot_id
  ) then
    raise exception 'log_rundown_breaks: opportunity % does not mark slot %', new.local_opportunity_id, new.clock_slot_id;
  end if;

  if v_slot.timing_mode = 'float' then
    v_start := coalesce(v_slot.earliest_start_offset_seconds, v_slot.start_offset_seconds, 0);
    if new.landing_offset_seconds is not null then
      if new.landing_offset_seconds < v_start
         or new.landing_offset_seconds > coalesce(v_slot.latest_start_offset_seconds, v_slot.start_offset_seconds, 0) then
        raise exception 'log_rundown_breaks: landing % is outside slot %''s window', new.landing_offset_seconds, new.clock_slot_id;
      end if;
      v_start := new.landing_offset_seconds;
    end if;
    -- Same rule as generation: the latest permitted start plus the duration.
    v_rejoin := coalesce(v_slot.latest_start_offset_seconds, v_slot.start_offset_seconds, 0) + v_slot.duration_seconds;
  else
    new.landing_offset_seconds := null;
    v_start := coalesce(v_slot.start_offset_seconds, 0);
    v_rejoin := v_start + v_slot.duration_seconds;
  end if;

  if new.hour_index is null then
    new.hour_index := greatest(0, round((extract(epoch from new.scheduled_at - v_rundown.shift_start_at) - v_start) / 3600.0)::integer);
  end if;

  new.scheduled_at := v_rundown.shift_start_at + make_interval(secs => new.hour_index * 3600 + v_start);
  new.available_duration_seconds := v_slot.duration_seconds;
  new.network_rejoin_at := v_rundown.shift_start_at + make_interval(secs => new.hour_index * 3600 + v_rejoin);
  new.label := coalesce(v_slot.label, case when new.local_opportunity_id is null then 'Network slot' else 'Local opportunity' end);
  new.position := new.hour_index * 10000 + v_slot.position;
  return new;
end;
$$;

revoke execute on function public.log_derive_rundown_break_times() from public, anon, authenticated;

create trigger log_rundown_breaks_derive_times
  before insert or update on public.log_rundown_breaks
  for each row execute function public.log_derive_rundown_break_times();

-- Every surviving row through the trigger once, so stored times match the
-- slot (an imported break kept DAD's printed window until now).
update public.log_rundown_breaks set hour_index = hour_index;

-- 7. The Underwriting boundary -------------------------------------------------

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
  where r.program_id = p_program_id;

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

create or replace function public.log_list_placeable_rundown_breaks(p_schedule_line_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.uw_contract_schedule_lines;
  v_breaks jsonb;
begin
  if auth.uid() is null or not private.has_underwriting_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select * into v_line from public.uw_contract_schedule_lines where id = p_schedule_line_id;
  if not found then
    return jsonb_build_object('error', 'unknown_schedule_line');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'break_id', b.id,
    'rundown_id', lr.id,
    'air_date', lr.air_date,
    'scheduled_at', b.scheduled_at,
    'label', b.label,
    'program_name', lp.name,
    'remaining_seconds', b.available_duration_seconds - coalesce(occupied.total, 0),
    'last_item_id', last_item.id
  ) order by b.scheduled_at), '[]'::jsonb)
  into v_breaks
  from public.log_rundown_breaks b
  join public.log_rundowns lr on lr.id = b.rundown_id
  join public.log_programs lp on lp.id = lr.program_id
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
    -- Only windows a producer marked (docs/log-slot-keyed-breaks-design.md
    -- §4): a break on an unmarked slot exists only because an import placed
    -- what DAD scheduled there, not as inventory.
    and b.local_opportunity_id is not null
    and lr.air_date >= v_line.start_date
    and (v_line.end_date is null or lr.air_date <= v_line.end_date)
    and (v_line.program_id is null or lr.program_id = v_line.program_id)
    and extract(dow from lr.air_date)::integer = any(v_line.days_of_week);

  return jsonb_build_object('ok', true, 'breaks', v_breaks);
end;
$$;
