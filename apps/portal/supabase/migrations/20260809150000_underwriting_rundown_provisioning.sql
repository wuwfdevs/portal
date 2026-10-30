-- Lets Underwriting's auto-fill scheduler provision the Log rundowns it
-- needs, instead of only ever filling into ones a Log producer already
-- happened to build by hand. Without this, a 26-week campaign genuinely
-- couldn't get ahead of itself: auto-fill could never place more than
-- whatever few days a host had already generated a rundown for.
--
-- Same two-way-boundary shape as every other Underwriting/Log crossing in
-- this tool's own migrations (log_place_underwriting_credit,
-- log_list_placeable_rundown_breaks) — narrow, additive, security definer,
-- owned here since Underwriting is the caller with no RLS access to Log's
-- own tables at all. Nothing about "what a rundown should contain" is
-- reimplemented in SQL: that logic (resolving the active clock version,
-- expanding local opportunities across every hour of a shift) stays
-- exactly where it already lives — lib/log/rundown-generation.ts's
-- buildRundownBreakDrafts(), lib/log/clock-versions.ts's
-- resolveCurrentVersion(), lib/log/schedule.ts's isScheduleEntryActiveOn()
-- — all pure, dependency-free TypeScript this monolith's own Underwriting
-- code calls directly (lib/underwriting/rundown-provisioning.ts). These two
-- functions only cross the RLS boundary: one reads what Underwriting needs
-- to run that logic itself, the other writes what it computed.
--
-- log_get_program_schedule_context(program_id) — every log_schedule entry,
-- log_clock_versions row, and active log_local_opportunities row reachable
-- from that program, plus every air_date this program already has a
-- rundown for (so a repeat auto-fill run doesn't re-attempt generation for
-- days it already provisioned). All four of those tables are
-- has_log_access-gated — an underwriting-only caller has no read access
-- otherwise.
--
-- log_generate_rundown_for_underwriting(...) — inserts exactly what
-- generateRundown() (src/app/(portal)/log/rundown-actions.ts) itself
-- inserts, idempotent on the same (program_id, air_date) unique constraint,
-- upserting breaks against the same (rundown_id, local_opportunity_id,
-- scheduled_at) constraint generateRundown()'s own upsert already relies
-- on. Break drafts arrive precomputed as a jsonb array — the caller ran
-- buildRundownBreakDrafts() itself — so this function is a thin,
-- structurally-validated insert, not a second generation implementation.

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
  'Everything lib/underwriting/rundown-provisioning.ts needs to decide which of a schedule line''s remaining campaign dates already have a rundown and, for the rest, resolve the active schedule entry/clock version/local opportunities itself using Log''s own pure generation logic. Security definer: has_log_access-gated tables, called by an underwriting-only session.';

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
    return jsonb_build_object('ok', true, 'rundown_id', v_existing_id, 'already_existed', true);
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
      rundown_id, local_opportunity_id, position, label, requirement, permitted_content_types, allow_multiple,
      scheduled_at, available_duration_seconds, network_rejoin_at
    ) values (
      v_rundown_id,
      (v_draft->>'local_opportunity_id')::uuid,
      (v_draft->>'position')::integer,
      v_draft->>'label',
      (v_draft->>'requirement')::public.log_opportunity_requirement,
      (select coalesce(array_agg(x), '{}'::text[]) from jsonb_array_elements_text(v_draft->'permitted_content_types') as x),
      (v_draft->>'allow_multiple')::boolean,
      (v_draft->>'scheduled_at')::timestamptz,
      (v_draft->>'available_duration_seconds')::integer,
      (v_draft->>'network_rejoin_at')::timestamptz
    )
    -- Same guard generateRundown()'s own upsert relies on
    -- (20260808220000_log_rundown_breaks_dedup_and_unique.sql) — belt and
    -- suspenders against a concurrent double-submit, not expected to ever
    -- actually conflict here since v_rundown_id is freshly inserted above.
    on conflict on constraint log_rundown_breaks_unique_occurrence do nothing;
  end loop;

  return jsonb_build_object('ok', true, 'rundown_id', v_rundown_id, 'already_existed', false);
end;
$$;

comment on function public.log_generate_rundown_for_underwriting(uuid, uuid, uuid, date, timestamptz, timestamptz, jsonb) is
  'Inserts the same rundown + breaks shape generateRundown() itself inserts, idempotent on log_rundowns'' own (program_id, air_date) unique constraint. Break drafts arrive precomputed (buildRundownBreakDrafts(), called by lib/underwriting/rundown-provisioning.ts) — this function never decides what a rundown should contain, only writes it past RLS for an underwriting-only caller.';

revoke execute on function public.log_generate_rundown_for_underwriting(uuid, uuid, uuid, date, timestamptz, timestamptz, jsonb) from public, anon;
grant execute on function public.log_generate_rundown_for_underwriting(uuid, uuid, uuid, date, timestamptz, timestamptz, jsonb) to authenticated;
