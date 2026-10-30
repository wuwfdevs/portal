-- Sourcework: Analyze source (docs/sourcework-analysis-design.md §20).
--
-- One run per source replaces Extract data points, the per-theme Suggest quotes pass and the
-- separate background pre-pass: the model reads the source with web search available and
-- returns findings, a few candidate clips and the pages it consulted. This migration is the
-- schema that run needs, and nothing else; it changes no existing row.

-- 1. Findings ---------------------------------------------------------------------------------
-- A finding says why it matters, in one line the model must write (a better filter than a
-- count). A project with no research question still gets findings, as relevance 'general'.
alter table public.sw_data_points
  add column significance text check (char_length(significance) <= 400);

comment on column public.sw_data_points.significance is
  'One line on why the finding matters to its question, written by the model; null on points made before Analyze (docs/sourcework-analysis-design.md §20).';

alter table public.sw_data_points drop constraint sw_data_points_relevance_check;
alter table public.sw_data_points add constraint sw_data_points_relevance_check
  check (relevance in ('question', 'story', 'general'));

alter table public.sw_data_points drop constraint sw_data_points_bearing_check;
alter table public.sw_data_points add constraint sw_data_points_bearing_check check (
  (relevance = 'question' and question_id is not null and story_element is null)
  or (relevance = 'story' and question_id is null and story_element is not null)
  or (relevance = 'general' and question_id is null and story_element is null)
);

-- 2. Candidate clips --------------------------------------------------------------------------
-- A clip Analyze proposes belongs to a source, not to a theme. Themes are retired as the way in
-- (they stay readable), so theme_id may be null; the composite foreign key does not apply to a
-- row whose theme_id is null. What the clip serves is its sw_quote_suggestion_points rows: none
-- means it is narrative colour that serves no finding.
alter table public.sw_quote_suggestions alter column theme_id drop not null;

create index sw_quote_suggestions_source_status_idx
  on public.sw_quote_suggestions (source_id, status);

-- Analyze does not rate its clips: a self-assigned strong / good / usable was the model grading its
-- own work, and the reporter listens either way. A clip with no tier is simply unrated.
alter table public.sw_quote_suggestions alter column tier drop not null;

-- Accepting a clip with no tier records no quality_tier on its excerpt (it was `else 1`, which would
-- have read as "usable"). Otherwise this is sw_accept_quote_suggestion exactly as it was.
create or replace function public.sw_accept_quote_suggestion(
  p_suggestion_id uuid,
  p_start_ms integer,
  p_end_ms integer,
  p_title text,
  p_text text
)
returns uuid
language plpgsql
security invoker
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
    created_by, origin, suggestion_reason, quality_tier
  )
  values (
    s.source_id, s.representation_id, p_title, p_start_ms, p_end_ms, p_text,
    auth.uid(), 'suggested', s.reason,
    case s.tier when 'strong' then 3 when 'good' then 2 when 'usable' then 1 else null end
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

revoke all on function public.sw_accept_quote_suggestion(uuid, integer, integer, text, text) from public;
grant execute on function public.sw_accept_quote_suggestion(uuid, integer, integer, text, text) to authenticated;

-- 3. Pages the model relied on ----------------------------------------------------------------
-- Which findings a consulted page informed. The page itself is an sw_context_notes row, as
-- before: background only, never evidence, never quotable.
create table public.sw_context_note_points (
  note_id uuid not null references public.sw_context_notes (id) on delete cascade,
  data_point_id uuid not null references public.sw_data_points (id) on delete cascade,
  primary key (note_id, data_point_id)
);

create index sw_context_note_points_point_idx on public.sw_context_note_points (data_point_id);

alter table public.sw_context_note_points enable row level security;
grant select, insert on public.sw_context_note_points to authenticated;

create policy sw_context_note_points_select on public.sw_context_note_points
  for select to authenticated
  using ((select private.has_transcription_access((select auth.uid()))));

create policy sw_context_note_points_insert on public.sw_context_note_points
  for insert to authenticated
  with check ((select private.has_transcription_access((select auth.uid()))));

-- 4. The interviewer --------------------------------------------------------------------------
-- What an interviewer asks is not a finding and not a clip. Set from the speakers menu; null
-- means nobody has said, and the model is told only what the transcript shows.
alter table public.tw_speakers
  add column role text check (role in ('interviewer', 'subject'));

comment on column public.tw_speakers.role is
  'Set by a person: the interviewer''s lines are skipped by Analyze. Null = not said.';

-- 5. The run ----------------------------------------------------------------------------------
-- One more kind of run, per source; one may be in flight per source so a double click cannot
-- start two. Synthesis and outline runs (later slices) are added to the check now so those
-- slices need no change to this table.
alter table public.sw_analysis_runs drop constraint sw_analysis_runs_kind_check;
alter table public.sw_analysis_runs add constraint sw_analysis_runs_kind_check
  check (kind in (
    'context', 'extraction', 'theme_assign', 'theme_review', 'quote_suggest', 'piece_draft',
    'analyze', 'synthesis', 'outline'
  ));

alter table public.sw_analysis_runs drop constraint sw_analysis_runs_source_check;
alter table public.sw_analysis_runs add constraint sw_analysis_runs_source_check
  check (kind not in ('extraction', 'analyze') or source_id is not null);

create unique index sw_analysis_runs_one_running_analyze
  on public.sw_analysis_runs (project_id, source_id)
  where status = 'running' and kind = 'analyze' and not trial;
