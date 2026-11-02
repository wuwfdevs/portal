-- tw_search: optional project/source scoping, for search surfaces narrower
-- than the whole archive.
--
-- Three new browse/search surfaces need this (cross-source excerpts +
-- project-scoped search in the project workspace, and a per-source search in
-- the excerpt pane so a source with hundreds of excerpts stays searchable):
-- the tool-wide search box already covers "search everything," but nothing
-- let a query stay scoped to one project's sources or one source's own
-- transcript/document text + excerpts. Rather than a parallel function, this
-- adds two nullable filter parameters — trailing, both defaulting to null —
-- so every existing call site (tool-wide search, with neither filter) is
-- unaffected.
--
-- Sixth revision of this function in this migration lineage. The OUT row
-- shape is unchanged (only new IN parameters are added), which looks at
-- first glance like a `create or replace` should work — but confirmed by
-- hitting it while applying this migration: Postgres identifies a function
-- by its full argument type list, so adding parameters (even trailing ones
-- with defaults) makes `create or replace` create a *second* overload
-- alongside the original 3-argument one rather than replacing it, leaving a
-- stale copy that would keep answering any 3-arg positional call unchanged.
-- Drop the old signature first, same as the two OUT-shape-changing revisions
-- before this one.
drop function if exists public.tw_search(text, extensions.vector, integer);

create function public.tw_search(
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
    -- Referencing project for a chunk or excerpt hit. A source attached to
    -- more than one project (the "reference an existing source" UI, shipped
    -- in Phase 3a) prefers whichever project project_id_filter names, so a
    -- project-scoped search's hits resolve back to *that* project rather
    -- than whichever one attached the source earliest — otherwise a shared
    -- source's hits would both link to the wrong project's URL and get
    -- excluded by the project_id_filter check below even though the source
    -- genuinely belongs to the project being searched. Falls back to the
    -- earliest reference exactly as before when project_id_filter is null
    -- (every row ties on the preference key, so added_at alone decides).
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
  'Hybrid keyword + semantic search across transcript chunks, document chunks, source excerpts, and projects, merged with reciprocal rank fusion. SECURITY INVOKER — RLS on the underlying tables is still the boundary. Pass a null query_embedding to run keyword-only; project_id_filter/source_id_filter narrow the search to one project''s sources or one source, both null by default for the tool-wide search.';

revoke execute on function public.tw_search(text, extensions.vector, integer, uuid, uuid) from public, anon;
grant execute on function public.tw_search(text, extensions.vector, integer, uuid, uuid) to authenticated;
