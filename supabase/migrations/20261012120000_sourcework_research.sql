-- Sourcework research, Phase A (docs/sourcework-analysis-design.md §4, §5.1–§5.3,
-- §8): research questions, web background notes, data points with their
-- evidence spans, the audit log of model runs, and editor-managed prompt
-- versions with their drafts and trials. Themes, suggested quotes and piece
-- formats are Phases B, C and E and add their own tables.
--
-- Everything the model produces here is a suggestion until a person accepts it:
-- sw_data_points.status is 'suggested' | 'accepted' | 'rejected', reject hides
-- and never deletes, and a later run replaces only what is still 'suggested'.
--
-- Access follows the rest of Sourcework: any transcription tool member reads and
-- writes a project's research. The one elevation is the new `editor` tool role
-- (a stacking role, tool_access.tool_roles), which maintains the prompts every
-- project's runs use — private.is_sourcework_editor().

-- The elevation ---------------------------------------------------------------
create function private.is_sourcework_editor(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.has_tool_role(uid, 'transcription', 'editor');
$$;

grant execute on function private.is_sourcework_editor(uuid) to authenticated;

-- Research questions ------------------------------------------------------------
-- Ordered text, per project. Archiving hides a question without orphaning the
-- data points that answer it, so a question is never deleted.
create table public.sw_research_questions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tw_projects (id) on delete cascade,
  position integer not null default 0 check (position >= 0),
  question text not null check (char_length(btrim(question)) between 1 and 500),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.sw_research_questions is
  'What a project is trying to learn (docs/sourcework-analysis-design.md §4.1). Archived, never deleted: a data point keeps pointing at the question it answered.';

create index sw_research_questions_project_idx
  on public.sw_research_questions (project_id, position, created_at);

create trigger set_sw_research_questions_updated_at
  before update on public.sw_research_questions
  for each row execute function public.set_updated_at();

-- Prompt versions ----------------------------------------------------------------
-- Created before the runs and data points that point at them. Insert-only: a
-- published version never changes, "live" is a movable pointer, and rolling back
-- is moving it (§8). The slot list lives in code (lib/sourcework/prompts.ts).
create table public.sw_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  slot text not null check (char_length(slot) between 1 and 40),
  version integer not null check (version >= 1),
  body text not null check (char_length(btrim(body)) between 1 and 20000),
  note text check (note is null or char_length(note) <= 300),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (slot, version),
  unique (id, slot)
);

comment on table public.sw_prompt_versions is
  'Insert-only history of an editor-managed prompt slot''s language (docs/sourcework-analysis-design.md §8). A run records the version it used; the accept rate per version is the quality metric.';

create table public.sw_prompt_live (
  slot text primary key,
  version_id uuid not null,
  moved_by uuid not null references public.profiles (id) on delete restrict,
  moved_at timestamptz not null default now(),
  -- The pointer can only name a version of its own slot.
  foreign key (version_id, slot) references public.sw_prompt_versions (id, slot)
);

comment on table public.sw_prompt_live is
  'Which published version of each prompt slot runs. No row means the built-in text in code. Moving it is publishing or rolling back.';

-- One draft per slot per editor, autosaved (§8.1).
create table public.sw_prompt_drafts (
  slot text not null check (char_length(slot) between 1 and 40),
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) <= 20000),
  updated_at timestamptz not null default now(),
  primary key (slot, user_id)
);

-- Model runs ------------------------------------------------------------------------
-- One row per model run, in the spirit of sw_document_processing_runs: an audit log,
-- not a queue. A run in flight holds a partial unique index so a double click can't
-- start two, and a run that died with its request is recoverable (see
-- lib/sourcework/research-runs.ts) rather than blocking a retry forever.
create table public.sw_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('context', 'extraction')),
  project_id uuid not null references public.tw_projects (id) on delete cascade,
  source_id uuid references public.sw_sources (id) on delete cascade,
  prompt_version_id uuid references public.sw_prompt_versions (id) on delete set null,
  -- True for a "Try this draft" run: it writes a sw_prompt_trials row and nothing to the project.
  trial boolean not null default false,
  model text not null,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  counts jsonb not null default '{}'::jsonb,
  -- Context runs record the web searches the model made (§5.1, privacy).
  queries jsonb not null default '[]'::jsonb,
  error text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint sw_analysis_runs_source_check check (kind <> 'extraction' or source_id is not null)
);

comment on table public.sw_analysis_runs is
  'Audit log of every model run behind Sourcework research (docs/sourcework-analysis-design.md §4.7). Not a job queue.';
comment on column public.sw_analysis_runs.prompt_version_id is
  'The published prompt version the run used; null means the built-in text in code.';

create index sw_analysis_runs_project_idx on public.sw_analysis_runs (project_id, started_at desc);
create index sw_analysis_runs_source_idx on public.sw_analysis_runs (source_id, started_at desc);

create unique index sw_analysis_runs_one_running_extraction
  on public.sw_analysis_runs (project_id, source_id)
  where status = 'running' and kind = 'extraction' and not trial;
create unique index sw_analysis_runs_one_running_context
  on public.sw_analysis_runs (project_id)
  where status = 'running' and kind = 'context';

-- Background notes --------------------------------------------------------------------
-- What the model found on the web to read a project's sources correctly. Background
-- only: never quotable, never evidence, never an excerpt (§4.2). Deliberately not in
-- sw_sources, which is immutable original media that everything else cites.
create table public.sw_context_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tw_projects (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  summary text not null check (char_length(btrim(summary)) between 1 and 600),
  url text not null check (url ~* '^https?://'),
  retrieved_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'dismissed')),
  run_id uuid references public.sw_analysis_runs (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

comment on table public.sw_context_notes is
  'Web background gathered for a project (docs/sourcework-analysis-design.md §4.2). Passed to extraction as unverified reference; dismissed notes are never sent.';

create index sw_context_notes_project_idx on public.sw_context_notes (project_id, created_at);

-- Data points -------------------------------------------------------------------------------
create table public.sw_data_points (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tw_projects (id) on delete cascade,
  source_id uuid not null references public.sw_sources (id) on delete cascade,
  representation_id uuid not null references public.sw_representations (id) on delete cascade,
  question_id uuid references public.sw_research_questions (id) on delete restrict,
  relevance text not null check (relevance in ('question', 'story')),
  story_element text check (story_element in ('character', 'place', 'moment', 'detail', 'background')),
  claim text not null check (char_length(btrim(claim)) between 1 and 800),
  -- The model's own wording, kept when a person edits `claim`.
  ai_claim text not null,
  speaker_id uuid references public.tw_speakers (id) on delete set null,
  kind text not null check (kind in ('firsthand', 'secondhand', 'opinion', 'factual')),
  status text not null default 'suggested' check (status in ('suggested', 'accepted', 'rejected')),
  prompt_version_id uuid references public.sw_prompt_versions (id) on delete set null,
  run_id uuid references public.sw_analysis_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A responsive point names its question; a story point names its element. One
  -- passage that answers two questions is two data points.
  constraint sw_data_points_relevance_check check (
    (relevance = 'question' and question_id is not null and story_element is null)
    or (relevance = 'story' and question_id is null and story_element is not null)
  )
);

comment on table public.sw_data_points is
  'A short paraphrase of what a source says that bears on a project''s questions or story, with the passages it rests on (docs/sourcework-analysis-design.md §4.3). A paraphrase, never a quote: an excerpt is the literal cut.';
comment on column public.sw_data_points.ai_claim is
  'The model''s original wording. `claim` starts equal to it and is what a person edits.';

create index sw_data_points_project_source_idx
  on public.sw_data_points (project_id, source_id, status);
create index sw_data_points_source_idx on public.sw_data_points (source_id);
create index sw_data_points_question_idx on public.sw_data_points (question_id);
create index sw_data_points_run_idx on public.sw_data_points (run_id);
create index sw_data_points_prompt_version_idx on public.sw_data_points (prompt_version_id)
  where status <> 'suggested';

create trigger set_sw_data_points_updated_at
  before update on public.sw_data_points
  for each row execute function public.set_updated_at();

-- One or more evidence spans per data point, in the typed-locator shape of
-- sw_source_excerpts / sw_excerpt_document_locations: a memory is often built up
-- across two passages. The model returns unit ranges; code derives these.
create table public.sw_data_point_spans (
  id uuid primary key default gen_random_uuid(),
  data_point_id uuid not null references public.sw_data_points (id) on delete cascade,
  position integer not null check (position >= 0),
  locator_kind text not null check (locator_kind in ('temporal', 'document')),
  start_ms integer,
  end_ms integer,
  page_number integer,
  -- SET NULL, not CASCADE: reprocessing a document regenerates its blocks, and a
  -- data point made against the previous run keeps its page (same reasoning as
  -- sw_excerpt_document_locations.block_id).
  first_block_id uuid references public.sw_document_blocks (id) on delete set null,
  last_block_id uuid references public.sw_document_blocks (id) on delete set null,
  unique (data_point_id, position),
  constraint sw_data_point_spans_locator_check check (
    (locator_kind = 'temporal' and start_ms is not null and end_ms is not null
      and end_ms > start_ms and start_ms >= 0 and page_number is null)
    or (locator_kind = 'document' and page_number is not null and page_number >= 1
      and start_ms is null and end_ms is null)
  )
);

create index sw_data_point_spans_data_point_idx on public.sw_data_point_spans (data_point_id, position);

-- Trials of a draft prompt -----------------------------------------------------------------
-- "Try this draft": the live version and the editor's draft run on identical input and
-- are compared. Private to the editor who ran it, expires after 14 days, and never
-- touches project data (§8.1).
create table public.sw_prompt_trials (
  id uuid primary key default gen_random_uuid(),
  slot text not null check (char_length(slot) between 1 and 40),
  draft_body text not null,
  -- The live version when the trial ran; null means the built-in text.
  live_version_id uuid references public.sw_prompt_versions (id) on delete set null,
  project_id uuid not null references public.tw_projects (id) on delete cascade,
  source_id uuid not null references public.sw_sources (id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  error text,
  -- { live: TrialSide, draft: TrialSide } — see lib/sourcework/trials.ts.
  results jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days')
);

create index sw_prompt_trials_owner_idx on public.sw_prompt_trials (created_by, slot, created_at desc);

-- Counts the screens show -------------------------------------------------------------------------
-- Views, security invoker: RLS on sw_data_points applies to the caller exactly as if the
-- page read the table, and the aggregation happens in the database rather than past
-- PostgREST's row cap.
create view public.sw_data_point_counts
with (security_invoker = true) as
select
  project_id,
  source_id,
  (count(*) filter (where status <> 'rejected'))::integer as total,
  (count(*) filter (where status = 'suggested'))::integer as to_review,
  (count(*) filter (where status = 'accepted'))::integer as accepted,
  (count(*) filter (where status = 'rejected'))::integer as rejected
from public.sw_data_points
group by project_id, source_id;

create view public.sw_data_point_question_counts
with (security_invoker = true) as
select
  project_id,
  question_id,
  (count(*) filter (where status <> 'rejected'))::integer as total
from public.sw_data_points
where question_id is not null
group by project_id, question_id;

revoke all on public.sw_data_point_counts from anon;
revoke all on public.sw_data_point_question_counts from anon;
grant select on public.sw_data_point_counts to authenticated;
grant select on public.sw_data_point_question_counts to authenticated;

-- Accepted ÷ reviewed, per prompt version (§8): a data point a person has decided on
-- counts, one still waiting does not. A null version is the built-in text.
create function public.sw_extraction_accept_rates()
returns table (prompt_version_id uuid, accepted integer, rejected integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    d.prompt_version_id,
    (count(*) filter (where d.status = 'accepted'))::integer,
    (count(*) filter (where d.status = 'rejected'))::integer
  from public.sw_data_points d
  where d.status <> 'suggested'
  group by d.prompt_version_id
$$;

revoke all on function public.sw_extraction_accept_rates() from public;
grant execute on function public.sw_extraction_accept_rates() to authenticated;

-- Publishing a prompt --------------------------------------------------------------------------------
-- Saves the next version of a slot and moves the live pointer to it, atomically.
-- security invoker: the editor policies below still decide whether the caller may.
create function public.sw_publish_prompt(p_slot text, p_body text, p_note text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_next integer;
  v_id uuid;
begin
  -- Serialise publishers of one slot so two editors can't mint the same number.
  perform pg_advisory_xact_lock(hashtext('sw_prompt_' || p_slot));

  select coalesce(max(version), 0) + 1 into v_next
    from public.sw_prompt_versions
   where slot = p_slot;

  insert into public.sw_prompt_versions (slot, version, body, note, created_by)
  values (p_slot, v_next, p_body, nullif(btrim(p_note), ''), auth.uid())
  returning id into v_id;

  insert into public.sw_prompt_live (slot, version_id, moved_by)
  values (p_slot, v_id, auth.uid())
  on conflict (slot) do update
    set version_id = excluded.version_id,
        moved_by = excluded.moved_by,
        moved_at = now();

  return v_next;
end;
$$;

revoke all on function public.sw_publish_prompt(text, text, text) from public;
grant execute on function public.sw_publish_prompt(text, text, text) to authenticated;

-- Row Level Security -------------------------------------------------------------------------------------
alter table public.sw_research_questions enable row level security;
alter table public.sw_context_notes enable row level security;
alter table public.sw_analysis_runs enable row level security;
alter table public.sw_data_points enable row level security;
alter table public.sw_data_point_spans enable row level security;
alter table public.sw_prompt_versions enable row level security;
alter table public.sw_prompt_live enable row level security;
alter table public.sw_prompt_drafts enable row level security;
alter table public.sw_prompt_trials enable row level security;

grant select, insert, update on public.sw_research_questions to authenticated;
grant select, insert, update on public.sw_context_notes to authenticated;
grant select, insert, update on public.sw_analysis_runs to authenticated;
grant select, insert, update, delete on public.sw_data_points to authenticated;
grant select, insert, update, delete on public.sw_data_point_spans to authenticated;
grant select, insert on public.sw_prompt_versions to authenticated;
grant select, insert, update on public.sw_prompt_live to authenticated;
grant select, insert, update, delete on public.sw_prompt_drafts to authenticated;
grant select, insert, update, delete on public.sw_prompt_trials to authenticated;

-- Project research is the shared workspace's: any tool member reads and writes it.
create policy sw_research_questions_select on public.sw_research_questions
  for select to authenticated
  using ((select private.has_transcription_access((select auth.uid()))));

create policy sw_research_questions_insert on public.sw_research_questions
  for insert to authenticated
  with check (
    (select private.has_transcription_access((select auth.uid())))
    and created_by = (select auth.uid())
  );

-- Anyone on the tool may reword, reorder or archive a project's question; the
-- creator is not who decides. There is no delete: a question is archived.
create policy sw_research_questions_update on public.sw_research_questions
  for update to authenticated
  using ((select private.has_transcription_access((select auth.uid()))))
  with check ((select private.has_transcription_access((select auth.uid()))));

create policy sw_context_notes_member_all on public.sw_context_notes
  for all to authenticated
  using ((select private.has_transcription_access((select auth.uid()))))
  with check ((select private.has_transcription_access((select auth.uid()))));

create policy sw_analysis_runs_select on public.sw_analysis_runs
  for select to authenticated
  using ((select private.has_transcription_access((select auth.uid()))));

create policy sw_analysis_runs_insert on public.sw_analysis_runs
  for insert to authenticated
  with check (
    (select private.has_transcription_access((select auth.uid())))
    and created_by = (select auth.uid())
  );

-- A run that died with its request is closed by whoever retries it, not only its starter.
create policy sw_analysis_runs_update on public.sw_analysis_runs
  for update to authenticated
  using ((select private.has_transcription_access((select auth.uid()))))
  with check ((select private.has_transcription_access((select auth.uid()))));

create policy sw_data_points_member_all on public.sw_data_points
  for all to authenticated
  using ((select private.has_transcription_access((select auth.uid()))))
  with check ((select private.has_transcription_access((select auth.uid()))));

create policy sw_data_point_spans_member_all on public.sw_data_point_spans
  for all to authenticated
  using ((select private.has_transcription_access((select auth.uid()))))
  with check ((select private.has_transcription_access((select auth.uid()))));

-- Prompts: every member's runs read the live text; only an editor writes it.
create policy sw_prompt_versions_select on public.sw_prompt_versions
  for select to authenticated
  using ((select private.has_transcription_access((select auth.uid()))));

create policy sw_prompt_versions_insert on public.sw_prompt_versions
  for insert to authenticated
  with check (
    (select private.has_transcription_access((select auth.uid())))
    and (select private.is_sourcework_editor((select auth.uid())))
    and created_by = (select auth.uid())
  );

create policy sw_prompt_live_select on public.sw_prompt_live
  for select to authenticated
  using ((select private.has_transcription_access((select auth.uid()))));

create policy sw_prompt_live_insert on public.sw_prompt_live
  for insert to authenticated
  with check (
    (select private.has_transcription_access((select auth.uid())))
    and (select private.is_sourcework_editor((select auth.uid())))
    and moved_by = (select auth.uid())
  );

create policy sw_prompt_live_update on public.sw_prompt_live
  for update to authenticated
  using (
    (select private.has_transcription_access((select auth.uid())))
    and (select private.is_sourcework_editor((select auth.uid())))
  )
  with check (
    (select private.has_transcription_access((select auth.uid())))
    and (select private.is_sourcework_editor((select auth.uid())))
    and moved_by = (select auth.uid())
  );

-- Drafts and trials are private to the editor who made them.
create policy sw_prompt_drafts_own on public.sw_prompt_drafts
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.is_sourcework_editor((select auth.uid())))
  )
  with check (
    user_id = (select auth.uid())
    and (select private.is_sourcework_editor((select auth.uid())))
  );

create policy sw_prompt_trials_own on public.sw_prompt_trials
  for all to authenticated
  using (
    created_by = (select auth.uid())
    and (select private.has_transcription_access((select auth.uid())))
    and (select private.is_sourcework_editor((select auth.uid())))
  )
  with check (
    created_by = (select auth.uid())
    and (select private.has_transcription_access((select auth.uid())))
    and (select private.is_sourcework_editor((select auth.uid())))
  );

-- Publishing or rolling back a prompt changes what every project's next run says, so it
-- is audited. Editors only, and only their own actor id — a member-scoped policy would
-- let anyone with the tool write audit rows (the lesson audit_events_insert_log records).
create policy audit_events_insert_sourcework on public.audit_events
  for insert to authenticated
  with check (
    (select private.is_sourcework_editor((select auth.uid())))
    and actor_id = (select auth.uid())
  );
