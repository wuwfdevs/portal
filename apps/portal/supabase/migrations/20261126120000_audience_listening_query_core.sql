-- Audience Listening: the query is the core record (design doc section 13).
--
-- What changes: the campaign layer goes. A query now carries what a campaign carried (an owner, a Sourcework project, who may host), events and
-- host requests hang off a query, a table's questions are the query's own questions, pacing is the event's, tags go and a mark keeps an optional
-- note, and the words every recording opens with are a station-level numbered version like the consent wording.
--
-- Two parts. Part 1 only adds and replaces. Part 2 (after the marker) drops the campaign tables, the old triggers and functions and the tag column;
-- it is its own block because the Supabase connector holds back statements it classes as destructive (CLAUDE.md, "Database workflow"). Run part 1,
-- then part 2. Nothing is in production; the preview project holds one demonstration campaign, whose query, owner, Sourcework project and hosting
-- setting are carried across below so its events keep working.

-- =================================================================================================
-- PART 1: add and replace

-- The query gains the campaign's remaining jobs. from_label (already there) is the "from WUWF" line the campaign called owner_label.
alter table public.al_queries
  add column owner_id uuid references public.profiles (id) on delete set null,
  add column sourcework_project_id uuid references public.tw_projects (id) on delete set null,
  add column hosting text not null default 'staff_only';

alter table public.al_queries
  add constraint al_queries_hosting_check check (hosting in ('staff_only', 'private_tables', 'anyone'));

comment on column public.al_queries.owner_id is
  'The staff member the query is the responsibility of, and the person a scheduled hand-off to Sourcework is made as (the old campaign owner). Null falls back to whoever made it.';
comment on column public.al_queries.sourcework_project_id is
  'The one Sourcework project for this query; each table''s recording is a source in it.';
comment on column public.al_queries.hosting is
  'Who may convene around this query. staff_only: only staff make events. private_tables: anyone may also start a private one-table session from the website (a kitchen table). anyone: that, and anyone may send a request to host a session for staff to schedule. Every public event is still approved by a coordinator before it is listed.';

-- The preview project''s demonstration campaign: carry its settings to its query (no-op on an empty database).
update public.al_queries q
   set owner_id = c.owner_id,
       sourcework_project_id = c.sourcework_project_id,
       hosting = case when c.accepts_kitchen_tables then 'private_tables' else 'staff_only' end
  from public.al_campaigns c
 where c.query_id = q.id;

-- Events hang off a query.
alter table public.al_events
  add column query_id uuid references public.al_queries (id) on delete restrict,
  add column planned_minutes integer;

update public.al_events e set query_id = c.query_id from public.al_campaigns c where c.id = e.campaign_id and c.query_id is not null;

alter table public.al_events alter column query_id set not null;
alter table public.al_events add constraint al_events_planned_minutes_check check (planned_minutes is null or planned_minutes between 10 and 480);

create index al_events_query_idx on public.al_events (query_id, starts_at);

comment on column public.al_events.query_id is 'The query this session is convened around. Every query can be convened around.';
comment on column public.al_events.planned_minutes is
  'How long the session is planned to run, in minutes. Null means ends_at minus starts_at. Pacing is computed from it (the suggested time for each question); nothing is enforced. A kitchen table''s host chooses 30, 45 or 60.';
comment on table public.al_events is
  'A listening session in a place at a time, convened around a query. A public event is listed only after a coordinator approves it; a private event is never listed. A private event with one table is the kitchen table.';

-- An event starts inside its query's window.
create function public.al_events_check_query_span()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_opens timestamptz;
  v_closes timestamptz;
begin
  select opens_at, closes_at into v_opens, v_closes from public.al_queries where id = new.query_id;
  if v_opens is not null and new.starts_at < v_opens then
    raise exception 'event_outside_query' using errcode = '23514', detail = 'The event starts before the query opens.';
  end if;
  if v_closes is not null and new.starts_at > v_closes then
    raise exception 'event_outside_query' using errcode = '23514', detail = 'The event starts after the query closes.';
  end if;
  return new;
end;
$$;

create trigger al_events_check_query_span
  before insert or update of starts_at, query_id on public.al_events
  for each row execute function public.al_events_check_query_span();

revoke execute on function public.al_events_check_query_span() from public, anon, authenticated;

-- A host request is made on a query.
alter table public.al_host_requests add column query_id uuid references public.al_queries (id) on delete restrict;
alter table public.al_host_requests alter column query_id set not null;
comment on column public.al_host_requests.query_id is 'The query the person wants to host a session around. A request is always about a query; there is no general door.';

-- A mark keeps an optional note (why it mattered) in place of a tag from a vocabulary chosen in advance.
alter table public.al_highlights add column note text;
alter table public.al_highlights add constraint al_highlights_note_check check (note is null or char_length(note) between 1 and 500);
comment on table public.al_highlights is
  'Lines the facilitator marked "what mattered", with an optional note on why. There is no tag vocabulary: themes are found by Sourcework, not chosen in advance. The text is a snapshot copied by the function from the transcript line, so re-transcribing never changes what was marked.';

-- The words every table''s recording opens with, as numbered versions (insert-only, like the consent wording).
create table public.al_opening_texts (
  id uuid primary key default gen_random_uuid(),
  version integer not null,
  body text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint al_opening_texts_version_unique unique (version),
  constraint al_opening_texts_body_check check (char_length(btrim(body)) between 1 and 2000)
);

comment on table public.al_opening_texts is
  'What every table''s recording opens with (each person says their first name, where they live and that they are okay being recorded): the on-tape half of the consent. Station-wide, not per query, and not editable by a reporter. Insert-only numbered versions; al_tables.opening_text_version records the version the table was shown.';

create function public.al_opening_texts_set_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.version := coalesce((select max(version) from public.al_opening_texts), 0) + 1;
  return new;
end;
$$;

create trigger al_opening_texts_set_version
  before insert on public.al_opening_texts
  for each row execute function public.al_opening_texts_set_version();

revoke execute on function public.al_opening_texts_set_version() from public, anon, authenticated;

alter table public.al_opening_texts enable row level security;
revoke all on public.al_opening_texts from anon, authenticated;
grant select, insert (body, created_by) on public.al_opening_texts to authenticated;

create policy al_opening_texts_member_select on public.al_opening_texts
  for select to authenticated
  using ((select private.has_audience_listening_access((select auth.uid()))));
create policy al_opening_texts_coordinator_insert on public.al_opening_texts
  for insert to authenticated
  with check (
    (select private.has_audience_listening_access((select auth.uid())))
    and (select private.is_audience_listening_coordinator((select auth.uid())))
  );

alter table public.al_tables add column opening_text_version text;
comment on column public.al_tables.opening_text_version is 'The version of al_opening_texts the facilitator was shown when the table agreed. Null when none existed.';

-- Who may host, in one place: the hub, the query page, the kitchen-table call and the host-request call all ask these.
create function private.al_can_host_table(q_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.al_queries q
     where q.id = q_id and q.status = 'open' and q.hosting in ('private_tables', 'anyone')
       and (q.opens_at is null or q.opens_at <= now()) and (q.closes_at is null or q.closes_at > now())
       and private.tool_is_enabled('audience-listening')
       and exists (select 1 from public.al_consent_texts)
  );
$$;

create function private.al_can_request_host(q_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.al_queries q
     where q.id = q_id and q.status = 'open' and q.hosting = 'anyone'
       and (q.opens_at is null or q.opens_at <= now()) and (q.closes_at is null or q.closes_at > now())
       and private.tool_is_enabled('audience-listening')
  );
$$;

revoke execute on function private.al_can_host_table(uuid) from public, anon, authenticated;
revoke execute on function private.al_can_request_host(uuid) from public, anon, authenticated;
grant execute on function private.al_can_host_table(uuid) to service_role;
grant execute on function private.al_can_request_host(uuid) to service_role;

-- -------------------------------------------------------------------------------------------------
-- Functions that named a campaign

-- A table's view: the query's questions in order, the standard opening, and the event's planned length.
create or replace function private.al_table_view(p_table_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t public.al_tables;
  e public.al_events;
  q public.al_queries;
  v_consent public.al_consent_texts;
  v_opening public.al_opening_texts;
begin
  select * into t from public.al_tables where id = p_table_id;
  select * into e from public.al_events where id = t.event_id;
  select * into q from public.al_queries where id = e.query_id;
  select * into v_consent from public.al_consent_texts
   where version = coalesce(nullif(t.consent_text_version, '')::integer, (select max(version) from public.al_consent_texts));
  select * into v_opening from public.al_opening_texts
   where version = coalesce(nullif(t.opening_text_version, '')::integer, (select max(version) from public.al_opening_texts));

  return jsonb_build_object(
    'number', t.number,
    'state', t.state,
    'event_title', e.title,
    'place_name', e.place_name,
    'query_title', q.public_title,
    'planned_minutes', coalesce(e.planned_minutes, greatest(1, round(extract(epoch from e.ends_at - e.starts_at) / 60)::integer)),
    'prompt_position', t.prompt_position,
    'event_prompt_position', e.current_prompt_position,
    'last_call_at', e.last_call_at,
    'kitchen', e.kitchen_host_subject is not null,
    'help_requested', t.help_requested_at is not null,
    -- Told "help is coming" only while a console has checked in within the last minute; otherwise the phone says it has flagged it.
    'help_available', e.console_seen_at is not null and e.console_seen_at > now() - interval '1 minute',
    'facilitator_first_name', t.facilitator_first_name,
    'consent', case when v_consent.id is null then null
                    else jsonb_build_object('version', v_consent.version, 'text', v_consent.body) end,
    'opening', case when v_opening.id is null then null
                    else jsonb_build_object('version', v_opening.version, 'text', v_opening.body) end,
    'prompts', coalesce((
      select jsonb_agg(jsonb_build_object('position', x.position, 'text', x.prompt, 'hint', x.guidance) order by x.position, x.created_at)
      from public.al_questions x where x.query_id = q.id), '[]'::jsonb),
    'uploaded_seqs', coalesce((
      select jsonb_agg(s.seq order by s.seq)
      from public.al_conversations cv
      join public.al_conversation_segments s on s.conversation_id = cv.id and s.status = 'uploaded'
      where cv.table_id = t.id), '[]'::jsonb)
  );
end;
$$;

create or replace function private.al_room_view(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'title', e.title,
    'status', e.status,
    'starts_at', e.starts_at,
    'ends_at', e.ends_at,
    'planned_minutes', coalesce(e.planned_minutes, greatest(1, round(extract(epoch from e.ends_at - e.starts_at) / 60)::integer)),
    'current_prompt_position', e.current_prompt_position,
    'last_call_at', e.last_call_at,
    'prompts', coalesce((
      select jsonb_agg(jsonb_build_object('position', x.position, 'text', x.prompt) order by x.position, x.created_at)
      from public.al_questions x where x.query_id = e.query_id), '[]'::jsonb),
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object('number', t.number, 'state', t.state, 'prompt_position', t.prompt_position,
                                          'help_requested', t.help_requested_at is not null,
                                          'facilitator_first_name', t.facilitator_first_name)
                       order by t.number)
      from public.al_tables t where t.event_id = e.id), '[]'::jsonb)
  )
  from public.al_events e where e.id = p_event_id;
$$;

create or replace function public.al_site_room_call(p_subject text, p_public_id text, p_action text, p_value integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.al_events;
  v_prompts integer;
begin
  if not private.tool_is_enabled('audience-listening') then
    return jsonb_build_object('error', 'not_accepting');
  end if;
  if p_action is null or p_action not in ('last-call', 'prompt', 'help-clear') then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  e := private.al_room_event(p_subject, p_public_id);
  if e.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  if p_action = 'last-call' then
    update public.al_events set last_call_at = coalesce(last_call_at, now()), console_seen_at = now() where id = e.id;
  elsif p_action = 'prompt' then
    select count(*) into v_prompts from public.al_questions where query_id = e.query_id;
    if p_value is null or p_value < 1 or p_value > greatest(v_prompts, 1) then
      return jsonb_build_object('error', 'invalid_request');
    end if;
    update public.al_events set current_prompt_position = p_value, console_seen_at = now() where id = e.id;
  else
    update public.al_tables set help_requested_at = null where event_id = e.id and number = p_value;
    update public.al_events set console_seen_at = now() where id = e.id;
  end if;
  return jsonb_build_object('room', private.al_room_view(e.id));
end;
$$;

create or replace function public.al_site_table_update(p_session_hash text, p_event text, p_prompt integer)
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
      from public.al_questions p
      join public.al_events e on e.query_id = p.query_id
     where e.id = t.event_id;
    if p_prompt is null or p_prompt < 1 or p_prompt > greatest(v_prompts, 1) then
      return jsonb_build_object('error', 'invalid_request');
    end if;
    update public.al_tables set prompt_position = p_prompt where id = t.id;
  end if;

  return jsonb_build_object('table', private.al_table_view(t.id));
end;
$$;

create or replace function public.al_site_table_open(p_link_hash text, p_session_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.al_tables;
  e public.al_events;
  q public.al_queries;
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
  select * into q from public.al_queries where id = e.query_id;
  if e.status not in ('scheduled', 'live') or q.status <> 'open'
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

create or replace function public.al_site_event(p_public_id text)
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
     and exists (select 1 from public.al_queries q where q.id = al_events.query_id and q.status = 'open');
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
                       else greatest(0, e.seats - (select count(*) from public.al_seats s where s.event_id = e.id)) end,
    'query_public_id', (select q.public_id from public.al_queries q where q.id = e.query_id)
  );
end;
$$;

create or replace function public.al_site_seat_save(p_subject text, p_public_id text, p_name text, p_email text)
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
     and exists (select 1 from public.al_queries q where q.id = al_events.query_id and q.status = 'open');
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

create or replace function public.al_site_highlights_save(p_session_hash text, p_highlights jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.al_tables;
  c public.al_conversations;
  v_rep uuid;
  item jsonb;
  seg public.tw_segments;
  v_note text;
  v_speaker uuid;
  v_start integer;
begin
  t := private.al_table_for_conversation(p_session_hash);
  if t.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  select * into c from public.al_conversations where table_id = t.id for update;
  if not found or c.status = 'sent' then
    return jsonb_build_object('error', case when found then 'not_open' else 'not_found' end);
  end if;
  select r.id into v_rep from public.sw_representations r
   where r.source_id = c.sourcework_source_id and r.kind = 'transcript' and r.status = 'ready';
  if v_rep is null then
    return jsonb_build_object('error', 'not_open');
  end if;
  if jsonb_typeof(p_highlights) is distinct from 'array' or jsonb_array_length(p_highlights) > 100 then
    return jsonb_build_object('error', 'invalid_request');
  end if;

  delete from public.al_highlights where conversation_id = c.id;
  for item in select * from jsonb_array_elements(p_highlights) loop
    begin
      v_start := (item->>'startMs')::integer;
    exception when others then
      raise exception 'invalid_request';
    end;
    v_note := nullif(btrim(coalesce(item->>'note', '')), '');
    if v_note is not null and char_length(v_note) > 500 then
      raise exception 'invalid_request';
    end if;
    select * into seg from public.tw_segments where representation_id = v_rep and start_ms = v_start limit 1;
    if not found then
      raise exception 'invalid_request';
    end if;
    select s.id into v_speaker from public.tw_speakers ts
      join public.al_speakers s on s.conversation_id = c.id and s.source_label = ts.diarization_label
     where ts.id = seg.speaker_id;
    insert into public.al_highlights (conversation_id, start_ms, end_ms, text, note, speaker_id)
    values (c.id, seg.start_ms, seg.end_ms, left(seg.text, 4000), v_note, v_speaker)
    on conflict (conversation_id, start_ms) do update set note = excluded.note where al_highlights.note is distinct from excluded.note;
  end loop;
  return jsonb_build_object('ok', true);
exception
  when raise_exception then
    -- 'invalid_request' raised above rolls the whole replacement back; anything else is the database's own failure.
    if sqlerrm = 'invalid_request' then
      return jsonb_build_object('error', 'invalid_request');
    end if;
    raise;
end;
$$;

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
      select jsonb_agg(jsonb_build_object('start_ms', h.start_ms, 'end_ms', h.end_ms, 'text', h.text, 'note', h.note, 'speaker_id', h.speaker_id)
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

create or replace function public.al_create_excerpts_from_highlights(p_conversation_id uuid, p_created_by uuid)
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
            left('Marked by the table''s facilitator as what mattered' || case when h.note is null then '' else ': ' || h.note end, 600))
    returning id into v_excerpt;
    update public.al_highlights set excerpt_id = v_excerpt where id = h.id;
    v_made := v_made + 1;
  end loop;
  return v_made;
end;
$$;


-- The facilitator agrees, and the table records the consent wording and the opening it was shown (extends the 5-argument version of
-- 20261114120000 with the opening's version; a new signature, so the old one is dropped in part 2).
create function public.al_site_table_agree(
  p_session_hash text, p_consent_version integer, p_first_name text, p_email text, p_people integer, p_opening_version integer
)
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
  -- When the station has an opening, the table must say which version it was shown; when it has none, there is nothing to record.
  if exists (select 1 from public.al_opening_texts) then
    if p_opening_version is null or not exists (select 1 from public.al_opening_texts where version = p_opening_version) then
      return jsonb_build_object('error', 'invalid_request');
    end if;
  elsif p_opening_version is not null then
    return jsonb_build_object('error', 'invalid_request');
  end if;

  update public.al_tables
     set state = 'agreed', agreed_at = now(), consent_text_version = p_consent_version::text, opening_text_version = p_opening_version::text,
         facilitator_first_name = v_name, facilitator_email = v_email, expected_speakers = p_people
   where id = t.id;
  return jsonb_build_object('table', private.al_table_view(t.id));
end;
$$;

comment on function public.al_site_table_agree(text, integer, text, text, integer, integer) is
  'Records the table''s agreement with the consent wording and the opening shown, the facilitator''s first name and email (required), and how many are at the table. service_role only.';

revoke execute on function public.al_site_table_agree(text, integer, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.al_site_table_agree(text, integer, text, text, integer, integer) to service_role;

-- A kitchen table is a private one-table session anyone starts on a query that allows it. The host picks how long it runs.
create function public.al_site_kitchen_table_create(
  p_subject text, p_query_public_id text, p_link_hash text, p_host_name text, p_place text, p_starts_at timestamptz, p_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.al_queries;
  v_start timestamptz;
  v_event uuid;
  v_public text;
  v_name text := nullif(btrim(coalesce(p_host_name, '')), '');
  v_place text := coalesce(nullif(btrim(coalesce(p_place, '')), ''), 'A kitchen table');
begin
  if not private.tool_is_enabled('audience-listening') then
    return jsonb_build_object('error', 'not_accepting');
  end if;
  if private.al_site_subject(p_subject) is null or not private.al_valid_hash(p_link_hash) or p_query_public_id is null
     or p_minutes is null or p_minutes not in (30, 45, 60) then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  if (v_name is not null and char_length(v_name) > 120) or char_length(v_place) > 200 then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  select * into q from public.al_queries where public_id = p_query_public_id;
  if not found or not private.al_can_host_table(q.id) then
    return jsonb_build_object('error', 'not_available');
  end if;
  if (select count(*) from public.al_events
       where organizer_kind = 'person' and kitchen_host_subject = p_subject and created_at > now() - interval '1 day') >= 3 then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  v_start := least(greatest(coalesce(p_starts_at, now()), now() - interval '1 hour'), now() + interval '30 days');
  if (q.opens_at is not null and v_start < q.opens_at) or (q.closes_at is not null and v_start > q.closes_at) then
    return jsonb_build_object('error', 'not_open');
  end if;

  v_public := substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 16);
  -- ends_at is the window the table's link stays usable; planned_minutes is how long the host said it would run.
  insert into public.al_events (public_id, query_id, title, starts_at, ends_at, planned_minutes, place_name, status, visibility, listing_state, organizer_kind, organizer_label, kitchen_host_subject)
  values (v_public, q.id, left(q.public_title || ' · kitchen table', 200), v_start, v_start + interval '6 hours', p_minutes, v_place, 'scheduled', 'private', 'not_listed',
          'person', v_name, p_subject)
  returning id into v_event;
  insert into public.al_tables (event_id, number, join_token_hash, join_token_issued_at) values (v_event, 1, p_link_hash, now());

  return jsonb_build_object('event_public_id', v_public, 'title', q.public_title);
end;
$$;

revoke execute on function public.al_site_kitchen_table_create(text, text, text, text, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.al_site_kitchen_table_create(text, text, text, text, text, timestamptz, integer) to service_role;

-- A request to host a session, made on a query that invites them.
create function public.al_site_host_request(
  p_subject text,
  p_query_public_id text,
  p_name text,
  p_email text,
  p_kind text,
  p_organization text,
  p_seats integer,
  p_address text,
  p_expected text,
  p_when_text text,
  p_invitees_text text,
  p_journalist_requested boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := btrim(coalesce(p_email, ''));
  v_org text := nullif(btrim(coalesce(p_organization, '')), '');
  v_address text := btrim(coalesce(p_address, ''));
  v_when text := btrim(coalesce(p_when_text, ''));
  v_invitees text := nullif(btrim(coalesce(p_invitees_text, '')), '');
begin
  if private.al_site_subject(p_subject) is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;
  if not private.tool_is_enabled('audience-listening') then
    return jsonb_build_object('error', 'not_accepting');
  end if;
  if p_kind is null or p_kind not in ('invite', 'public')
     or p_seats is null or p_seats not in (12, 30, 60)
     or p_expected is null or p_expected not in ('6-8', '9-12', '12+')
     or p_journalist_requested is null or p_query_public_id is null
  then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  if char_length(v_name) = 0 or char_length(v_email) = 0 or char_length(v_address) = 0 or char_length(v_when) = 0 then
    return jsonb_build_object('error', 'required_field_missing');
  end if;
  if char_length(v_name) > 200 or char_length(v_email) > 320 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or char_length(coalesce(v_org, '')) > 200 or char_length(v_address) > 500 or char_length(v_when) > 500
     or char_length(coalesce(v_invitees, '')) > 2000
  then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  select id into v_query from public.al_queries where public_id = p_query_public_id;
  if v_query is null or not private.al_can_request_host(v_query) then
    return jsonb_build_object('error', 'not_available');
  end if;

  insert into public.al_host_requests
    (query_id, name, email, kind, organization, seats, address, expected, when_text, invitees_text, journalist_requested)
  values
    (v_query, v_name, v_email, p_kind, v_org, p_seats, v_address, p_expected, v_when, v_invitees, p_journalist_requested);
  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.al_site_host_request(text, text, text, text, text, text, integer, text, text, text, text, boolean) is
  'A request to host a listening session around a query that invites hosts, from the website. The subject is checked and not kept. service_role only.';

revoke execute on function public.al_site_host_request(text, text, text, text, text, text, integer, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.al_site_host_request(text, text, text, text, text, text, integer, text, text, text, text, boolean) to service_role;


-- A query says whether people may convene around it themselves, so its page can offer to.
create or replace function public.al_site_query(p_public_id text)
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
      'allow_text_answers', q.allow_text_answers,
      'can_host_table', private.al_can_host_table(q.id),
      'can_request_host', private.al_can_request_host(q.id),
      'outcome', (
        select jsonb_build_object(
          'kind', o.kind,
          'title', o.title,
          'url', o.url,
          'published_at', o.published_at,
          'summary', o.summary,
          'response_count', (
            select count(*) from public.al_submissions s where s.query_id = q.id and s.status = 'submitted'
          )
        )
        from public.al_outcomes o
        where o.query_id = q.id and q.listed_on_hub
        order by o.published_at desc, o.created_at desc
        limit 1
      )
    )
  end
  from (select public.al_public_query(p_public_id) as base) b
  left join public.al_queries q on q.public_id = p_public_id and q.status <> 'draft';
$$;


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
            'question_count', (select count(*) from public.al_questions x where x.query_id = q.id),
            'can_host_table', private.al_can_host_table(q.id),
            'can_request_host', private.al_can_request_host(q.id)
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
  end) || jsonb_build_object('events',
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
                             else greatest(0, x.seats - (select count(*) from public.al_seats s where s.event_id = x.id)) end,
          'query_public_id', (select q.public_id from public.al_queries q where q.id = x.query_id)
        )
        order by x.starts_at
      )
      from (
        select * from public.al_events e
         where e.visibility = 'public' and e.listing_state = 'listed' and e.status = 'scheduled' and e.ends_at > now()
           and exists (select 1 from public.al_queries q where q.id = e.query_id and q.status = 'open')
         order by e.starts_at
         limit 12
            ) x
    ), '[]'::jsonb) end);
$$;


-- =================================================================================================
-- PART 2: drop what the query now carries (run after part 1)

drop trigger al_events_check_span on public.al_events;
drop function public.al_events_check_span();
drop trigger al_campaigns_close_query on public.al_campaigns;
drop function public.al_campaign_close_query();
drop function public.al_site_table_agree(text, integer, text, text, integer);
drop function if exists public.al_site_table_agree(text, integer, text, integer);
drop function public.al_site_kitchen_table_create(text, text, text, text, text, timestamptz);
drop function public.al_site_host_request(text, text, text, text, text, integer, text, text, text, text, boolean);

alter table public.al_events drop column campaign_id;
alter table public.al_highlights drop column tag;

drop table public.al_campaign_tags;
drop table public.al_campaign_prompts;
drop table public.al_campaigns;
