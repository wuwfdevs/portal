-- Sourcework Phase 3b, part 2: tw_search() document-aware chunk/excerpt
-- resolution. Split from 20260731180000_sourcework_documents.sql because
-- Postgres refuses to plan a query comparing against a freshly-added enum
-- value ('document_text', added by that migration) inside the same
-- transaction that added it (error 55P04) — confirmed by hitting it while
-- applying that migration as one file. This migration must run after that
-- one has committed.
--
-- Fifth revision of this function in this migration lineage (see
-- 20260731170000_tw_search_source_id.sql's own comment on why
-- `create or replace` won't do for an output-shape change — drop first).
--
-- Changes from the previous revision: a chunk hit's hit_kind is now
-- 'transcript' or 'document' depending on the owning representation's kind
-- (previously always 'transcript'), and the result row gains a nullable
-- page_number — populated from a document chunk's page_start, or a document
-- excerpt's first location row, whichever the hit is. See
-- docs/sourcework-design.md §8.8.

drop function public.tw_search(text, extensions.vector, integer);

create function public.tw_search(
  query_text text,
  query_embedding extensions.vector(1536) default null,
  match_limit integer default 30
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
    coalesce(ch.text, ex.excerpt_text, proj.description, '') as snippet,
    spk.label as speaker_label,
    f.fused_score::real as score
    from fused f
    left join public.tw_chunks ch on f.hit_kind in ('transcript', 'document') and ch.id = f.hit_id
    left join public.sw_source_excerpts ex on f.hit_kind = 'clip' and ex.id = f.hit_id
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
    -- Referencing project for a chunk or excerpt hit. One row today (a
    -- source is only ever referenced by a second project once the
    -- "reference an existing source" UI exists) — takes the earliest
    -- reference if that changes.
    left join lateral (
      select ps.project_id
        from public.sw_project_sources ps
       where ps.source_id = coalesce(chunk_src.id, excerpt_src.id)
         and f.hit_kind in ('transcript', 'document', 'clip')
       order by ps.added_at
       limit 1
    ) referencing_project on true
    join public.tw_projects proj
      on proj.id = case f.hit_kind
                     when 'project' then f.hit_id
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
   order by f.fused_score desc, proj.created_at desc
   limit match_limit;
$$;

comment on function public.tw_search(text, extensions.vector, integer) is
  'Hybrid keyword + semantic search across transcript chunks, document chunks, source excerpts, and projects, merged with reciprocal rank fusion. SECURITY INVOKER — RLS on the underlying tables is still the boundary. Pass a null query_embedding to run keyword-only.';

revoke execute on function public.tw_search(text, extensions.vector, integer) from public, anon;
grant execute on function public.tw_search(text, extensions.vector, integer) to authenticated;
