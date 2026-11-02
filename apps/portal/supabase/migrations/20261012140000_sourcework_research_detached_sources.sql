-- Detaching a source from a project (removeSourceFromProject) deletes only the
-- sw_project_sources link. The project's data points for that source stay in the
-- table (re-attaching the source brings them back), but nothing on screen can
-- reach them while it is detached: the only place they are reviewed is the
-- source opened from its project. They must therefore not count — not toward
-- the Projects list's "needs attention" and "N to review", not in a source's
-- counts, and not in a question's data point total. Each count below now goes
-- through the project's current source links.

create or replace view public.sw_data_point_counts
with (security_invoker = true) as
select
  d.project_id,
  d.source_id,
  (count(*) filter (where d.status <> 'rejected'))::integer as total,
  (count(*) filter (where d.status = 'suggested'))::integer as to_review,
  (count(*) filter (where d.status = 'accepted'))::integer as accepted,
  (count(*) filter (where d.status = 'rejected'))::integer as rejected
from public.sw_data_points d
join public.sw_project_sources ps
  on ps.project_id = d.project_id and ps.source_id = d.source_id
group by d.project_id, d.source_id;

create or replace view public.sw_data_point_question_counts
with (security_invoker = true) as
select
  d.project_id,
  d.question_id,
  (count(*) filter (where d.status <> 'rejected'))::integer as total
from public.sw_data_points d
join public.sw_project_sources ps
  on ps.project_id = d.project_id and ps.source_id = d.source_id
where d.question_id is not null
group by d.project_id, d.question_id;

create or replace view public.sw_project_overview
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
  greatest(p.updated_at, src.last_source_at, exc.last_excerpt_at) as last_activity,
  coalesce(rev.review_count, 0) as review_count
from public.tw_projects p
left join public.profiles pr on pr.id = p.created_by
left join lateral (
  select
    count(distinct s.id)::integer as source_count,
    count(distinct s.id) filter (where s.status = 'failed' or r.status = 'failed')::integer
      as failed_count,
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
) exc on true
left join lateral (
  -- Only data points of sources the project still has.
  select count(*)::integer as review_count
  from public.sw_data_points d
  join public.sw_project_sources ps3
    on ps3.project_id = d.project_id and ps3.source_id = d.source_id
  where d.project_id = p.id and d.status = 'suggested'
) rev on true;
