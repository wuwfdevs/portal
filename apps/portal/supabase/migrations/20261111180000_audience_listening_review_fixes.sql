-- Audience Listening: two fixes found in review of phase D (docs/audience-listening-suite-design.md §10).
--
-- 1. A table that ends before its first segment was reserved had no conversation row, so al_site_table_end answered "complete" with
--    nothing missing even when the phone said segments 0..n existed, and a segment uploaded afterwards made a conversation with no
--    last_seq that could never settle. The conversation is now made, and the last segment recorded, whenever the phone says something
--    was recorded (p_last_seq >= 0).
-- 2. The 30-day purge deleted an unsent conversation and, through on delete cascade, every contact card in it, including a card a
--    reviewer had already contacted or approved for naming: a consent record. A conversation holding such a card is now not due. The
--    preview says how many are held back, so the Purge page can name them rather than leave a due list that quietly differs from
--    what is deleted.
--
-- create or replace on functions from 20261111140000 and 20261111160000 (applied): the signatures and grants are unchanged.

create or replace function public.al_site_table_end(p_session_hash text, p_last_seq integer)
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
  if p_last_seq < 0 then
    return jsonb_build_object('complete', true, 'missing', '[]'::jsonb);
  end if;

  -- Something was recorded, so the conversation exists and knows its last segment even if no segment has reached the server yet.
  insert into public.al_conversations (table_id, event_id) values (t.id, t.event_id)
  on conflict (table_id) do nothing;
  select * into v_conversation from public.al_conversations where table_id = t.id for update;

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

-- A conversation is due for the purge when it was never sent, its event ended 30 days ago, and no card in it has been acted on.
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

  return jsonb_build_object('submissions', v_submissions, 'conversations', v_conversations, 'storage_paths', v_paths);
end;
$$;
