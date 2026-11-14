-- Audience Listening, suite phase E follow-up: the gaps the website's screens left (2026-11-13).
--
-- 1. The facilitator gives an email when the table agrees. WUWF emails them a link to the after-page (name the voices, mark what
--    mattered, send) once the transcript is ready. The link is a token whose SHA-256 is stored (al_tables.after_token_hash) and
--    which the conversation functions accept alongside the table's own session, for fourteen days. It cannot record: only the four
--    after-page functions look for it, and the table session still ends twelve hours after the event.
-- 2. An organizer is made by a single-use link (al_events.organizer_claim_hash): the organizer opens it signed in to the website,
--    and al_site_room_claim records their account as the event's organizer_subject. Nothing in the Portal learns who the account is.
-- 3. The website's hub lists upcoming listed public events (additive: a reader ignores a field it does not know).
-- 4. The purge also clears a facilitator's email and after link thirty days after the event.
--
-- Nothing here changes who may see a transcript: only the table's session or its after link opens the four after-page functions.

-- ------------------------------------------------------------------------------------------------
-- 1. The facilitator

alter table public.al_tables
  add column facilitator_email text,
  add column after_token_hash text,
  add column after_token_expires_at timestamptz,
  add column after_link_sent_at timestamptz,
  add constraint al_tables_facilitator_email_check
    check (facilitator_email is null or (char_length(facilitator_email) <= 320 and facilitator_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  add constraint al_tables_after_token_hash_check
    check (after_token_hash is null or after_token_hash ~ '^[0-9a-f]{64}$');

create unique index al_tables_after_token_hash_key on public.al_tables (after_token_hash) where after_token_hash is not null;

comment on column public.al_tables.facilitator_email is
  'The facilitator''s email, given when the table agrees, used only to send the after-page link. Staff read it; the website never receives it back. Cleared by the purge thirty days after the event.';
comment on column public.al_tables.after_token_hash is
  'SHA-256 of the after-page link''s token (the token itself exists in the email and nowhere else). Opens the four after-page functions until after_token_expires_at; it cannot record.';

-- Staff issue and send the link; they cannot set the email.
grant update (after_token_hash, after_token_expires_at, after_link_sent_at) on public.al_tables to authenticated;

-- The table behind a session, or behind an after link, locked for the call. An unknown, expired and replaced token are the same answer.
create function private.al_table_for_conversation(p_hash text)
returns public.al_tables
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.al_tables;
begin
  if not private.al_valid_hash(p_hash) then
    return null;
  end if;
  select * into t from public.al_tables
   where (session_hash = p_hash and session_expires_at > now())
      or (after_token_hash = p_hash and after_token_expires_at > now())
   for update;
  if not found then
    return null;
  end if;
  return t;
end;
$$;

revoke execute on function private.al_table_for_conversation(text) from public, anon, authenticated;

-- The agreement now carries the facilitator's email. The three-argument form is replaced, not kept: a phone that does not send an
-- email cannot agree for a table, so the facilitator is always reachable. Tapping again after the table agreed changes nothing.
drop function public.al_site_table_agree(text, integer, text);

create function public.al_site_table_agree(p_session_hash text, p_consent_version integer, p_first_name text, p_email text)
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
  -- Idempotent: tapping twice, or reopening, does not move the record of when the table agreed or to what.
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
         facilitator_first_name = v_name, facilitator_email = v_email
   where id = t.id;
  return jsonb_build_object('table', private.al_table_view(t.id));
end;
$$;

comment on function public.al_site_table_agree(text, integer, text, text) is
  'Records the table''s agreement (the facilitator''s tap after the consent is read aloud) with the wording version they were shown, their first name and their email. The email is required the first time. service_role only.';

revoke execute on function public.al_site_table_agree(text, integer, text, text) from public, anon, authenticated;
grant execute on function public.al_site_table_agree(text, integer, text, text) to service_role;

-- The four after-page functions accept the table's session or its after link. Each is its earlier body with the one lookup changed.
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
  v_tag text;
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

create or replace function public.al_site_conversation_send(p_session_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.al_tables;
  c public.al_conversations;
begin
  t := private.al_table_for_conversation(p_session_hash);
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
-- 2. The organizer

alter table public.al_events
  add column organizer_claim_hash text,
  add column organizer_claim_issued_at timestamptz,
  add constraint al_events_organizer_claim_hash_check
    check (organizer_claim_hash is null or organizer_claim_hash ~ '^[0-9a-f]{64}$');

create unique index al_events_organizer_claim_hash_key on public.al_events (organizer_claim_hash) where organizer_claim_hash is not null;

comment on column public.al_events.organizer_claim_hash is
  'SHA-256 of the single-use organizer link''s token. Opening the link signed in to the website makes that account the event''s organizer and clears this.';

-- Handing an event to an account is a coordinator's decision, in the database and not only on the screen. The claim function runs as
-- the service role with no signed-in staff member, so it passes.
create function public.al_events_guard_organizer()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.organizer_claim_hash is distinct from old.organizer_claim_hash or new.organizer_subject is distinct from old.organizer_subject)
     and auth.uid() is not null
     and not coalesce(private.is_audience_listening_coordinator(auth.uid()), false)
  then
    raise exception 'Only a coordinator can give an event an organizer.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.al_events_guard_organizer() from public, anon, authenticated;

create trigger al_events_guard_organizer
  before update on public.al_events
  for each row execute function public.al_events_guard_organizer();

-- Redeems an organizer link for a site account. p_subject is 'site:account:<id>'. A link made later replaces an earlier one, and
-- claiming it replaces whoever organized the event before: staff made the link on purpose.
create function public.al_site_room_claim(p_subject text, p_claim_hash text)
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
  if p_subject is null or p_subject !~ '^site:account:[A-Za-z0-9_-]{1,128}$' or not private.al_valid_hash(p_claim_hash) then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  select * into e from public.al_events where organizer_claim_hash = p_claim_hash and status in ('scheduled', 'live') for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  update public.al_events set organizer_subject = p_subject, organizer_claim_hash = null where id = e.id;
  return jsonb_build_object('public_id', e.public_id);
end;
$$;

comment on function public.al_site_room_claim(text, text) is
  'Makes a site account the organizer of the event whose single-use organizer link it opened. service_role only.';

revoke execute on function public.al_site_room_claim(text, text) from public, anon, authenticated;
grant execute on function public.al_site_room_claim(text, text) to service_role;

-- ------------------------------------------------------------------------------------------------
-- 3. The hub lists upcoming public events

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

comment on function public.al_site_hub() is
  'The website''s listening page: open listed queries (no count), answered listed queries with their outcomes and a response count, and upcoming listed public events. Called by the Portal''s signed route after it verifies the request; service_role only.';

-- ------------------------------------------------------------------------------------------------
-- 4. The purge also clears a facilitator's email and after link

create or replace function public.al_purge_preview()
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
    'emails', (select count(*) from public.al_tables t join public.al_events e on e.id = t.event_id
                where e.ends_at < now() - interval '30 days' and (t.facilitator_email is not null or t.after_token_hash is not null)),
    'submissions', (select count(*) from public.al_submissions where status = 'in_progress' and updated_at < now() - interval '30 days'),
    'conversations', (select count(*) from public.al_conversations c join public.al_events e on e.id = c.event_id
                       where c.status <> 'sent' and e.ends_at < now() - interval '30 days'
                         and not exists (select 1 from public.al_contact_cards k
                                          where k.conversation_id = c.id and (k.contacted_at is not null or k.name_approved_at is not null))),
    'cards', (select count(*) from public.al_contact_cards k join public.al_conversations c on c.id = k.conversation_id
                join public.al_events e on e.id = c.event_id
               where c.status <> 'sent' and e.ends_at < now() - interval '30 days'
                 and not exists (select 1 from public.al_contact_cards a
                                  where a.conversation_id = c.id and (a.contacted_at is not null or a.name_approved_at is not null))),
    -- Old and unsent, but kept: a reviewer has already contacted someone in it or approved a name.
    'held', (select count(*) from public.al_conversations c join public.al_events e on e.id = c.event_id
              where c.status <> 'sent' and e.ends_at < now() - interval '30 days'
                and exists (select 1 from public.al_contact_cards k
                             where k.conversation_id = c.id and (k.contacted_at is not null or k.name_approved_at is not null)))
  );
end;
$$;

create or replace function public.al_purge_run()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paths jsonb;
  v_submissions integer;
  v_conversations integer;
  v_emails integer;
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
       and not exists (select 1 from public.al_contact_cards k
                        where k.conversation_id = c.id and (k.contacted_at is not null or k.name_approved_at is not null))
  ) q;

  delete from public.al_submissions where status = 'in_progress' and updated_at < now() - interval '30 days';
  get diagnostics v_submissions = row_count;
  -- Deleting the conversation removes its segments, voices, marks and cards (all on delete cascade). The table stays. A conversation
  -- with a card a reviewer has acted on is never selected: that card is the record of what the person agreed to.
  delete from public.al_conversations c using public.al_events e
   where e.id = c.event_id and c.status <> 'sent' and e.ends_at < now() - interval '30 days'
     and not exists (select 1 from public.al_contact_cards k
                      where k.conversation_id = c.id and (k.contacted_at is not null or k.name_approved_at is not null));
  get diagnostics v_conversations = row_count;

  -- The facilitator's email was for sending one link. Thirty days after the event it and the link go, whether or not the conversation was sent.
  update public.al_tables t
     set facilitator_email = null, after_token_hash = null, after_token_expires_at = null
    from public.al_events e
   where e.id = t.event_id and e.ends_at < now() - interval '30 days' and (t.facilitator_email is not null or t.after_token_hash is not null);
  get diagnostics v_emails = row_count;

  return jsonb_build_object('submissions', v_submissions, 'conversations', v_conversations, 'emails', v_emails, 'storage_paths', v_paths);
end;
$$;
