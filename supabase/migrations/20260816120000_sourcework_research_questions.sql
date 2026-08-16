-- Sourcework Phase 4: research questions and data points
-- (docs/sourcework-design.md §9). Collection layer: a project-scoped list of
-- what a reporter is trying to find out, plus data points — the reporter's
-- own articulated findings, grounded by one or more excerpts, optionally
-- answering one of the project's research questions.

create table public.sw_research_questions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tw_projects (id) on delete cascade,
  prompt text not null,
  position integer not null,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, position)
);

comment on table public.sw_research_questions is
  'A project-scoped question a reporter is trying to answer. Deactivate-dont-delete (active flag, no delete grant) since a data point may reference one — see docs/sourcework-design.md §9.2.';

create index sw_research_questions_project_id_idx on public.sw_research_questions (project_id);

create table public.sw_data_points (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tw_projects (id) on delete cascade,
  research_question_id uuid references public.sw_research_questions (id) on delete set null,
  summary text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('english', summary)) stored,
  embedding extensions.vector(1536),
  embedding_stale boolean not null default true
);

comment on table public.sw_data_points is
  'A reporters own articulated finding, grounded by zero or more excerpts (sw_data_point_excerpts) and optionally answering one research question. See docs/sourcework-design.md §9.3 for how this differs from an excerpt.';

create index sw_data_points_project_id_idx on public.sw_data_points (project_id);
create index sw_data_points_research_question_id_idx on public.sw_data_points (research_question_id);
create index sw_data_points_search_idx on public.sw_data_points using gin (search);
create index sw_data_points_embedding_idx on public.sw_data_points using hnsw (embedding extensions.vector_cosine_ops);

create table public.sw_data_point_excerpts (
  data_point_id uuid not null references public.sw_data_points (id) on delete cascade,
  excerpt_id uuid not null references public.sw_source_excerpts (id) on delete cascade,
  added_at timestamptz not null default now(),
  added_by uuid references public.profiles (id) on delete set null,
  primary key (data_point_id, excerpt_id)
);

comment on table public.sw_data_point_excerpts is
  'Many-to-many: which excerpts ground a data point. An excerpt deletion (deleteClip) only removes this join row, never the data point itself.';

create index sw_data_point_excerpts_excerpt_id_idx on public.sw_data_point_excerpts (excerpt_id);

-- updated_at maintenance ------------------------------------------------------

create trigger set_sw_research_questions_updated_at
  before update on public.sw_research_questions
  for each row execute function public.set_updated_at();

create trigger set_sw_data_points_updated_at
  before update on public.sw_data_points
  for each row execute function public.set_updated_at();

-- embedding_stale maintenance, mirroring sw_flag_source_excerpt_embedding() --

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
  before update of summary on public.sw_data_points
  for each row
  when (new.summary is distinct from old.summary)
  execute function public.sw_flag_data_point_embedding();

-- RLS: same collaborative sub-resource model every sw_/tw_ table uses -------

alter table public.sw_research_questions enable row level security;
alter table public.sw_data_points enable row level security;
alter table public.sw_data_point_excerpts enable row level security;

create policy sw_research_questions_select on public.sw_research_questions
  for select to authenticated
  using (private.has_transcription_access(auth.uid()));

create policy sw_research_questions_insert on public.sw_research_questions
  for insert to authenticated
  with check (private.has_transcription_access(auth.uid()));

create policy sw_research_questions_update on public.sw_research_questions
  for update to authenticated
  using (private.has_transcription_access(auth.uid()))
  with check (private.has_transcription_access(auth.uid()));

-- No delete grant: deactivate via `active`, matching log_content_items.
grant select, insert, update on public.sw_research_questions to authenticated;

create policy sw_data_points_member_all on public.sw_data_points
  for all to authenticated
  using (private.has_transcription_access(auth.uid()))
  with check (private.has_transcription_access(auth.uid()));

grant select, insert, update, delete on public.sw_data_points to authenticated;

create policy sw_data_point_excerpts_member_all on public.sw_data_point_excerpts
  for all to authenticated
  using (private.has_transcription_access(auth.uid()))
  with check (private.has_transcription_access(auth.uid()));

grant select, insert, update, delete on public.sw_data_point_excerpts to authenticated;

-- tw_search: seventh revision in this migration lineage. Adds the
-- 'data_point' hit kind (docs/sourcework-design.md §9.7). A data point
-- already carries project_id directly (no lateral "which project references
-- this source" resolution needed, unlike a chunk/excerpt hit), and has no
-- single start_ms/page_number location of its own. Neither the IN parameter
-- list nor the OUT row shape changes, so create or replace is safe here
-- (contrast the sixth revision's comment on why a drop was needed then).

create or replace function public.tw_search(
  query_text text,
  query_embedding extensions.vector(1536) default null,
  match_limit integer default 30,
  project_id_filter uuid default null,
  source_id_filter uuid default null
)
returns table (
  kind text,
  result_id uuid,
  project_id uuid,
  source_id uuid,
  project_title text,
  project_description text,
  interview_date date,
  start_ms integer,
  end_ms integer,
  page_number integer,
  title text,
  snippet text,
  speaker_label text,
  score real
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with q as (
    select websearch_to_tsquery('english', coalesce(query_text, '')) as ts
  ),
  keyword as (
    select
      case when r.kind = 'document_text' then 'document' else 'transcript' end as hit_kind,
      ch.id as hit_id,
      ts_rank_cd(ch.search, q.ts) as rank_score
      from public.tw_chunks ch
      join public.sw_representations r on r.id = ch.representation_id, q
     where numnode(q.ts) > 0 and ch.search @@ q.ts
    union all
    select 'clip', ex.id, ts_rank_cd(ex.search, q.ts)
      from public.sw_source_excerpts ex, q
     where numnode(q.ts) > 0 and ex.search @@ q.ts
    union all
    select 'project', p.id, ts_rank_cd(p.search, q.ts)
      from public.tw_projects p, q
     where numnode(q.ts) > 0 and p.search @@ q.ts
    union all
    select 'data_point', dp.id, ts_rank_cd(dp.search, q.ts)
      from public.sw_data_points dp, q
     where numnode(q.ts) > 0 and dp.search @@ q.ts
  ),
  keyword_ranked as (
    select hit_kind, hit_id, row_number() over (order by rank_score desc, hit_id) as rn
      from keyword
  ),
  vector_hits as (
    select * from (
      select
        case when r.kind = 'document_text' then 'document' else 'transcript' end as hit_kind,
        ch.id as hit_id,
        (ch.embedding <=> query_embedding) as distance
        from public.tw_chunks ch
        join public.sw_representations r on r.id = ch.representation_id
       where query_embedding is not null and ch.embedding is not null
       order by ch.embedding <=> query_embedding
       limit greatest(match_limit, 30) * 2
    ) chunk_hits
    union all
    select * from (
      select 'clip'::text, ex.id, (ex.embedding <=> query_embedding)
        from public.sw_source_excerpts ex
       where query_embedding is not null and ex.embedding is not null
       order by ex.embedding <=> query_embedding
       limit greatest(match_limit, 30) * 2
    ) excerpts
    union all
    select * from (
      select 'data_point'::text, dp.id, (dp.embedding <=> query_embedding)
        from public.sw_data_points dp
       where query_embedding is not null and dp.embedding is not null
       order by dp.embedding <=> query_embedding
       limit greatest(match_limit, 30) * 2
    ) data_points
  ),
  vector_ranked as (
    select hit_kind, hit_id, row_number() over (order by distance, hit_id) as rn
      from vector_hits
  ),
  fused as (
    select
      coalesce(k.hit_kind, v.hit_kind) as hit_kind,
      coalesce(k.hit_id, v.hit_id) as hit_id,
      (coalesce(1.0 / (60 + k.rn), 0) + coalesce(1.0 / (60 + v.rn), 0))
        * case when coalesce(k.hit_kind, v.hit_kind) = 'clip' then 1.2 else 1.0 end as fused_score
      from keyword_ranked k
      full outer join vector_ranked v on v.hit_kind = k.hit_kind and v.hit_id = k.hit_id
  )
  select
    f.hit_kind as kind,
    f.hit_id as result_id,
    proj.id as project_id,
    coalesce(chunk_src.id, excerpt_src.id) as source_id,
    proj.title as project_title,
    proj.description as project_description,
    coalesce(chunk_src.interview_date, excerpt_src.interview_date) as interview_date,
    coalesce(ch.start_ms, ex.start_ms) as start_ms,
    coalesce(ch.end_ms, ex.end_ms) as end_ms,
    coalesce(ch.page_start, excerpt_loc.page_number) as page_number,
    ex.title,
    coalesce(ch.text, ex.excerpt_text, dp.summary, proj.description, '') as snippet,
    spk.label as speaker_label,
    f.fused_score::real as score
    from fused f
    left join public.tw_chunks ch on f.hit_kind in ('transcript', 'document') and ch.id = f.hit_id
    left join public.sw_source_excerpts ex on f.hit_kind = 'clip' and ex.id = f.hit_id
    left join public.sw_data_points dp on f.hit_kind = 'data_point' and dp.id = f.hit_id
    left join public.sw_representations chunk_rep
      on f.hit_kind in ('transcript', 'document') and chunk_rep.id = ch.representation_id
    left join public.sw_sources chunk_src on chunk_src.id = chunk_rep.source_id
    left join public.sw_sources excerpt_src on f.hit_kind = 'clip' and excerpt_src.id = ex.source_id
    left join lateral (
      select l.page_number
        from public.sw_excerpt_document_locations l
       where f.hit_kind = 'clip' and l.excerpt_id = ex.id
       order by l.sequence
       limit 1
    ) excerpt_loc on true
    -- Referencing project for a chunk or excerpt hit — see the sixth
    -- revision's comment for why project_id_filter is preferred when set. A
    -- data_point hit needs none of this: it already carries project_id.
    left join lateral (
      select ps.project_id
        from public.sw_project_sources ps
       where ps.source_id = coalesce(chunk_src.id, excerpt_src.id)
         and f.hit_kind in ('transcript', 'document', 'clip')
       order by (ps.project_id = project_id_filter) desc, ps.added_at
       limit 1
    ) referencing_project on true
    join public.tw_projects proj
      on proj.id = case f.hit_kind
                     when 'project' then f.hit_id
                     when 'data_point' then dp.project_id
                     else referencing_project.project_id
                   end
    left join lateral (
      select coalesce(nullif(trim(sp.display_name), ''), 'Speaker ' || sp.diarization_label) as label
        from public.tw_segments sg
        left join public.tw_speakers sp on sp.id = sg.speaker_id
       where f.hit_kind = 'clip'
         and sg.representation_id = ex.representation_id
         and sg.start_ms <= ex.start_ms
       order by sg.start_ms desc
       limit 1
    ) spk on true
   where (project_id_filter is null or proj.id = project_id_filter)
     and (source_id_filter is null or coalesce(chunk_src.id, excerpt_src.id) = source_id_filter)
   order by f.fused_score desc, proj.created_at desc
   limit match_limit;
$$;

comment on function public.tw_search(text, extensions.vector, integer, uuid, uuid) is
  'Hybrid keyword + semantic search across transcript chunks, document chunks, source excerpts, data points, and projects, merged with reciprocal rank fusion. SECURITY INVOKER — RLS on the underlying tables is still the boundary. Pass a null query_embedding to run keyword-only; project_id_filter/source_id_filter narrow the search to one project''s sources or one source, both null by default for the tool-wide search. A data_point hit ignores source_id_filter (a data point has no single source), so it never matches a source-scoped search.';

revoke execute on function public.tw_search(text, extensions.vector, integer, uuid, uuid) from public, anon;
grant execute on function public.tw_search(text, extensions.vector, integer, uuid, uuid) to authenticated;
