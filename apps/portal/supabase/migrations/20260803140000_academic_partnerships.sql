-- Academic Partnerships: the sixth tool on the portal foundation. A public
-- inquiry form for the WUWF Applied Media Partnership Program, feeding a
-- staff-run pipeline from New through Active to Completed.
--
-- See docs/academic-partnerships-design.md for the product and architecture
-- rationale. The short version of what looks different from other tools here:
--
--   1. This tool HAS a public write surface, like Audience Listening, but a
--      much narrower one: one submission, one request, no session, no
--      multi-step flow, and no row is ever read back by the public. So it
--      does not need Audience Listening's whole "seven security-definer
--      functions plus a dedicated non-cookie client" architecture — a plain
--      Server Action calling the ordinary cookie-based client is enough,
--      because there is no later request that needs to recover an earlier
--      session from a cookie. What IS kept from that tool: ap_submissions
--      table RLS stays staff-only, full stop, and the public surface is
--      exactly two enumerable security-definer functions at the bottom of
--      this file.
--
--   2. audit_events is select-restricted to administrators only
--      (audit_events_select_admin_only, 20260722120001_rls_policies.sql) —
--      it is not a per-entity history any tool member can read. So this
--      tool keeps its own staff-visible timeline, ap_submission_events,
--      while also calling logAuditEvent() for the same key actions per
--      CLAUDE.md's audit convention. The two are complementary: one is the
--      domain timeline a reviewer reads on the submission screen, the other
--      is the cross-tool ledger an administrator reads.
--
--   3. stage and disposition are separate columns, not one status enum.
--      Deferred/Declined/Withdrawn/Archived are dispositions that take a
--      submission out of the active kanban board without erasing which
--      pipeline stage it had reached — the same shape as ep_pitches'
--      archived_at/archived_reason/archived_by, renamed to the brief's own
--      vocabulary and widened to four values.
--
-- Tables are prefixed ap_ per CLAUDE.md's directory conventions.

create type public.ap_partnership_type as enum (
  'classroom_visit',
  'station_immersion',
  'applied_project',
  'internship_practicum',
  'faculty_research',
  'other'
);

create type public.ap_stage as enum (
  'new',
  'reviewing',
  'meeting_requested',
  'scoping',
  'approved',
  'active',
  'completed'
);

create type public.ap_disposition as enum ('deferred', 'declined', 'withdrawn', 'archived');
create type public.ap_fit as enum ('strong', 'possible', 'weak');
create type public.ap_capacity as enum ('available', 'uncertain', 'unavailable');
create type public.ap_timing as enum ('feasible', 'requires_adjustment', 'not_feasible');

create type public.ap_event_type as enum (
  'received',
  'owner_changed',
  'stage_changed',
  'note',
  'email_action',
  'appointment_shared',
  'disposition_changed',
  'assessment_updated',
  'next_action_updated',
  'completed'
);

-- Settings ------------------------------------------------------------------
-- Singleton (id always true), same trick ep_settings uses. One public form
-- configuration for the whole program.

create table public.ap_settings (
  id boolean primary key default true check (id),
  is_open boolean not null default false,
  intro_copy text not null default
    'Tell us about the partnership you have in mind. A WUWF staff member will review your inquiry and follow up by email — submitting this form does not guarantee a partnership, publication, distribution, or news coverage.',
  confirmation_copy text not null default
    'Thank you. WUWF will review your inquiry and follow up by email. Submitting this form does not guarantee a partnership, publication, distribution, or news coverage.',
  enabled_partnership_types public.ap_partnership_type[] not null default array[
    'classroom_visit', 'station_immersion', 'applied_project',
    'internship_practicum', 'faculty_research', 'other'
  ]::public.ap_partnership_type[],
  google_appointments_url text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

comment on table public.ap_settings is
  'Singleton (id always true). Controls the public form at /partner: open/closed, copy, which of the six partnership types are currently offered, and the Google Appointments URL used by the Invite to Meet email.';

insert into public.ap_settings (id) values (true) on conflict (id) do nothing;

-- Email templates -------------------------------------------------------------
-- Seven fixed keys the brief asks for. Plain text with {{placeholder}} tokens,
-- interpolated in lib/academic-partnerships/email.ts — never sent by this
-- repository (there is no transactional email sender here), only drafted for
-- a mailto: link or copy-to-clipboard. See design doc §3 "Email".

create table public.ap_email_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key in (
    'meeting_invite', 'request_info', 'narrower_scope', 'defer', 'decline', 'approve', 'follow_up'
  )),
  label text not null,
  subject text not null,
  body text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

insert into public.ap_email_templates (key, label, subject, body) values
  ('meeting_invite', 'Invite to meet',
   'Following up on your WUWF partnership inquiry',
   E'Hi {{faculty_name}},\n\nThanks for reaching out about a partnership with WUWF. We''d like to set up a short call to talk through what you have in mind.\n\nYou can pick a time here: {{appointments_url}}\n\n{{staff_context}}\n\nLooking forward to it,\nWUWF'),
  ('request_info', 'Request more information',
   'A quick question about your WUWF partnership inquiry',
   E'Hi {{faculty_name}},\n\nThanks for your inquiry about a partnership with WUWF. Before we go further, could you tell us more?\n\n{{staff_context}}\n\nThanks,\nWUWF'),
  ('narrower_scope', 'Propose a narrower or different scope',
   'A thought on your WUWF partnership inquiry',
   E'Hi {{faculty_name}},\n\nThanks for your inquiry about a partnership with WUWF. We think this could work well in a narrower or somewhat different form than originally proposed.\n\n{{staff_context}}\n\nLet us know what you think,\nWUWF'),
  ('defer', 'Defer the request',
   'Your WUWF partnership inquiry',
   E'Hi {{faculty_name}},\n\nThanks for your inquiry about a partnership with WUWF. We are not able to take this on right now, but we would like to revisit it later.\n\n{{staff_context}}\n\nThanks for your patience,\nWUWF'),
  ('decline', 'Decline the request',
   'Your WUWF partnership inquiry',
   E'Hi {{faculty_name}},\n\nThanks for your inquiry about a partnership with WUWF. We are not able to move forward with this at this time.\n\n{{staff_context}}\n\nThank you for thinking of WUWF,\nWUWF'),
  ('approve', 'Approve the partnership',
   'Your WUWF partnership is approved',
   E'Hi {{faculty_name}},\n\nGood news — we''d like to move forward with this partnership.\n\n{{staff_context}}\n\nWe''ll be in touch about next steps,\nWUWF'),
  ('follow_up', 'Post-engagement follow-up',
   'Following up after our WUWF partnership',
   E'Hi {{faculty_name}},\n\nNow that our partnership has wrapped up, we''d love to hear how it went and whether you''d be interested in working together again.\n\n{{staff_context}}\n\nThanks again,\nWUWF')
on conflict (key) do nothing;

-- Submissions -----------------------------------------------------------------
-- One row per faculty inquiry. Public fields are written once, by
-- ap_submit_inquiry() below, and never again. Internal fields are written
-- only by staff, through the portal's ordinary RLS-scoped Server Actions.

create table public.ap_submissions (
  id uuid primary key default gen_random_uuid(),

  -- Public fields ---------------------------------------------------------
  faculty_name text not null,
  email text not null,
  department text not null,
  phone text,
  partnership_type public.ap_partnership_type not null,
  course_title text,
  course_number text,
  timeframe text,
  enrollment_estimate integer,
  learning_objectives text,
  description text not null,
  student_experience text,
  support_requested text,
  deliverables text,
  relevant_dates text,
  may_publish boolean not null default false,
  additional_context text,

  -- Research/expertise path only (partnership_type = 'faculty_research') --
  research_topic text,
  research_summary text,
  research_relevance text,
  research_status text,
  research_links text,
  research_dates text,
  research_availability text,

  -- Internal fields ---------------------------------------------------------
  stage public.ap_stage not null default 'new',
  stage_changed_at timestamptz not null default now(),
  stage_changed_by uuid references public.profiles (id) on delete set null,
  disposition public.ap_disposition,
  disposition_reason text,
  disposition_by uuid references public.profiles (id) on delete set null,
  disposition_at timestamptz,
  owner_id uuid references public.profiles (id) on delete set null,
  fit public.ap_fit,
  capacity public.ap_capacity,
  timing public.ap_timing,
  primary_function text,
  potential_staff_lead text,
  key_considerations text,
  next_action text,
  next_action_date date,

  -- Metadata ----------------------------------------------------------------
  submitted_ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ap_submissions_enrollment_check check (enrollment_estimate is null or enrollment_estimate >= 0),
  -- A reason is required for the three ways a submission closes early, not
  -- for 'archived' — archiving a completed or already-closed record is
  -- housekeeping, not a decision that needs explaining.
  constraint ap_submissions_disposition_reason_check
    check (disposition not in ('deferred', 'declined', 'withdrawn') or disposition_reason is not null)
);

comment on table public.ap_submissions is
  'One faculty inquiry. stage is the pipeline position (preserved even after the submission closes); disposition is a separate, optional field that takes it out of the active kanban board — mirrors ep_pitches'' archived_at/archived_reason/archived_by. Table RLS is staff-only in full; the only public write goes through ap_submit_inquiry() below.';
comment on column public.ap_submissions.disposition is
  'Null while the submission is still active in the pipeline. deferred/declined/withdrawn/archived all take it off the kanban board without losing which stage it had reached.';

create index ap_submissions_stage_idx on public.ap_submissions (stage) where disposition is null;
create index ap_submissions_disposition_idx on public.ap_submissions (disposition);
create index ap_submissions_owner_idx on public.ap_submissions (owner_id);
create index ap_submissions_partnership_type_idx on public.ap_submissions (partnership_type);
create index ap_submissions_department_idx on public.ap_submissions (department);
create index ap_submissions_created_at_idx on public.ap_submissions (created_at desc);
create index ap_submissions_next_action_date_idx on public.ap_submissions (next_action_date)
  where next_action_date is not null;

-- Activity log ------------------------------------------------------------------
-- Staff-visible chronological history for one submission. actor_id is
-- nullable: the one event with a null actor is 'received', inserted by
-- ap_submit_inquiry() itself (a security-definer function, so it bypasses
-- RLS the way al_start_submission() does — no grant needs to admit the
-- public to this table at all).

create table public.ap_submission_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.ap_submissions (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  event_type public.ap_event_type not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.ap_submission_events is
  'Append-only, chronological, per-submission activity log. actor_id is null only for the "received" event that ap_submit_inquiry() writes on behalf of the public submitter. Distinct from audit_events (portal-wide, administrator-only reading) — see design doc §4.';

create index ap_submission_events_submission_idx
  on public.ap_submission_events (submission_id, created_at);

-- updated_at maintenance ----------------------------------------------------

create trigger set_ap_settings_updated_at
  before update on public.ap_settings
  for each row execute function public.set_updated_at();

create trigger set_ap_email_templates_updated_at
  before update on public.ap_email_templates
  for each row execute function public.set_updated_at();

create trigger set_ap_submissions_updated_at
  before update on public.ap_submissions
  for each row execute function public.set_updated_at();

-- Stamps stage_changed_at/stage_changed_by whenever stage actually changes,
-- regardless of which code path changed it — the same reasoning as
-- set_updated_at(), scoped to one column. updated_by isn't available inside a
-- trigger (no auth context beyond auth.uid()), so this uses auth.uid()
-- directly rather than trusting a client-supplied actor.
create function public.ap_stamp_stage_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at = now();
    new.stage_changed_by = auth.uid();
  end if;
  return new;
end;
$$;

create trigger ap_submissions_stamp_stage_change
  before update on public.ap_submissions
  for each row execute function public.ap_stamp_stage_change();

-- Authorization helpers ---------------------------------------------------------
-- In `private`, never `public` — see 20260724120000_private_authz_functions.sql.

create function private.has_academic_partnerships_access(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tool_access ta
    join public.tools t on t.id = ta.tool_id
    join public.profiles p on p.id = uid
    where ta.user_id = uid
      and t.key = 'academic-partnerships'
      and ta.revoked_at is null
      and p.account_status = 'active'
  );
$$;

-- The elevation within the tool: a grant carrying tool_role = 'coordinator',
-- the same shape as private.is_roadmap_curator(). Gates Settings' write
-- actions, per the brief's "configuration and form settings should be limited
-- to appropriate administrators" — this tool's own vocabulary for that,
-- consistent with tool_access.tool_role being free text interpreted per-tool.
create function private.is_academic_partnerships_coordinator(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tool_access ta
    join public.tools t on t.id = ta.tool_id
    join public.profiles p on p.id = uid
    where ta.user_id = uid
      and t.key = 'academic-partnerships'
      and ta.revoked_at is null
      and ta.tool_role = 'coordinator'
      and p.account_status = 'active'
  ) or private.is_administrator(uid);
$$;

revoke execute on function private.has_academic_partnerships_access(uuid) from public, anon;
revoke execute on function private.is_academic_partnerships_coordinator(uuid) from public, anon;
grant execute on function private.has_academic_partnerships_access(uuid) to authenticated;
grant execute on function private.is_academic_partnerships_coordinator(uuid) to authenticated;

-- Row Level Security ------------------------------------------------------------
-- Staff-only on every table, without exception, exactly like Audience
-- Listening's al_* tables. Participants reach none of these rows directly —
-- see the two public functions at the bottom of this file.

alter table public.ap_settings enable row level security;
alter table public.ap_email_templates enable row level security;
alter table public.ap_submissions enable row level security;
alter table public.ap_submission_events enable row level security;

grant select on public.ap_settings to authenticated;
grant update on public.ap_settings to authenticated;
grant select on public.ap_email_templates to authenticated;
grant update on public.ap_email_templates to authenticated;
-- No insert grant: ap_submissions is written only by ap_submit_inquiry() for
-- the public fields; staff never create a submission by hand.
grant select, update on public.ap_submissions to authenticated;
grant select, insert on public.ap_submission_events to authenticated;

create policy ap_settings_select on public.ap_settings
  for select to authenticated
  using (private.has_academic_partnerships_access(auth.uid()));

create policy ap_settings_update on public.ap_settings
  for update to authenticated
  using (private.is_academic_partnerships_coordinator(auth.uid()))
  with check (private.is_academic_partnerships_coordinator(auth.uid()));

create policy ap_email_templates_select on public.ap_email_templates
  for select to authenticated
  using (private.has_academic_partnerships_access(auth.uid()));

create policy ap_email_templates_update on public.ap_email_templates
  for update to authenticated
  using (private.is_academic_partnerships_coordinator(auth.uid()))
  with check (private.is_academic_partnerships_coordinator(auth.uid()));

create policy ap_submissions_select on public.ap_submissions
  for select to authenticated
  using (private.has_academic_partnerships_access(auth.uid()));

create policy ap_submissions_update on public.ap_submissions
  for update to authenticated
  using (private.has_academic_partnerships_access(auth.uid()))
  with check (private.has_academic_partnerships_access(auth.uid()));

create policy ap_submission_events_select on public.ap_submission_events
  for select to authenticated
  using (private.has_academic_partnerships_access(auth.uid()));

create policy ap_submission_events_insert on public.ap_submission_events
  for insert to authenticated
  with check (private.has_academic_partnerships_access(auth.uid()) and actor_id = auth.uid());

-- audit_events: without this, every logAuditEvent() call from this tool would
-- fail RLS (the existing policies admit only administrators, Editorial
-- Planning editors, and Audience Listening members) and be swallowed by that
-- helper's console.error. Same shape as audit_events_insert_audience_listening.
create policy audit_events_insert_academic_partnerships on public.audit_events
  for insert to authenticated
  with check (private.has_academic_partnerships_access(auth.uid()) and actor_id = auth.uid());

-- The public inquiry form ------------------------------------------------------
-- Exactly two security-definer functions. This IS the public API of this
-- tool. Unlike Audience Listening, there is no participant identity and no
-- later request that needs to recover an earlier session — see design doc §3
-- for why that lets this stay this small.

-- Read: the public view of settings. anon and authenticated may call it; it
-- only reads, and it never returns anything but what /partner needs to render.
create function public.ap_public_form_config()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'is_open', s.is_open,
    'intro_copy', s.intro_copy,
    'enabled_partnership_types', s.enabled_partnership_types
  )
  from public.ap_settings s
  where s.id = true;
$$;

comment on function public.ap_public_form_config() is
  'The only part of this tool readable without a session. Never returns confirmation_copy (sent back inline by ap_submit_inquiry on success instead, so a probe of this function alone cannot see it) or the appointments URL.';

-- Write: validate and insert one inquiry, plus its "received" activity event,
-- in one transaction. p_payload carries every public field by name; internal
-- fields are never accepted from the client — the function sets stage='new'
-- and leaves every other internal column at its default. Returns the new
-- submission's confirmation copy, or an error code the form maps to a
-- sentence; never a submission id or anything else a public caller could
-- later use to look the row up (there is no faculty-facing status by design).
create function public.ap_submit_inquiry(p_payload jsonb, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.ap_settings;
  v_type public.ap_partnership_type;
  v_email text;
  v_enrollment integer;
  v_recent_by_email integer;
  v_recent_by_ip integer;
  v_new_id uuid;
begin
  select * into v_settings from public.ap_settings where id = true;
  if v_settings.is_open is not true then
    return jsonb_build_object('error', 'closed');
  end if;

  begin
    v_type := (p_payload->>'partnership_type')::public.ap_partnership_type;
  exception when invalid_text_representation then
    return jsonb_build_object('error', 'invalid_partnership_type');
  end;
  if not (v_type = any (v_settings.enabled_partnership_types)) then
    return jsonb_build_object('error', 'invalid_partnership_type');
  end if;

  v_email := trim(p_payload->>'email');
  if v_email is null or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return jsonb_build_object('error', 'invalid_email');
  end if;

  if coalesce(trim(p_payload->>'faculty_name'), '') = ''
     or coalesce(trim(p_payload->>'department'), '') = ''
     or coalesce(trim(p_payload->>'description'), '') = ''
  then
    return jsonb_build_object('error', 'missing_required_field');
  end if;

  if v_type = 'faculty_research' and (
    coalesce(trim(p_payload->>'research_topic'), '') = ''
    or coalesce(trim(p_payload->>'research_summary'), '') = ''
  ) then
    return jsonb_build_object('error', 'missing_required_field');
  end if;

  begin
    v_enrollment := nullif(trim(p_payload->>'enrollment_estimate'), '')::integer;
  exception when invalid_text_representation then
    return jsonb_build_object('error', 'invalid_enrollment_estimate');
  end;

  -- Bounded per submitter, in the same transaction as the write — the same
  -- shape as al_start_submission's "one participant, one query, three tries",
  -- adapted to having no participant identity: email and a salted IP hash
  -- (computed by the caller, from x-forwarded-for, never the raw IP) are the
  -- two things available. See design doc §3 "Abuse protection".
  select count(*) into v_recent_by_email
  from public.ap_submissions
  where email = v_email and created_at > now() - interval '24 hours';
  if v_recent_by_email >= 3 then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  if p_ip_hash is not null then
    select count(*) into v_recent_by_ip
    from public.ap_submissions
    where submitted_ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
    if v_recent_by_ip >= 5 then
      return jsonb_build_object('error', 'rate_limited');
    end if;
  end if;

  insert into public.ap_submissions (
    faculty_name, email, department, phone, partnership_type,
    course_title, course_number, timeframe, enrollment_estimate,
    learning_objectives, description, student_experience, support_requested,
    deliverables, relevant_dates, may_publish, additional_context,
    research_topic, research_summary, research_relevance, research_status,
    research_links, research_dates, research_availability,
    submitted_ip_hash
  ) values (
    trim(p_payload->>'faculty_name'), v_email, trim(p_payload->>'department'),
    nullif(trim(p_payload->>'phone'), ''), v_type,
    nullif(trim(p_payload->>'course_title'), ''), nullif(trim(p_payload->>'course_number'), ''),
    nullif(trim(p_payload->>'timeframe'), ''),
    v_enrollment,
    nullif(trim(p_payload->>'learning_objectives'), ''), trim(p_payload->>'description'),
    nullif(trim(p_payload->>'student_experience'), ''), nullif(trim(p_payload->>'support_requested'), ''),
    nullif(trim(p_payload->>'deliverables'), ''), nullif(trim(p_payload->>'relevant_dates'), ''),
    coalesce((p_payload->>'may_publish')::boolean, false), nullif(trim(p_payload->>'additional_context'), ''),
    nullif(trim(p_payload->>'research_topic'), ''), nullif(trim(p_payload->>'research_summary'), ''),
    nullif(trim(p_payload->>'research_relevance'), ''), nullif(trim(p_payload->>'research_status'), ''),
    nullif(trim(p_payload->>'research_links'), ''), nullif(trim(p_payload->>'research_dates'), ''),
    nullif(trim(p_payload->>'research_availability'), ''),
    p_ip_hash
  )
  returning id into v_new_id;

  insert into public.ap_submission_events (submission_id, actor_id, event_type, note)
  values (v_new_id, null, 'received', 'Submitted through the public inquiry form.');

  return jsonb_build_object('ok', true, 'confirmation_copy', v_settings.confirmation_copy);
end;
$$;

comment on function public.ap_submit_inquiry(jsonb, text) is
  'The only way a row is ever written to ap_submissions from outside the portal. Validates required fields, the enabled-type list, email shape, and per-submitter rate limits inside this one transaction, then inserts the submission and its "received" activity event together. Every internal field is left at its default; the client cannot set stage, owner, or any assessment field.';

revoke execute on function public.ap_public_form_config() from public;
revoke execute on function public.ap_submit_inquiry(jsonb, text) from public;
grant execute on function public.ap_public_form_config() to anon, authenticated;
grant execute on function public.ap_submit_inquiry(jsonb, text) to anon, authenticated;

-- Registry row ------------------------------------------------------------------
-- Upsert rather than update, per the audience-listening/remote-interview
-- lesson: a bare update silently no-ops on a project whose seed never ran.

insert into public.tools (key, name, description, route, status, enabled, default_access, sort_order)
values (
  'academic-partnerships',
  'Academic Partnerships',
  'Faculty inquiries for the WUWF Applied Media Partnership Program, from submission through active partnership.',
  '/academic-partnerships',
  'available',
  true,
  'invite_only',
  6
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  route = excluded.route,
  status = excluded.status,
  enabled = excluded.enabled;
