-- Audience Listening: a query's read carries what came of it (component C's "You asked, we reported", and the
-- follow-through components E and F later). A follow-up to 20261109120000, which added al_outcomes and listed_on_hub.
--
-- al_site_query() gains an `outcome`: the newest outcome of a query that is listed on the hub, with the number of people who
-- answered. Both are absent (null) for a query that is not listed or has no outcome, so an open question's count never leaves the
-- Portal (no public tallies on open questions). Everything else in the payload is unchanged from 20261107120000; this replaces the
-- function in place (grants are kept by CREATE OR REPLACE, and restated below).

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

revoke execute on function public.al_site_query(text) from public, anon, authenticated;
grant execute on function public.al_site_query(text) to service_role;
