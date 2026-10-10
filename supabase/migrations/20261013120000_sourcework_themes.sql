-- Sourcework research, Phase B (docs/sourcework-analysis-design.md §4.5, §5.4, §8):
-- themes, the data points that support or complicate them, merge suggestions, and
-- the embeddings that narrow which themes a new data point is checked against.
--
-- Same principles as Phase A. Everything the model produces is a suggestion until a
-- person accepts it (sw_themes.status, sw_theme_merge_suggestions.status); reject
-- hides and never deletes, and a later run never alters an accepted theme. A
-- theme's memo is human-only and is never written by a run. Nothing here is deleted:
-- there is no delete grant or policy on any of the three new tables.
--
-- Access is the rest of Sourcework's: any transcription tool member reads and
-- writes a project's themes (docs/sourcework-analysis-design.md §12 question 1).

-- Runs ------------------------------------------------------------------------------
-- Two more kinds of model run, kept in the same audit log. Assignment is the cheap
-- step after a data point is accepted; reviewing themes is the click that proposes
-- new themes and merges. One of each may run per project at a time.
alter table public.sw_analysis_runs drop constraint sw_analysis_runs_kind_check;
alter table public.sw_analysis_runs add constraint sw_analysis_runs_kind_check
  check (kind in ('context', 'extraction', 'theme_assign', 'theme_review'));

create unique index sw_analysis_runs_one_running_theme_step
  on public.sw_analysis_runs (project_id, kind)
  where status = 'running' and kind in ('theme_assign', 'theme_review') and not trial;

-- Themes --------------------------------------------------------------------------------
-- A theme is a claim-style statement ("Locals treated the fort's tunnels as a private
-- playground"), not a topic. Stable once accepted: a run assigns into it and may
-- suggest merging it, never rewords it. A merged theme stays as a row (merged_into_id)
-- so the history of what became what is not lost, and drops out of every list.
create table public.sw_themes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tw_projects (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  definition text not null check (char_length(btrim(definition)) between 1 and 600),
  -- Human-only. A run never reads it as an instruction and never writes it.
  memo text not null default '' check (char_length(memo) <= 4000),
  status text not null default 'suggested' check (status in ('suggested', 'accepted', 'rejected')),
  origin text not null default 'person' check (origin in ('model', 'person')),
  merged_into_id uuid references public.sw_themes (id) on delete restrict,
  -- The run that proposed it and the prompt version that run used; null version = built-in text.
  run_id uuid references public.sw_analysis_runs (id) on delete set null,
  prompt_version_id uuid references public.sw_prompt_versions (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  accepted_by uuid references public.profiles (id) on delete restrict,
  accepted_at timestamptz,
  embedding extensions.vector(1536),
  embedding_stale boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id),
  constraint sw_themes_merged_check check (
    merged_into_id is null or (status = 'accepted' and merged_into_id <> id)
  ),
  -- An accepted theme says who and when. A theme rejected after being accepted keeps both.
  constraint sw_themes_accepted_check check (
    status <> 'accepted' or (accepted_at is not null and accepted_by is not null)
  )
);

comment on table public.sw_themes is
  'A claim-style statement that data points support or complicate (docs/sourcework-analysis-design.md §4.5). Breadth numbers are computed (sw_theme_breadth), never stored.';
comment on column public.sw_themes.memo is
  'The reporter''s own notes. Human-only: Review themes never reads it as input or writes it.';
comment on column public.sw_themes.merged_into_id is
  'Set when an accepted merge folded this theme into another. The row stays so the history is whole; every list skips it.';

create index sw_themes_project_idx on public.sw_themes (project_id, status, created_at);
create index sw_themes_merged_into_idx on public.sw_themes (merged_into_id) where merged_into_id is not null;
create index sw_themes_stale_idx on public.sw_themes (project_id) where embedding_stale;

create trigger set_sw_themes_updated_at
  before update on public.sw_themes
  for each row execute function public.set_updated_at();

-- What embeds is the theme's own wording; a reworded theme is re-embedded on the next pass.
create function public.sw_flag_theme_embedding()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.embedding_stale := true;
  return new;
end;
$$;

create trigger sw_themes_flag_embedding
  before update of title, definition on public.sw_themes
  for each row
  when (new.title is distinct from old.title or new.definition is distinct from old.definition)
  execute function public.sw_flag_theme_embedding();

-- Data points get the same pair of columns (§4.3). Existing rows start stale: the next
-- assignment pass embeds the accepted ones it needs.
alter table public.sw_data_points
  add column embedding extensions.vector(1536),
  add column embedding_stale boolean not null default true,
  add column theme_checked_at timestamptz;

comment on column public.sw_data_points.embedding is
  'Embedding of the claim, used to find the nearest themes. Null until embedded; embedding_stale marks a claim reworded since. Optional: every path works without OPENAI_API_KEY.';

comment on column public.sw_data_points.theme_checked_at is
  'When assignment last checked this point against the accepted themes. A point is looked at again only when a theme has been accepted since, so one that fits nothing is not asked about on every click.';

create unique index sw_data_points_id_project_key on public.sw_data_points (id, project_id);
create index sw_data_points_stale_idx on public.sw_data_points (project_id)
  where embedding_stale and status = 'accepted';

create function public.sw_flag_data_point_embedding()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.embedding_stale := true;
  return new;
end;
$$;

create trigger sw_data_points_flag_embedding
  before update of claim on public.sw_data_points
  for each row
  when (new.claim is distinct from old.claim)
  execute function public.sw_flag_data_point_embedding();

-- Where a data point sits ---------------------------------------------------------------
-- A data point can sit in several themes. `stance` is the point of the table: a data
-- point that complicates a theme is shown beside the ones that support it, not hidden.
-- A person removing a point from a theme sets removed_at rather than deleting the row,
-- so a later run does not put it straight back.
create table public.sw_data_point_themes (
  data_point_id uuid not null,
  theme_id uuid not null,
  project_id uuid not null references public.tw_projects (id) on delete cascade,
  stance text not null check (stance in ('supports', 'complicates')),
  assigned_by text not null check (assigned_by in ('model', 'person')),
  run_id uuid references public.sw_analysis_runs (id) on delete set null,
  removed_at timestamptz,
  removed_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (data_point_id, theme_id),
  -- A point and the theme it sits in belong to the same project.
  foreign key (data_point_id, project_id)
    references public.sw_data_points (id, project_id) on delete cascade,
  foreign key (theme_id, project_id)
    references public.sw_themes (id, project_id) on delete cascade,
  constraint sw_data_point_themes_removed_check check ((removed_at is null) = (removed_by is null))
);

create index sw_data_point_themes_theme_idx on public.sw_data_point_themes (theme_id)
  where removed_at is null;
create index sw_data_point_themes_point_idx on public.sw_data_point_themes (data_point_id)
  where removed_at is null;

-- Merge suggestions -----------------------------------------------------------------------
-- "Merge A into B": a suggestion that describes a change; accepting performs it
-- (sw_merge_themes below). The pair is unique, so a rejected suggestion is never
-- proposed again.
create table public.sw_theme_merge_suggestions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tw_projects (id) on delete cascade,
  from_theme_id uuid not null,
  into_theme_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  status text not null default 'suggested' check (status in ('suggested', 'accepted', 'rejected')),
  run_id uuid references public.sw_analysis_runs (id) on delete set null,
  prompt_version_id uuid references public.sw_prompt_versions (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id) on delete restrict,
  decided_at timestamptz,
  unique (from_theme_id, into_theme_id),
  foreign key (from_theme_id, project_id)
    references public.sw_themes (id, project_id) on delete cascade,
  foreign key (into_theme_id, project_id)
    references public.sw_themes (id, project_id) on delete cascade,
  constraint sw_theme_merge_suggestions_distinct_check check (from_theme_id <> into_theme_id),
  constraint sw_theme_merge_suggestions_decided_check check (
    (status = 'suggested') = (decided_at is null)
  )
);

create index sw_theme_merge_suggestions_project_idx
  on public.sw_theme_merge_suggestions (project_id, status);

-- What the screens read ---------------------------------------------------------------------
-- Views, security invoker: RLS applies to the caller exactly as if the page read the
-- tables. Only accepted data points of sources the project still has count (the same
-- rule as sw_data_point_counts): a point a person has since un-accepted, or whose
-- source was detached, drops out of every number without losing its row.

-- Per-theme breadth: how many distinct sources and speakers back it, and how many
-- data points support it versus complicate it (§4.5, "Rank by breadth, not repetition").
create view public.sw_theme_breadth
with (security_invoker = true) as
select
  t.id as theme_id,
  t.project_id,
  coalesce(b.source_count, 0) as source_count,
  coalesce(b.speaker_count, 0) as speaker_count,
  coalesce(b.supporting, 0) as supporting,
  coalesce(b.complicating, 0) as complicating
from public.sw_themes t
left join lateral (
  select
    count(distinct d.source_id)::integer as source_count,
    count(distinct d.speaker_id)::integer as speaker_count,
    (count(*) filter (where m.stance = 'supports'))::integer as supporting,
    (count(*) filter (where m.stance = 'complicates'))::integer as complicating
  from public.sw_data_point_themes m
  join public.sw_data_points d on d.id = m.data_point_id and d.status = 'accepted'
  join public.sw_project_sources ps
    on ps.project_id = d.project_id and ps.source_id = d.source_id
  where m.theme_id = t.id and m.removed_at is null
) b on true;

-- The research questions a theme's data points answer ("Q1 · Q3" under its title).
create view public.sw_theme_questions
with (security_invoker = true) as
select
  m.theme_id,
  m.project_id,
  d.question_id,
  count(*)::integer as total
from public.sw_data_point_themes m
join public.sw_data_points d on d.id = m.data_point_id and d.status = 'accepted'
join public.sw_project_sources ps on ps.project_id = d.project_id and ps.source_id = d.source_id
where m.removed_at is null and d.question_id is not null
group by m.theme_id, m.project_id, d.question_id;

-- The candidate pool: accepted data points that sit in no live theme. A point in a
-- suggested theme is already proposed somewhere, so it is not in the pool; a point
-- in a rejected or merged-away theme, or removed from its theme, is.
create view public.sw_unthemed_data_points
with (security_invoker = true) as
select d.id, d.project_id, d.source_id
from public.sw_data_points d
join public.sw_project_sources ps on ps.project_id = d.project_id and ps.source_id = d.source_id
where d.status = 'accepted'
  and not exists (
    select 1
    from public.sw_data_point_themes m
    join public.sw_themes t on t.id = m.theme_id
    where m.data_point_id = d.id
      and m.removed_at is null
      and t.status in ('suggested', 'accepted')
      and t.merged_into_id is null
  );

-- Decisions waiting on the Themes tab, per project: themes the model proposed and merges
-- it suggested between two themes that are both still live. The tab's badge reads this.
create view public.sw_theme_decision_counts
with (security_invoker = true) as
select
  p.id as project_id,
  (
    select count(*)
      from public.sw_themes t
     where t.project_id = p.id and t.status = 'suggested' and t.merged_into_id is null
  )::integer as suggested_themes,
  (
    select count(*)
      from public.sw_theme_merge_suggestions ms
      join public.sw_themes tf on tf.id = ms.from_theme_id
      join public.sw_themes ti on ti.id = ms.into_theme_id
     where ms.project_id = p.id and ms.status = 'suggested'
       and tf.status = 'accepted' and tf.merged_into_id is null
       and ti.status = 'accepted' and ti.merged_into_id is null
  )::integer as suggested_merges
from public.tw_projects p;

revoke all on public.sw_theme_breadth from anon;
revoke all on public.sw_theme_questions from anon;
revoke all on public.sw_unthemed_data_points from anon;
revoke all on public.sw_theme_decision_counts from anon;
grant select on public.sw_theme_breadth to authenticated;
grant select on public.sw_theme_questions to authenticated;
grant select on public.sw_unthemed_data_points to authenticated;
grant select on public.sw_theme_decision_counts to authenticated;

-- The Projects list's "needs attention" also counts suggested themes and merges
-- (§7.1). review_count stays the last column of the view the list already reads.
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
  -- Decisions waiting: data points of sources the project still has, themes
  -- the model proposed, and merges it suggested between live themes.
  select (
    (select count(*)
       from public.sw_data_points d
       join public.sw_project_sources ps3
         on ps3.project_id = d.project_id and ps3.source_id = d.source_id
      where d.project_id = p.id and d.status = 'suggested')
    + (select count(*)
         from public.sw_themes t
        where t.project_id = p.id and t.status = 'suggested' and t.merged_into_id is null)
    + (select count(*)
         from public.sw_theme_merge_suggestions ms
         join public.sw_themes tf on tf.id = ms.from_theme_id
         join public.sw_themes ti on ti.id = ms.into_theme_id
        where ms.project_id = p.id and ms.status = 'suggested'
          and tf.status = 'accepted' and tf.merged_into_id is null
          and ti.status = 'accepted' and ti.merged_into_id is null)
  )::integer as review_count
) rev on true;

-- Functions ----------------------------------------------------------------------------------
-- The nearest accepted themes to each of a set of data points, by embedding (§5.4:
-- "find the nearest themes by embedding, then one call confirms"). security invoker:
-- the caller's RLS still decides what they can see. A point or theme without an
-- embedding simply doesn't appear; the caller then falls back to every accepted theme.
create function public.sw_nearest_themes(
  p_project_id uuid,
  p_data_point_ids uuid[],
  p_k integer
)
returns table (data_point_id uuid, theme_id uuid, similarity double precision)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select ranked.data_point_id, ranked.theme_id, ranked.similarity
  from (
    select
      d.id as data_point_id,
      t.id as theme_id,
      (1 - (d.embedding <=> t.embedding))::double precision as similarity,
      row_number() over (partition by d.id order by d.embedding <=> t.embedding) as rank
    from public.sw_data_points d
    join public.sw_themes t on t.project_id = d.project_id
    where d.project_id = p_project_id
      and d.id = any (p_data_point_ids)
      and d.embedding is not null
      and t.embedding is not null
      and t.status = 'accepted'
      and t.merged_into_id is null
  ) ranked
  where ranked.rank <= greatest(p_k, 1)
$$;

revoke all on function public.sw_nearest_themes(uuid, uuid[], integer) from public;
grant execute on function public.sw_nearest_themes(uuid, uuid[], integer) to authenticated;

-- Accepted ÷ reviewed, per prompt version, for the themes the model proposed (§8). A
-- null version is the built-in text. A suggestion still waiting does not count.
create function public.sw_theme_accept_rates()
returns table (prompt_version_id uuid, accepted integer, rejected integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.prompt_version_id,
    (count(*) filter (where t.status = 'accepted'))::integer,
    (count(*) filter (where t.status = 'rejected'))::integer
  from public.sw_themes t
  where t.origin = 'model' and t.status <> 'suggested'
  group by t.prompt_version_id
$$;

revoke all on function public.sw_theme_accept_rates() from public;
grant execute on function public.sw_theme_accept_rates() to authenticated;

-- Writing what Review themes proposed: every theme and its data points in one
-- transaction, so a failure part-way leaves nothing behind (there is no delete on these
-- tables to clean up with). p_themes is
--   [{ "title": text, "definition": text,
--      "members": [{ "data_point_id": uuid, "stance": "supports" | "complicates" }] }]
-- Returns how many themes were written. security invoker: the insert policies still
-- decide whether the caller may.
create function public.sw_add_proposed_themes(
  p_project_id uuid,
  p_run_id uuid,
  p_prompt_version_id uuid,
  p_themes jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_theme jsonb;
  v_member jsonb;
  v_theme_id uuid;
  v_count integer := 0;
begin
  for v_theme in select * from jsonb_array_elements(p_themes) loop
    insert into public.sw_themes (
      project_id, title, definition, status, origin, run_id, prompt_version_id, created_by
    )
    values (
      p_project_id, v_theme ->> 'title', v_theme ->> 'definition', 'suggested', 'model',
      p_run_id, p_prompt_version_id, auth.uid()
    )
    returning id into v_theme_id;

    for v_member in select * from jsonb_array_elements(v_theme -> 'members') loop
      insert into public.sw_data_point_themes (
        data_point_id, theme_id, project_id, stance, assigned_by, run_id
      )
      values (
        (v_member ->> 'data_point_id')::uuid, v_theme_id, p_project_id,
        v_member ->> 'stance', 'model', p_run_id
      );
    end loop;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.sw_add_proposed_themes(uuid, uuid, uuid, jsonb) from public;
grant execute on function public.sw_add_proposed_themes(uuid, uuid, uuid, jsonb) to authenticated;

-- Accepting a merge: folds one accepted theme into another in a single transaction (§5.4:
-- "accepting performs it, and the theme's memo records why"). The data points move
-- with their stance; one already in the target stays as the target has it (including
-- one a person removed from it). The folded theme stays as a row, pointing at its
-- target. Returns 'merged', or why nothing changed: 'missing', 'decided', 'stale'.
-- security invoker: the policies below still decide whether the caller may.
create function public.sw_merge_themes(p_suggestion_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  s public.sw_theme_merge_suggestions%rowtype;
  v_from public.sw_themes%rowtype;
  v_into public.sw_themes%rowtype;
begin
  select * into s from public.sw_theme_merge_suggestions where id = p_suggestion_id for update;
  if not found then
    return 'missing';
  end if;
  if s.status <> 'suggested' then
    return 'decided';
  end if;

  select * into v_from from public.sw_themes where id = s.from_theme_id for update;
  select * into v_into from public.sw_themes where id = s.into_theme_id for update;
  -- Both ends must still be live accepted themes; if either was rejected or merged
  -- since the suggestion was made, it no longer describes anything that can be done.
  if v_from.status <> 'accepted' or v_from.merged_into_id is not null
     or v_into.status <> 'accepted' or v_into.merged_into_id is not null then
    return 'stale';
  end if;

  insert into public.sw_data_point_themes (
    data_point_id, theme_id, project_id, stance, assigned_by, run_id
  )
  select m.data_point_id, v_into.id, m.project_id, m.stance, m.assigned_by, m.run_id
    from public.sw_data_point_themes m
   where m.theme_id = v_from.id and m.removed_at is null
  on conflict (data_point_id, theme_id) do nothing;

  update public.sw_themes
     set merged_into_id = v_into.id
   where id = v_from.id;

  update public.sw_themes
     set memo = left(
           btrim(memo || case when memo = '' then '' else E'\n\n' end
             || 'Merged “' || v_from.title || '” into this theme on '
             || to_char(current_date, 'YYYY-MM-DD') || ': ' || s.reason),
           4000)
   where id = v_into.id;

  update public.sw_theme_merge_suggestions
     set status = 'accepted', decided_by = auth.uid(), decided_at = now()
   where id = s.id;

  -- Any other open suggestion that touched the folded theme describes something that
  -- can no longer happen.
  update public.sw_theme_merge_suggestions
     set status = 'rejected', decided_by = auth.uid(), decided_at = now()
   where status = 'suggested'
     and id <> s.id
     and (from_theme_id = v_from.id or into_theme_id = v_from.id);

  return 'merged';
end;
$$;

revoke all on function public.sw_merge_themes(uuid) from public;
grant execute on function public.sw_merge_themes(uuid) to authenticated;

-- Row Level Security --------------------------------------------------------------------------
alter table public.sw_themes enable row level security;
alter table public.sw_data_point_themes enable row level security;
alter table public.sw_theme_merge_suggestions enable row level security;

-- No delete anywhere: a theme is rejected, a point removed (removed_at), a merge declined.
grant select, insert, update on public.sw_themes to authenticated;
grant select, insert, update on public.sw_data_point_themes to authenticated;
grant select, insert, update on public.sw_theme_merge_suggestions to authenticated;

create policy sw_themes_select on public.sw_themes
  for select to authenticated
  using ((select private.has_transcription_access((select auth.uid()))));

create policy sw_themes_insert on public.sw_themes
  for insert to authenticated
  with check (
    (select private.has_transcription_access((select auth.uid())))
    and created_by = (select auth.uid())
  );

create policy sw_themes_update on public.sw_themes
  for update to authenticated
  using ((select private.has_transcription_access((select auth.uid()))))
  with check ((select private.has_transcription_access((select auth.uid()))));

create policy sw_data_point_themes_select on public.sw_data_point_themes
  for select to authenticated
  using ((select private.has_transcription_access((select auth.uid()))));

create policy sw_data_point_themes_insert on public.sw_data_point_themes
  for insert to authenticated
  with check ((select private.has_transcription_access((select auth.uid()))));

create policy sw_data_point_themes_update on public.sw_data_point_themes
  for update to authenticated
  using ((select private.has_transcription_access((select auth.uid()))))
  with check ((select private.has_transcription_access((select auth.uid()))));

create policy sw_theme_merge_suggestions_select on public.sw_theme_merge_suggestions
  for select to authenticated
  using ((select private.has_transcription_access((select auth.uid()))));

create policy sw_theme_merge_suggestions_insert on public.sw_theme_merge_suggestions
  for insert to authenticated
  with check (
    (select private.has_transcription_access((select auth.uid())))
    and created_by = (select auth.uid())
  );

create policy sw_theme_merge_suggestions_update on public.sw_theme_merge_suggestions
  for update to authenticated
  using ((select private.has_transcription_access((select auth.uid()))))
  with check ((select private.has_transcription_access((select auth.uid()))));
