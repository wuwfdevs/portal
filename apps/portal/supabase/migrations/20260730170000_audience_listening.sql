-- Audience Listening: the fourth tool on the portal foundation. Schema, RLS,
-- the public participation surface, storage, and the registry row.
--
-- See docs/audience-listening-design.md for the product and architecture
-- rationale. Two things in §6 of that document explain most of what looks
-- unusual below, and are worth having in mind while reading:
--
--   1. This tool has a PUBLIC WRITE SURFACE. Everything else in this portal is
--      written by an authenticated staff member whose whole row is safe to hand
--      them, so RLS alone is the boundary. Here the same al_queries row holds
--      the public title a participant must read and the internal notes they must
--      never see, and the same al_submissions row holds a participant's own
--      answers and the newsroom's review state. RLS is row-level; it cannot
--      split a row. Column-level GRANTs can, but they are per-role — and an
--      anonymous participant and a staff reporter are both `authenticated`.
--
--   2. So: al_* table RLS is STAFF-ONLY (every policy requires
--      private.has_audience_listening_access), and the entire public surface is
--      the seven `security definer` functions at the bottom of this file. They
--      are the API. Being an explicit, enumerable list is the point.
--
--      This is the same reasoning that produced ri_bind_guest_participant() and
--      ri_guest_join_waiting_room() in
--      20260729180000_remote_interview_waiting_room.sql ("a plain RLS update
--      policy on a guest's own row would also let them set their own
--      admitted_at"), applied to a whole surface rather than two calls.
--
-- Storage is the one deliberate exception: uploads go directly from the
-- participant's browser to Supabase Storage (never through a Server Action), so
-- the bucket policies do have to admit participants. They are scoped to the
-- object prefix of a submission the caller owns that is still in progress.
--
-- Tables are prefixed al_ per CLAUDE.md's directory conventions, following the
-- tw_* and ri_* precedents.

create type public.al_query_status as enum ('draft', 'open', 'closed', 'archived');
create type public.al_field_mode as enum ('hidden', 'optional', 'required');
create type public.al_transcription_mode as enum ('automatic', 'manual');
create type public.al_submission_status as enum ('in_progress', 'submitted');
create type public.al_review_state as enum ('new', 'reviewed', 'flagged', 'rejected');
create type public.al_answer_status as enum ('pending', 'uploaded', 'failed');
create type public.al_transcription_state as enum ('none', 'queued', 'sent', 'failed');

-- One row per listening initiative. public_id is the only identifier that ever
-- appears in a public URL: 16 characters from a 32-character lowercase alphabet
-- (~80 bits), generated in lib/audience-listening/public-id.ts with
-- crypto.randomBytes, exactly as Remote Interview's join tokens are. Nothing in
-- this schema is sequential, but a uuid still identifies a row across tools —
-- the separate opaque id keeps the public surface from holding any handle on
-- internal identity.
create table public.al_queries (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  internal_title text not null,
  public_title text not null,
  public_intro text not null default '',
  internal_notes text,
  status public.al_query_status not null default 'draft',
  opens_at timestamptz,
  closes_at timestamptz,
  -- Participant information: each field independently hidden/optional/required.
  field_name public.al_field_mode not null default 'optional',
  field_email public.al_field_mode not null default 'optional',
  field_phone public.al_field_mode not null default 'hidden',
  field_city public.al_field_mode not null default 'optional',
  field_note public.al_field_mode not null default 'optional',
  -- Consent and attribution. The three permissions below are deliberately
  -- separate questions and are never collapsed into one "consented" flag —
  -- see the design doc §3E.
  consent_text text not null default
    'Participation is voluntary and you confirm you have the right to submit these recordings. WUWF may review, edit, excerpt, broadcast, publish or otherwise use submitted answers for editorial purposes, and may use one answer without using the others. Submission does not guarantee publication, broadcast, contact or follow-up, and responses will not be published automatically. WUWF may preserve the original recordings for newsroom use. An anonymity preference may not remove identifying details contained in the recording itself.',
  ask_contact_permission boolean not null default true,
  ask_attribution_permission boolean not null default true,
  allow_anonymous_request boolean not null default true,
  transcription_mode public.al_transcription_mode not null default 'manual',
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint al_queries_public_id_format check (public_id ~ '^[a-z0-9]{16}$'),
  constraint al_queries_window_check
    check (opens_at is null or closes_at is null or closes_at > opens_at)
);

comment on table public.al_queries is
  'One public listening initiative. Draft queries are invisible to the public in every sense: al_public_query() reports a draft exactly as it reports a public id that does not exist, so a draft link cannot be probed for existence.';
comment on column public.al_queries.transcription_mode is
  'automatic queues every uploaded answer for transcription at submission; manual leaves them for staff to send individually. "Automatic" is automatic eligibility, not background processing — this repository has no job queue, so the queue is drained by a one-click staff action. See design doc §6.';

create index al_queries_created_by_idx on public.al_queries (created_by);
create index al_queries_status_idx on public.al_queries (status);

-- One to five, ordered. position is a plain integer rewritten on reorder, the
-- same approach the Editorial Planning settings screens use for sort_order — no
-- unique constraint, because a swap under one would need a deferrable
-- constraint or a temporary value for no benefit.
create table public.al_questions (
  id uuid primary key default gen_random_uuid(),
  query_id uuid not null references public.al_queries (id) on delete cascade,
  position integer not null,
  prompt text not null,
  guidance text,
  internal_context text,
  required boolean not null default false,
  max_duration_seconds integer not null default 120,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint al_questions_position_check check (position >= 1),
  constraint al_questions_duration_check check (max_duration_seconds between 15 and 600)
);

create index al_questions_query_position_idx on public.al_questions (query_id, position);

-- One participant's grouped response. participant_user_id is the anonymous
-- Supabase identity established at "Begin" (the same signInAnonymously() path
-- Remote Interview's guests use); it is `on delete set null` so a submission
-- survives its anonymous auth user being cleaned up.
create table public.al_submissions (
  id uuid primary key default gen_random_uuid(),
  query_id uuid not null references public.al_queries (id) on delete cascade,
  participant_user_id uuid references auth.users (id) on delete set null,
  status public.al_submission_status not null default 'in_progress',
  participant_name text,
  participant_email text,
  participant_phone text,
  participant_city text,
  participant_note text,
  consent_contact boolean not null default false,
  consent_identify boolean not null default false,
  request_anonymous boolean not null default false,
  consent_agreed_at timestamptz,
  submitted_at timestamptz,
  review_state public.al_review_state not null default 'new',
  internal_notes text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.al_submissions.consent_agreed_at is
  'Set once, by al_finalize_submission(), against the consent_text in force at that moment. A submission with a null value here was never completed.';

create index al_submissions_query_idx on public.al_submissions (query_id, submitted_at desc);
create index al_submissions_review_idx on public.al_submissions (query_id, review_state);

-- At most one in-progress submission per (query, participant): reopening the
-- page resumes rather than forking, and a scripted client cannot accumulate
-- half-finished rows. See design doc §6, "Abuse protection".
create unique index al_submissions_one_in_progress_idx
  on public.al_submissions (query_id, participant_user_id)
  where status = 'in_progress' and participant_user_id is not null;

-- One recording, for one question, in one submission. The question_* columns
-- are a SNAPSHOT taken by al_reserve_answer() from al_questions itself — the
-- client never supplies them, so it cannot fabricate what it was asked, and a
-- reporter rewording a question after the first responses never makes a
-- historical answer ambiguous (design doc §2, constraint 2).
create table public.al_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.al_submissions (id) on delete cascade,
  query_id uuid not null references public.al_queries (id) on delete cascade,
  question_id uuid references public.al_questions (id) on delete set null,
  question_prompt text not null,
  question_position integer not null,
  question_required boolean not null default false,
  status public.al_answer_status not null default 'pending',
  storage_path text not null,
  content_type text not null,
  size_bytes bigint,
  duration_ms integer,
  review_state public.al_review_state not null default 'new',
  internal_note text,
  transcription_state public.al_transcription_state not null default 'none',
  transcription_project_id uuid references public.tw_projects (id) on delete set null,
  transcription_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, question_id)
);

comment on table public.al_answers is
  'There is no "skipped" status: a skipped question simply has no answer row. "Answered or skipped" is derived by comparing a query''s questions against the answers that exist, which stays correct after a question is reworded.';
comment on column public.al_answers.storage_path is
  'Deliberately extension-less (<query id>/<submission id>/<answer id>). A redo on a browser that picks a different container would otherwise orphan the first upload under a different key; a fixed key means a redo overwrites in place.';

create index al_answers_submission_idx on public.al_answers (submission_id, question_position);
create index al_answers_query_idx on public.al_answers (query_id);
create index al_answers_transcription_idx on public.al_answers (query_id, transcription_state);

-- A query holds at most five questions. Enforced here rather than only in the
-- server action: this is exactly the sort of limit that gets worked around by
-- an action nobody remembered to guard.
create function public.al_enforce_question_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from public.al_questions where query_id = new.query_id) >= 5 then
    raise exception 'A query can have at most 5 questions.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.al_enforce_question_limit() from public, anon, authenticated;

create trigger al_questions_enforce_limit
  before insert on public.al_questions
  for each row execute function public.al_enforce_question_limit();

-- updated_at maintenance (reuses public.set_updated_at() from the platform schema) ---

create trigger set_al_queries_updated_at
  before update on public.al_queries
  for each row execute function public.set_updated_at();

create trigger set_al_questions_updated_at
  before update on public.al_questions
  for each row execute function public.set_updated_at();

create trigger set_al_submissions_updated_at
  before update on public.al_submissions
  for each row execute function public.set_updated_at();

create trigger set_al_answers_updated_at
  before update on public.al_answers
  for each row execute function public.set_updated_at();

-- Authorization helpers ---------------------------------------------------------
-- All in `private`, never `public`: a function in `public` is reachable as a
-- PostgREST RPC endpoint, letting any signed-in user probe other people's tool
-- access. `private` is not in PostgREST's exposed schema list, so these stay
-- usable inside policies without being an API surface. See
-- 20260724120000_private_authz_functions.sql for the full rationale.
--
-- (The `public.al_*` functions further down are a different case entirely:
-- being reachable as RPC endpoints is exactly what they are for.)

-- Mirrors private.has_transcription_access's shape exactly
-- (20260725000000_transcription_workspace_schema.sql). Deliberately does NOT
-- bypass for platform administrators — tool access is always an explicit
-- tool_access grant in this portal, even for admins.
create function private.has_audience_listening_access(uid uuid)
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
      and t.key = 'audience-listening'
      and ta.revoked_at is null
      and p.account_status = 'active'
  );
$$;

-- Whether a query is open for new submissions right now: status plus the
-- opens_at/closes_at window. Used by the public functions, never rendered
-- from — the window is checked where it is enforced, not only where it is shown.
create function private.al_is_accepting(q_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.al_queries q
    where q.id = q_id
      and q.status = 'open'
      and (q.opens_at is null or q.opens_at <= now())
      and (q.closes_at is null or q.closes_at > now())
  );
$$;

-- Storage-prefix ownership for the bucket policies below: an object under the
-- prefix of an in-progress submission belonging to the caller. Once a
-- submission is finalized, its audio can no longer be overwritten by the
-- participant who made it.
create function private.al_owns_open_submission_object(object_name text, uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.al_submissions s
    where s.participant_user_id = uid
      and s.status = 'in_progress'
      and object_name like s.query_id::text || '/' || s.id::text || '/%'
  );
$$;

revoke execute on function private.has_audience_listening_access(uuid) from public, anon;
revoke execute on function private.al_is_accepting(uuid) from public, anon;
revoke execute on function private.al_owns_open_submission_object(text, uuid) from public, anon;

grant execute on function private.has_audience_listening_access(uuid) to authenticated;
grant execute on function private.al_is_accepting(uuid) to authenticated;
grant execute on function private.al_owns_open_submission_object(text, uuid) to authenticated;

-- Row Level Security ------------------------------------------------------------
-- Staff-only, on every table, without exception. Participants reach none of
-- these rows directly — see this file's header comment and the public functions
-- at the bottom.
--
-- Within staff, the trust model is the Transcription Workspace's shared
-- workspace: any tool member can see and review every query and submission.
-- Ownership is only asserted where destroying something is possible.

alter table public.al_queries enable row level security;
alter table public.al_questions enable row level security;
alter table public.al_submissions enable row level security;
alter table public.al_answers enable row level security;

grant select, insert, update, delete on public.al_queries to authenticated;
grant select, insert, update, delete on public.al_questions to authenticated;
-- No insert or delete grant for submissions/answers: they are created only by
-- al_start_submission()/al_reserve_answer(), and nothing in this tool deletes a
-- participant's response. "Reject" is a review state, not a deletion.
grant select, update on public.al_submissions to authenticated;
grant select, update on public.al_answers to authenticated;

create policy al_queries_select on public.al_queries
  for select
  to authenticated
  using (private.has_audience_listening_access(auth.uid()));

create policy al_queries_insert on public.al_queries
  for insert
  to authenticated
  with check (private.has_audience_listening_access(auth.uid()) and created_by = auth.uid());

create policy al_queries_update on public.al_queries
  for update
  to authenticated
  using (private.has_audience_listening_access(auth.uid()))
  with check (private.has_audience_listening_access(auth.uid()));

-- Only the creator can delete, matching tw_projects' precedent. The application
-- additionally refuses to delete a query that has any submissions — archiving
-- is the finished state, and a delete would cascade a participant's audio
-- metadata away.
create policy al_queries_delete on public.al_queries
  for delete
  to authenticated
  using (private.has_audience_listening_access(auth.uid()) and created_by = auth.uid());

create policy al_questions_member_all on public.al_questions
  for all
  to authenticated
  using (private.has_audience_listening_access(auth.uid()))
  with check (private.has_audience_listening_access(auth.uid()));

create policy al_submissions_select on public.al_submissions
  for select
  to authenticated
  using (private.has_audience_listening_access(auth.uid()));

create policy al_submissions_update on public.al_submissions
  for update
  to authenticated
  using (private.has_audience_listening_access(auth.uid()))
  with check (private.has_audience_listening_access(auth.uid()));

create policy al_answers_select on public.al_answers
  for select
  to authenticated
  using (private.has_audience_listening_access(auth.uid()));

create policy al_answers_update on public.al_answers
  for update
  to authenticated
  using (private.has_audience_listening_access(auth.uid()))
  with check (private.has_audience_listening_access(auth.uid()));

-- audit_events: without this, every logAuditEvent() call from this tool would
-- fail RLS (the existing policies admit only administrators and Editorial
-- Planning editors) and be swallowed by that helper's console.error. Same
-- shape as audit_events_insert_editorial_editor.
create policy audit_events_insert_audience_listening on public.audit_events
  for insert
  to authenticated
  with check (private.has_audience_listening_access(auth.uid()) and actor_id = auth.uid());

-- Storage -----------------------------------------------------------------------
-- Private bucket for participants' original audio. The file that the
-- participant's browser uploaded stays here untouched forever; transcription
-- handoff COPIES into transcription-media rather than moving or re-encoding
-- (design doc §2, constraint 4).
--
-- Size limit is generous relative to the real ceiling: the longest permitted
-- answer is 10 minutes, which is ~2.5 MB as Opus and ~10 MB as AAC.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audience-listening-media',
  'audience-listening-media',
  false,
  52428800, -- 50 MiB
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Participants write only under the prefix of their own still-open submission,
-- and read nothing: playback during the flow is from the in-memory blob, and
-- nothing gives a participant the ability to remove their own submitted
-- evidence — the same call Remote Interview made for guests.
create policy al_media_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'audience-listening-media'
    and private.al_owns_open_submission_object(name, auth.uid())
  );

create policy al_media_update on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'audience-listening-media'
    and private.al_owns_open_submission_object(name, auth.uid())
  )
  with check (
    bucket_id = 'audience-listening-media'
    and private.al_owns_open_submission_object(name, auth.uid())
  );

create policy al_media_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'audience-listening-media'
    and private.has_audience_listening_access(auth.uid())
  );

create policy al_media_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'audience-listening-media'
    and private.has_audience_listening_access(auth.uid())
  );

-- Transcription handoff needs the destination bucket to accept what a browser
-- actually produced. Chrome and Firefox give audio/webm and Safari audio/mp4,
-- all of which transcription-media already allows — but some Firefox builds
-- fall back to Ogg/Opus, and without this the handoff would fail for exactly
-- one browser, at the last step. Additive; touches no existing entry.
update storage.buckets
set allowed_mime_types = allowed_mime_types || array['audio/ogg']
where id = 'transcription-media'
  and not ('audio/ogg' = any (allowed_mime_types));

-- The public participation surface ------------------------------------------------
-- Seven security-definer functions. This list IS the public API of this tool:
-- everything a participant can do, enumerable on one screen. `anon` may call
-- exactly one of them, and it only reads; everything that writes requires a
-- real (if anonymous) session, established when the participant presses Begin.
--
-- Every one of them re-derives authorization from auth.uid() and the row it is
-- touching. None of them trusts a caller-supplied identity, and none returns a
-- column that is not meant for the public.

-- Read: the public view of a query and its questions, or null. Null covers
-- "no such public id" and "that query is a draft" identically, on purpose.
create function public.al_public_query(p_public_id text)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'public_id', q.public_id,
    'public_title', q.public_title,
    'public_intro', q.public_intro,
    'state', case
      when q.status <> 'open' then 'closed'
      when q.opens_at is not null and q.opens_at > now() then 'not_yet_open'
      when q.closes_at is not null and q.closes_at <= now() then 'closed'
      else 'open'
    end,
    'opens_at', q.opens_at,
    'closes_at', q.closes_at,
    'consent_text', q.consent_text,
    'ask_contact_permission', q.ask_contact_permission,
    'ask_attribution_permission', q.ask_attribution_permission,
    'allow_anonymous_request', q.allow_anonymous_request,
    'fields', jsonb_build_object(
      'name', q.field_name,
      'email', q.field_email,
      'phone', q.field_phone,
      'city', q.field_city,
      'note', q.field_note
    ),
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', x.id,
          'position', x.position,
          'prompt', x.prompt,
          'guidance', x.guidance,
          'required', x.required,
          'max_duration_seconds', x.max_duration_seconds
        )
        order by x.position, x.created_at
      )
      from public.al_questions x
      where x.query_id = q.id
    ), '[]'::jsonb)
  )
  from public.al_queries q
  where q.public_id = p_public_id
    and q.status <> 'draft';
$$;

comment on function public.al_public_query(text) is
  'The only part of this tool readable without a session. Returns exactly the public fields — never internal_title, internal_notes, internal question context, or any submission data.';

-- Write: create (or resume) this participant's submission. The first moment any
-- row exists for them, and deliberately behind a deliberate action.
create function public.al_start_submission(p_public_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query_id uuid;
  v_existing uuid;
  v_total integer;
  v_new_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;

  select id into v_query_id from public.al_queries where public_id = p_public_id;
  if v_query_id is null or not private.al_is_accepting(v_query_id) then
    return jsonb_build_object('error', 'not_accepting');
  end if;

  select id into v_existing
  from public.al_submissions
  where query_id = v_query_id
    and participant_user_id = auth.uid()
    and status = 'in_progress'
  limit 1;

  if v_existing is not null then
    return jsonb_build_object('submission_id', v_existing, 'resumed', true);
  end if;

  -- One participant, one query, three tries. Enough for someone who genuinely
  -- wants a second go; not enough to be a flood vector. See design doc §6.
  select count(*) into v_total
  from public.al_submissions
  where query_id = v_query_id and participant_user_id = auth.uid();

  if v_total >= 3 then
    return jsonb_build_object('error', 'submission_limit');
  end if;

  insert into public.al_submissions (query_id, participant_user_id)
  values (v_query_id, auth.uid())
  returning id into v_new_id;

  return jsonb_build_object('submission_id', v_new_id, 'resumed', false);
end;
$$;

-- Read: what this participant has already saved, so reopening the page restores
-- their progress instead of silently starting over.
create function public.al_participant_progress(p_submission_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'status', s.status,
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'answer_id', a.id,
        'question_id', a.question_id,
        'status', a.status,
        'duration_ms', a.duration_ms
      ))
      from public.al_answers a
      where a.submission_id = s.id
    ), '[]'::jsonb)
  )
  from public.al_submissions s
  where s.id = p_submission_id
    and s.participant_user_id = auth.uid();
$$;

-- Write: create or reset the answer row and hand back its storage path. The row
-- exists before the bytes do — the same order the Transcription Workspace uses
-- (createProject -> upload -> completeProjectUpload), and what makes it
-- impossible to write an object no row knows about.
create function public.al_reserve_answer(
  p_submission_id uuid,
  p_question_id uuid,
  p_content_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.al_submissions;
  v_question public.al_questions;
  v_answer_id uuid;
  v_path text;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;

  -- Keep in step with the bucket's allowed_mime_types above.
  if p_content_type is null
     or p_content_type not in ('audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav')
  then
    return jsonb_build_object('error', 'unsupported_type');
  end if;

  select * into v_sub
  from public.al_submissions
  where id = p_submission_id
    and participant_user_id = auth.uid()
    and status = 'in_progress';
  if not found then
    return jsonb_build_object('error', 'not_open');
  end if;

  select * into v_question
  from public.al_questions
  where id = p_question_id and query_id = v_sub.query_id;
  if not found then
    return jsonb_build_object('error', 'unknown_question');
  end if;

  select id into v_answer_id
  from public.al_answers
  where submission_id = v_sub.id and question_id = v_question.id;

  if v_answer_id is null then
    v_answer_id := gen_random_uuid();
    v_path := v_sub.query_id::text || '/' || v_sub.id::text || '/' || v_answer_id::text;
    insert into public.al_answers (
      id, submission_id, query_id, question_id,
      question_prompt, question_position, question_required,
      status, storage_path, content_type
    ) values (
      v_answer_id, v_sub.id, v_sub.query_id, v_question.id,
      v_question.prompt, v_question.position, v_question.required,
      'pending', v_path, p_content_type
    );
  else
    -- A redo. Same row, same object key, re-snapshotted wording (the prompt may
    -- have been edited between the first take and this one).
    update public.al_answers
    set status = 'pending',
        content_type = p_content_type,
        size_bytes = null,
        duration_ms = null,
        question_prompt = v_question.prompt,
        question_position = v_question.position,
        question_required = v_question.required
    where id = v_answer_id
    returning storage_path into v_path;
  end if;

  return jsonb_build_object('answer_id', v_answer_id, 'storage_path', v_path);
end;
$$;

-- Write: confirm a successful direct-to-storage upload. Duration and size are
-- enforced here, in the same transaction as the write, so a hand-crafted client
-- cannot skip them.
create function public.al_complete_answer(
  p_answer_id uuid,
  p_size_bytes bigint,
  p_duration_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_seconds integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;

  select coalesce(q.max_duration_seconds, 600) into v_max_seconds
  from public.al_answers a
  join public.al_submissions s on s.id = a.submission_id
  left join public.al_questions q on q.id = a.question_id
  where a.id = p_answer_id
    and s.participant_user_id = auth.uid()
    and s.status = 'in_progress';
  if not found then
    return jsonb_build_object('error', 'not_open');
  end if;

  -- Matches the bucket's own file_size_limit; both are enforced, independently.
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 52428800 then
    return jsonb_build_object('error', 'invalid_size');
  end if;

  -- 10% plus two seconds of tolerance: an encoder finishing its current frame
  -- routinely overshoots a stop() by a little, and rejecting a good answer over
  -- that would be indefensible.
  if p_duration_ms is not null
     and p_duration_ms > (v_max_seconds * 1000 * 11 / 10 + 2000)
  then
    return jsonb_build_object('error', 'too_long');
  end if;

  update public.al_answers
  set status = 'uploaded',
      size_bytes = p_size_bytes,
      duration_ms = p_duration_ms
  where id = p_answer_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- Write: the participant's own details and their three permission choices, and
-- nothing else. This is the whole reason there is no participant UPDATE policy
-- on al_submissions — one would also let them write review_state, reviewed_by,
-- submitted_at, or another participant's row.
create function public.al_save_participant_details(
  p_submission_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_city text,
  p_note text,
  p_consent_contact boolean,
  p_consent_identify boolean,
  p_request_anonymous boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;

  update public.al_submissions
  set
    participant_name = nullif(left(trim(coalesce(p_name, '')), 200), ''),
    participant_email = nullif(left(trim(coalesce(p_email, '')), 320), ''),
    participant_phone = nullif(left(trim(coalesce(p_phone, '')), 40), ''),
    participant_city = nullif(left(trim(coalesce(p_city, '')), 200), ''),
    participant_note = nullif(left(trim(coalesce(p_note, '')), 4000), ''),
    consent_contact = coalesce(p_consent_contact, false),
    consent_identify = coalesce(p_consent_identify, false),
    request_anonymous = coalesce(p_request_anonymous, false)
  where id = p_submission_id
    and participant_user_id = auth.uid()
    and status = 'in_progress';

  if not found then
    return jsonb_build_object('error', 'not_open');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Write: the one irreversible step. Everything the flow claims to require is
-- re-checked here — consent, required questions, required participant fields,
-- at least one answer — and the transition to 'submitted' is what makes a
-- second final submission impossible (every other participant function requires
-- status = 'in_progress').
create function public.al_finalize_submission(
  p_submission_id uuid,
  p_consent_agreed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.al_submissions;
  v_query public.al_queries;
  v_uploaded integer;
  v_missing integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;
  if not coalesce(p_consent_agreed, false) then
    return jsonb_build_object('error', 'consent_required');
  end if;

  select * into v_sub
  from public.al_submissions
  where id = p_submission_id
    and participant_user_id = auth.uid()
    and status = 'in_progress';
  if not found then
    return jsonb_build_object('error', 'not_open');
  end if;

  select * into v_query from public.al_queries where id = v_sub.query_id;

  -- Deliberately NOT private.al_is_accepting(): a participant who was already
  -- recording when the query closed is allowed to finish. Their work is not
  -- discarded for a deadline they could not see coming. An archived query is
  -- genuinely over, and a draft can have no submissions at all.
  if v_query.status not in ('open', 'closed') then
    return jsonb_build_object('error', 'not_open');
  end if;

  select count(*) into v_uploaded
  from public.al_answers
  where submission_id = v_sub.id and status = 'uploaded';
  if v_uploaded = 0 then
    return jsonb_build_object('error', 'no_answers');
  end if;

  select count(*) into v_missing
  from public.al_questions q
  where q.query_id = v_sub.query_id
    and q.required
    and not exists (
      select 1 from public.al_answers a
      where a.submission_id = v_sub.id
        and a.question_id = q.id
        and a.status = 'uploaded'
    );
  if v_missing > 0 then
    return jsonb_build_object('error', 'required_answer_missing');
  end if;

  if (v_query.field_name = 'required' and coalesce(v_sub.participant_name, '') = '')
     or (v_query.field_email = 'required' and coalesce(v_sub.participant_email, '') = '')
     or (v_query.field_phone = 'required' and coalesce(v_sub.participant_phone, '') = '')
     or (v_query.field_city = 'required' and coalesce(v_sub.participant_city, '') = '')
     or (v_query.field_note = 'required' and coalesce(v_sub.participant_note, '') = '')
  then
    return jsonb_build_object('error', 'required_field_missing');
  end if;

  update public.al_submissions
  set status = 'submitted',
      submitted_at = now(),
      consent_agreed_at = now()
  where id = v_sub.id;

  -- Never-completed placeholder rows are left alone rather than deleted: their
  -- storage object may well exist, and a 'pending' row is how the review screen
  -- shows "upload incomplete" honestly instead of silently as "skipped".
  if v_query.transcription_mode = 'automatic' then
    update public.al_answers
    set transcription_state = 'queued'
    where submission_id = v_sub.id and status = 'uploaded';
  end if;

  return jsonb_build_object('ok', true, 'answers', v_uploaded);
end;
$$;

revoke execute on function public.al_public_query(text) from public;
revoke execute on function public.al_start_submission(text) from public, anon;
revoke execute on function public.al_participant_progress(uuid) from public, anon;
revoke execute on function public.al_reserve_answer(uuid, uuid, text) from public, anon;
revoke execute on function public.al_complete_answer(uuid, bigint, integer) from public, anon;
revoke execute on function public.al_save_participant_details(uuid, text, text, text, text, text, boolean, boolean, boolean) from public, anon;
revoke execute on function public.al_finalize_submission(uuid, boolean) from public, anon;

grant execute on function public.al_public_query(text) to anon, authenticated;
grant execute on function public.al_start_submission(text) to authenticated;
grant execute on function public.al_participant_progress(uuid) to authenticated;
grant execute on function public.al_reserve_answer(uuid, uuid, text) to authenticated;
grant execute on function public.al_complete_answer(uuid, bigint, integer) to authenticated;
grant execute on function public.al_save_participant_details(uuid, text, text, text, text, text, boolean, boolean, boolean) to authenticated;
grant execute on function public.al_finalize_submission(uuid, boolean) to authenticated;

-- Tool registry -------------------------------------------------------------------
-- The row is seed-only today (supabase/seed.sql), pointing at the generic
-- placeholder route with status='planned'. Upsert rather than update: Remote
-- Interview's migration used a bare `update`, which silently no-ops on a
-- project whose seed never ran. status flips straight to 'available' because
-- this milestone ships the whole path — create a query, publish it, collect
-- submissions, review them, hand one to transcription.

insert into public.tools (key, name, description, route, status, enabled, default_access, sort_order)
values (
  'audience-listening',
  'Audience Listening',
  'Collect recorded answers from the public to a short set of questions, and review them here.',
  '/audience-listening',
  'available',
  true,
  'invite_only',
  4
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  route = excluded.route,
  status = excluded.status,
  enabled = excluded.enabled;
