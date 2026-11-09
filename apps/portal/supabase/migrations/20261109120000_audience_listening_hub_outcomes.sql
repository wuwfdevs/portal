-- Audience Listening: the hub read and outcomes (Phase A remainder of docs/audience-listening-suite-design.md).
--
-- WUWF.org's listening page shows what is being asked now and what came of what was asked. This migration adds
-- the Portal half of that:
--
--   * al_queries.listed_on_hub: a staff switch, off by default. Nothing is published automatically (design §6):
--     a query made for a story's embed does not appear on the website's listening page unless someone says so.
--   * al_outcomes: a title and an address staff paste ("a story", "an episode", "a report"). The Portal is
--     CMS-agnostic, so this is never a reference to a record in any CMS (design §2, Outcomes and reports).
--     Only query_id exists today; campaign_id and inbox_id join it with the campaigns and inboxes (phases C and D).
--   * al_site_hub(): the one read the site's hub screen makes. service_role only, like the other al_site_* functions.
--
-- Counts. The hub returns a response count ONLY for a question that has an outcome. An open question's count never
-- leaves the Portal (no public tallies on open questions), and nothing returns a distribution of answers.
--
-- Not here: campaigns and closed-campaign reports. They do not exist until phase D, so the read has no field for
-- them yet; they arrive as an additive part of the same message.

-- ------------------------------------------------------------------------------------------------
-- The hub switch

alter table public.al_queries
  add column listed_on_hub boolean not null default false;

comment on column public.al_queries.listed_on_hub is
  'Whether the website''s listening page may list this query (while open) and its outcomes (once there are any). Off by default; a staff member turns it on per query. A query that is not listed is still reachable by its own link.';

-- ------------------------------------------------------------------------------------------------
-- Outcomes

create table public.al_outcomes (
  id uuid primary key default gen_random_uuid(),
  query_id uuid not null references public.al_queries (id) on delete cascade,
  kind text not null,
  title text not null,
  url text not null,
  summary text,
  published_at date not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint al_outcomes_kind_check check (kind in ('story', 'episode', 'report')),
  constraint al_outcomes_title_check check (char_length(btrim(title)) between 1 and 200),
  -- An address a reader is sent to: https only, no whitespace, no credentials in it.
  constraint al_outcomes_url_check check (url ~ '^https://[^\s/@]+(/[^\s]*)?$' and char_length(url) <= 2000),
  constraint al_outcomes_summary_check check (summary is null or char_length(summary) <= 600)
);

comment on table public.al_outcomes is
  'What came of a query: a title and an address staff paste (a story, an episode, a report). Public once its query is listed on the hub. Never a reference to a record in any CMS.';

create index al_outcomes_query_idx on public.al_outcomes (query_id, published_at desc);

create trigger set_al_outcomes_updated_at
  before update on public.al_outcomes
  for each row execute function public.set_updated_at();

alter table public.al_outcomes enable row level security;

grant select, insert, update, delete on public.al_outcomes to authenticated;

create policy al_outcomes_member_all on public.al_outcomes
  for all
  to authenticated
  using ((select private.has_audience_listening_access((select auth.uid()))))
  with check ((select private.has_audience_listening_access((select auth.uid()))));

-- ------------------------------------------------------------------------------------------------
-- The hub read. Exactly the public fields; never an internal title, note, submission, name or audio.

create function public.al_site_hub()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select case
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
  end;
$$;

comment on function public.al_site_hub() is
  'The website''s listening page: open listed queries (no count) and answered listed queries with their outcomes and a response count. Called by the Portal''s signed route after it verifies the request; service_role only.';

revoke execute on function public.al_site_hub() from public, anon, authenticated;
grant execute on function public.al_site_hub() to service_role;
