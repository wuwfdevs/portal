-- Fixes a real regression 20260810130000_log_opportunity_assignment_
-- placement_boundary.sql introduced into log_get_program_schedule_context():
-- it based its widened copy of the function on
-- 20260809150000_underwriting_rundown_provisioning.sql's original
-- local_opportunities query (o.position/o.label/o.timing_mode/o.start_
-- offset_seconds/o.duration_seconds/o.earliest_/latest_start_offset_
-- seconds/o.allow_multiple, read straight off log_local_opportunities),
-- without noticing that 20260809170000_log_local_opportunities_slot_
-- based.sql had already replaced that exact query with a join to
-- log_clock_slots (slot_position/slot_label/timing_mode/offsets all read
-- from cs.*, since those columns no longer exist on log_local_opportunities
-- at all — see that migration's own comment on this function). The result:
-- every call to this function since 20260810130000 landed errored outright
-- ("column o.position does not exist"), caught immediately while manually
-- verifying the opportunity-assignments feature end to end against preview,
-- before it reached production. This migration restores the slot-joined
-- query exactly as 20260809170000 defined it, keeping 20260810130000's own
-- additions (opportunity_assignments, content_items) alongside it.

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

comment on function public.log_get_program_schedule_context(uuid) is
  'Everything lib/underwriting/rundown-provisioning.ts needs to decide which of a schedule line''s remaining campaign dates already have a rundown, resolve the active schedule entry/clock version/local opportunities itself using Log''s own pure generation logic, and plan assigned-content placement (planAssignedContentPlacements) into whatever it generates. Local opportunities are slot-keyed — their offset/duration/label/timing come from a join to log_clock_slots, not their own columns. Security definer: has_log_access-gated tables, called by an underwriting-only session.';

revoke execute on function public.log_get_program_schedule_context(uuid) from public, anon;
grant execute on function public.log_get_program_schedule_context(uuid) to authenticated;
