-- Sourcework's Projects list, paged and filtered in the database
-- (docs/ui-patterns.md, "Pagination"). The list used to read every project,
-- then every link, source and representation for all of them, and filter in
-- the browser; past PostgREST's 1000-row cap it would have dropped rows
-- silently. This view gives each project one row with the figures the list
-- shows, so the page can sort, filter, count and `.range()` over it.
--
-- security_invoker, so Row Level Security on tw_projects, sw_sources,
-- sw_representations and sw_source_excerpts applies to the caller exactly as
-- it did when the page read those tables itself: tool members see every
-- project, nobody else sees any.
--
-- started_by_name is a courtesy column: profiles RLS shows a non-admin only
-- their own row, so it is null for projects other people started and the page
-- falls back to a plain word (same convention as lib/roadmap/queries.ts).

create view public.sw_project_overview
with (security_invoker = true) as
select
  p.id,
  p.title,
  p.description,
  p.created_at,
  p.created_by,
  pr.display_name as started_by_name,
  coalesce(src.source_count, 0) as source_count,
  coalesce(src.failed_count, 0) as failed_count,
  coalesce(src.active_count, 0) as active_count,
  coalesce(exc.excerpt_count, 0) as excerpt_count,
  greatest(p.updated_at, src.last_source_at, exc.last_excerpt_at) as last_activity
from public.tw_projects p
left join public.profiles pr on pr.id = p.created_by
left join lateral (
  select
    count(distinct s.id)::integer as source_count,
    -- A source whose upload failed, or whose transcript/text extraction did.
    count(distinct s.id) filter (where s.status = 'failed' or r.status = 'failed')::integer
      as failed_count,
    -- Still on its way: uploading, or uploaded and not yet processed.
    count(distinct s.id) filter (
      where s.status = 'uploading' or (s.status = 'ready' and r.status in ('pending', 'processing'))
    )::integer as active_count,
    max(s.created_at) as last_source_at
  from public.sw_project_sources ps
  join public.sw_sources s on s.id = ps.source_id
  left join public.sw_representations r
    on r.source_id = s.id and r.kind in ('transcript', 'document_text')
  where ps.project_id = p.id
) src on true
left join lateral (
  select count(*)::integer as excerpt_count, max(e.created_at) as last_excerpt_at
  from public.sw_source_excerpts e
  where e.source_id in (
    select ps2.source_id from public.sw_project_sources ps2 where ps2.project_id = p.id
  )
) exc on true;

comment on view public.sw_project_overview is
  'One row per project with source/excerpt counts and last activity, for the Sourcework Projects list. security_invoker: the caller''s RLS applies.';

revoke all on public.sw_project_overview from anon;
grant select on public.sw_project_overview to authenticated;
