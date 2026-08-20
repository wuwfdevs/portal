-- Editorial Inquiry: grounded-reasoning revision. Read
-- docs/editorial-inquiry-design.md before touching any of this — it records
-- the full rationale; this migration just makes the schema match. In short:
-- Editorial Inquiry now draws WUWF's guiding questions and editorial criteria
-- from Editorial Planning (ep_pillars/ep_criteria/ep_rubric_profiles) instead
-- of an independently typed seed question, replaces the old boolean
-- "assumption flag" with a ten-reason diagnosis, adds evidentiary status to
-- context notes, and widens the discuss thread's action vocabulary from
-- reframe/sibling/context to branch/drilldown/context/reframe/diagnosis/
-- assessment. Verified directly against both projects before writing this:
-- ei_inquiries/ei_questions/ei_context_notes/ei_chat_messages are all empty
-- in preview and production, so every column change below goes straight to
-- its final shape — no backfill step, no two-phase nullable-then-not-null.

-- ei_inquiries: pillar-linked, not free-typed --------------------------------

alter table public.ei_inquiries
  add column pillar_id uuid references public.ep_pillars (id) on delete set null,
  add column pillar_name_snapshot text,
  add column guiding_question_text text;

alter table public.ei_inquiries
  alter column pillar_name_snapshot set not null,
  alter column guiding_question_text set not null;

alter table public.ei_inquiries drop column seed_question;

comment on table public.ei_inquiries is
  'One inquiry, associated with a WUWF guiding question — a pillar''s ep_pillars.guiding_question, never independently typed. pillar_name_snapshot/guiding_question_text snapshot the pillar at creation time so a later edit in Editorial Planning cannot retroactively change what an inquiry has been reasoning about. See docs/editorial-inquiry-design.md §2, §9.';

comment on column public.ei_inquiries.pillar_id is
  'On delete set null rather than cascade: a pillar being retired/deleted in Editorial Planning must not take a reporter''s inquiry history with it. The snapshot columns keep the inquiry meaningful even if this goes null.';

-- ei_questions: diagnosis replaces the old assumption flag; depth no longer
-- gates reject/promote -------------------------------------------------------

alter table public.ei_questions
  drop constraint ei_questions_promote_depth_check,
  drop constraint ei_questions_reject_depth_check;

-- Neither status can ever apply to the root (depth 0) — that's the only
-- structural rule left. Whether a question is *ready* to be promoted, at any
-- depth, is now an editorial judgment (the model's Evaluate output, and
-- ultimately the reporter's), not a mechanical depth gate. See design doc §5, §8.
alter table public.ei_questions
  add constraint ei_questions_status_depth_check check (status = 'active' or depth >= 1);

alter table public.ei_questions
  add column diagnosis_kind text,
  add column diagnosis_note text;

alter table public.ei_questions
  add constraint ei_questions_diagnosis_kind_check check (diagnosis_kind is null or diagnosis_kind in (
    'still_thematic', 'too_broad', 'compound_question', 'unverified_premise', 'already_known',
    'unclear_stakes', 'no_uncertainty', 'implausible_reporting_path', 'trivial',
    'descriptive_not_investigative'
  ));

comment on column public.ei_questions.diagnosis_kind is
  'Why this question is not yet a strong story question, in the model''s own diagnosis (design doc §5) — null means undiagnosed, not "fine." unverified_premise is the direct successor of the old has_assumption flag.';

alter table public.ei_questions
  drop column has_assumption,
  drop column assumption_text;

-- ei_context_notes: evidentiary status, so a hunch can never silently read as
-- an established fact three branches downstream (design doc §4) -------------

alter table public.ei_context_notes
  add column evidentiary_status text not null default 'hunch',
  add column source_title text,
  add column source_url text;

alter table public.ei_context_notes
  add constraint ei_context_notes_evidentiary_status_check check (evidentiary_status in (
    'hunch', 'source_claim', 'established_fact', 'web_finding', 'inference', 'open_question'
  ));

comment on column public.ei_context_notes.evidentiary_status is
  'Epistemic weight, orthogonal to kind (which describes form — note/link/excerpt). Defaults to hunch, deliberately the humble default for a bare manually-added assertion. web_finding notes carry source_title/source_url.';

-- ei_chat_messages: citations from web search; wider action vocabulary ------

alter table public.ei_chat_messages
  add column citations jsonb;

comment on column public.ei_chat_messages.citations is
  'url_citation annotations (title+url) from a reply that used the web_search tool. Independent of action_kind — a plain reply can still cite sources.';

alter table public.ei_chat_messages
  drop constraint ei_chat_messages_action_kind_check;

alter table public.ei_chat_messages
  add constraint ei_chat_messages_action_kind_check check (action_kind is null or action_kind in (
    'branch', 'drilldown', 'context', 'reframe', 'diagnosis', 'assessment'
  ));

comment on column public.ei_chat_messages.action_kind is
  'branch/drilldown/context execute immediately (applied_at set at insert). reframe waits for an explicit Apply click. diagnosis/assessment are purely informational (never mutate the tree beyond diagnosis writing onto the acted-on question''s own diagnosis_kind/diagnosis_note) and also get applied_at set immediately, since neither has a pending step. See design doc §7, §9.';

-- Read access to Editorial Planning's guiding questions and criteria --------
-- Narrow, additive select policies — the same "one more policy for a specific
-- cross-tool read" shape as tools_select_proposed_for_roadmap and
-- log_broadcast_events_select_for_underwriting. Nothing about who can WRITE
-- ep_pillars/ep_criteria/ep_rubric_profiles changes; only Editorial Inquiry
-- members gain select access alongside the existing ep_has_access predicate.
-- No new grant needed — grant select ... to authenticated already exists on
-- all three tables from Editorial Planning's own migrations; RLS policies on
-- the same command simply OR together.

create policy ep_pillars_select_for_editorial_inquiry on public.ep_pillars
  for select to authenticated
  using (private.has_editorial_inquiry_access(auth.uid()));

create policy ep_criteria_select_for_editorial_inquiry on public.ep_criteria
  for select to authenticated
  using (private.has_editorial_inquiry_access(auth.uid()));

create policy ep_rubric_profiles_select_for_editorial_inquiry on public.ep_rubric_profiles
  for select to authenticated
  using (private.has_editorial_inquiry_access(auth.uid()));

-- ei_create_inquiry: now pillar-based ----------------------------------------
-- Signature changes (text -> uuid), so the old overload is dropped outright
-- rather than left as a stale, now-meaningless entry point.

drop function if exists public.ei_create_inquiry(text);

create function public.ei_create_inquiry(p_pillar_id uuid)
returns public.ei_inquiries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pillar public.ep_pillars;
  v_inquiry public.ei_inquiries;
begin
  if not private.has_editorial_inquiry_access(auth.uid()) then
    raise exception 'not authorized';
  end if;

  -- security definer, so this reads past ep_pillars' own RLS the same way
  -- every other cross-tool boundary function in this repo does (e.g.
  -- log_get_program_schedule_context) — the caller only needs
  -- has_editorial_inquiry_access, not a separate editorial-planning grant.
  select * into v_pillar from public.ep_pillars where id = p_pillar_id and active;
  if not found then
    raise exception 'that guiding question is not available';
  end if;
  if v_pillar.guiding_question is null or trim(v_pillar.guiding_question) = '' then
    raise exception 'that pillar has no guiding question yet — set one in Editorial Planning first';
  end if;

  insert into public.ei_inquiries (pillar_id, pillar_name_snapshot, guiding_question_text, created_by)
  values (v_pillar.id, v_pillar.name, v_pillar.guiding_question, auth.uid())
  returning * into v_inquiry;

  insert into public.ei_questions (inquiry_id, parent_id, depth, text, created_by)
  values (v_inquiry.id, null, 0, v_inquiry.guiding_question_text, auth.uid());

  return v_inquiry;
end;
$$;

comment on function public.ei_create_inquiry(uuid) is
  'The only way an inquiry is created — inserts the ei_inquiries row (snapshotting the pillar''s name and guiding question) and its depth-0 root ei_questions row together so neither can exist without the other. Requires only has_editorial_inquiry_access, not a separate editorial-planning grant, since it reads ep_pillars as security definer.';

revoke execute on function public.ei_create_inquiry(uuid) from public, anon;
grant execute on function public.ei_create_inquiry(uuid) to authenticated;
