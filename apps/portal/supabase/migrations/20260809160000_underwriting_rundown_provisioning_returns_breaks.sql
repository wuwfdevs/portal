-- Widens log_generate_rundown_for_underwriting() to return the breaks it
-- just inserted, so the caller doesn't need a second round trip to find
-- out what it can place into.
--
-- More importantly, this rides alongside a real correction to *how*
-- lib/underwriting/rundown-provisioning.ts is called
-- (lib/underwriting/auto-fill.ts): the previous shape generated a rundown
-- for a schedule line's *entire* remaining campaign as one blind pre-pass,
-- independent of how many credits would actually get placed this run —
-- two separate computations (how much inventory to create, how much
-- demand to fill) that were expected to just happen to agree, which is
-- exactly the category of bug this feature has already shipped twice this
-- same day (the per-break-vs-per-day mismatch, then the ignored
-- target_time). The fix: auto-fill now plans against whatever inventory
-- already exists first, and only generates exactly as many *additional*
-- days as that plan is still short — one unified computation, not two.
-- That new orchestration needs each newly-generated rundown's own break
-- ids back immediately to fold into its second, final planning pass,
-- rather than re-querying log_list_placeable_rundown_breaks() again.
--
-- See CLAUDE.md's dated note for the full account.

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
  'Inserts the same rundown + breaks shape generateRundown() itself inserts, idempotent on log_rundowns'' own (program_id, air_date) unique constraint, and returns the resulting breaks (new or pre-existing) so the caller can plan against them immediately without a second read. Break drafts arrive precomputed (buildRundownBreakDrafts(), called by lib/underwriting/rundown-provisioning.ts) — this function never decides what a rundown should contain, only writes it past RLS for an underwriting-only caller.';

revoke execute on function public.log_generate_rundown_for_underwriting(uuid, uuid, uuid, date, timestamptz, timestamptz, jsonb) from public, anon;
grant execute on function public.log_generate_rundown_for_underwriting(uuid, uuid, uuid, date, timestamptz, timestamptz, jsonb) to authenticated;
