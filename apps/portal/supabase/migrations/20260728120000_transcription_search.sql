-- Transcription Workspace Phase 5: search & reuse.
--
-- Implements docs/transcription-workspace-design.md §3F/§3G/§6 — hybrid
-- keyword + semantic search over transcripts, clips, and project metadata,
-- all inside Postgres (FTS + pgvector), with no separate search service.
--
-- Deliberately adds NO context columns. §3G settled on tw_projects.description
-- — a project holds exactly one recording and one transcript, so the free-text
-- field it already has *is* the description of the transcript. What Phase 5
-- adds around it is a writer (updateProjectDetails), a place to show it, and
-- the two indexes below.
--
-- Everything here degrades cleanly when no embeddings API key is configured:
-- chunks are still created and still keyword-searchable, embedding columns
-- stay null, and tw_search() simply runs its keyword half. Semantic ranking
-- switches itself on when the key appears and the backfill has run.

-- pgvector lives in `extensions`, per Supabase convention — never `public`,
-- which is PostgREST's exposed schema. Column types and the cosine operator
-- are reached by schema-qualifying the type and pinning search_path on the
-- function below, rather than by assuming the caller's search_path.
create extension if not exists vector with schema extensions;

-- Keyword-search surfaces ------------------------------------------------------
-- tw_segments already carries one (see the Phase 1 migration). These are the
-- other two units a search can return: a clip, and a project matched on its
-- own title/background.

alter table public.tw_projects
  add column search tsvector generated always as (
    to_tsvector('english', title || ' ' || coalesce(description, ''))
  ) stored;

create index tw_projects_search_idx on public.tw_projects using gin (search);

alter table public.tw_clips
  add column search tsvector generated always as (
    to_tsvector('english', title || ' ' || excerpt)
  ) stored,
  add column embedding extensions.vector(1536),
  add column embedding_stale boolean not null default true;

create index tw_clips_search_idx on public.tw_clips using gin (search);

create index tw_clips_embedding_idx on public.tw_clips
  using hnsw (embedding extensions.vector_cosine_ops);

comment on column public.tw_clips.embedding is
  'Embedding of title + excerpt. Null until embedded; embedding_stale marks a clip whose title or excerpt changed since. See design doc §6.';

-- Semantic search unit ---------------------------------------------------------
-- Overlapping ~45-second windows of transcript with speaker names inlined.
-- Segments are too granular to embed well (a few seconds of speech is a noisy
-- embedding) — chunk-level embeddings capture topics. `text` is what a search
-- result displays; what gets *embedded* is that text with a provenance header
-- from the project's title/date/background prepended in application code, so
-- a passage is retrievable by facts the project stated and the passage didn't
-- (design doc §6).

create table public.tw_chunks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tw_projects (id) on delete cascade,
  start_ms integer not null,
  end_ms integer not null,
  text text not null,
  embedding extensions.vector(1536),
  stale boolean not null default true,
  search tsvector generated always as (to_tsvector('english', text)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tw_chunks_time_range_check check (end_ms > start_ms)
);

comment on table public.tw_chunks is
  'Transcript windows for retrieval, rebuilt from tw_segments after transcription and on backfill. Derived data — safe to delete and regenerate for any project.';
comment on column public.tw_chunks.stale is
  'True when this window has no current embedding: freshly chunked, or invalidated because an overlapping segment or the project background changed. The re-embed pass consumes this.';

create index tw_chunks_project_id_idx on public.tw_chunks (project_id);
create index tw_chunks_search_idx on public.tw_chunks using gin (search);
create index tw_chunks_stale_idx on public.tw_chunks (project_id) where stale;

create index tw_chunks_embedding_idx on public.tw_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

create trigger set_tw_chunks_updated_at
  before update on public.tw_chunks
  for each row execute function public.set_updated_at();

-- Staleness ---------------------------------------------------------------------
-- Editing is not allowed to silently leave the index describing text that is
-- no longer there. These triggers only *flag* — re-embedding is a debounced
-- server action (design doc §6, "staleness over eagerness"), because most
-- corrections are spelling and names that barely move an embedding and an
-- embed-per-keystroke pipeline would be absurd.
--
-- Invoker rights, not definer: whoever edits a segment is a tool member who
-- already holds update on tw_chunks under RLS, so there is nothing to elevate.

create function public.tw_flag_chunks_for_segment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.tw_chunks
     set stale = true
   where project_id = coalesce(new.project_id, old.project_id)
     and start_ms <= coalesce(new.end_ms, old.end_ms)
     and end_ms >= coalesce(new.start_ms, old.start_ms);
  return null;
end;
$$;

create trigger tw_segments_flag_chunks
  after insert or delete or update of text, start_ms, end_ms, speaker_id
  on public.tw_segments
  for each row execute function public.tw_flag_chunks_for_segment();

-- A speaker rename changes every chunk that inlines that name.
create function public.tw_flag_chunks_for_speaker()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.tw_chunks set stale = true where project_id = new.project_id;
  return null;
end;
$$;

create trigger tw_speakers_flag_chunks
  after update of display_name on public.tw_speakers
  for each row when (new.display_name is distinct from old.display_name)
  execute function public.tw_flag_chunks_for_speaker();

-- The project's title/background is the provenance header on every one of its
-- chunk embeddings, so editing it invalidates all of them (design doc §3G).
create function public.tw_flag_chunks_for_project()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.tw_chunks set stale = true where project_id = new.id;
  return null;
end;
$$;

create trigger tw_projects_flag_chunks
  after update of title, description, interview_date on public.tw_projects
  for each row
  when (
    new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.interview_date is distinct from old.interview_date
  )
  execute function public.tw_flag_chunks_for_project();

create function public.tw_flag_clip_embedding()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.embedding_stale := true;
  return new;
end;
$$;

create trigger tw_clips_flag_embedding
  before update of title, excerpt on public.tw_clips
  for each row
  when (new.title is distinct from old.title or new.excerpt is distinct from old.excerpt)
  execute function public.tw_flag_clip_embedding();

-- Row Level Security -------------------------------------------------------------
-- Same member-scoped model as every other tw_ sub-resource table: a chunk is
-- derived from a transcript the member can already read.

alter table public.tw_chunks enable row level security;

grant select, insert, update, delete on public.tw_chunks to authenticated;

create policy tw_chunks_member_all on public.tw_chunks
  for all
  to authenticated
  using (private.has_transcription_access(auth.uid()))
  with check (private.has_transcription_access(auth.uid()));

-- Hybrid search -------------------------------------------------------------------
-- Keyword rank and cosine-similarity rank merged with reciprocal rank fusion,
-- the standard Supabase hybrid pattern. One RPC, three kinds of result, one
-- ranked list (design doc §3F).
--
-- SECURITY INVOKER on purpose — the opposite of the private.* authz helpers,
-- which exist to read past RLS. This one must be *subject* to RLS so the
-- policies on tw_chunks/tw_clips/tw_projects remain the enforcement boundary
-- for search exactly as they are for every other read. That is precisely what
-- makes it safe to expose in `public` as a PostgREST RPC: it carries no
-- elevated rights, so calling it directly can return nothing the caller could
-- not already select.
--
-- query_embedding is nullable: with no embeddings API key configured the
-- caller passes null and this degrades to pure keyword search rather than
-- failing.

create function public.tw_search(
  query_text text,
  query_embedding extensions.vector(1536) default null,
  match_limit integer default 30
)
returns table (
  kind text,
  result_id uuid,
  project_id uuid,
  project_title text,
  project_description text,
  interview_date date,
  start_ms integer,
  end_ms integer,
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
  -- Keyword half: every kind ranked together, so a strong project-title match
  -- can outrank a weak transcript match rather than living in its own list.
  keyword as (
    select 'transcript'::text as hit_kind, ch.id as hit_id, ts_rank_cd(ch.search, q.ts) as rank_score
      from public.tw_chunks ch, q
     where numnode(q.ts) > 0 and ch.search @@ q.ts
    union all
    select 'clip', cl.id, ts_rank_cd(cl.search, q.ts)
      from public.tw_clips cl, q
     where numnode(q.ts) > 0 and cl.search @@ q.ts
    union all
    select 'project', p.id, ts_rank_cd(p.search, q.ts)
      from public.tw_projects p, q
     where numnode(q.ts) > 0 and p.search @@ q.ts
  ),
  keyword_ranked as (
    select hit_kind, hit_id, row_number() over (order by rank_score desc, hit_id) as rn
      from keyword
  ),
  -- Semantic half. Each kind takes its own nearest-neighbour pass so the HNSW
  -- index is actually usable; they are fused by rank afterwards anyway.
  vector_hits as (
    select * from (
      select 'transcript'::text as hit_kind, ch.id as hit_id, (ch.embedding <=> query_embedding) as distance
        from public.tw_chunks ch
       where query_embedding is not null and ch.embedding is not null
       order by ch.embedding <=> query_embedding
       limit greatest(match_limit, 30) * 2
    ) transcript_hits
    union all
    select * from (
      select 'clip'::text, cl.id, (cl.embedding <=> query_embedding)
        from public.tw_clips cl
       where query_embedding is not null and cl.embedding is not null
       order by cl.embedding <=> query_embedding
       limit greatest(match_limit, 30) * 2
    ) clips
  ),
  vector_ranked as (
    select hit_kind, hit_id, row_number() over (order by distance, hit_id) as rn
      from vector_hits
  ),
  -- Reciprocal rank fusion. k=60 is the constant from the original RRF paper
  -- and what Supabase's hybrid-search guide uses; it damps the difference
  -- between rank 1 and 2 enough that neither half dominates the other.
  -- Clips carry a modest boost: a clip exists because a human already decided
  -- that passage was worth keeping, which beats any similarity score as a
  -- relevance signal.
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
    p.id as project_id,
    p.title as project_title,
    p.description as project_description,
    p.interview_date,
    coalesce(ch.start_ms, cl.start_ms) as start_ms,
    coalesce(ch.end_ms, cl.end_ms) as end_ms,
    cl.title,
    coalesce(ch.text, cl.excerpt, p.description, '') as snippet,
    spk.label as speaker_label,
    f.fused_score::real as score
    from fused f
    left join public.tw_chunks ch on f.hit_kind = 'transcript' and ch.id = f.hit_id
    left join public.tw_clips cl on f.hit_kind = 'clip' and cl.id = f.hit_id
    join public.tw_projects p
      on p.id = case f.hit_kind when 'project' then f.hit_id else coalesce(ch.project_id, cl.project_id) end
    -- Who is speaking at a clip's in-point. Chunks inline speaker names in
    -- their own text already, so this only has to cover clips.
    left join lateral (
      select coalesce(nullif(trim(sp.display_name), ''), 'Speaker ' || sp.diarization_label) as label
        from public.tw_segments sg
        left join public.tw_speakers sp on sp.id = sg.speaker_id
       where f.hit_kind = 'clip'
         and sg.project_id = cl.project_id
         and sg.start_ms <= cl.start_ms
       order by sg.start_ms desc
       limit 1
    ) spk on true
   order by f.fused_score desc, p.created_at desc
   limit match_limit;
$$;

comment on function public.tw_search(text, extensions.vector, integer) is
  'Hybrid keyword + semantic search across transcript chunks, clips, and projects, merged with reciprocal rank fusion. SECURITY INVOKER — RLS on the underlying tables is still the boundary. Pass a null query_embedding to run keyword-only.';

revoke execute on function public.tw_search(text, extensions.vector, integer) from public, anon;
grant execute on function public.tw_search(text, extensions.vector, integer) to authenticated;
