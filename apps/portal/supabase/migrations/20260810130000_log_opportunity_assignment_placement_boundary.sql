-- Completes 20260810120000_log_opportunity_assignments.sql's fix for
-- Underwriting's own auto-fill-provisioned rundowns never getting assigned
-- content (legal ID included) placed: that migration widened
-- log_generate_rundown_for_underwriting()'s return value, but placing
-- anything still needs to read log_opportunity_assignments/log_content_items
-- (both has_log_access-gated — unreachable to an underwriting-only session)
-- and then write into log_rundown_items (also has_log_access-gated for
-- insert). Same two-way boundary shape as every other Log/Underwriting
-- crossing: nothing about *what* to place is decided here — that stays in
-- lib/log/opportunity-assignments.ts's planAssignedContentPlacements(),
-- called directly by both lib/log/opportunity-assignment-placement.ts (the
-- Log-access-session wrapper) and lib/underwriting/rundown-provisioning.ts
-- (fed by this migration's own widened read). Only the read and the write
-- cross the RLS boundary.

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

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'clock_version_id', o.clock_version_id,
    'position', o.position,
    'label', o.label,
    'requirement', o.requirement,
    'timing_mode', o.timing_mode,
    'start_offset_seconds', o.start_offset_seconds,
    'duration_seconds', o.duration_seconds,
    'earliest_start_offset_seconds', o.earliest_start_offset_seconds,
    'latest_start_offset_seconds', o.latest_start_offset_seconds,
    'permitted_content_types', o.permitted_content_types,
    'allow_multiple', o.allow_multiple
  )), '[]'::jsonb)
  into v_local_opportunities
  from public.log_local_opportunities o
  where o.active
    and o.clock_version_id in (
      select v.id from public.log_clock_versions v
      where v.clock_template_id in (select clock_template_id from public.log_schedule where program_id = p_program_id)
    );

  -- Active assignments pinning content to any of this program's own local
  -- opportunities, plus the content items (with components) they
  -- reference — everything lib/log/opportunity-assignments.ts's
  -- planAssignedContentPlacements() needs to decide what a freshly
  -- generated break should get, computed in TS from data read here rather
  -- than reimplemented in SQL (see this migration's own header).
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

comment on function public.log_get_program_schedule_context(uuid) is
  'Everything lib/underwriting/rundown-provisioning.ts needs to decide which of a schedule line''s remaining campaign dates already have a rundown, resolve the active schedule entry/clock version/local opportunities itself using Log''s own pure generation logic, and plan assigned-content placement (planAssignedContentPlacements) into whatever it generates. Security definer: has_log_access-gated tables, called by an underwriting-only session.';

revoke execute on function public.log_get_program_schedule_context(uuid) from public, anon;
grant execute on function public.log_get_program_schedule_context(uuid) to authenticated;

-- The write half: inserts precomputed log_rundown_items rows (already
-- planned in TS by planAssignedContentPlacements) past RLS for an
-- underwriting-only caller. item_kind is hardcoded to 'content' rather than
-- trusted from the jsonb payload — this function's only purpose is placing
-- library content items, nothing else. Silently skips (rather than errors
-- on) any item whose break_id doesn't resolve to a real row, the same
-- best-effort posture placeAssignedContent's own failed-write handling
-- gives this everywhere else.
create or replace function public.log_insert_rundown_items_for_underwriting(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_inserted integer := 0;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;
  if not private.has_underwriting_access(auth.uid()) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.log_rundown_items (
      break_id, position, item_kind, content_item_id, planned_duration_seconds, placement_status
    )
    select
      (v_item->>'break_id')::uuid,
      (v_item->>'position')::integer,
      'content',
      (v_item->>'content_item_id')::uuid,
      (v_item->>'planned_duration_seconds')::integer,
      'replaceable'
    where exists (select 1 from public.log_rundown_breaks where id = (v_item->>'break_id')::uuid);
    if found then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'inserted', v_inserted);
end;
$$;

comment on function public.log_insert_rundown_items_for_underwriting(jsonb) is
  'Writes precomputed log_rundown_items rows past RLS for an underwriting-only caller — the write half of assigned-content placement for auto-fill-provisioned rundowns. What to insert is decided entirely in TS by lib/log/opportunity-assignments.ts''s planAssignedContentPlacements(); this function only crosses the boundary.';

revoke execute on function public.log_insert_rundown_items_for_underwriting(jsonb) from public, anon;
grant execute on function public.log_insert_rundown_items_for_underwriting(jsonb) to authenticated;
