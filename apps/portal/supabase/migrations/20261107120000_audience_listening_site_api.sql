-- Audience Listening: the site's signed API (Phase A of docs/audience-listening-suite-design.md).
--
-- WUWF.org renders every screen a listener sees and calls the Portal from its server with signed requests that
-- assert a SUBJECT (the site's own opaque visitor or account id). A subject is not a Supabase auth user, so the
-- participant functions of Milestone 1 (which read auth.uid()) cannot serve it. This migration adds:
--
--   * al_submissions.participant_subject, beside participant_user_id (a row has at most one),
--   * the same seven participant functions with an al_site_ prefix taking the subject first, plus a written answer,
--     a read for the query with its display fields, and a forget-subject erasure,
--   * display fields on al_queries (who asked, where it is from, the context) and a switch for written answers,
--   * written answers on al_answers (answer_kind / answer_text; the audio columns become nullable for them),
--   * a small request limiter, because a public write surface needs one and the Portal has no queue or cache.
--
-- Every al_site_* function is EXECUTE-able by service_role ONLY. The Portal's route handlers call them after
-- verifying the request signature; anon and authenticated get nothing, so a leaked anon key reaches nothing new.
-- RLS on the al_* tables is unchanged (staff only): the function list is still the whole public surface.
--
-- The rules are the Milestone 1 rules. The limits in private.al_answer_limit_error() are the same numbers
-- al_complete_answer() uses; if one changes, change both.

-- ------------------------------------------------------------------------------------------------
-- Columns

alter table public.al_queries
  add column asked_by text,
  add column from_label text,
  add column context_label text,
  add column allow_text_answers boolean not null default false;

comment on column public.al_queries.asked_by is
  'Public: who is asking ("Leigh Ostrander"). Shown by the single-question components.';
comment on column public.al_queries.from_label is
  'Public: the desk or program the question is from ("from the WUWF News desk").';
comment on column public.al_queries.context_label is
  'Public: the series or project this belongs to ("After Isaias", "Coastal Futures").';
comment on column public.al_queries.allow_text_answers is
  'Whether the site may offer "Write" beside "Record". Off by default; a staff member turns it on per query.';

alter table public.al_submissions
  add column participant_subject text,
  add constraint al_submissions_subject_format
    check (participant_subject is null or participant_subject ~ '^site:(visitor|account):[A-Za-z0-9_-]{1,128}$'),
  add constraint al_submissions_one_identity
    check (participant_user_id is null or participant_subject is null);

comment on column public.al_submissions.participant_subject is
  'The site''s opaque subject for this participant: site:visitor:<id> or site:account:<id>. Never an email, a name, or a donor or membership id. Rows made by the Portal''s own /listen page use participant_user_id instead; a row has at most one.';

create unique index al_submissions_one_in_progress_subject_idx
  on public.al_submissions (query_id, participant_subject)
  where status = 'in_progress' and participant_subject is not null;

create index al_submissions_subject_idx
  on public.al_submissions (participant_subject)
  where participant_subject is not null;

alter table public.al_answers
  add column answer_kind text not null default 'audio',
  add column answer_text text,
  alter column storage_path drop not null,
  alter column content_type drop not null,
  add constraint al_answers_kind_check check (answer_kind in ('audio', 'text')),
  add constraint al_answers_kind_shape check (
    (answer_kind = 'audio' and storage_path is not null and content_type is not null and answer_text is null)
    or (answer_kind = 'text' and answer_text is not null and storage_path is null and content_type is null)
  );

comment on column public.al_answers.answer_kind is
  'audio (a recording at storage_path) or text (a written answer in answer_text). A text answer is never handed to transcription.';

-- ------------------------------------------------------------------------------------------------
-- The request limiter. A fixed window per key, counted in the database because the Portal has no cache.
-- RLS on, no policies: only service_role (through al_site_rate_hit) can touch it.

create table public.al_site_rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

alter table public.al_site_rate_limits enable row level security;

comment on table public.al_site_rate_limits is
  'Fixed-window request counters for the site API, keyed by a caller-chosen string (a subject, or a hash of the site''s client address). No policies: service_role only, through al_site_rate_hit().';

create function public.al_site_rate_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_hits integer;
begin
  if p_key is null or length(p_key) = 0 or length(p_key) > 200
     or p_limit < 1 or p_window_seconds < 1
  then
    return false;
  end if;

  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.al_site_rate_limits (key, window_start, hits)
  values (p_key, v_start, 1)
  on conflict (key, window_start) do update set hits = public.al_site_rate_limits.hits + 1
  returning hits into v_hits;

  -- Housekeeping, about one call in a hundred: nothing older than a day matters.
  if random() < 0.01 then
    delete from public.al_site_rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end;
$$;

-- ------------------------------------------------------------------------------------------------
-- Helpers (private; never exposed)

create function private.al_site_subject(p_subject text)
returns text
language sql
immutable
as $$
  select case when p_subject ~ '^site:(visitor|account):[A-Za-z0-9_-]{1,128}$' then p_subject else null end;
$$;

-- The size and duration rules of al_complete_answer(), as one function that returns the refusal (or null).
create function private.al_answer_limit_error(p_size_bytes bigint, p_duration_ms integer, p_max_seconds integer)
returns text
language sql
immutable
as $$
  select case
    when p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 52428800 then 'invalid_size'
    -- 10% plus two seconds of tolerance, as in al_complete_answer(): an encoder finishing its current frame
    -- routinely overshoots a stop() by a little.
    when p_duration_ms is not null and p_duration_ms > (p_max_seconds * 1000 * 11 / 10 + 2000) then 'too_long'
    else null
  end;
$$;

-- ------------------------------------------------------------------------------------------------
-- The site API. Subject first; every refusal is a { "error": code } the Portal maps to the contract's codes.

-- Read: the public view of a query, with the display fields. Null for a draft or an unknown id, identically.
create function public.al_site_query(p_public_id text)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select case
    when base is null then null
    else base || jsonb_build_object(
      'asked_by', q.asked_by,
      'from_label', q.from_label,
      'context_label', q.context_label,
      'allow_text_answers', q.allow_text_answers
    )
  end
  from (select public.al_public_query(p_public_id) as base) b
  left join public.al_queries q on q.public_id = p_public_id and q.status <> 'draft';
$$;

create function public.al_site_start_submission(p_subject text, p_public_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject text := private.al_site_subject(p_subject);
  v_query_id uuid;
  v_existing uuid;
  v_total integer;
  v_new_id uuid;
begin
  if v_subject is null then
    return jsonb_build_object('error', 'invalid_request');
  end if;

  select id into v_query_id from public.al_queries where public_id = p_public_id;
  if v_query_id is null or not private.al_is_accepting(v_query_id) then
    return jsonb_build_object('error', 'not_accepting');
  end if;

  select id into v_existing
  from public.al_submissions
  where query_id = v_query_id and participant_subject = v_subject and status = 'in_progress'
  limit 1;

  if v_existing is not null then
    return jsonb_build_object('submission_id', v_existing, 'resumed', true);
  end if;

  -- One subject, one query, three tries (the same cap as al_start_submission()).
  select count(*) into v_total
  from public.al_submissions
  where query_id = v_query_id and participant_subject = v_subject;

  if v_total >= 3 then
    return jsonb_build_object('error', 'submission_limit');
  end if;

  insert into public.al_submissions (query_id, participant_subject)
  values (v_query_id, v_subject)
  returning id into v_new_id;

  return jsonb_build_object('submission_id', v_new_id, 'resumed', false);
end;
$$;

-- Read: what this subject has already saved. Null (not found) for a submission that is not theirs.
create function public.al_site_progress(p_subject text, p_submission_id uuid)
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
        'kind', a.answer_kind,
        'status', a.status,
        'duration_ms', a.duration_ms,
        'text', case when a.answer_kind = 'text' then a.answer_text else null end
      ) order by a.question_position)
      from public.al_answers a
      where a.submission_id = s.id
    ), '[]'::jsonb)
  )
  from public.al_submissions s
  where s.id = p_submission_id
    and private.al_site_subject(p_subject) is not null
    and s.participant_subject = p_subject;
$$;

-- Write: create or reset the audio answer row and hand back its object key. The row exists before the bytes.
create function public.al_site_reserve_answer(
  p_subject text,
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
  v_subject text := private.al_site_subject(p_subject);
  v_sub public.al_submissions;
  v_question public.al_questions;
  v_answer_id uuid;
  v_path text;
begin
  if v_subject is null then
    return jsonb_build_object('error', 'invalid_request');
  end if;

  -- Keep in step with the bucket's allowed_mime_types.
  if p_content_type is null
     or p_content_type not in ('audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav')
  then
    return jsonb_build_object('error', 'unsupported_type');
  end if;

  select * into v_sub
  from public.al_submissions
  where id = p_submission_id and participant_subject = v_subject and status = 'in_progress';
  if not found then
    return jsonb_build_object('error', 'not_found');
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
      status, answer_kind, storage_path, content_type
    ) values (
      v_answer_id, v_sub.id, v_sub.query_id, v_question.id,
      v_question.prompt, v_question.position, v_question.required,
      'pending', 'audio', v_path, p_content_type
    );
  else
    -- A redo, or a switch from a written answer to a recording: same row, re-snapshotted wording.
    v_path := v_sub.query_id::text || '/' || v_sub.id::text || '/' || v_answer_id::text;
    update public.al_answers
    set status = 'pending',
        answer_kind = 'audio',
        answer_text = null,
        storage_path = v_path,
        content_type = p_content_type,
        size_bytes = null,
        duration_ms = null,
        question_prompt = v_question.prompt,
        question_position = v_question.position,
        question_required = v_question.required
    where id = v_answer_id;
  end if;

  return jsonb_build_object(
    'answer_id', v_answer_id,
    'storage_path', v_path,
    'max_duration_seconds', v_question.max_duration_seconds
  );
end;
$$;

-- Write: a written answer. Only where the query allows it.
create function public.al_site_save_text_answer(
  p_subject text,
  p_submission_id uuid,
  p_question_id uuid,
  p_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject text := private.al_site_subject(p_subject);
  v_sub public.al_submissions;
  v_question public.al_questions;
  v_query public.al_queries;
  v_text text := trim(coalesce(p_text, ''));
  v_answer_id uuid;
begin
  if v_subject is null then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  if length(v_text) = 0 or length(v_text) > 4000 then
    return jsonb_build_object('error', 'invalid_size');
  end if;

  select * into v_sub
  from public.al_submissions
  where id = p_submission_id and participant_subject = v_subject and status = 'in_progress';
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  select * into v_query from public.al_queries where id = v_sub.query_id;
  if not v_query.allow_text_answers then
    return jsonb_build_object('error', 'unsupported_type');
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
    insert into public.al_answers (
      submission_id, query_id, question_id,
      question_prompt, question_position, question_required,
      status, answer_kind, answer_text, size_bytes
    ) values (
      v_sub.id, v_sub.query_id, v_question.id,
      v_question.prompt, v_question.position, v_question.required,
      'uploaded', 'text', v_text, octet_length(v_text)
    )
    returning id into v_answer_id;
  else
    -- Replaces a recording or an earlier written answer. An orphaned recording object is the route's to remove.
    update public.al_answers
    set status = 'uploaded',
        answer_kind = 'text',
        answer_text = v_text,
        storage_path = null,
        content_type = null,
        size_bytes = octet_length(v_text),
        duration_ms = null,
        question_prompt = v_question.prompt,
        question_position = v_question.position,
        question_required = v_question.required
    where id = v_answer_id;
  end if;

  return jsonb_build_object('answer_id', v_answer_id);
end;
$$;

-- Write: confirm a direct-to-storage upload.
create function public.al_site_complete_answer(
  p_subject text,
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
  v_subject text := private.al_site_subject(p_subject);
  v_max_seconds integer;
  v_refusal text;
begin
  if v_subject is null then
    return jsonb_build_object('error', 'invalid_request');
  end if;

  select coalesce(q.max_duration_seconds, 600) into v_max_seconds
  from public.al_answers a
  join public.al_submissions s on s.id = a.submission_id
  left join public.al_questions q on q.id = a.question_id
  where a.id = p_answer_id
    and a.answer_kind = 'audio'
    and s.participant_subject = v_subject
    and s.status = 'in_progress';
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  v_refusal := private.al_answer_limit_error(p_size_bytes, p_duration_ms, v_max_seconds);
  if v_refusal is not null then
    return jsonb_build_object('error', v_refusal);
  end if;

  update public.al_answers
  set status = 'uploaded', size_bytes = p_size_bytes, duration_ms = p_duration_ms
  where id = p_answer_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- Write: the participant's details and their three permission choices, and nothing else.
create function public.al_site_save_details(
  p_subject text,
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
declare
  v_subject text := private.al_site_subject(p_subject);
begin
  if v_subject is null then
    return jsonb_build_object('error', 'invalid_request');
  end if;

  -- Board 5b keeps "identify me" and "keep me anonymous" as separate boxes, as Milestone 1 does. Only the table
  -- contact card (board 5i) makes them mutually exclusive, and that is enforced where that card is saved.
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
  where id = p_submission_id and participant_subject = v_subject and status = 'in_progress';

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Write: the one irreversible step. Everything the flow claims to require is re-checked here.
create function public.al_site_finalize(
  p_subject text,
  p_submission_id uuid,
  p_consent_agreed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject text := private.al_site_subject(p_subject);
  v_sub public.al_submissions;
  v_query public.al_queries;
  v_uploaded integer;
  v_missing integer;
begin
  if v_subject is null then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  if not coalesce(p_consent_agreed, false) then
    return jsonb_build_object('error', 'consent_required');
  end if;

  select * into v_sub
  from public.al_submissions
  where id = p_submission_id and participant_subject = v_subject and status = 'in_progress';
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  select * into v_query from public.al_queries where id = v_sub.query_id;

  -- Not al_is_accepting(): someone already recording when the query closed may finish (see al_finalize_submission()).
  -- But a disabled tool is closed to everyone.
  if v_query.status not in ('open', 'closed') or not private.tool_is_enabled('audience-listening') then
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
      where a.submission_id = v_sub.id and a.question_id = q.id and a.status = 'uploaded'
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
  set status = 'submitted', submitted_at = now(), consent_agreed_at = now()
  where id = v_sub.id;

  -- Only recordings are queued; a written answer has nothing to transcribe.
  if v_query.transcription_mode = 'automatic' then
    update public.al_answers
    set transcription_state = 'queued'
    where submission_id = v_sub.id and status = 'uploaded' and answer_kind = 'audio';
  end if;

  return jsonb_build_object('ok', true, 'answers', v_uploaded);
end;
$$;

-- Write: erase what a subject has not yet sent, and detach the rest. Returns the object keys it removed rows for,
-- so the route can delete the audio. Submitted work is editorial record and stays, with the subject nulled.
create function public.al_site_forget_subject(p_subject text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject text := private.al_site_subject(p_subject);
  v_paths jsonb;
begin
  if v_subject is null then
    return jsonb_build_object('error', 'invalid_request');
  end if;

  select coalesce(jsonb_agg(a.storage_path), '[]'::jsonb) into v_paths
  from public.al_answers a
  join public.al_submissions s on s.id = a.submission_id
  where s.participant_subject = v_subject
    and s.status = 'in_progress'
    and a.storage_path is not null;

  delete from public.al_submissions where participant_subject = v_subject and status = 'in_progress';
  update public.al_submissions set participant_subject = null where participant_subject = v_subject;

  return jsonb_build_object('ok', true, 'storage_paths', v_paths);
end;
$$;

-- ------------------------------------------------------------------------------------------------
-- Grants: service_role only. Supabase's default privileges give anon and authenticated EXECUTE on new functions in
-- public, so they are revoked by name, not only from PUBLIC.

revoke execute on function public.al_site_rate_hit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.al_site_query(text) from public, anon, authenticated;
revoke execute on function public.al_site_start_submission(text, text) from public, anon, authenticated;
revoke execute on function public.al_site_progress(text, uuid) from public, anon, authenticated;
revoke execute on function public.al_site_reserve_answer(text, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.al_site_save_text_answer(text, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.al_site_complete_answer(text, uuid, bigint, integer) from public, anon, authenticated;
revoke execute on function public.al_site_save_details(text, uuid, text, text, text, text, text, boolean, boolean, boolean) from public, anon, authenticated;
revoke execute on function public.al_site_finalize(text, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.al_site_forget_subject(text) from public, anon, authenticated;

grant execute on function public.al_site_rate_hit(text, integer, integer) to service_role;
grant execute on function public.al_site_query(text) to service_role;
grant execute on function public.al_site_start_submission(text, text) to service_role;
grant execute on function public.al_site_progress(text, uuid) to service_role;
grant execute on function public.al_site_reserve_answer(text, uuid, uuid, text) to service_role;
grant execute on function public.al_site_save_text_answer(text, uuid, uuid, text) to service_role;
grant execute on function public.al_site_complete_answer(text, uuid, bigint, integer) to service_role;
grant execute on function public.al_site_save_details(text, uuid, text, text, text, text, text, boolean, boolean, boolean) to service_role;
grant execute on function public.al_site_finalize(text, uuid, boolean) to service_role;
grant execute on function public.al_site_forget_subject(text) to service_role;

-- private.* helpers are not exposed through PostgREST (the schema is not in its list) and are called only from the
-- security definer functions above.
