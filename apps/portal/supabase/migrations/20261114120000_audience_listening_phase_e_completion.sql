-- Audience Listening, suite phase E completion (2026-11-14). Follows 20261113120000.
--
-- 1. Speakers. What a facilitator names on the after-page is written through to Sourcework's own speakers (tw_speakers.display_name), so
--    Analyze, search and excerpt names see it; the facilitator's merges are copied as the same name, never as a destructive merge. Names
--    AssemblyAI suggests are kept apart (tw_speakers.suggested_name) and never overwrite a person's. The table's size, given at the
--    agreement, goes to the transcription request as a speaker range.
-- 2. Highlights. Lines the facilitator marks become Sourcework excerpts (al_create_excerpts_from_highlights), made as a named staff
--    member; lines Analyze proposed are returned to the after-page as proposals to confirm.
-- 3. The recorder. A segment may carry the time its phone started recording it, so a gap (a locked screen) shows on the table page.
-- 4. A recording from a separate recorder can be attached to a table that has agreed (staff only).
-- 5. Jobs. A log of scheduled runs and the helpers the scheduled route calls (service_role only).
-- 6. Kitchen tables. A campaign may accept them; a host makes a private one-table event and gets the table's link without staff.

-- ------------------------------------------------------------------------------------------------
-- 1. Speakers

alter table public.tw_speakers
  add column suggested_name text,
  add constraint tw_speakers_suggested_name_check check (suggested_name is null or char_length(suggested_name) between 1 and 60);

comment on column public.tw_speakers.suggested_name is
  'A name the speech provider proposed from what was said, shown to a person to confirm. Never copied into display_name by code.';

alter table public.al_tables
  add column expected_speakers integer,
  add constraint al_tables_expected_speakers_check check (expected_speakers is null or expected_speakers between 1 and 40);

comment on column public.al_tables.expected_speakers is
  'How many people the facilitator said were at the table, given at the agreement. Sent to the transcription request as a speaker range.';

-- The agreement now also carries how many are at the table.
drop function public.al_site_table_agree(text, integer, text, text);

create function public.al_site_table_agree(p_session_hash text, p_consent_version integer, p_first_name text, p_email text, p_people integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.al_tables;
  v_name text := nullif(btrim(coalesce(p_first_name, '')), '');
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
begin
  t := private.al_table_for_session(p_session_hash);
  if t.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_name is not null and char_length(v_name) > 60 then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  if p_people is not null and (p_people < 1 or p_people > 40) then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  if t.state <> 'waiting' then
    return jsonb_build_object('table', private.al_table_view(t.id));
  end if;
  if v_email is null then
    return jsonb_build_object('error', 'required_field_missing');
  end if;
  if char_length(v_email) > 320 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  if p_consent_version is null or not exists (select 1 from public.al_consent_texts where version = p_consent_version) then
    return jsonb_build_object('error', 'invalid_request');
  end if;

  update public.al_tables
     set state = 'agreed', agreed_at = now(), consent_text_version = p_consent_version::text,
         facilitator_first_name = v_name, facilitator_email = v_email, expected_speakers = p_people
   where id = t.id;
  return jsonb_build_object('table', private.al_table_view(t.id));
end;
$$;

comment on function public.al_site_table_agree(text, integer, text, text, integer) is
  'Records the table''s agreement with the wording version shown, the facilitator''s first name and email (required), and how many are at the table. service_role only.';

revoke execute on function public.al_site_table_agree(text, integer, text, text, integer) from public, anon, authenticated;
grant execute on function public.al_site_table_agree(text, integer, text, text, integer) to service_role;

-- The after-page reads suggested names and proposed lines too.
create or replace function public.al_site_conversation(p_session_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.al_tables;
  c public.al_conversations;
  v_rep uuid;
  v_ready boolean;
begin
  t := private.al_table_for_conversation(p_session_hash);
  if t.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  select * into c from public.al_conversations where table_id = t.id;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  select r.id into v_rep from public.sw_representations r
   where r.source_id = c.sourcework_source_id and r.kind = 'transcript' and r.status = 'ready';
  v_ready := v_rep is not null;

  -- The voices are made the first time the transcript is read, from the speakers Sourcework found.
  if v_ready and not exists (select 1 from public.al_speakers where conversation_id = c.id) then
    insert into public.al_speakers (conversation_id, source_label, label, first_heard_ms, share_percent)
    select c.id, x.diarization_label, 'Voice ' || row_number() over (order by x.first_ms, x.diarization_label),
           x.first_ms, case when x.total > 0 then round(100.0 * x.spoken / x.total)::integer else 0 end
    from (
      select ts.diarization_label,
             min(sg.start_ms) as first_ms,
             sum(sg.end_ms - sg.start_ms) as spoken,
             sum(sum(sg.end_ms - sg.start_ms)) over () as total
      from public.tw_speakers ts
      join public.tw_segments sg on sg.speaker_id = ts.id
      where ts.representation_id = v_rep
      group by ts.diarization_label
    ) x
    on conflict (conversation_id, source_label) do nothing;
  end if;

  return jsonb_build_object(
    'status', case when v_ready and c.status in ('complete', 'transcribing') then 'ready' else c.status end,
    'transcript_ready', v_ready,
    'tags', coalesce((select jsonb_agg(g.label order by g.position, g.created_at) from public.al_campaign_tags g
                       join public.al_events e on e.campaign_id = g.campaign_id where e.id = t.event_id), '[]'::jsonb),
    'lines', case when not v_ready then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('start_ms', sg.start_ms, 'end_ms', sg.end_ms, 'text', sg.text, 'speaker_id', s.id)
                       order by sg.position)
      from public.tw_segments sg
      left join public.tw_speakers ts on ts.id = sg.speaker_id
      left join public.al_speakers s on s.conversation_id = c.id and s.source_label = ts.diarization_label
      where sg.representation_id = v_rep), '[]'::jsonb) end,
    'speakers', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'label', s.label, 'name', s.name, 'is_facilitator', s.is_facilitator,
                                          'first_heard_ms', s.first_heard_ms, 'share_percent', s.share_percent, 'merged_into', s.merged_into,
                                          'suggested_name', (select tw.suggested_name from public.tw_speakers tw
                                                              where tw.representation_id = v_rep and tw.diarization_label = s.source_label))
                       order by s.first_heard_ms, s.label)
      from public.al_speakers s where s.conversation_id = c.id), '[]'::jsonb),
    'highlights', coalesce((
      select jsonb_agg(jsonb_build_object('start_ms', h.start_ms, 'end_ms', h.end_ms, 'text', h.text, 'tag', h.tag, 'speaker_id', h.speaker_id)
                       order by h.start_ms)
      from public.al_highlights h where h.conversation_id = c.id), '[]'::jsonb),
    -- Lines Analyze proposed as worth keeping, as the start of the transcript line each falls in: a proposal to confirm, never a mark.
    'proposals', case when not v_ready then '[]'::jsonb else coalesce((
      select jsonb_agg(x.start_ms order by x.start_ms)
      from (
        select distinct on (sg.start_ms) sg.start_ms
        from public.sw_quote_suggestions q
        join public.tw_segments sg on sg.representation_id = v_rep and q.start_ms >= sg.start_ms and q.start_ms < sg.end_ms
        where q.source_id = c.sourcework_source_id and q.status = 'suggested'
        order by sg.start_ms
        limit 12
      ) x), '[]'::jsonb) end,
    -- Only that a speaker left one, never what it says.
    'contact_card_count', (select count(*) from public.al_contact_cards k where k.conversation_id = c.id)
  );
end;
$$;

-- The facilitator's names reach Sourcework.
create or replace function public.al_site_speakers_save(p_session_hash text, p_speakers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.al_tables;
  c public.al_conversations;
  item jsonb;
  v_id uuid;
  v_name text;
  v_into uuid;
  v_facilitators integer := 0;
  v_rep uuid;
begin
  t := private.al_table_for_conversation(p_session_hash);
  if t.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  select * into c from public.al_conversations where table_id = t.id for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if c.status = 'sent' then
    return jsonb_build_object('error', 'not_open');
  end if;
  if jsonb_typeof(p_speakers) is distinct from 'array' or jsonb_array_length(p_speakers) > 40 then
    return jsonb_build_object('error', 'invalid_request');
  end if;

  for item in select * from jsonb_array_elements(p_speakers) loop
    begin
      v_id := (item->>'id')::uuid;
      v_into := nullif(item->>'mergedInto', '')::uuid;
    exception when others then
      return jsonb_build_object('error', 'invalid_request');
    end;
    v_name := nullif(btrim(coalesce(item->>'name', '')), '');
    if v_name is not null and char_length(v_name) > 60 then
      return jsonb_build_object('error', 'invalid_request');
    end if;
    if not exists (select 1 from public.al_speakers where id = v_id and conversation_id = c.id) then
      return jsonb_build_object('error', 'not_found');
    end if;
    if v_into is not null then
      if v_into = v_id or not exists (select 1 from public.al_speakers where id = v_into and conversation_id = c.id) then
        return jsonb_build_object('error', 'invalid_request');
      end if;
      -- No chains: a voice that is merged away is not a target, and a target is not merged away.
      if exists (select 1 from jsonb_array_elements(p_speakers) o
                  where (o->>'id')::uuid = v_into and nullif(o->>'mergedInto', '') is not null) then
        return jsonb_build_object('error', 'invalid_request');
      end if;
    end if;
    if coalesce((item->>'isFacilitator')::boolean, false) then
      v_facilitators := v_facilitators + 1;
    end if;
  end loop;
  -- "That's me" is one voice.
  if v_facilitators > 1 then
    return jsonb_build_object('error', 'invalid_request');
  end if;

  -- Everything is checked above; from here on nothing can be refused, so no write is left half done.
  update public.al_speakers set merged_into = null where conversation_id = c.id;
  for item in select * from jsonb_array_elements(p_speakers) loop
    update public.al_speakers
       set name = nullif(btrim(coalesce(item->>'name', '')), ''),
           is_facilitator = coalesce((item->>'isFacilitator')::boolean, false),
           merged_into = nullif(item->>'mergedInto', '')::uuid
     where id = (item->>'id')::uuid and conversation_id = c.id;
  end loop;

  update public.al_conversations set status = 'named' where id = c.id and status in ('complete', 'transcribing');

  -- Write through to Sourcework's own speakers, so Analyze, search and excerpt names see what the facilitator said. A merged voice gets
  -- the name of the voice it was folded into (the merge itself stays a choice here that can be undone). A name is only ever written, never
  -- cleared: a name a staff member gave in Sourcework is not erased from this page.
  select r.id into v_rep from public.sw_representations r
   where r.source_id = c.sourcework_source_id and r.kind = 'transcript' and r.status = 'ready';
  if v_rep is not null then
    update public.tw_speakers tw
       set display_name = resolved.name
      from (
        select sp.source_label,
               coalesce(nullif(btrim(coalesce(target.name, '')), ''), nullif(btrim(coalesce(sp.name, '')), '')) as name
          from public.al_speakers sp
          left join public.al_speakers target on target.id = sp.merged_into
         where sp.conversation_id = c.id
      ) resolved
     where tw.representation_id = v_rep and tw.diarization_label = resolved.source_label
       and resolved.name is not null and tw.display_name is distinct from resolved.name;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------------------------------------------
-- 2. Highlights become Sourcework excerpts

alter table public.al_highlights
  add column excerpt_id uuid references public.sw_source_excerpts (id) on delete set null;

comment on column public.al_highlights.excerpt_id is
  'The Sourcework excerpt made from this mark, once a staff member (or the scheduled route, as the campaign owner) has turned the marks into excerpts.';

-- Makes an excerpt for every mark that has none, in the transcript the conversation was sent as. p_created_by is the staff member the
-- excerpts are made as (Sourcework records who made an excerpt). Returns how many were made.
create function public.al_create_excerpts_from_highlights(p_conversation_id uuid, p_created_by uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.al_conversations;
  t public.al_tables;
  v_rep uuid;
  h record;
  v_excerpt uuid;
  v_made integer := 0;
begin
  select * into c from public.al_conversations where id = p_conversation_id;
  if not found or c.sourcework_source_id is null or p_created_by is null then
    return 0;
  end if;
  select * into t from public.al_tables where id = c.table_id;
  select r.id into v_rep from public.sw_representations r
   where r.source_id = c.sourcework_source_id and r.kind = 'transcript' and r.status = 'ready';
  if v_rep is null then
    return 0;
  end if;
  for h in select * from public.al_highlights where conversation_id = c.id and excerpt_id is null order by start_ms loop
    insert into public.sw_source_excerpts (source_id, representation_id, title, start_ms, end_ms, excerpt_text, created_by, origin, suggestion_reason)
    values (c.sourcework_source_id, v_rep,
            left('Table ' || t.number::text || ': ' || regexp_replace(h.text, '\s+', ' ', 'g'), 120),
            h.start_ms, h.end_ms, h.text, p_created_by, 'manual',
            left('Marked by the table''s facilitator as what mattered' || case when h.tag is null then '' else ' (' || h.tag || ')' end, 600))
    returning id into v_excerpt;
    update public.al_highlights set excerpt_id = v_excerpt where id = h.id;
    v_made := v_made + 1;
  end loop;
  return v_made;
end;
$$;

comment on function public.al_create_excerpts_from_highlights(uuid, uuid) is
  'Turns a conversation''s marked lines into Sourcework excerpts, once each. service_role only.';

revoke execute on function public.al_create_excerpts_from_highlights(uuid, uuid) from public, anon, authenticated;
grant execute on function public.al_create_excerpts_from_highlights(uuid, uuid) to service_role;

-- ------------------------------------------------------------------------------------------------
-- 3. The recorder: when each segment started

alter table public.al_conversation_segments add column started_at timestamptz;

comment on column public.al_conversation_segments.started_at is
  'The time the table''s phone started recording this segment, as its clock read, when it said. Used only to show a gap between segments.';

drop function public.al_site_table_segment_complete(text, integer, bigint, integer);

create function public.al_site_table_segment_complete(p_session_hash text, p_seq integer, p_size_bytes bigint, p_duration_ms integer, p_started_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.al_tables;
  v_conversation public.al_conversations;
  v_limit text;
  v_started timestamptz;
begin
  t := private.al_table_for_session(p_session_hash);
  if t.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  select * into v_conversation from public.al_conversations where table_id = t.id for update;
  if not found or not exists (select 1 from public.al_conversation_segments where conversation_id = v_conversation.id and seq = p_seq) then
    return jsonb_build_object('error', 'not_found');
  end if;
  v_limit := private.al_answer_limit_error(p_size_bytes, p_duration_ms, 300);
  if v_limit is not null then
    return jsonb_build_object('error', v_limit);
  end if;
  -- A phone's clock may be wrong: a start time outside the night is ignored rather than trusted.
  select case when p_started_at is not null and p_started_at between e.starts_at - interval '1 day' and e.ends_at + interval '13 hours'
              then p_started_at end into v_started
    from public.al_events e where e.id = t.event_id;

  update public.al_conversation_segments
     set status = 'uploaded', size_bytes = p_size_bytes, duration_ms = p_duration_ms, started_at = coalesce(v_started, started_at)
   where conversation_id = v_conversation.id and seq = p_seq and status <> 'uploaded';

  update public.al_conversations
     set duration_ms = (select coalesce(sum(duration_ms), 0) from public.al_conversation_segments
                         where conversation_id = v_conversation.id and status = 'uploaded')
   where id = v_conversation.id;
  perform private.al_conversation_settle(v_conversation.id);

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.al_site_table_segment_complete(text, integer, bigint, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.al_site_table_segment_complete(text, integer, bigint, integer, timestamptz) to service_role;

-- ------------------------------------------------------------------------------------------------
-- 4. A recording from a separate recorder, attached by staff to a table that has agreed

create function public.al_staff_reserve_recording(p_table_id uuid, p_content_type text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.al_tables;
  v_conversation uuid;
  v_path text;
begin
  if not private.has_audience_listening_access(auth.uid()) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if p_content_type is null or p_content_type not in ('audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav') then
    return jsonb_build_object('error', 'unsupported_type');
  end if;
  select * into t from public.al_tables where id = p_table_id for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  -- The table's agreement is the consent: a recording is attached only to a table that has given it.
  if t.agreed_at is null or t.state = 'waiting' then
    return jsonb_build_object('error', 'consent_required');
  end if;
  insert into public.al_conversations (table_id, event_id) values (t.id, t.event_id) on conflict (table_id) do nothing;
  select id into v_conversation from public.al_conversations where table_id = t.id;
  if exists (select 1 from public.al_conversations where id = v_conversation and sourcework_source_id is not null)
     or exists (select 1 from public.al_conversation_segments where conversation_id = v_conversation and status = 'uploaded') then
    return jsonb_build_object('error', 'not_open');
  end if;
  -- One file, as segment 0, replacing any unfinished segments the phone left.
  delete from public.al_conversation_segments where conversation_id = v_conversation and status <> 'uploaded';
  v_path := t.event_id::text || '/' || t.id::text || '/0';
  insert into public.al_conversation_segments (conversation_id, seq, storage_path, content_type) values (v_conversation, 0, v_path, p_content_type);
  return jsonb_build_object('storage_path', v_path);
end;
$$;

create function public.al_staff_complete_recording(p_table_id uuid, p_size_bytes bigint, p_duration_ms integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.al_tables;
  v_conversation public.al_conversations;
begin
  if not private.has_audience_listening_access(auth.uid()) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  select * into t from public.al_tables where id = p_table_id for update;
  if not found or t.agreed_at is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  select * into v_conversation from public.al_conversations where table_id = t.id for update;
  if not found or not exists (select 1 from public.al_conversation_segments where conversation_id = v_conversation.id and seq = 0 and status = 'pending') then
    return jsonb_build_object('error', 'not_found');
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_duration_ms is null or p_duration_ms <= 0 then
    return jsonb_build_object('error', 'invalid_size');
  end if;

  update public.al_conversation_segments set status = 'uploaded', size_bytes = p_size_bytes, duration_ms = p_duration_ms
   where conversation_id = v_conversation.id and seq = 0;
  update public.al_tables set state = 'ended' where id = t.id and state in ('agreed', 'recording', 'paused');
  update public.al_conversations set duration_ms = p_duration_ms, last_seq = 0, status = 'uploading' where id = v_conversation.id;
  perform private.al_conversation_settle(v_conversation.id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.al_staff_reserve_recording(uuid, text) from public, anon;
revoke execute on function public.al_staff_complete_recording(uuid, bigint, integer) from public, anon;
grant execute on function public.al_staff_reserve_recording(uuid, text) to authenticated;
grant execute on function public.al_staff_complete_recording(uuid, bigint, integer) to authenticated;

-- Staff upload to the one path al_staff_reserve_recording made: a pending segment 0 of a conversation. No other object, and a phone's own
-- pending segments are never theirs to write (staff upload with their own session, and only to a pending row they reserved).
create policy al_media_insert_staff_recording on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'audience-listening-media'
    and private.has_audience_listening_access(auth.uid())
    and exists (select 1 from public.al_conversation_segments s where s.storage_path = name and s.seq = 0 and s.status = 'pending')
  );

create policy al_media_update_staff_recording on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'audience-listening-media'
    and private.has_audience_listening_access(auth.uid())
    and exists (select 1 from public.al_conversation_segments s where s.storage_path = name and s.seq = 0 and s.status = 'pending')
  )
  with check (
    bucket_id = 'audience-listening-media'
    and private.has_audience_listening_access(auth.uid())
    and exists (select 1 from public.al_conversation_segments s where s.storage_path = name and s.seq = 0 and s.status = 'pending')
  );

-- ------------------------------------------------------------------------------------------------
-- 5. Scheduled work

create table public.al_job_runs (
  id uuid primary key default gen_random_uuid(),
  task text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  summary jsonb not null default '{}'::jsonb,
  error text,
  constraint al_job_runs_task_check check (char_length(task) between 1 and 60),
  constraint al_job_runs_error_check check (error is null or char_length(error) <= 1000)
);

create index al_job_runs_started_idx on public.al_job_runs (started_at desc);

comment on table public.al_job_runs is
  'One row per task of a scheduled run of the listening route: when, whether it worked, and counts. Written by the route (service role); staff read it.';

alter table public.al_job_runs enable row level security;
create policy al_job_runs_staff_select on public.al_job_runs for select to authenticated using (private.has_audience_listening_access(auth.uid()));
revoke all on public.al_job_runs from public, anon, authenticated;
grant select on public.al_job_runs to authenticated;

-- Facilitator emails and links thirty days after the event: the purge's step, without a person, because it is small and cannot lose a
-- conversation. Conversations themselves stay a coordinator's decision.
create function public.al_cron_clear_facilitator_emails()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.al_tables t
     set facilitator_email = null, after_token_hash = null, after_token_expires_at = null
    from public.al_events e
   where e.id = t.event_id and e.ends_at < now() - interval '30 days' and (t.facilitator_email is not null or t.after_token_hash is not null);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- What a purge would remove, for the reminder email. The same counts as al_purge_preview, without a signed-in staff member.
create function public.al_cron_purge_counts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'submissions', (select count(*) from public.al_submissions where status = 'in_progress' and updated_at < now() - interval '30 days'),
    'conversations', (select count(*) from public.al_conversations c join public.al_events e on e.id = c.event_id
                       where c.status <> 'sent' and e.ends_at < now() - interval '30 days'
                         and not exists (select 1 from public.al_contact_cards k
                                          where k.conversation_id = c.id and (k.contacted_at is not null or k.name_approved_at is not null)))
  );
$$;

-- What the Ask digest says: how many are waiting, and how many requests to host have waited past five days. Counts only.
create function public.al_cron_digest_counts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'questions_new', (select count(*) from public.al_inbox where state = 'new'),
    'host_requests_new', (select count(*) from public.al_host_requests where state = 'new'),
    'host_requests_late', (select count(*) from public.al_host_requests where state = 'new' and created_at < now() - interval '5 days')
  );
$$;

revoke execute on function public.al_cron_clear_facilitator_emails() from public, anon, authenticated;
revoke execute on function public.al_cron_purge_counts() from public, anon, authenticated;
revoke execute on function public.al_cron_digest_counts() from public, anon, authenticated;
grant execute on function public.al_cron_clear_facilitator_emails() to service_role;
grant execute on function public.al_cron_purge_counts() to service_role;
grant execute on function public.al_cron_digest_counts() to service_role;

-- ------------------------------------------------------------------------------------------------
-- 6. Kitchen tables

alter table public.al_campaigns add column accepts_kitchen_tables boolean not null default false;

alter table public.al_events
  add column kitchen_host_subject text,
  add constraint al_events_kitchen_host_subject_check check (kitchen_host_subject is null or kitchen_host_subject ~ '^site:(visitor|account):[A-Za-z0-9_-]{1,128}$');

comment on column public.al_events.kitchen_host_subject is
  'The opaque subject that started a kitchen table, kept only to limit how many one host starts in a day. Not an organizer: it opens nothing.';

comment on column public.al_campaigns.accepts_kitchen_tables is
  'Whether anyone may start a private one-table session for this campaign from the website, without staff. The event is never listed.';

-- A host starts a kitchen table: a private event with one table, and its single-use link, made by the site's server from a token whose
-- hash is p_link_hash. Rate limited by the route and again here (three a day per host). The event is private and never listed, so staff
-- see it with every other event and nobody else does.
create function public.al_site_kitchen_table_create(
  p_subject text, p_campaign_public_id text, p_link_hash text, p_host_name text, p_place text, p_starts_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.al_campaigns;
  v_start timestamptz;
  v_event uuid;
  v_public text;
  v_name text := nullif(btrim(coalesce(p_host_name, '')), '');
  v_place text := coalesce(nullif(btrim(coalesce(p_place, '')), ''), 'A kitchen table');
begin
  if not private.tool_is_enabled('audience-listening') then
    return jsonb_build_object('error', 'not_accepting');
  end if;
  if private.al_site_subject(p_subject) is null or not private.al_valid_hash(p_link_hash) or p_campaign_public_id is null then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  if (v_name is not null and char_length(v_name) > 120) or char_length(v_place) > 200 then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  select * into c from public.al_campaigns where public_id = p_campaign_public_id and status = 'open' and accepts_kitchen_tables;
  if not found then
    return jsonb_build_object('error', 'not_available');
  end if;
  if not exists (select 1 from public.al_consent_texts) then
    return jsonb_build_object('error', 'not_accepting');
  end if;
  if (select count(*) from public.al_events
       where organizer_kind = 'person' and kitchen_host_subject = p_subject and created_at > now() - interval '1 day') >= 3 then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  v_start := least(greatest(coalesce(p_starts_at, now()), now() - interval '1 hour'), now() + interval '30 days');
  if (c.opens_at is not null and v_start < c.opens_at) or (c.closes_at is not null and v_start > c.closes_at) then
    return jsonb_build_object('error', 'not_open');
  end if;

  v_public := substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 16);
  insert into public.al_events (public_id, campaign_id, title, starts_at, ends_at, place_name, status, visibility, listing_state, organizer_kind, organizer_label, kitchen_host_subject)
  values (v_public, c.id, left(c.title || ' · kitchen table', 200), v_start, v_start + interval '6 hours', v_place, 'scheduled', 'private', 'not_listed',
          'person', v_name, p_subject)
  returning id into v_event;
  insert into public.al_tables (event_id, number, join_token_hash, join_token_issued_at) values (v_event, 1, p_link_hash, now());

  return jsonb_build_object('event_public_id', v_public, 'title', c.title, 'question', c.question);
end;
$$;

comment on function public.al_site_kitchen_table_create(text, text, text, text, text, timestamptz) is
  'Starts a private one-table event for a host and gives its table the link whose hash is passed. service_role only.';

revoke execute on function public.al_site_kitchen_table_create(text, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.al_site_kitchen_table_create(text, text, text, text, text, timestamptz) to service_role;

-- The hub also lists the campaigns that accept kitchen tables.
create or replace function public.al_site_hub()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select (case
    when not private.tool_is_enabled('audience-listening') then
      jsonb_build_object('open', '[]'::jsonb, 'answered', '[]'::jsonb)
    else jsonb_build_object(
      -- Open now: listed, open, inside its window, and with something to answer. No count.
      'open', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'public_id', q.public_id,
            'public_title', q.public_title,
            'public_intro', q.public_intro,
            'asked_by', q.asked_by,
            'from_label', q.from_label,
            'context_label', q.context_label,
            'closes_at', q.closes_at,
            'allow_text_answers', q.allow_text_answers,
            'question_count', (select count(*) from public.al_questions x where x.query_id = q.id)
          )
          order by coalesce(q.opens_at, q.created_at) desc
        )
        from (
          select * from public.al_queries
          where listed_on_hub
            and private.al_is_accepting(id)
            and exists (select 1 from public.al_questions x where x.query_id = al_queries.id)
          order by coalesce(opens_at, created_at) desc
          limit 24
        ) q
      ), '[]'::jsonb),
      -- Answered: listed, open or closed, with at least one outcome. The count is allowed here and only here.
      'answered', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'public_id', q.public_id,
            'public_title', q.public_title,
            'asked_by', q.asked_by,
            'from_label', q.from_label,
            'context_label', q.context_label,
            'response_count', (
              select count(*) from public.al_submissions s where s.query_id = q.id and s.status = 'submitted'
            ),
            'outcomes', (
              select jsonb_agg(
                jsonb_build_object(
                  'kind', o.kind,
                  'title', o.title,
                  'url', o.url,
                  'published_at', o.published_at,
                  'summary', o.summary
                )
                order by o.published_at desc, o.created_at desc
              )
              from public.al_outcomes o where o.query_id = q.id
            )
          )
          order by q.latest_outcome desc
        )
        from (
          select al_queries.*, (select max(o.published_at) from public.al_outcomes o where o.query_id = al_queries.id) as latest_outcome
          from public.al_queries
          where listed_on_hub
            and status in ('open', 'closed')
            and exists (select 1 from public.al_outcomes o where o.query_id = al_queries.id)
          order by latest_outcome desc
          limit 24
        ) q
      ), '[]'::jsonb)
    )
  end) || jsonb_build_object('kitchen_campaigns',
    case when not private.tool_is_enabled('audience-listening') then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('public_id', k.public_id, 'title', k.title, 'question', k.question) order by k.created_at desc)
      from (
        select * from public.al_campaigns
         where status = 'open' and accepts_kitchen_tables
           and (closes_at is null or closes_at > now())
           and exists (select 1 from public.al_consent_texts)
         order by created_at desc
         limit 6
      ) k
    ), '[]'::jsonb) end) || jsonb_build_object('events',
    case when not private.tool_is_enabled('audience-listening') then '[]'::jsonb else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'public_id', x.public_id,
          'title', x.title,
          'starts_at', x.starts_at,
          'ends_at', x.ends_at,
          'place_name', x.place_name,
          'city', x.city,
          'organizer_label', x.organizer_label,
          'seats_left', case when x.seats is null then null
                             else greatest(0, x.seats - (select count(*) from public.al_seats s where s.event_id = x.id)) end
        )
        order by x.starts_at
      )
      from (
        select * from public.al_events e
         where e.visibility = 'public' and e.listing_state = 'listed' and e.status = 'scheduled' and e.ends_at > now()
           and exists (select 1 from public.al_campaigns c where c.id = e.campaign_id and c.status = 'open')
         order by e.starts_at
         limit 12
      ) x
    ), '[]'::jsonb) end);
$$;

