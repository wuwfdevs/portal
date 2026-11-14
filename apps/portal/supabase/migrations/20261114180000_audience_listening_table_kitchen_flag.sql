-- Audience Listening: a table says whether it is a kitchen table.
--
-- A kitchen table is a private one-table session its host starts from the website: nobody organizes it and nobody is at a front desk,
-- and no card was printed. The table's phone worded itself for an event (Table 1, "the organizer reads it from the front", "ask someone at
-- the front"). It now needs to know which it is, so the view carries `kitchen`, true when the event was started by a visitor. Additive; a
-- site that does not read it behaves as before. Replaces private.al_table_view, unchanged otherwise (grants are kept by create or replace).

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
    'kitchen', e.kitchen_host_subject is not null,
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
