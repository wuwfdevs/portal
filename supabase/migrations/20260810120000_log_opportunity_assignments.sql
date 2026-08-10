-- Log: generalizes legal-ID auto-placement into a reusable mechanism —
-- pinning a specific content-library item to a specific local opportunity,
-- so generation places it automatically the same way legal ID already was,
-- instead of a host having to remember to fill it by hand every day. Two
-- real, unused-until-now content items already exist in the library for
-- exactly this (Unearthing Florida, BirdNote — see supabase/seed.sql), and
-- CLAUDE.md's own dated notes ("Airs Fridays during the second Morning
-- Edition hour", "Airs daily during the second Morning Edition hour") were
-- never anything more than a text hint nothing enforced.
--
-- This also fixes two real bugs found by comparing preview data against
-- what the app claimed: (1) every rundown Underwriting's auto-fill
-- provisioning generates (lib/underwriting/rundown-provisioning.ts →
-- log_generate_rundown_for_underwriting()) never got a legal ID at all,
-- because placeLegalIdIfApplicable only ever lived in the Log route's own
-- rundown-actions.ts, never ported into the shared provisioning path — 0 of
-- 75 Morning Edition rundowns in preview had one; (2) even on the path that
-- did call it, selectLegalIdBreakDraftsPerHour guessed "whichever marked
-- opportunity has the latest network_rejoin_at is the trailing pre-Billboard
-- slot" — but Morning Edition's real top-of-hour Music Bed/Silence slots
-- were never marked as opportunities at all, so the heuristic would have
-- targeted the ~49:35 story window instead (whose permitted_content_types
-- doesn't even include legal_id), ignoring the purpose-built `required`
-- 42:30 opportunity that already exists for exactly this. See CLAUDE.md's
-- dated note for the full account.
--
-- Both callers now place content the same explicit way: a producer decides
-- what airs where, generation just executes it — no more guessing "last
-- opportunity of the hour" for anything, legal ID included.

create table public.log_opportunity_assignments (
  id uuid primary key default gen_random_uuid(),
  local_opportunity_id uuid not null references public.log_local_opportunities (id) on delete cascade,
  content_item_id uuid not null references public.log_content_items (id) on delete cascade,
  -- null: applies to every hourly repetition of this opportunity across a
  -- multi-hour shift (legal ID's own case — every hour, every day). A
  -- specific value restricts it to just that repetition (0-based, matching
  -- lib/log/rundown-generation.ts's RundownBreakDraft.hour_index) — e.g.
  -- Unearthing Florida airing only "during the second Morning Edition hour"
  -- is hour_index = 1, not every hour Morning Edition's clock repeats.
  hour_index integer,
  -- 0=Sunday..6=Saturday, matching log_schedule.days_of_week's own
  -- convention exactly (lib/log/schedule.ts's isScheduleEntryActiveOn):
  -- empty means every day. Non-empty restricts it — e.g. Unearthing
  -- Florida's real "Airs Fridays" note becomes days_of_week = {5}.
  days_of_week integer[] not null default '{}'::integer[],
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint log_opportunity_assignments_hour_index_check check (hour_index is null or hour_index >= 0)
);

comment on table public.log_opportunity_assignments is
  'WUWF''s own "this always airs here" pin — a specific content-library item assigned to a specific local opportunity, placed automatically at rundown-generation time (see lib/log/opportunity-assignment-placement.ts). Legal-ID auto-placement is now just one instance of this, not a special case: see CLAUDE.md''s dated note. Editable in place (deactivate via active, not deleted), same lifecycle as log_local_opportunities itself.';
comment on column public.log_opportunity_assignments.hour_index is
  'Which repetition of the opportunity within a multi-hour shift this applies to (0-based). Null means every hour the opportunity recurs.';
comment on column public.log_opportunity_assignments.days_of_week is
  '0=Sunday..6=Saturday. Empty means every day a rundown is generated for.';

create index log_opportunity_assignments_opportunity_idx
  on public.log_opportunity_assignments (local_opportunity_id) where active;
create index log_opportunity_assignments_content_item_idx
  on public.log_opportunity_assignments (content_item_id);

create trigger set_log_opportunity_assignments_updated_at
  before update on public.log_opportunity_assignments
  for each row execute function public.set_updated_at();

-- RLS: producer-gated, same shape as log_local_opportunities — this is a
-- WUWF policy decision about what always fills a slot, not ordinary content
-- authorship (which stays open to any tool member).

alter table public.log_opportunity_assignments enable row level security;

grant select, insert, update on public.log_opportunity_assignments to authenticated;

create policy log_opportunity_assignments_select on public.log_opportunity_assignments
  for select to authenticated
  using (private.has_log_access(auth.uid()));

create policy log_opportunity_assignments_insert on public.log_opportunity_assignments
  for insert to authenticated
  with check (private.is_log_producer(auth.uid()));

create policy log_opportunity_assignments_update on public.log_opportunity_assignments
  for update to authenticated
  using (private.is_log_producer(auth.uid()))
  with check (private.is_log_producer(auth.uid()));

-- Widen log_generate_rundown_for_underwriting()'s returned breaks to carry
-- local_opportunity_id — needed so lib/underwriting/rundown-provisioning.ts
-- can match each newly-generated break against log_opportunity_assignments
-- the same way rundown-actions.ts already can from its own insert's
-- .select("id, local_opportunity_id, scheduled_at"). Everything else about
-- this function is unchanged from the previous revision.

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

comment on function public.log_generate_rundown_for_underwriting(uuid, uuid, uuid, date, timestamptz, timestamptz, jsonb) is
  'Inserts the same rundown + breaks shape generateRundown() itself inserts, idempotent on log_rundowns'' own (program_id, air_date) unique constraint, and returns the resulting breaks (new or pre-existing, now including local_opportunity_id) so the caller can plan against them immediately and match them against log_opportunity_assignments without a second read. Break drafts arrive precomputed (buildRundownBreakDrafts(), called by lib/underwriting/rundown-provisioning.ts) — this function never decides what a rundown should contain, only writes it past RLS for an underwriting-only caller.';

revoke execute on function public.log_generate_rundown_for_underwriting(uuid, uuid, uuid, date, timestamptz, timestamptz, jsonb) from public, anon;
grant execute on function public.log_generate_rundown_for_underwriting(uuid, uuid, uuid, date, timestamptz, timestamptz, jsonb) to authenticated;

-- One-time conditional backfill, not ongoing magic: if this environment
-- already has both a canonical approved legal_id content item and a
-- `required` local opportunity that permits legal_id (Morning Edition's own
-- 42:30 window, seeded in 20260809180000), wire them together explicitly so
-- the behavior CLAUDE.md has documented since generation first shipped
-- doesn't regress the moment this migration removes the old heuristic.
-- Skipped harmlessly wherever either piece doesn't exist yet (e.g.
-- production, which has no approved legal_id item — same "not configured"
-- treatment this repo gives every other optional integration).
do $$
declare
  v_legal_id_item uuid;
  v_opportunity record;
begin
  select id into v_legal_id_item
  from public.log_content_items
  where content_type = 'legal_id' and approval_status = 'approved'
  order by created_at desc
  limit 1;

  if v_legal_id_item is null then
    return;
  end if;

  for v_opportunity in
    select id from public.log_local_opportunities
    where active
      and requirement = 'required'
      and 'legal_id' = any(permitted_content_types)
  loop
    insert into public.log_opportunity_assignments (local_opportunity_id, content_item_id, notes)
    values (v_opportunity.id, v_legal_id_item, 'Backfilled by 20260810120000 — replaces the old per-hour "latest opportunity" heuristic.')
    on conflict do nothing;
  end loop;
end $$;
