-- Audience Listening: the hub says which campaign each thing belongs to.
--
-- The website's hub shows a campaign as one band: its question, then the ways to take part (answer alone, join a session, host
-- a table). The hub read listed open questions, sessions and kitchen campaigns as three unrelated lists, so the site could not
-- put them back together. This replaces al_site_hub() with the same body plus three additive fields:
--
--   * open[].campaign_public_id    the open campaign whose single question this is (al_campaigns.query_id), or null
--   * events[].campaign_public_id  the campaign the session belongs to (al_events.campaign_id)
--   * campaigns                    the open campaigns themselves: title, question, intro and who is asking
--
-- A reader that does not know the new fields ignores them. Nothing is public that was not already: an open campaign's title and
-- question were already on the hub for kitchen tables, and the word "campaign" is still never shown to the public (the site
-- words it by what it asks). service_role only, like every al_site_* function.

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
            'campaign_public_id', (select c.public_id from public.al_campaigns c where c.query_id = q.id and c.status = 'open')
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
                             else greatest(0, x.seats - (select count(*) from public.al_seats s where s.event_id = x.id)) end,
          'campaign_public_id', (select c.public_id from public.al_campaigns c where c.id = x.campaign_id)
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
    ), '[]'::jsonb) end) || jsonb_build_object('campaigns',
    case when not private.tool_is_enabled('audience-listening') then '[]'::jsonb else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'public_id', k.public_id,
          'title', k.title,
          'question', k.question,
          'intro', k.intro,
          'owner_label', k.owner_label,
          'closes_at', k.closes_at
        )
        order by k.created_at desc
      )
      from (
        select * from public.al_campaigns
         where status = 'open'
           and (closes_at is null or closes_at > now())
         order by created_at desc
         limit 6
      ) k
    ), '[]'::jsonb) end);
$$;

comment on function public.al_site_hub() is
  'The website''s hub: what is open now, what came of what was asked, listed sessions, kitchen-table campaigns, and the open campaigns that group them. A count appears only beside an outcome. service_role only.';

revoke execute on function public.al_site_hub() from public, anon, authenticated;
grant execute on function public.al_site_hub() to service_role;
