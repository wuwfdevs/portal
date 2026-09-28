-- Resources: slice 4 (the assistant). Semantic search alongside keyword
-- search, so a question in someone's own words ("use the same interview in
-- two projects") finds the guide written in the tool's words ("add another
-- source"). Same design as Sourcework's tw_search
-- (20260728120000_transcription_search.sql): keyword and vector rankings
-- fused by reciprocal rank fusion in one security invoker function, so
-- rc_articles RLS is still the boundary. OPENAI_API_KEY stays optional —
-- without it no embeddings exist and the vector half contributes nothing.
--
-- One deliberate difference: embeddings live in their own table, not on
-- rc_articles. Writing one onto an article would fire its updated_at and
-- version triggers, and every page would read "Updated today" after an
-- embedding pass. Staleness is a hash instead of a trigger-maintained flag:
-- an article needs (re-)embedding when it has no row here or the row's
-- content_hash differs from the article's.

create extension if not exists vector with schema extensions;

alter table public.rc_articles
  add column content_hash text generated always as (
    md5(coalesce(title, '') || E'\n' || coalesce(summary, '') || E'\n' || public.rc_body_text(body))
  ) stored;

comment on column public.rc_articles.content_hash is
  'Hash of the text that is embedded (title, summary, body). An rc_article_embeddings row with a different hash is stale.';

create table public.rc_article_embeddings (
  article_id uuid primary key references public.rc_articles (id) on delete cascade,
  embedding extensions.vector(1536) not null,
  content_hash text not null,
  embedded_at timestamptz not null default now()
);

comment on table public.rc_article_embeddings is
  'One embedding per article, of the text content_hash covers. Written by editors'' sessions (on save, and a best-effort pass when an editor opens Resources); read by rc_search_articles.';

create index rc_article_embeddings_hnsw
  on public.rc_article_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.rc_article_embeddings enable row level security;

grant select, insert, update, delete on public.rc_article_embeddings to authenticated;

-- Follows the article: the subquery runs under rc_articles' own RLS.
create policy rc_article_embeddings_select on public.rc_article_embeddings
  for select to authenticated
  using (exists (select 1 from public.rc_articles a where a.id = article_id));

-- Only editors write, as for articles themselves: a reader able to write a
-- vector could push any article up or down everyone's search results.
create policy rc_article_embeddings_insert on public.rc_article_embeddings
  for insert to authenticated
  with check ((select private.is_resources_editor((select auth.uid()))));

create policy rc_article_embeddings_update on public.rc_article_embeddings
  for update to authenticated
  using ((select private.is_resources_editor((select auth.uid()))))
  with check ((select private.is_resources_editor((select auth.uid()))));

create policy rc_article_embeddings_delete on public.rc_article_embeddings
  for delete to authenticated
  using ((select private.is_resources_editor((select auth.uid()))));

-- Articles whose embedding is missing or stale, with the text to embed.
-- security invoker: an editor sees every article, so an editor's pass covers
-- them all.
create function public.rc_articles_needing_embedding(p_limit integer default 50)
returns table (id uuid, title text, summary text, body_text text, content_hash text)
language sql
stable
security invoker
set search_path = public
as $$
  select a.id, a.title, a.summary, public.rc_body_text(a.body), a.content_hash
  from public.rc_articles a
  left join public.rc_article_embeddings e on e.article_id = a.id
  where e.article_id is null or e.content_hash <> a.content_hash
  order by a.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke execute on function public.rc_articles_needing_embedding(integer) from public, anon;
grant execute on function public.rc_articles_needing_embedding(integer) to authenticated;

-- Search, replaced. The keyword half matches every word of p_query first
-- and, only if that finds nothing, any of the words (p_fallback_query,
-- built by lib/resources/articles.ts's anyWordQuery); the vector half ranks
-- by distance to p_embedding when one is given. A stale embedding still
-- ranks — it describes substantially the same article — until it's redone.
drop function public.rc_search_articles(text, integer);

create function public.rc_search_articles(
  p_query text,
  p_limit integer default 30,
  p_fallback_query text default null,
  p_embedding extensions.vector(1536) default null
)
returns table (id uuid, rank real)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with strict_q as (
    select websearch_to_tsquery('english', coalesce(p_query, '')) as ts
  ),
  loose_q as (
    select websearch_to_tsquery('english', coalesce(p_fallback_query, '')) as ts
  ),
  strict_hits as (
    select a.id, ts_rank(a.search_vector, q.ts) as score
    from public.rc_articles a, strict_q q
    where numnode(q.ts) > 0 and a.search_vector @@ q.ts
  ),
  loose_hits as (
    select a.id, ts_rank(a.search_vector, q.ts) as score
    from public.rc_articles a, loose_q q
    where numnode(q.ts) > 0
      and a.search_vector @@ q.ts
      and not exists (select 1 from strict_hits)
  ),
  keyword_ranked as (
    select id, row_number() over (order by score desc, id) as rn
    from (select * from strict_hits union all select * from loose_hits) hits
  ),
  vector_ranked as (
    select id, row_number() over (order by distance, id) as rn
    from (
      select a.id, (e.embedding <=> p_embedding) as distance
      from public.rc_article_embeddings e
      join public.rc_articles a on a.id = e.article_id
      where p_embedding is not null
      order by e.embedding <=> p_embedding
      limit greatest(coalesce(p_limit, 30), 30) * 2
    ) nearest
  ),
  fused as (
    select
      coalesce(k.id, v.id) as id,
      coalesce(1.0 / (60 + k.rn), 0) + coalesce(1.0 / (60 + v.rn), 0) as score
    from keyword_ranked k
    full outer join vector_ranked v on v.id = k.id
  )
  select f.id, f.score::real as rank
  from fused f
  order by f.score desc, f.id
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

revoke execute on function public.rc_search_articles(text, integer, text, extensions.vector) from public, anon;
grant execute on function public.rc_search_articles(text, integer, text, extensions.vector) to authenticated;
