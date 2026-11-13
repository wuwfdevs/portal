-- Audience Listening: the table session and recording (phase D, second half, of docs/audience-listening-suite-design.md §2, §4, §5).
--
-- What a person at a table can do, through the website and only through the Portal's signed API:
--
--   open     redeem the table's single-use link: the hash of the link token is matched, the link is marked used, and a table SESSION
--            begins. The session is a second random token the site holds for that phone; only its SHA-256 is stored here.
--   agree    the facilitator's tap after the consent is read aloud, recorded as the table's agreement with the wording version they were
--            shown. Nothing records before it.
--   update   start, pause, resume, ask for a hand, move to a prompt.
--   segment  reserve a segment (at most five minutes), upload it by a signed URL the route mints, then complete it. The phone sends
--            segments as it goes and, after a drop, asks which are uploaded and sends the rest.
--   end      the table is over; the conversation is complete once every segment up to the last has uploaded.
--
-- Also here, because they are the two reads/writes of a public event that the Portal owns: the listed event (for its page) and a saved seat.
--
-- Rules that live in the database so no screen can get them wrong: a link is redeemed once; a table's session ends when staff re-issue its
-- link (a trigger, so no code path can forget); nothing is accepted before the agreement; a segment obeys the same size and duration
-- limits as an answer (private.al_answer_limit_error, five minutes); an event takes a table only while it is scheduled or live, inside
-- its day, in an open campaign; and the group-consent wording is a numbered version, never an edit.
--
-- Staff never write any of this. They read conversations and segments (RLS), and add a new version of the consent wording.
-- Every al_site_* function is execute for service_role only, like the rest.

-- ------------------------------------------------------------------------------------------------
-- The wording of the group consent. A change is a new version, never an edit (design §11, item 1).

create table public.al_consent_texts (
  id uuid primary key default gen_random_uuid(),
  version integer not null,
  body text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint al_consent_texts_version_unique unique (version),
  constraint al_consent_texts_body_check check (char_length(btrim(body)) between 1 and 4000)
);

comment on table public.al_consent_texts is
  'The words read aloud at a table before it records, as numbered versions. Insert-only: a change is a new version. al_tables.consent_text_version records the version the facilitator was shown.';

create function public.al_consent_texts_set_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.version := coalesce((select max(version) from public.al_consent_texts), 0) + 1;
  return new;
end;
$$;

create trigger al_consent_texts_set_version
  before insert on public.al_consent_texts
  for each row execute function public.al_consent_texts_set_version();

revoke execute on function public.al_consent_texts_set_version() from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------------
-- The table session

alter table public.al_tables
  add column session_hash text,
  add column session_expires_at timestamptz,
  add constraint al_tables_session_hash_check check (session_hash is null or session_hash ~ '^[0-9a-f]{64}$');

comment on column public.al_tables.session_hash is
  'SHA-256 of the table session token the website holds for the facilitator''s phone. Never the token. Cleared when staff re-issue the link.';

-- Re-issuing a link ends the session made from the old one, whichever code path wrote the new hash.
create function public.al_tables_end_session_on_reissue()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.join_token_hash is distinct from old.join_token_hash then
    new.session_hash := null;
    new.session_expires_at := null;
  end if;
  return new;
end;
$$;

create trigger al_tables_end_session_on_reissue
  before update on public.al_tables
  for each row execute function public.al_tables_end_session_on_reissue();

revoke execute on function public.al_tables_end_session_on_reissue() from public, anon, authenticated;

create index al_tables_session_idx on public.al_tables (session_hash) where session_hash is not null;
create index al_tables_link_idx on public.al_tables (join_token_hash) where join_token_hash is not null;

-- ------------------------------------------------------------------------------------------------
-- Conversations and their segments

create table public.al_conversations (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.al_tables (id) on delete cascade,
  event_id uuid not null references public.al_events (id) on delete cascade,
  status text not null default 'recording',
  last_seq integer,
  duration_ms integer not null default 0,
  transcription_project_id uuid references public.tw_projects (id) on delete set null,
  sourcework_source_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint al_conversations_table_unique unique (table_id),
  constraint al_conversations_status_check check (status in ('recording', 'uploading', 'complete', 'transcribing', 'ready', 'named', 'sent')),
  constraint al_conversations_last_seq_check check (last_seq is null or last_seq between 0 and 99),
  constraint al_conversations_duration_check check (duration_ms >= 0)
);

comment on table public.al_conversations is
  'One recording per table, in segments. complete once the table has ended and every segment up to last_seq has uploaded. Staff read; only the table session writes.';

create trigger set_al_conversations_updated_at
  before update on public.al_conversations
  for each row execute function public.set_updated_at();

create table public.al_conversation_segments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.al_conversations (id) on delete cascade,
  seq integer not null,
  storage_path text not null,
  content_type text not null,
  size_bytes bigint,
  duration_ms integer,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint al_conversation_segments_seq_unique unique (conversation_id, seq),
  constraint al_conversation_segments_seq_check check (seq between 0 and 99),
  constraint al_conversation_segments_status_check check (status in ('pending', 'uploaded', 'failed')),
  constraint al_conversation_segments_type_check check (content_type in ('audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'))
);

comment on table public.al_conversation_segments is
  'A recording of at most five minutes, uploaded by its own signed URL so a dropped connection resumes. The original segments are never replaced once uploaded.';

create trigger set_al_conversation_segments_updated_at
  before update on public.al_conversation_segments
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------------------------------------
-- RLS: staff read; a coordinator adds a version of the consent wording (insert only); nothing else is written by a screen.

alter table public.al_consent_texts enable row level security;
alter table public.al_conversations enable row level security;
alter table public.al_conversation_segments enable row level security;

revoke all on public.al_consent_texts, public.al_conversations, public.al_conversation_segments from anon, authenticated;
grant select, insert (body, created_by) on public.al_consent_texts to authenticated;
grant select on public.al_conversations to authenticated;
grant select on public.al_conversation_segments to authenticated;

create policy al_consent_texts_member_select on public.al_consent_texts
  for select to authenticated
  using ((select private.has_audience_listening_access((select auth.uid()))));
-- Only a coordinator adds a version: it is what a table agrees to, and the wording is settled with the University's counsel.
create policy al_consent_texts_coordinator_insert on public.al_consent_texts
  for insert to authenticated
  with check (
    (select private.has_audience_listening_access((select auth.uid())))
    and (select private.is_audience_listening_coordinator((select auth.uid())))
  );
create policy al_conversations_member_select on public.al_conversations
  for select to authenticated
  using ((select private.has_audience_listening_access((select auth.uid()))));
create policy al_conversation_segments_member_select on public.al_conversation_segments
  for select to authenticated
  using ((select private.has_audience_listening_access((select auth.uid()))));

-- ------------------------------------------------------------------------------------------------
-- Helpers (private; never exposed)

create function private.al_valid_hash(p_hash text)
returns boolean
language sql
immutable
as $$
  select p_hash is not null and p_hash ~ '^[0-9a-f]{64}$';
$$;

-- What a table's phone is shown: its place, the wording to read, the prompts, the tag vocabulary and where it is.
create function private.al_table_view(p_table_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t public.al_tables;
  e public.al_events;
  c public.al_campaigns;
  v_consent public.al_consent_texts;
begin
  select * into t from public.al_tables where id = p_table_id;
  select * into e from public.al_events where id = t.event_id;
  select * into c from public.al_campaigns where id = e.campaign_id;
  -- The wording the facilitator was shown, once they agreed; otherwise the current one.
  select * into v_consent from public.al_consent_texts
   where version = coalesce(nullif(t.consent_text_version, '')::integer, (select max(version) from public.al_consent_texts));

  return jsonb_build_object(
    'number', t.number,
    'state', t.state,
    'event_title', e.title,
    'place_name', e.place_name,
    'question', c.question,
    'prompt_position', t.prompt_position,
    'help_requested', t.help_requested_at is not null,
    'facilitator_first_name', t.facilitator_first_name,
    'consent', case when v_consent.id is null then null
                    else jsonb_build_object('version', v_consent.version, 'text', v_consent.body) end,
    'prompts', coalesce((
      select jsonb_agg(jsonb_build_object('position', p.position, 'kind', p.kind, 'text', p.text, 'hint', p.hint,
                                          'suggested_seconds', p.suggested_seconds) order by p.position, p.created_at)
      from public.al_campaign_prompts p where p.campaign_id = c.id), '[]'::jsonb),
    'tags', coalesce((select jsonb_agg(g.label order by g.position, g.created_at) from public.al_campaign_tags g where g.campaign_id = c.id), '[]'::jsonb),
    'uploaded_seqs', coalesce((
      select jsonb_agg(s.seq order by s.seq)
      from public.al_conversations cv
      join public.al_conversation_segments s on s.conversation_id = cv.id and s.status = 'uploaded'
      where cv.table_id = t.id), '[]'::jsonb)
  );
end;
$$;

revoke execute on function private.al_table_view(uuid) from public, anon, authenticated;

-- The table behind a live session, locked for the call, or no row. An unknown, expired and replaced session are the same answer.
create function private.al_table_for_session(p_session_hash text)
returns public.al_tables
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.al_tables;
begin
  if not private.al_valid_hash(p_session_hash) then
    return null;
  end if;
  select * into t from public.al_tables
   where session_hash = p_session_hash and session_expires_at > now()
   for update;
  if not found then
    return null;
  end if;
  return t;
end;
$$;

revoke execute on function private.al_table_for_session(text) from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------------
-- open: redeem the single-use link

create function public.al_site_table_open(p_link_hash text, p_session_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.al_tables;
  e public.al_events;
  c public.al_campaigns;
begin
  if not private.al_valid_hash(p_link_hash) or not private.al_valid_hash(p_session_hash) then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  if not private.tool_is_enabled('audience-listening') then
    return jsonb_build_object('error', 'not_accepting');
  end if;

  select * into t from public.al_tables where join_token_hash = p_link_hash for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if t.join_token_used_at is not null then
    return jsonb_build_object('error', 'link_used');
  end if;

  select * into e from public.al_events where id = t.event_id;
  select * into c from public.al_campaigns where id = e.campaign_id;
  if e.status not in ('scheduled', 'live') or c.status <> 'open'
     or now() < e.starts_at - interval '1 day' or now() > e.ends_at + interval '12 hours'
  then
    return jsonb_build_object('error', 'not_open');
  end if;
  -- Without the wording to read aloud there is nothing to agree to, so the table cannot begin.
  if not exists (select 1 from public.al_consent_texts) then
    return jsonb_build_object('error', 'not_accepting');
  end if;

  update public.al_tables
     set join_token_used_at = now(),
         session_hash = p_session_hash,
         session_expires_at = e.ends_at + interval '12 hours'
   where id = t.id;

  return jsonb_build_object('session_expires_at', e.ends_at + interval '12 hours', 'table', private.al_table_view(t.id));
end;
$$;

comment on function public.al_site_table_open(text, text) is
  'Redeems a table''s single-use link (matched by hash) and starts a table session (stored by hash). A second redemption is link_used. service_role only.';

-- ------------------------------------------------------------------------------------------------
-- read: where the table is (also how a phone that dropped finds which segments to send)

create function public.al_site_table_state(p_session_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.al_tables;
begin
  t := private.al_table_for_session(p_session_hash);
  if t.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  return jsonb_build_object('table', private.al_table_view(t.id));
end;
$$;

-- ------------------------------------------------------------------------------------------------
-- agree: the group-consent record

create function public.al_site_table_agree(p_session_hash text, p_consent_version integer, p_first_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.al_tables;
  v_name text := nullif(btrim(coalesce(p_first_name, '')), '');
begin
  t := private.al_table_for_session(p_session_hash);
  if t.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_name is not null and char_length(v_name) > 60 then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  -- Idempotent: tapping twice, or reopening, does not move the record of when the table agreed or to what.
  if t.state <> 'waiting' then
    return jsonb_build_object('table', private.al_table_view(t.id));
  end if;
  if p_consent_version is null or not exists (select 1 from public.al_consent_texts where version = p_consent_version) then
    return jsonb_build_object('error', 'invalid_request');
  end if;

  update public.al_tables
     set state = 'agreed', agreed_at = now(), consent_text_version = p_consent_version::text,
         facilitator_first_name = v_name
   where id = t.id;
  return jsonb_build_object('table', private.al_table_view(t.id));
end;
$$;

comment on function public.al_site_table_agree(text, integer, text) is
  'Records the table''s agreement (the facilitator''s tap after the consent is read aloud) with the wording version they were shown. service_role only.';

-- ------------------------------------------------------------------------------------------------
-- update: start, pause, resume, ask for a hand, move to a prompt

create function public.al_site_table_update(p_session_hash text, p_event text, p_prompt integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.al_tables;
  v_prompts integer;
begin
  t := private.al_table_for_session(p_session_hash);
  if t.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if p_event is null or p_event not in ('start', 'pause', 'resume', 'help', 'help-clear', 'prompt') then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  if t.state in ('ended', 'sent') then
    return jsonb_build_object('error', 'not_open');
  end if;

  if p_event in ('start', 'pause', 'resume') then
    -- Nothing records before the table has agreed.
    if t.state = 'waiting' then
      return jsonb_build_object('error', 'consent_required');
    end if;
    if p_event in ('start', 'resume') and t.state <> 'recording' then
      update public.al_tables set state = 'recording' where id = t.id;
      update public.al_events set status = 'live' where id = t.event_id and status = 'scheduled';
    elsif p_event = 'pause' and t.state = 'recording' then
      update public.al_tables set state = 'paused' where id = t.id;
    end if;
  elsif p_event = 'help' then
    update public.al_tables set help_requested_at = coalesce(help_requested_at, now()) where id = t.id;
  elsif p_event = 'help-clear' then
    update public.al_tables set help_requested_at = null where id = t.id;
  else
    select count(*) into v_prompts
      from public.al_campaign_prompts p
      join public.al_events e on e.campaign_id = p.campaign_id
     where e.id = t.event_id;
    if p_prompt is null or p_prompt < 1 or p_prompt > greatest(v_prompts, 1) then
      return jsonb_build_object('error', 'invalid_request');
    end if;
    update public.al_tables set prompt_position = p_prompt where id = t.id;
  end if;

  return jsonb_build_object('table', private.al_table_view(t.id));
end;
$$;

-- ------------------------------------------------------------------------------------------------
-- segments: reserve (the row exists before the bytes), then complete

create function public.al_site_table_segment(p_session_hash text, p_seq integer, p_content_type text)
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
  t := private.al_table_for_session(p_session_hash);
  if t.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if p_seq is null or p_seq < 0 or p_seq > 99 then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  if p_content_type is null or p_content_type not in ('audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav') then
    return jsonb_build_object('error', 'unsupported_type');
  end if;
  -- The agreement comes first. An ended table may still send segments its phone had not finished uploading.
  if t.state = 'waiting' then
    return jsonb_build_object('error', 'consent_required');
  end if;
  if t.state = 'sent' then
    return jsonb_build_object('error', 'not_open');
  end if;

  insert into public.al_conversations (table_id, event_id) values (t.id, t.event_id)
  on conflict (table_id) do nothing;
  select id into v_conversation from public.al_conversations where table_id = t.id;

  -- An uploaded segment is never replaced: the original is the record.
  if exists (select 1 from public.al_conversation_segments where conversation_id = v_conversation and seq = p_seq and status = 'uploaded') then
    return jsonb_build_object('already_uploaded', true, 'seq', p_seq);
  end if;

  v_path := t.event_id::text || '/' || t.id::text || '/' || p_seq::text;
  insert into public.al_conversation_segments (conversation_id, seq, storage_path, content_type)
  values (v_conversation, p_seq, v_path, p_content_type)
  on conflict (conversation_id, seq) do update
    set content_type = excluded.content_type, status = 'pending', size_bytes = null, duration_ms = null;

  return jsonb_build_object('seq', p_seq, 'storage_path', v_path, 'max_segment_seconds', 300);
end;
$$;

create function public.al_site_table_segment_complete(p_session_hash text, p_seq integer, p_size_bytes bigint, p_duration_ms integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.al_tables;
  v_conversation public.al_conversations;
  v_limit text;
begin
  t := private.al_table_for_session(p_session_hash);
  if t.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  select * into v_conversation from public.al_conversations where table_id = t.id for update;
  if not found or not exists (select 1 from public.al_conversation_segments where conversation_id = v_conversation.id and seq = p_seq) then
    return jsonb_build_object('error', 'not_found');
  end if;
  -- The same limits as an answer (private.al_answer_limit_error), with a five-minute segment.
  v_limit := private.al_answer_limit_error(p_size_bytes, p_duration_ms, 300);
  if v_limit is not null then
    return jsonb_build_object('error', v_limit);
  end if;

  update public.al_conversation_segments
     set status = 'uploaded', size_bytes = p_size_bytes, duration_ms = p_duration_ms
   where conversation_id = v_conversation.id and seq = p_seq and status <> 'uploaded';

  update public.al_conversations
     set duration_ms = (select coalesce(sum(duration_ms), 0) from public.al_conversation_segments
                         where conversation_id = v_conversation.id and status = 'uploaded')
   where id = v_conversation.id;
  perform private.al_conversation_settle(v_conversation.id);

  return jsonb_build_object('ok', true);
end;
$$;

-- A conversation is complete when its table has ended and every segment from 0 to last_seq is uploaded.
create function private.al_conversation_settle(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.al_conversations;
  v_ended boolean;
  v_missing integer;
begin
  select * into c from public.al_conversations where id = p_conversation_id;
  select state in ('ended', 'sent') into v_ended from public.al_tables where id = c.table_id;
  if not v_ended or c.last_seq is null or c.status not in ('recording', 'uploading') then
    return;
  end if;
  select count(*) into v_missing
    from generate_series(0, c.last_seq) as g(seq)
   where not exists (select 1 from public.al_conversation_segments s
                      where s.conversation_id = c.id and s.seq = g.seq and s.status = 'uploaded');
  update public.al_conversations set status = case when v_missing = 0 then 'complete' else 'uploading' end where id = c.id;
end;
$$;

revoke execute on function private.al_conversation_settle(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------------
-- end

create function public.al_site_table_end(p_session_hash text, p_last_seq integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.al_tables;
  v_conversation public.al_conversations;
  v_missing jsonb;
begin
  t := private.al_table_for_session(p_session_hash);
  if t.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if p_last_seq is null or p_last_seq < -1 or p_last_seq > 99 then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  if t.state = 'waiting' then
    return jsonb_build_object('error', 'consent_required');
  end if;

  if t.state in ('agreed', 'recording', 'paused') then
    update public.al_tables set state = 'ended' where id = t.id;
  end if;

  -- -1 means nothing was recorded: there is no conversation to complete.
  select * into v_conversation from public.al_conversations where table_id = t.id for update;
  if not found or p_last_seq < 0 then
    return jsonb_build_object('complete', true, 'missing', '[]'::jsonb);
  end if;

  update public.al_conversations set last_seq = p_last_seq, status = 'uploading'
   where id = v_conversation.id and status in ('recording', 'uploading');
  perform private.al_conversation_settle(v_conversation.id);

  select coalesce(jsonb_agg(g.seq order by g.seq), '[]'::jsonb) into v_missing
    from generate_series(0, p_last_seq) as g(seq)
   where not exists (select 1 from public.al_conversation_segments s
                      where s.conversation_id = v_conversation.id and s.seq = g.seq and s.status = 'uploaded');
  return jsonb_build_object('complete', v_missing = '[]'::jsonb, 'missing', v_missing);
end;
$$;

-- ------------------------------------------------------------------------------------------------
-- A public event and a saved seat

create function public.al_site_event(p_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  e public.al_events;
begin
  select * into e from public.al_events
   where public_id = p_public_id and visibility = 'public' and listing_state = 'listed' and status in ('scheduled', 'live')
     and exists (select 1 from public.al_campaigns c where c.id = al_events.campaign_id and c.status = 'open');
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'public_id', e.public_id,
    'title', e.title,
    'starts_at', e.starts_at,
    'ends_at', e.ends_at,
    'place_name', e.place_name,
    'address', e.address,
    'city', e.city,
    'organizer_label', e.organizer_label,
    'journalist_joining', e.wuwf_journalist_joining,
    'seats_left', case when e.seats is null then null
                       else greatest(0, e.seats - (select count(*) from public.al_seats s where s.event_id = e.id)) end
  );
end;
$$;

create function public.al_site_seat_save(p_subject text, p_public_id text, p_name text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.al_events;
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := btrim(coalesce(p_email, ''));
begin
  if private.al_site_subject(p_subject) is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;
  if not private.tool_is_enabled('audience-listening') then
    return jsonb_build_object('error', 'not_accepting');
  end if;
  if char_length(v_name) = 0 or char_length(v_email) = 0 then
    return jsonb_build_object('error', 'required_field_missing');
  end if;
  if char_length(v_name) > 200 or char_length(v_email) > 320 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('error', 'invalid_request');
  end if;

  select * into e from public.al_events
   where public_id = p_public_id and visibility = 'public' and listing_state = 'listed' and status in ('scheduled', 'live')
     and ends_at > now()
     and exists (select 1 from public.al_campaigns c where c.id = al_events.campaign_id and c.status = 'open');
  if not found then
    return jsonb_build_object('error', 'not_available');
  end if;

  -- The same address twice is the same seat, even when the event has since filled.
  if exists (select 1 from public.al_seats where event_id = e.id and lower(email) = lower(v_email)) then
    return jsonb_build_object('ok', true);
  end if;

  begin
    insert into public.al_seats (event_id, name, email, subject) values (e.id, v_name, v_email, p_subject);
  exception
    when unique_violation then
      -- The same address twice is the same seat; saying so again changes nothing.
      return jsonb_build_object('ok', true);
    when check_violation then
      if sqlerrm = 'event_full' then
        return jsonb_build_object('error', 'event_full');
      end if;
      raise;
  end;
  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.al_site_seat_save(text, text, text, text) is
  'Saves a seat at a listed public event: a name and an email used for that event only. Capped by the event''s seats. service_role only.';

-- ------------------------------------------------------------------------------------------------

revoke execute on function public.al_site_table_open(text, text) from public, anon, authenticated;
revoke execute on function public.al_site_table_state(text) from public, anon, authenticated;
revoke execute on function public.al_site_table_agree(text, integer, text) from public, anon, authenticated;
revoke execute on function public.al_site_table_update(text, text, integer) from public, anon, authenticated;
revoke execute on function public.al_site_table_segment(text, integer, text) from public, anon, authenticated;
revoke execute on function public.al_site_table_segment_complete(text, integer, bigint, integer) from public, anon, authenticated;
revoke execute on function public.al_site_table_end(text, integer) from public, anon, authenticated;
revoke execute on function public.al_site_event(text) from public, anon, authenticated;
revoke execute on function public.al_site_seat_save(text, text, text, text) from public, anon, authenticated;
grant execute on function public.al_site_table_open(text, text) to service_role;
grant execute on function public.al_site_table_state(text) to service_role;
grant execute on function public.al_site_table_agree(text, integer, text) to service_role;
grant execute on function public.al_site_table_update(text, text, integer) to service_role;
grant execute on function public.al_site_table_segment(text, integer, text) to service_role;
grant execute on function public.al_site_table_segment_complete(text, integer, bigint, integer) to service_role;
grant execute on function public.al_site_table_end(text, integer) to service_role;
grant execute on function public.al_site_event(text) to service_role;
grant execute on function public.al_site_seat_save(text, text, text, text) to service_role;
