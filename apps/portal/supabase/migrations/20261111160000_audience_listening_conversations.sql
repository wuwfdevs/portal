-- Audience Listening: conversations, speakers, highlights, contact cards, the organizer room and retention
-- (phase D, the rest, of docs/audience-listening-suite-design.md §2, §4, §8 and §11).
--
-- After a table ends, staff send its recording to Sourcework (a Portal action, as the staff member). The after-page then shows the
-- facilitator ONLY that conversation's transcript lines, read through a function from Sourcework's own records and returned in the
-- response, never stored by the website. The facilitator names the voices (by first name), marks the lines that mattered, and
-- sends the conversation. People at the table may leave a contact card from the table's second QR code.
--
-- Rules that live here so no screen can get them wrong:
--   * highlights are made from a line the transcript has, by its start time, and the TEXT IS COPIED here by the function (the site
--     never supplies it), so a re-transcription never changes what was marked;
--   * a contact card is per person (one per subject per conversation), "may name me" and "keep me anonymous" are mutually exclusive,
--     and a card's name can be approved for use only after a reviewer has contacted the person (a trigger);
--   * the facilitator learns only the COUNT of cards, never their contents; staff do not see the subject either (a column grant);
--   * the organizer console shows a table's state and never its content, and only the account that owns the event;
--   * "Help is coming" is shown only while a staff console has checked in within the last minute (al_events.console_seen_at);
--   * retention: a staff-run purge of what is due after 30 days, as a function a coordinator runs (design §11, item 2).
--
-- Every al_site_* function is execute for service_role only.

-- ------------------------------------------------------------------------------------------------
-- Columns on what exists

alter table public.al_events add column console_seen_at timestamptz;
comment on column public.al_events.console_seen_at is
  'When a staff or organizer console last checked in. A table is told help is coming only while this is within the last minute.';

alter table public.al_tables
  add column card_token_hash text,
  add constraint al_tables_card_hash_check check (card_token_hash is null or card_token_hash ~ '^[0-9a-f]{64}$');
comment on column public.al_tables.card_token_hash is
  'SHA-256 of the token on the table''s second QR code (leave a contact card). Not single use: each person at the table may leave one card, kept to one per person by their subject.';

-- Staff clear a request for a hand, and make the second card link; the recording state is still not theirs to write.
grant update (card_token_hash, help_requested_at) on public.al_tables to authenticated;

-- ------------------------------------------------------------------------------------------------
-- Speakers and highlights

create table public.al_speakers (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.al_conversations (id) on delete cascade,
  source_label text not null,
  label text not null,
  name text,
  is_facilitator boolean not null default false,
  first_heard_ms integer not null default 0,
  share_percent integer not null default 0,
  merged_into uuid references public.al_speakers (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint al_speakers_source_unique unique (conversation_id, source_label),
  constraint al_speakers_name_check check (name is null or char_length(name) between 1 and 60),
  constraint al_speakers_share_check check (share_percent between 0 and 100),
  constraint al_speakers_not_self_check check (merged_into is null or merged_into <> id)
);

comment on table public.al_speakers is
  'The voices the transcript found at a table ("Voice 1"), named afterwards by the facilitator by first name. Leaving one blank is allowed. A split voice can be merged into another.';

create trigger set_al_speakers_updated_at
  before update on public.al_speakers
  for each row execute function public.set_updated_at();

create table public.al_highlights (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.al_conversations (id) on delete cascade,
  start_ms integer not null,
  end_ms integer not null,
  text text not null,
  tag text,
  speaker_id uuid references public.al_speakers (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint al_highlights_start_unique unique (conversation_id, start_ms),
  constraint al_highlights_span_check check (end_ms > start_ms and start_ms >= 0),
  constraint al_highlights_text_check check (char_length(text) between 1 and 4000),
  constraint al_highlights_tag_check check (tag is null or char_length(tag) between 1 and 40)
);

comment on table public.al_highlights is
  'Lines the facilitator marked "what mattered", with a tag from the campaign''s vocabulary. The text is a snapshot copied by the function from the transcript line, so re-transcribing never changes what was marked.';

-- ------------------------------------------------------------------------------------------------
-- Contact cards

create table public.al_contact_cards (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.al_conversations (id) on delete cascade,
  subject text,
  first_name text not null,
  contact text,
  may_contact boolean not null default false,
  may_name boolean not null default false,
  keep_anonymous boolean not null default false,
  speaker_id uuid references public.al_speakers (id) on delete set null,
  contacted_at timestamptz,
  contacted_by uuid references public.profiles (id) on delete set null,
  name_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint al_contact_cards_subject_format check (subject is null or subject ~ '^site:(visitor|account):[A-Za-z0-9_-]{1,128}$'),
  constraint al_contact_cards_name_check check (char_length(btrim(first_name)) between 1 and 60),
  constraint al_contact_cards_contact_check check (contact is null or char_length(contact) <= 320),
  -- Three separate choices, all off by default; naming and anonymity cannot both be asked for.
  constraint al_contact_cards_name_xor_anonymous check (not (may_name and keep_anonymous))
);

comment on table public.al_contact_cards is
  'Per person, never per table (board 5i). Staff read everything but the subject. The facilitator learns only a count. Naming requires having been contacted first.';

create unique index al_contact_cards_person_unique on public.al_contact_cards (conversation_id, subject) where subject is not null;

create trigger set_al_contact_cards_updated_at
  before update on public.al_contact_cards
  for each row execute function public.set_updated_at();

-- A name is approved for use only for a person who agreed to be named and whom a reviewer has already contacted.
create function public.al_contact_cards_guard_naming()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.name_approved_at is not null and old.name_approved_at is null then
    if not new.may_name then
      raise exception 'This person did not say they may be named.' using errcode = '23514';
    end if;
    if new.contacted_at is null then
      raise exception 'Contact the person before using their name.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger al_contact_cards_guard_naming
  before update on public.al_contact_cards
  for each row execute function public.al_contact_cards_guard_naming();

revoke execute on function public.al_contact_cards_guard_naming() from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------------
-- RLS and grants

alter table public.al_speakers enable row level security;
alter table public.al_highlights enable row level security;
alter table public.al_contact_cards enable row level security;

revoke all on public.al_speakers, public.al_highlights, public.al_contact_cards from anon, authenticated;
grant select on public.al_speakers to authenticated;
grant select on public.al_highlights to authenticated;
-- Staff read every column of a card except the subject (the website's opaque id for the person), and act on it.
grant select (id, conversation_id, first_name, contact, may_contact, may_name, keep_anonymous, speaker_id, contacted_at, contacted_by,
              name_approved_at, created_at, updated_at) on public.al_contact_cards to authenticated;
grant update (contacted_at, contacted_by, name_approved_at, speaker_id) on public.al_contact_cards to authenticated;
grant delete on public.al_contact_cards to authenticated;
-- A conversation's staff-visible status moves with the Sourcework handoff.
grant update (status, transcription_project_id, sourcework_source_id) on public.al_conversations to authenticated;

create policy al_speakers_member_select on public.al_speakers
  for select to authenticated using ((select private.has_audience_listening_access((select auth.uid()))));
create policy al_highlights_member_select on public.al_highlights
  for select to authenticated using ((select private.has_audience_listening_access((select auth.uid()))));
create policy al_contact_cards_member_select on public.al_contact_cards
  for select to authenticated using ((select private.has_audience_listening_access((select auth.uid()))));
create policy al_contact_cards_member_update on public.al_contact_cards
  for update to authenticated
  using ((select private.has_audience_listening_access((select auth.uid()))))
  with check ((select private.has_audience_listening_access((select auth.uid()))));
create policy al_contact_cards_member_delete on public.al_contact_cards
  for delete to authenticated using ((select private.has_audience_listening_access((select auth.uid()))));
create policy al_conversations_member_update on public.al_conversations
  for update to authenticated
  using ((select private.has_audience_listening_access((select auth.uid()))))
  with check ((select private.has_audience_listening_access((select auth.uid()))));

-- ------------------------------------------------------------------------------------------------
-- The table view gains what the phone needs about the room: the last call, the room's prompt and whether help is watched for.

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
  c public.al_campaigns;
  v_consent public.al_consent_texts;
begin
  select * into t from public.al_tables where id = p_table_id;
  select * into e from public.al_events where id = t.event_id;
  select * into c from public.al_campaigns where id = e.campaign_id;
  select * into v_consent from public.al_consent_texts
   where version = coalesce(nullif(t.consent_text_version, '')::integer, (select max(version) from public.al_consent_texts));

  return jsonb_build_object(
    'number', t.number,
    'state', t.state,
    'event_title', e.title,
    'place_name', e.place_name,
    'question', c.question,
    'prompt_position', t.prompt_position,
    'event_prompt_position', e.current_prompt_position,
    'last_call_at', e.last_call_at,
    'help_requested', t.help_requested_at is not null,
    -- Told "help is coming" only while a console has checked in within the last minute; otherwise the phone says it has flagged it.
    'help_available', e.console_seen_at is not null and e.console_seen_at > now() - interval '1 minute',
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

-- ------------------------------------------------------------------------------------------------
-- The after-page: this conversation's transcript, speakers and highlights, for the table that owns it

create function public.al_site_conversation(p_session_hash text)
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
  t := private.al_table_for_session(p_session_hash);
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
                                          'first_heard_ms', s.first_heard_ms, 'share_percent', s.share_percent, 'merged_into', s.merged_into)
                       order by s.first_heard_ms, s.label)
      from public.al_speakers s where s.conversation_id = c.id), '[]'::jsonb),
    'highlights', coalesce((
      select jsonb_agg(jsonb_build_object('start_ms', h.start_ms, 'end_ms', h.end_ms, 'text', h.text, 'tag', h.tag, 'speaker_id', h.speaker_id)
                       order by h.start_ms)
      from public.al_highlights h where h.conversation_id = c.id), '[]'::jsonb),
    -- Only that a speaker left one, never what it says.
    'contact_card_count', (select count(*) from public.al_contact_cards k where k.conversation_id = c.id)
  );
end;
$$;

comment on function public.al_site_conversation(text) is
  'The after-page: only this table''s conversation (its transcript lines, speakers, highlights, and a count of contact cards). The website renders it and keeps none of it. service_role only.';

-- Names, who the facilitator is, and merged voices. p_speakers: [{ "id", "name", "isFacilitator", "mergedInto" }].
-- A refusal after the first write raises, which rolls the whole save back: a save is all of it or none of it.
create function public.al_site_speakers_save(p_session_hash text, p_speakers jsonb)
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
begin
  t := private.al_table_for_session(p_session_hash);
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
  return jsonb_build_object('ok', true);
end;
$$;

-- The lines that mattered. p_highlights: [{ "startMs", "tag" }]. Replaces the set. The text is copied here from the transcript.
create function public.al_site_highlights_save(p_session_hash text, p_highlights jsonb)
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
  v_tag text;
  v_speaker uuid;
  v_start integer;
begin
  t := private.al_table_for_session(p_session_hash);
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
    v_tag := nullif(btrim(coalesce(item->>'tag', '')), '');
    if v_tag is not null and not exists (
         select 1 from public.al_campaign_tags g join public.al_events e on e.campaign_id = g.campaign_id
          where e.id = t.event_id and lower(btrim(g.label)) = lower(v_tag)) then
      raise exception 'invalid_request';
    end if;
    select * into seg from public.tw_segments where representation_id = v_rep and start_ms = v_start limit 1;
    if not found then
      raise exception 'invalid_request';
    end if;
    select s.id into v_speaker from public.tw_speakers ts
      join public.al_speakers s on s.conversation_id = c.id and s.source_label = ts.diarization_label
     where ts.id = seg.speaker_id;
    insert into public.al_highlights (conversation_id, start_ms, end_ms, text, tag, speaker_id)
    values (c.id, seg.start_ms, seg.end_ms, left(seg.text, 4000), v_tag, v_speaker)
    on conflict (conversation_id, start_ms) do update set tag = excluded.tag;
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

-- The facilitator sends the conversation to the station. It can still be read, but no longer changed.
create function public.al_site_conversation_send(p_session_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.al_tables;
  c public.al_conversations;
begin
  t := private.al_table_for_session(p_session_hash);
  if t.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  select * into c from public.al_conversations where table_id = t.id for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if c.status in ('recording', 'uploading') then
    return jsonb_build_object('error', 'not_open');
  end if;
  update public.al_conversations set status = 'sent' where id = c.id;
  update public.al_tables set state = 'sent' where id = t.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------------------------------------------
-- Contact cards (the table's second QR code)

create function public.al_site_contact_card_open(p_card_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t public.al_tables;
  e public.al_events;
begin
  if not private.al_valid_hash(p_card_hash) then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  select * into t from public.al_tables where card_token_hash = p_card_hash;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if t.state in ('waiting') or not exists (select 1 from public.al_conversations where table_id = t.id) then
    return jsonb_build_object('error', 'not_open');
  end if;
  select * into e from public.al_events where id = t.event_id;
  return jsonb_build_object('event_title', e.title, 'table_number', t.number);
end;
$$;

create function public.al_site_contact_card_save(
  p_card_hash text, p_subject text, p_first_name text, p_contact text,
  p_may_contact boolean, p_may_name boolean, p_keep_anonymous boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.al_tables;
  c public.al_conversations;
  v_name text := btrim(coalesce(p_first_name, ''));
  v_contact text := nullif(btrim(coalesce(p_contact, '')), '');
  v_existing public.al_contact_cards;
begin
  if not private.al_valid_hash(p_card_hash) or private.al_site_subject(p_subject) is null then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  if not private.tool_is_enabled('audience-listening') then
    return jsonb_build_object('error', 'not_accepting');
  end if;
  if char_length(v_name) = 0 then
    return jsonb_build_object('error', 'required_field_missing');
  end if;
  if char_length(v_name) > 60 or char_length(coalesce(v_contact, '')) > 320
     or p_may_contact is null or p_may_name is null or p_keep_anonymous is null or (p_may_name and p_keep_anonymous)
  then
    return jsonb_build_object('error', 'invalid_request');
  end if;

  select * into t from public.al_tables where card_token_hash = p_card_hash;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  select * into c from public.al_conversations where table_id = t.id for update;
  if not found or t.state = 'waiting' then
    return jsonb_build_object('error', 'not_open');
  end if;
  if (select count(*) from public.al_contact_cards where conversation_id = c.id) >= 60 then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  -- The permission to contact is recorded as given, with or without a way to reach the person: the page warns, the database accepts.
  select * into v_existing from public.al_contact_cards where conversation_id = c.id and subject = p_subject;
  if found then
    -- Once a reviewer has contacted the person, the card is the record of what they agreed to and is not rewritten.
    if v_existing.contacted_at is not null then
      return jsonb_build_object('error', 'not_open');
    end if;
    update public.al_contact_cards
       set first_name = v_name, contact = v_contact, may_contact = p_may_contact, may_name = p_may_name, keep_anonymous = p_keep_anonymous
     where id = v_existing.id;
  else
    insert into public.al_contact_cards (conversation_id, subject, first_name, contact, may_contact, may_name, keep_anonymous)
    values (c.id, p_subject, v_name, v_contact, p_may_contact, p_may_name, p_keep_anonymous);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- A site account that is deleted also loses the seats it saved and the contact cards nobody has acted on. Cards a reviewer has already
-- contacted stay as the record of what the person agreed to, without the subject.
create or replace function public.al_site_forget_subject(p_subject text)
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
  delete from public.al_seats where subject = v_subject;
  delete from public.al_contact_cards where subject = v_subject and contacted_at is null;
  update public.al_contact_cards set subject = null where subject = v_subject;

  return jsonb_build_object('ok', true, 'storage_paths', v_paths);
end;
$$;

-- ------------------------------------------------------------------------------------------------
-- The organizer's room. Only the site account that owns the event; a table's state, never its content.

create function private.al_room_event(p_subject text, p_public_id text)
returns public.al_events
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.al_events;
begin
  if p_subject is null or p_subject !~ '^site:account:[A-Za-z0-9_-]{1,128}$' then
    return null;
  end if;
  select * into e from public.al_events where public_id = p_public_id and organizer_subject = p_subject and status in ('scheduled', 'live') for update;
  if not found then
    return null;
  end if;
  return e;
end;
$$;

revoke execute on function private.al_room_event(text, text) from public, anon, authenticated;

create function private.al_room_view(p_event_id uuid)
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
    'current_prompt_position', e.current_prompt_position,
    'last_call_at', e.last_call_at,
    'prompts', coalesce((
      select jsonb_agg(jsonb_build_object('position', p.position, 'kind', p.kind, 'text', p.text, 'suggested_seconds', p.suggested_seconds)
                       order by p.position, p.created_at)
      from public.al_campaign_prompts p where p.campaign_id = e.campaign_id), '[]'::jsonb),
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object('number', t.number, 'state', t.state, 'prompt_position', t.prompt_position,
                                          'help_requested', t.help_requested_at is not null,
                                          'facilitator_first_name', t.facilitator_first_name)
                       order by t.number)
      from public.al_tables t where t.event_id = e.id), '[]'::jsonb)
  )
  from public.al_events e where e.id = p_event_id;
$$;

revoke execute on function private.al_room_view(uuid) from public, anon, authenticated;

create function public.al_site_room(p_subject text, p_public_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.al_events;
begin
  if not private.tool_is_enabled('audience-listening') then
    return jsonb_build_object('error', 'not_accepting');
  end if;
  e := private.al_room_event(p_subject, p_public_id);
  if e.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  -- Checking in is what lets the tables say "help is coming".
  update public.al_events set console_seen_at = now() where id = e.id;
  return jsonb_build_object('room', private.al_room_view(e.id));
end;
$$;

-- p_action: 'last-call' | 'prompt' (p_value = position) | 'help-clear' (p_value = table number).
create function public.al_site_room_call(p_subject text, p_public_id text, p_action text, p_value integer)
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
    select count(*) into v_prompts from public.al_campaign_prompts where campaign_id = e.campaign_id;
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

-- ------------------------------------------------------------------------------------------------
-- Retention: what is due after 30 days (design §11, item 2). A coordinator runs it; nothing purges on its own.
--   * a submission still in progress, with its answers and audio, untouched for 30 days;
--   * a conversation never sent, 30 days after its event ended: its segments, speakers, highlights and unacted contact cards.
-- Contact cards and raw audio of material never used follow the campaign's report date, which does not exist until phase F.

create function public.al_purge_preview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.has_audience_listening_access(auth.uid()) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'submissions', (select count(*) from public.al_submissions where status = 'in_progress' and updated_at < now() - interval '30 days'),
    'conversations', (select count(*) from public.al_conversations c join public.al_events e on e.id = c.event_id
                       where c.status <> 'sent' and e.ends_at < now() - interval '30 days'),
    'cards', (select count(*) from public.al_contact_cards k join public.al_conversations c on c.id = k.conversation_id
                join public.al_events e on e.id = c.event_id
               where c.status <> 'sent' and e.ends_at < now() - interval '30 days' and k.contacted_at is null)
  );
end;
$$;

create function public.al_purge_run()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paths jsonb;
  v_submissions integer;
  v_conversations integer;
begin
  if not private.is_audience_listening_coordinator(auth.uid()) or not private.has_audience_listening_access(auth.uid()) then
    raise exception 'Only a coordinator can purge.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(p), '[]'::jsonb) into v_paths from (
    select a.storage_path as p
      from public.al_answers a join public.al_submissions s on s.id = a.submission_id
     where s.status = 'in_progress' and s.updated_at < now() - interval '30 days' and a.storage_path is not null
    union all
    select g.storage_path
      from public.al_conversation_segments g
      join public.al_conversations c on c.id = g.conversation_id
      join public.al_events e on e.id = c.event_id
     where c.status <> 'sent' and e.ends_at < now() - interval '30 days'
  ) q;

  delete from public.al_submissions where status = 'in_progress' and updated_at < now() - interval '30 days';
  get diagnostics v_submissions = row_count;
  -- Deleting the conversation removes its segments, speakers, highlights and cards (all on delete cascade). The table stays.
  delete from public.al_conversations c using public.al_events e
   where e.id = c.event_id and c.status <> 'sent' and e.ends_at < now() - interval '30 days';
  get diagnostics v_conversations = row_count;

  return jsonb_build_object('submissions', v_submissions, 'conversations', v_conversations, 'storage_paths', v_paths);
end;
$$;

-- ------------------------------------------------------------------------------------------------

revoke execute on function public.al_site_conversation(text) from public, anon, authenticated;
revoke execute on function public.al_site_speakers_save(text, jsonb) from public, anon, authenticated;
revoke execute on function public.al_site_highlights_save(text, jsonb) from public, anon, authenticated;
revoke execute on function public.al_site_conversation_send(text) from public, anon, authenticated;
revoke execute on function public.al_site_contact_card_open(text) from public, anon, authenticated;
revoke execute on function public.al_site_contact_card_save(text, text, text, text, boolean, boolean, boolean) from public, anon, authenticated;
revoke execute on function public.al_site_room(text, text) from public, anon, authenticated;
revoke execute on function public.al_site_room_call(text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.al_purge_preview() from public, anon;
revoke execute on function public.al_purge_run() from public, anon;
grant execute on function public.al_site_conversation(text) to service_role;
grant execute on function public.al_site_speakers_save(text, jsonb) to service_role;
grant execute on function public.al_site_highlights_save(text, jsonb) to service_role;
grant execute on function public.al_site_conversation_send(text) to service_role;
grant execute on function public.al_site_contact_card_open(text) to service_role;
grant execute on function public.al_site_contact_card_save(text, text, text, text, boolean, boolean, boolean) to service_role;
grant execute on function public.al_site_room(text, text) to service_role;
grant execute on function public.al_site_room_call(text, text, text, integer) to service_role;
-- The purge functions check the caller themselves (a staff member with access; a coordinator to run).
grant execute on function public.al_purge_preview() to authenticated;
grant execute on function public.al_purge_run() to authenticated;
