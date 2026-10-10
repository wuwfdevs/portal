-- Sourcework research, Phase C (docs/sourcework-analysis-design.md §4.6, §5.5, §8):
-- suggested quotes. For one theme, the model reads its supporting data points with the
-- transcript around them and proposes the clips that would work best on air. Each is a
-- suggestion a person plays, trims, accepts or rejects; accepting turns it into an
-- ordinary excerpt on its source.
--
-- One departure from §4.6, deliberate: a suggestion is NOT a `sw_source_excerpts` row with
-- `review_status = 'suggested'`. Nine places read that table and would each need a filter
-- (the rail, the library, clips.zip, the piece editor's picker, the search index, the
-- Projects list's counts, tw_search ...), and one missed filter would put unreviewed model
-- output into a finished piece or an export. A suggestion lives in its own table and the
-- excerpt row is written only on accept, so every existing reader is correct without a
-- change. The excerpt keeps what the design wanted recorded (its origin, the why-line and
-- the tier) in three new columns nothing needs to filter on.
--
-- Same principles as Phases A and B: reject hides and never deletes, and a later run never
-- alters a decided suggestion. The one delete is a run replacing the suggestions still
-- waiting for a decision (the delete policy below is scoped to exactly those).

-- Runs ------------------------------------------------------------------------------
-- One more kind of model run: Suggest quotes, for one theme. One may run per theme at a
-- time, so a double click cannot start two.
alter table public.sw_analysis_runs drop constraint sw_analysis_runs_kind_check;
alter table public.sw_analysis_runs add constraint sw_analysis_runs_kind_check
  check (kind in ('context', 'extraction', 'theme_assign', 'theme_review', 'quote_suggest'));

alter table public.sw_analysis_runs
  add column theme_id uuid references public.sw_themes (id) on delete set null;

alter table public.sw_analysis_runs add constraint sw_analysis_runs_quote_theme_check
  check (kind <> 'quote_suggest' or theme_id is not null);

create unique index sw_analysis_runs_one_running_quote_step
  on public.sw_analysis_runs (theme_id)
  where status = 'running' and kind = 'quote_suggest' and not trial;

-- Trials of the quote quality guide ------------------------------------------------------------
-- "Try this draft" for the quote guide (§8.1) is sampled on a theme, not a source: the live text and
-- the editor's draft each choose clips from the same theme's evidence and the two lists are compared.
-- Extraction trials still name a source; a quote trial names a theme.
alter table public.sw_prompt_trials alter column source_id drop not null;
alter table public.sw_prompt_trials
  add column theme_id uuid references public.sw_themes (id) on delete cascade;
alter table public.sw_prompt_trials add constraint sw_prompt_trials_sample_check check (
  case when slot = 'quote_quality' then theme_id is not null else source_id is not null end
);

-- Excerpts: where an accepted one came from -----------------------------------------------
-- Nothing reads these to decide what to show; they say how the excerpt came to be.
alter table public.sw_source_excerpts
  add column origin text not null default 'manual' check (origin in ('manual', 'suggested')),
  add column suggestion_reason text check (char_length(suggestion_reason) <= 600),
  add column quality_tier smallint check (quality_tier between 1 and 3);

comment on column public.sw_source_excerpts.origin is
  '''suggested'' when the excerpt began as an accepted quote suggestion (docs/sourcework-analysis-design.md §4.6). Informational: every excerpt is an ordinary excerpt.';
comment on column public.sw_source_excerpts.quality_tier is
  'The tier the model gave a suggested quote when it was accepted: 3 strong, 2 good, 1 usable. Null for an excerpt made by hand.';

-- Suggestions ----------------------------------------------------------------------------------
create table public.sw_quote_suggestions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tw_projects (id) on delete cascade,
  theme_id uuid not null,
  source_id uuid not null references public.sw_sources (id) on delete cascade,
  representation_id uuid references public.sw_representations (id) on delete set null,
  speaker_id uuid references public.tw_speakers (id) on delete set null,
  -- The clip as proposed, in the source's media. Code derives both from the sentence
  -- numbers the model returned; the model never types a time or a word.
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null,
  -- The words in that range, derived from the transcript. Display only: an accepted
  -- excerpt's text is derived again from whatever range was accepted.
  quote_text text not null check (char_length(btrim(quote_text)) >= 1),
  -- "Why it works": one or two sentences, the model's own.
  reason text not null check (char_length(btrim(reason)) between 1 and 600),
  tier text not null check (tier in ('strong', 'good', 'usable')),
  status text not null default 'suggested' check (status in ('suggested', 'accepted', 'rejected')),
  -- Set when it is accepted. If that excerpt is later deleted the suggestion stays accepted.
  excerpt_id uuid references public.sw_source_excerpts (id) on delete set null,
  run_id uuid references public.sw_analysis_runs (id) on delete set null,
  -- The quote quality guide version the run used; null = the built-in text.
  prompt_version_id uuid references public.sw_prompt_versions (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id) on delete restrict,
  decided_at timestamptz,
  foreign key (theme_id, project_id)
    references public.sw_themes (id, project_id) on delete cascade,
  constraint sw_quote_suggestions_range_check check (end_ms > start_ms),
  constraint sw_quote_suggestions_decided_check check (
    (status = 'suggested') = (decided_at is null)
  )
);

comment on table public.sw_quote_suggestions is
  'A clip the model proposed for a theme (docs/sourcework-analysis-design.md §5.5). Accepting writes an ordinary sw_source_excerpts row (sw_accept_quote_suggestion); rejecting hides it and keeps it, so it is not proposed again.';

create index sw_quote_suggestions_theme_idx on public.sw_quote_suggestions (theme_id, status);
create index sw_quote_suggestions_source_idx on public.sw_quote_suggestions (source_id);
create index sw_quote_suggestions_project_idx on public.sw_quote_suggestions (project_id, status);

-- The data points a suggestion rests on: when it is accepted, the excerpt "exemplifies" them.
create table public.sw_quote_suggestion_points (
  suggestion_id uuid not null references public.sw_quote_suggestions (id) on delete cascade,
  data_point_id uuid not null references public.sw_data_points (id) on delete cascade,
  primary key (suggestion_id, data_point_id)
);

create index sw_quote_suggestion_points_point_idx on public.sw_quote_suggestion_points (data_point_id);

-- "This excerpt exemplifies that data point" (§4.6). A theme's representative quotes are
-- derived from it: the excerpts linked to the theme's data points. There is no
-- theme-to-excerpt table. Phase A dropped an earlier sketch of this table.
create table public.sw_data_point_excerpts (
  data_point_id uuid not null references public.sw_data_points (id) on delete cascade,
  excerpt_id uuid not null references public.sw_source_excerpts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (data_point_id, excerpt_id)
);

create index sw_data_point_excerpts_excerpt_idx on public.sw_data_point_excerpts (excerpt_id);

-- Functions ----------------------------------------------------------------------------------
-- Accepting a suggestion: the excerpt, its links to the data points it exemplifies, and the
-- decision, in one transaction, so a failure part-way leaves no excerpt without its
-- suggestion marked and no suggestion marked without its excerpt. The reporter may have
-- trimmed the clip, so the range, the title and the words (re-derived by the caller for
-- that range) arrive as arguments. Returns the new excerpt's id, or null when the
-- suggestion is gone or was already decided (the caller says so; nothing is changed).
-- security invoker: the policies below still decide whether the caller may.
create function public.sw_accept_quote_suggestion(
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
    case s.tier when 'strong' then 3 when 'good' then 2 else 1 end
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

-- Accepted ÷ reviewed, per quote quality guide version (§8). A null version is the built-in
-- text. A suggestion still waiting does not count.
create function public.sw_quote_accept_rates()
returns table (prompt_version_id uuid, accepted integer, rejected integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    q.prompt_version_id,
    (count(*) filter (where q.status = 'accepted'))::integer,
    (count(*) filter (where q.status = 'rejected'))::integer
  from public.sw_quote_suggestions q
  where q.status <> 'suggested'
  group by q.prompt_version_id
$$;

revoke all on function public.sw_quote_accept_rates() from public;
grant execute on function public.sw_quote_accept_rates() to authenticated;

-- Row Level Security --------------------------------------------------------------------------
-- Any transcription tool member, like the rest of Sourcework. A suggestion is rejected,
-- never deleted; the only delete is of one still waiting for a decision, which a new run
-- replaces. (An excerpt deleted by hand removes its sw_data_point_excerpts rows by
-- cascade, and a deleted suggestion its points, which needs no policy.)
alter table public.sw_quote_suggestions enable row level security;
alter table public.sw_quote_suggestion_points enable row level security;
alter table public.sw_data_point_excerpts enable row level security;

grant select, insert, update, delete on public.sw_quote_suggestions to authenticated;
grant select, insert on public.sw_quote_suggestion_points to authenticated;
grant select, insert on public.sw_data_point_excerpts to authenticated;

create policy sw_quote_suggestions_select on public.sw_quote_suggestions
  for select to authenticated
  using ((select private.has_transcription_access((select auth.uid()))));

create policy sw_quote_suggestions_insert on public.sw_quote_suggestions
  for insert to authenticated
  with check (
    (select private.has_transcription_access((select auth.uid())))
    and created_by = (select auth.uid())
  );

create policy sw_quote_suggestions_update on public.sw_quote_suggestions
  for update to authenticated
  using ((select private.has_transcription_access((select auth.uid()))))
  with check ((select private.has_transcription_access((select auth.uid()))));

create policy sw_quote_suggestions_delete_waiting on public.sw_quote_suggestions
  for delete to authenticated
  using (
    (select private.has_transcription_access((select auth.uid())))
    and status = 'suggested'
  );

create policy sw_quote_suggestion_points_select on public.sw_quote_suggestion_points
  for select to authenticated
  using ((select private.has_transcription_access((select auth.uid()))));

create policy sw_quote_suggestion_points_insert on public.sw_quote_suggestion_points
  for insert to authenticated
  with check ((select private.has_transcription_access((select auth.uid()))));

create policy sw_data_point_excerpts_select on public.sw_data_point_excerpts
  for select to authenticated
  using ((select private.has_transcription_access((select auth.uid()))));

create policy sw_data_point_excerpts_insert on public.sw_data_point_excerpts
  for insert to authenticated
  with check ((select private.has_transcription_access((select auth.uid()))));
