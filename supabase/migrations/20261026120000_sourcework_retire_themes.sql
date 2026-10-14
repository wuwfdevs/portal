-- Retires the theme model and what the earlier research runners left in the schema
-- (docs/sourcework-analysis-design.md §24). The pipeline is now Analyze -> Synthesize -> Outline -> Write from
-- outline; a theme is not a step in it, and nothing writes or reads one any more.
--
-- Everything this removes is test data from the earlier runners, and none of it is preserved:
--   * every theme, theme link and merge suggestion, and the tables, views and functions behind them;
--   * every data point that did not come from an Analyze run, and the embedding columns that only matched
--     data points to themes;
--   * every analysis run of a retired kind (extraction, background, theme, quote and Draft with AI runs),
--     the prompt versions and drafts of the five retired prompt slots, and the prompt trials;
--   * stored format trials, which held drafted pieces rather than outlines;
--   * a quote suggestion's theme and tier, and an excerpt's quality tier (Analyze's clips carry neither).
-- What stays: excerpts, pieces and their versions, research questions, context notes, Analyze findings,
-- syntheses, and the Analyze, Synthesis and Outline prompts.
--
-- Run it in the Supabase SQL editor, preview first and then production, not through the MCP tool, which holds
-- DROP and DELETE statements for a confirmation that never arrives.

begin;

-- 1. Data ---------------------------------------------------------------------------------------------

-- Data points first, by the kind of run that wrote them; every foreign key into runs is ON DELETE SET NULL.
delete from sw_data_points
where run_id is null
   or run_id not in (select id from sw_analysis_runs where kind = 'analyze');

delete from sw_piece_format_trials;

delete from sw_analysis_runs where kind not in ('analyze', 'synthesis', 'outline');

delete from sw_prompt_live where slot not in ('analyze', 'synthesis', 'outline');
delete from sw_prompt_drafts where slot not in ('analyze', 'synthesis', 'outline');
delete from sw_prompt_versions where slot not in ('analyze', 'synthesis', 'outline');

-- 2. Themes -------------------------------------------------------------------------------------------

drop view if exists sw_theme_breadth;
drop view if exists sw_theme_decision_counts;
drop view if exists sw_theme_questions;
drop view if exists sw_unthemed_data_points;

-- The project list counted suggested themes and merges among the things waiting for review; now it is the
-- suggested data points alone.
create or replace view sw_project_overview with (security_invoker = true) as
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
from tw_projects p
  left join profiles pr on pr.id = p.created_by
  left join lateral (
    select count(distinct s.id)::integer as source_count,
      count(distinct s.id) filter (where s.status = 'failed'::sw_source_status or r.status = 'failed'::sw_representation_status)::integer as failed_count,
      count(distinct s.id) filter (where s.status = 'uploading'::sw_source_status or s.status = 'ready'::sw_source_status and (r.status = any (array['pending'::sw_representation_status, 'processing'::sw_representation_status])))::integer as active_count,
      max(s.created_at) as last_source_at
    from sw_project_sources ps
      join sw_sources s on s.id = ps.source_id
      left join sw_representations r on r.source_id = s.id and (r.kind = any (array['transcript'::sw_representation_kind, 'document_text'::sw_representation_kind]))
    where ps.project_id = p.id
  ) src on true
  left join lateral (
    select count(*)::integer as excerpt_count,
      max(e.created_at) as last_excerpt_at
    from sw_source_excerpts e
    where e.source_id in (select ps2.source_id from sw_project_sources ps2 where ps2.project_id = p.id)
  ) exc on true
  left join lateral (
    select (
      select count(*)
      from sw_data_points d
        join sw_project_sources ps3 on ps3.project_id = d.project_id and ps3.source_id = d.source_id
      where d.project_id = p.id and d.status = 'suggested'::text
    )::integer as review_count
  ) rev on true;

drop function if exists sw_add_proposed_themes(uuid, uuid, uuid, jsonb);
drop function if exists sw_merge_themes(uuid);
drop function if exists sw_nearest_themes(uuid, uuid[], integer);
drop function if exists sw_theme_accept_rates();
drop function if exists sw_quote_accept_rates();

drop table sw_theme_merge_suggestions;
drop table sw_data_point_themes;

-- A suggested clip belongs to a source and a run. Its theme and tier went with the theme runs.
alter table sw_quote_suggestions drop column theme_id;
alter table sw_quote_suggestions drop column tier;

alter table sw_analysis_runs drop constraint sw_analysis_runs_quote_theme_check;
alter table sw_analysis_runs drop column theme_id;

-- Prompt trials sampled a theme for the quote guide; the extraction and quote guides were the only slots
-- tried this way, and both are gone.
drop table sw_prompt_trials;

drop table sw_themes;
drop function if exists sw_flag_theme_embedding();

-- 3. Data points: the embedding columns only matched a point to a theme ---------------------------------

drop trigger if exists sw_data_points_flag_embedding on sw_data_points;
drop function if exists sw_flag_data_point_embedding();
drop index if exists sw_data_points_stale_idx;
alter table sw_data_points drop column embedding;
alter table sw_data_points drop column embedding_stale;
alter table sw_data_points drop column theme_checked_at;

-- 4. Runs: four kinds remain ----------------------------------------------------------------------------

alter table sw_analysis_runs drop constraint sw_analysis_runs_kind_check;
alter table sw_analysis_runs
  add constraint sw_analysis_runs_kind_check check (kind in ('analyze', 'synthesis', 'outline', 'expand'));

alter table sw_analysis_runs drop constraint sw_analysis_runs_source_check;
alter table sw_analysis_runs
  add constraint sw_analysis_runs_source_check check (kind <> 'analyze' or source_id is not null);

drop index if exists sw_analysis_runs_one_running_context;
drop index if exists sw_analysis_runs_one_running_extraction;
drop index if exists sw_analysis_runs_one_running_theme_step;
drop index if exists sw_analysis_runs_one_running_piece_draft;
create unique index sw_analysis_runs_one_running_expand
  on sw_analysis_runs (piece_id)
  where status = 'running' and kind = 'expand' and not trial;

-- 5. Accepting a clip no longer carries a tier ----------------------------------------------------------

create or replace function sw_accept_quote_suggestion(
  p_suggestion_id uuid,
  p_start_ms integer,
  p_end_ms integer,
  p_title text,
  p_text text
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  s public.sw_quote_suggestions%rowtype;
  v_excerpt_id uuid;
begin
  select * into s from public.sw_quote_suggestions where id = p_suggestion_id for update;
  if not found or s.status <> 'suggested' then
    return null;
  end if;

  insert into public.sw_source_excerpts (
    source_id, representation_id, title, start_ms, end_ms, excerpt_text,
    created_by, origin, suggestion_reason
  )
  values (
    s.source_id, s.representation_id, p_title, p_start_ms, p_end_ms, p_text,
    auth.uid(), 'suggested', s.reason
  )
  returning id into v_excerpt_id;

  insert into public.sw_data_point_excerpts (data_point_id, excerpt_id)
  select sp.data_point_id, v_excerpt_id
    from public.sw_quote_suggestion_points sp
   where sp.suggestion_id = s.id
  on conflict do nothing;

  update public.sw_quote_suggestions
     set status = 'accepted', excerpt_id = v_excerpt_id,
         decided_by = auth.uid(), decided_at = now()
   where id = s.id;

  return v_excerpt_id;
end;
$$;

alter table sw_source_excerpts drop column quality_tier;

commit;
