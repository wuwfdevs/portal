-- Log: local opportunities become slot-keyed, not an independently-authored
-- time range — a direct product correction to the domain redesign in
-- 20260808120000_log_local_opportunities.sql, requested directly (not a bug
-- fix). See CLAUDE.md's dated note for the full design conversation. Two
-- things changed at once, both requested together:
--
-- 1. A local opportunity is now "mark an existing network slot as eligible
--    for local content," not an independently-authored time range. Every
--    fillability column log_local_opportunities carried alongside its own
--    offsets (position, label, timing_mode, start_offset_seconds,
--    duration_seconds, earliest_/latest_start_offset_seconds) is dropped in
--    favor of a single slot_id reference — offset/duration/label/timing are
--    always the referenced network slot's own (immutable, insert-only)
--    values, so an opportunity can never drift out of sync with the clock
--    it describes the way a hand-typed offset could (the exact bug class
--    three separate clock-seed correction migrations had to fix). A real
--    local opportunity that spans more than one network element (WUWF's
--    local-story windows, which cover several network slots at once — see
--    CLAUDE.md's domain redesign note) is now several separate slot-keyed
--    opportunity rows, one per slot, rather than one row with a custom
--    range. Confirmed directly: a network slot marked eligible this way
--    (including a required one like a newscast) can always be independently
--    filled on its own — there is no "only as part of a group" mode.
-- 2. allow_multiple is gone, from both log_local_opportunities and
--    log_rundown_breaks — there is no scenario that needs a break capped at
--    a single item; the only real limit is remaining duration, already
--    enforced by application logic and the timing engine
--    (lib/log/timing.ts), never a stored flag.
--
-- No production data exists in this tool for these tables (CLAUDE.md), so
-- both changes are plain ALTER TABLEs, not a drop-and-recreate — no
-- downstream FK (log_rundown_breaks.local_opportunity_id,
-- uw_scheduled_placements.log_rundown_item_id, etc.) needs to be rebuilt.
--
-- Preview does carry real *generated* test data, though (confirmed directly:
-- 77 rundowns, 1520 breaks, 86 uw_scheduled_placements from exercising
-- auto-fill against the real Autumn Beck Blackledge contract) — but zero
-- log_broadcast_events, zero uw_exceptions, zero uw_makegoods. Nothing has
-- actually "aired" in this simulated environment yet, so none of it is
-- broadcast history worth preserving — it's disposable scaffolding from
-- generating against the old opportunity shape, the same "no real
-- production data yet" status this table's own placements have already
-- been cleared under twice before (see CLAUDE.md's auto-fill bug-fix
-- notes). Cleared explicitly here rather than left to dangle: every
-- existing local opportunity is about to lose the very columns
-- (start_offset_seconds, duration_seconds) that scheduled_at/available_
-- duration_seconds/network_rejoin_at on log_rundown_breaks were computed
-- from, so keeping those breaks around post-migration would be keeping
-- data computed from a model that no longer exists.
delete from public.uw_scheduled_placements;
delete from public.log_rundowns; -- cascades: log_rundown_breaks -> log_rundown_items -> log_broadcast_events

alter table public.log_local_opportunities
  drop column position,
  drop column label,
  drop column timing_mode,
  drop column start_offset_seconds,
  drop column duration_seconds,
  drop column earliest_start_offset_seconds,
  drop column latest_start_offset_seconds,
  drop column allow_multiple,
  add column slot_id uuid references public.log_clock_slots (id) on delete cascade;

-- Backfill is unnecessary (no rows carry meaningful data to preserve — see
-- above), but slot_id must be populated before it can be required: any
-- stray row from manual testing gets deleted outright rather than left with
-- a null slot_id forever, since a local opportunity with no slot reference
-- is meaningless under the new model.
delete from public.log_local_opportunities where slot_id is null;

alter table public.log_local_opportunities
  alter column slot_id set not null,
  add constraint log_local_opportunities_slot_id_key unique (slot_id);

comment on table public.log_local_opportunities is
  'WUWF''s own local-substitution overlay on an accurate network clock version — marks one existing network slot (slot_id) as available for local content. A real local opportunity that spans several network elements (e.g. Morning Edition''s story windows) is several of these rows, one per slot, not one row with a custom time range — see CLAUDE.md''s dated note. requirement = ''optional'' means "WUWF may cover this; if nothing is placed, the network feed simply continues" — never an error. Editable in place (deactivate via active, not deleted) — WUWF policy, not the network''s immutable structure.';
comment on column public.log_local_opportunities.slot_id is
  'The network slot this opportunity marks as locally eligible — one opportunity per slot (unique). Offset, duration, timing mode, and label are always the referenced slot''s own — never duplicated here, so they can never drift out of sync with the clock.';

drop index if exists log_local_opportunities_version_idx;
create index log_local_opportunities_version_idx on public.log_local_opportunities (clock_version_id);
create index log_local_opportunities_slot_idx on public.log_local_opportunities (slot_id);

-- No item-count cap, on either table — the only real limit on how many
-- items occupy a break is remaining duration, computed by
-- lib/log/timing.ts, never an authored flag. See CLAUDE.md's dated note:
-- "there is never a scenario in which we need to restrain a slot to a
-- single item."

alter table public.log_rundown_breaks drop column allow_multiple;

comment on table public.log_rundown_breaks is
  'One occurrence of a local opportunity within a rundown (docs/log-design.md §4B) — a container zero or more log_rundown_items may occupy, bounded only by available_duration_seconds, never an item-count cap. An unused break with requirement = optional is a normal, resolved state ("carrying network"); requirement = required with zero items is unresolved. See lib/log/timing.ts.';

-- ============================================================================
-- Underwriting boundary: drop the allow_multiple checks these functions
-- inherited from log_rundown_breaks, and fix log_get_program_schedule_context
-- to read the new slot-keyed opportunity shape via a join to log_clock_slots.
-- ============================================================================

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
    and lr.air_date >= v_line.start_date
    and (v_line.end_date is null or lr.air_date <= v_line.end_date)
    and (v_line.program_id is null or lr.program_id = v_line.program_id)
    and extract(dow from lr.air_date)::integer = any(v_line.days_of_week);

  return jsonb_build_object('ok', true, 'breaks', v_breaks);
end;
$$;

comment on function public.log_list_placeable_rundown_breaks(uuid) is
  'Every currently-open Log rundown break eligible for this schedule line (permits underwriting_credit, within the line''s program/day-of-week/date eligibility), including last_item_id — the id of whichever item currently holds the break''s highest position, if any, so a caller can check same-underwriter/same-industry adjacency before appending another credit. No capacity/allow_multiple gate — remaining_seconds is informational, callers decide fit themselves. Security definer: the caller may have no Log access at all.';

revoke execute on function public.log_list_placeable_rundown_breaks(uuid) from public, anon;
grant execute on function public.log_list_placeable_rundown_breaks(uuid) to authenticated;

create or replace function public.log_place_underwriting_credit(
  p_break_id uuid,
  p_schedule_line_id uuid,
  p_copy_id uuid,
  p_override_reason text default null
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
  v_contract public.uw_contracts;
  v_copy public.uw_copy;
  v_linked boolean;
  v_needs_override boolean;
  v_occupied integer;
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

  select * into v_break from public.log_rundown_breaks where id = p_break_id;
  if not found then
    return jsonb_build_object('error', 'unknown_break');
  end if;
  if not ('underwriting_credit' = any(v_break.permitted_content_types)) then
    return jsonb_build_object('error', 'break_not_eligible');
  end if;

  select coalesce(sum(planned_duration_seconds), 0)
    into v_occupied
    from public.log_rundown_items where break_id = p_break_id;

  select * into v_rundown from public.log_rundowns where id = v_break.rundown_id;
  select * into v_program from public.log_programs where id = v_rundown.program_id;

  select * into v_line from public.uw_contract_schedule_lines where id = p_schedule_line_id;
  if not found then
    return jsonb_build_object('error', 'unknown_schedule_line');
  end if;

  select * into v_contract from public.uw_contracts where id = v_line.contract_id;
  if v_contract.status <> 'active' then
    return jsonb_build_object('error', 'contract_not_active');
  end if;

  if v_line.program_id is not null and v_line.program_id <> v_rundown.program_id then
    return jsonb_build_object('error', 'program_not_eligible');
  end if;

  select * into v_copy from public.uw_copy where id = p_copy_id;
  if not found then
    return jsonb_build_object('error', 'unknown_copy');
  end if;

  select exists(
    select 1 from public.uw_contract_copy
    where contract_id = v_line.contract_id and copy_id = p_copy_id
  ) into v_linked;
  if not v_linked then
    return jsonb_build_object('error', 'copy_not_linked');
  end if;

  if v_copy.duration_seconds is null then
    return jsonb_build_object('error', 'copy_duration_unknown');
  end if;
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
    program_id, program_name, break_label, status, override_reason, created_by
  ) values (
    p_schedule_line_id, p_copy_id, v_item_id, v_rundown.air_date, v_break.scheduled_at,
    v_rundown.program_id, v_program.name, v_break.label,
    'scheduled', case when v_needs_override then p_override_reason else null end, auth.uid()
  )
  returning id into v_placement_id;

  return jsonb_build_object('ok', true, 'placement_id', v_placement_id, 'item_id', v_item_id);
end;
$$;

comment on function public.log_place_underwriting_credit(uuid, uuid, uuid, text) is
  'The only path that ever creates an item_kind = underwriting_credit row. Security definer so the guard (a permitted break with room; an active contract; program-eligible schedule line; linked, eligible copy; an explicit manager-checked override otherwise) lives in one place instead of a blanket RLS policy. No allow_multiple gate — a break holds as many items as fit in its remaining duration.';

revoke execute on function public.log_place_underwriting_credit(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.log_place_underwriting_credit(uuid, uuid, uuid, text) to authenticated;

create or replace function public.log_relocate_underwriting_credit(
  p_item_id uuid,
  p_destination_break_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.log_rundown_items;
  v_source_break public.log_rundown_breaks;
  v_placement public.uw_scheduled_placements;
  v_dest_break public.log_rundown_breaks;
  v_dest_rundown public.log_rundowns;
  v_program public.log_programs;
  v_occupied integer;
  v_next_position integer;
  v_open_exception_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;
  if not private.has_log_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select * into v_item from public.log_rundown_items where id = p_item_id;
  if not found or v_item.item_kind <> 'underwriting_credit' then
    return jsonb_build_object('error', 'not_a_credit');
  end if;

  if exists (
    select 1 from public.log_broadcast_events
    where rundown_item_id = p_item_id and outcome = 'aired_as_scheduled'
  ) then
    return jsonb_build_object('error', 'already_aired');
  end if;

  select * into v_source_break from public.log_rundown_breaks where id = v_item.break_id;

  select * into v_placement from public.uw_scheduled_placements
    where log_rundown_item_id = p_item_id and status <> 'superseded'
    order by created_at desc limit 1;
  if not found then
    return jsonb_build_object('error', 'unknown_placement');
  end if;

  select * into v_dest_break from public.log_rundown_breaks where id = p_destination_break_id;
  if not found then
    return jsonb_build_object('error', 'unknown_break');
  end if;
  if v_dest_break.id = v_source_break.id then
    return jsonb_build_object('error', 'same_break');
  end if;
  if v_dest_break.rundown_id <> v_source_break.rundown_id then
    return jsonb_build_object('error', 'different_rundown');
  end if;
  if not ('underwriting_credit' = any(v_dest_break.permitted_content_types)) then
    return jsonb_build_object('error', 'break_not_eligible');
  end if;

  -- Excludes the item itself: it's still sitting in the source break at
  -- this point (nothing has moved yet), so it must not count against its
  -- own destination's duration math.
  select coalesce(sum(planned_duration_seconds), 0)
    into v_occupied
    from public.log_rundown_items where break_id = p_destination_break_id and id <> p_item_id;
  if v_item.planned_duration_seconds > (v_dest_break.available_duration_seconds - v_occupied) then
    return jsonb_build_object('error', 'too_long');
  end if;

  select * into v_dest_rundown from public.log_rundowns where id = v_dest_break.rundown_id;
  select * into v_program from public.log_programs where id = v_dest_rundown.program_id;

  select coalesce(max(position), 0) + 1 into v_next_position
    from public.log_rundown_items where break_id = p_destination_break_id and id <> p_item_id;

  update public.log_rundown_items
  set break_id = p_destination_break_id,
      position = v_next_position
  where id = p_item_id;

  update public.uw_scheduled_placements
  set scheduled_at = v_dest_break.scheduled_at,
      break_label = v_dest_break.label,
      program_id = v_dest_rundown.program_id,
      program_name = v_program.name
  where id = v_placement.id;

  select ex.id into v_open_exception_id
  from public.log_broadcast_events lbe
  join public.uw_exceptions ex on ex.log_broadcast_event_id = lbe.id
  where lbe.rundown_item_id = p_item_id
    and ex.resolution_status = 'open'
  order by lbe.recorded_at desc
  limit 1;

  if v_open_exception_id is not null then
    update public.uw_exceptions
    set resolution_status = 'resolved',
        resolution_action = 'reassign',
        resolution_notes = coalesce(resolution_notes || E'\n\n', '')
          || 'Automatically resolved: the host moved this credit to another break in the same broadcast.',
        resolved_by = auth.uid(),
        resolved_at = now()
    where id = v_open_exception_id;
  end if;

  return jsonb_build_object('ok', true, 'item_id', p_item_id, 'placement_id', v_placement.id);
end;
$$;

comment on function public.log_relocate_underwriting_credit(uuid, uuid) is
  'Moves an already-placed, not-yet-aired underwriting credit to a different open, eligible break in the same rundown, in place (same log_rundown_items row, same id) — never a delete/reinsert, so it can never cascade away a prior log_broadcast_events row. No allow_multiple gate — a break holds as many items as fit in its remaining duration. Gated by has_log_access, not has_underwriting_access — narrower than log_place_underwriting_credit() (no new copy, no override, same rundown only), which is what makes the lighter gate appropriate. Auto-resolves an open exception against a prior miss, if any (resolution_action = reassign).';

revoke all on function public.log_relocate_underwriting_credit(uuid, uuid) from public, anon;
grant execute on function public.log_relocate_underwriting_credit(uuid, uuid) to authenticated;

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

  -- Slot-keyed now (see this migration's header): every opportunity's
  -- offset/duration/label/timing come from a join to its referenced network
  -- slot, since those columns no longer exist on log_local_opportunities
  -- itself.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'clock_version_id', o.clock_version_id,
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

  select coalesce(jsonb_agg(r.air_date), '[]'::jsonb)
  into v_existing_rundown_dates
  from public.log_rundowns r
  where r.program_id = p_program_id;

  return jsonb_build_object(
    'ok', true,
    'schedule_entries', v_schedule_entries,
    'clock_versions', v_clock_versions,
    'local_opportunities', v_local_opportunities,
    'existing_rundown_dates', v_existing_rundown_dates
  );
end;
$$;

comment on function public.log_get_program_schedule_context(uuid) is
  'Everything lib/underwriting/rundown-provisioning.ts needs to decide which of a schedule line''s remaining campaign dates already have a rundown and, for the rest, resolve the active schedule entry/clock version/local opportunities itself using Log''s own pure generation logic. Local opportunities are slot-keyed — their offset/duration/label/timing come from a join to log_clock_slots, not their own columns. Security definer: has_log_access-gated tables, called by an underwriting-only session.';

revoke execute on function public.log_get_program_schedule_context(uuid) from public, anon;
grant execute on function public.log_get_program_schedule_context(uuid) to authenticated;

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
    insert into public.log_rundown_breaks (
      rundown_id, local_opportunity_id, position, label, requirement, permitted_content_types,
      scheduled_at, available_duration_seconds, network_rejoin_at
    ) values (
      v_rundown_id,
      (v_draft->>'local_opportunity_id')::uuid,
      (v_draft->>'position')::integer,
      v_draft->>'label',
      (v_draft->>'requirement')::public.log_opportunity_requirement,
      (select coalesce(array_agg(x), '{}'::text[]) from jsonb_array_elements_text(v_draft->'permitted_content_types') as x),
      (v_draft->>'scheduled_at')::timestamptz,
      (v_draft->>'available_duration_seconds')::integer,
      (v_draft->>'network_rejoin_at')::timestamptz
    )
    on conflict on constraint log_rundown_breaks_unique_occurrence do nothing;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'rundown_id', v_rundown_id,
    'already_existed', false,
    'breaks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'break_id', b.id,
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

comment on function public.log_generate_rundown_for_underwriting(uuid, uuid, uuid, date, timestamptz, timestamptz, jsonb) is
  'Inserts the same rundown + breaks shape generateRundown() itself inserts, idempotent on log_rundowns'' own (program_id, air_date) unique constraint, and returns the resulting breaks (new or pre-existing) so the caller can plan against them immediately without a second read. Break drafts arrive precomputed (buildRundownBreakDrafts(), called by lib/underwriting/rundown-provisioning.ts) — this function never decides what a rundown should contain, only writes it past RLS for an underwriting-only caller. No allow_multiple column to write anymore.';

revoke execute on function public.log_generate_rundown_for_underwriting(uuid, uuid, uuid, date, timestamptz, timestamptz, jsonb) from public, anon;
grant execute on function public.log_generate_rundown_for_underwriting(uuid, uuid, uuid, date, timestamptz, timestamptz, jsonb) to authenticated;
