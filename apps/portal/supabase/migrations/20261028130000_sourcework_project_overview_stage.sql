-- Where each project stands, for the Sourcework Projects list's progress bar.
-- The list's view carried source and excerpt counts but nothing about the flow a project moves
-- through (Analyze, Review, Synthesis, Piece), so a row could say how big a project was and not how far
-- along. These columns are the inputs to lib/sourcework/project-stage.ts's projectStage(), the same
-- rule the project page's step strip uses, so the list and the page can't disagree. The view computes
-- no stage itself: SQL never decides what "next" is.
--
-- Columns are appended, so `create or replace` keeps the view's grants and every existing reader.
-- Still security_invoker: the caller's RLS applies to every table read here.

create or replace view public.sw_project_overview with (security_invoker = true) as
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
  coalesce(rev.review_count, 0) as review_count,
  -- Appended for the progress bar.
  coalesce(src.ready_count, 0) as ready_count,
  coalesce(src.analyzed_count, 0) as analyzed_count,
  coalesce(rev.clip_review_count, 0) as clip_review_count,
  coalesce(rev.accepted_count, 0) as accepted_count,
  coalesce(syn.has_synthesis, false) as has_synthesis,
  coalesce(pc.piece_count, 0) as piece_count
from public.tw_projects p
  left join public.profiles pr on pr.id = p.created_by
  left join lateral (
    select count(distinct s.id)::integer as source_count,
      count(distinct s.id) filter (where s.status = 'failed'::sw_source_status or r.status = 'failed'::sw_representation_status)::integer as failed_count,
      count(distinct s.id) filter (where s.status = 'uploading'::sw_source_status or s.status = 'ready'::sw_source_status and (r.status = any (array['pending'::sw_representation_status, 'processing'::sw_representation_status])))::integer as active_count,
      max(s.created_at) as last_source_at,
      -- Finished processing and readable.
      count(distinct s.id) filter (where s.status = 'ready'::sw_source_status and r.status = 'ready'::sw_representation_status)::integer as ready_count,
      -- Analyze ran to the end on it in this project: its latest non-trial run succeeded.
      count(distinct s.id) filter (
        where (
          select ar.status
          from public.sw_analysis_runs ar
          where ar.project_id = p.id and ar.source_id = s.id and ar.kind = 'analyze' and not ar.trial
          order by ar.started_at desc
          limit 1
        ) = 'succeeded'
      )::integer as analyzed_count
    from public.sw_project_sources ps
      join public.sw_sources s on s.id = ps.source_id
      left join public.sw_representations r on r.source_id = s.id and (r.kind = any (array['transcript'::sw_representation_kind, 'document_text'::sw_representation_kind]))
    where ps.project_id = p.id
  ) src on true
  left join lateral (
    select count(*)::integer as excerpt_count,
      max(e.created_at) as last_excerpt_at
    from public.sw_source_excerpts e
    where e.source_id in (select ps2.source_id from public.sw_project_sources ps2 where ps2.project_id = p.id)
  ) exc on true
  left join lateral (
    select (
      select count(*)
      from public.sw_data_points d
        join public.sw_project_sources ps3 on ps3.project_id = d.project_id and ps3.source_id = d.source_id
      where d.project_id = p.id and d.status = 'suggested'::text
    )::integer as review_count,
    (
      select count(*)
      from public.sw_quote_suggestions q
        join public.sw_project_sources ps4 on ps4.project_id = q.project_id and ps4.source_id = q.source_id
      where q.project_id = p.id and q.status = 'suggested'::text
    )::integer as clip_review_count,
    (
      select count(*)
      from public.sw_data_points d2
        join public.sw_project_sources ps5 on ps5.project_id = d2.project_id and ps5.source_id = d2.source_id
      where d2.project_id = p.id and d2.status = 'accepted'::text
    )::integer as accepted_count
  ) rev on true
  left join lateral (
    select (s2.current_version >= 1) as has_synthesis
    from public.sw_project_syntheses s2
    where s2.project_id = p.id
  ) syn on true
  left join lateral (
    select count(*)::integer as piece_count
    from public.sw_pieces pc2
    where pc2.project_id = p.id
  ) pc on true;

comment on view public.sw_project_overview is
  'One row per project with source/excerpt counts, last activity and the inputs to the project stage, for the Sourcework Projects list. security_invoker: the caller''s RLS applies.';
