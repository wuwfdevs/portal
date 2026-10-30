-- Sourcework Phase 2: folds tw_clips into the general Source Excerpt model —
-- a rename and reshape, not a parallel table kept "to unify later". See
-- docs/sourcework-design.md.
--
-- The `kind` value 'clip' returned by tw_search is left as-is: this stays the
-- audio-clip concept from the user's perspective (the workspace UI is
-- untouched), only the backing table generalizes.

alter table public.tw_clips rename to sw_source_excerpts;

alter table public.sw_source_excerpts rename column excerpt to excerpt_text;

alter table public.sw_source_excerpts add column source_id uuid;
alter table public.sw_source_excerpts add column representation_id uuid;

update public.sw_source_excerpts ex
   set source_id = (
     select ps.source_id
       from public.sw_project_sources ps
      where ps.project_id = ex.project_id
      order by ps.added_at
      limit 1
   );

update public.sw_source_excerpts ex
   set representation_id = (
     select r.id
       from public.sw_representations r
      where r.source_id = ex.source_id and r.kind = 'transcript'
      limit 1
   );

alter table public.sw_source_excerpts
  alter column source_id set not null,
  add constraint sw_source_excerpts_source_id_fkey
    foreign key (source_id) references public.sw_sources (id) on delete cascade,
  add constraint sw_source_excerpts_representation_id_fkey
    foreign key (representation_id) references public.sw_representations (id) on delete set null;

alter table public.sw_source_excerpts drop constraint tw_clips_project_id_fkey;
alter table public.sw_source_excerpts drop column project_id;

alter table public.sw_source_excerpts rename constraint tw_clips_time_range_check to sw_source_excerpts_time_range_check;
alter table public.sw_source_excerpts rename constraint tw_clips_pkey to sw_source_excerpts_pkey;

alter index tw_clips_search_idx rename to sw_source_excerpts_search_idx;
alter index tw_clips_embedding_idx rename to sw_source_excerpts_embedding_idx;
create index sw_source_excerpts_source_id_idx on public.sw_source_excerpts (source_id);

comment on table public.sw_source_excerpts is
  'A non-destructive [start_ms, end_ms) reference into a source''s original media, plus the editorial title/excerpt needed to find and export it. Generalizes what was tw_clips — see docs/sourcework-design.md.';
comment on column public.sw_source_excerpts.representation_id is
  'Which transcript this excerpt''s text was taken from, if any (nullable — a source with no transcript yet can still be excerpted by timestamp).';

alter trigger set_tw_clips_updated_at on public.sw_source_excerpts rename to set_sw_source_excerpts_updated_at;

drop trigger tw_clips_flag_embedding on public.sw_source_excerpts;
drop function public.tw_flag_clip_embedding();

create function public.sw_flag_source_excerpt_embedding()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.embedding_stale := true;
  return new;
end;
$$;

create trigger sw_source_excerpts_flag_embedding
  before update of title, excerpt_text on public.sw_source_excerpts
  for each row
  when (new.title is distinct from old.title or new.excerpt_text is distinct from old.excerpt_text)
  execute function public.sw_flag_source_excerpt_embedding();

-- RLS: same collaborative sub-resource model, renamed policy --------------

drop policy tw_clips_member_all on public.sw_source_excerpts;
create policy sw_source_excerpts_member_all on public.sw_source_excerpts
  for all
  to authenticated
  using (private.has_transcription_access(auth.uid()))
  with check (private.has_transcription_access(auth.uid()));

-- tw_search: clip resolution now goes through source_id, same fan-out
-- pattern the previous migration gave the chunk half.

create or replace function public.tw_search(
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
  keyword as (
    select 'transcript'::text as hit_kind, ch.id as hit_id, ts_rank_cd(ch.search, q.ts) as rank_score
      from public.tw_chunks ch, q
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
      select 'transcript'::text as hit_kind, ch.id as hit_id, (ch.embedding <=> query_embedding) as distance
        from public.tw_chunks ch
       where query_embedding is not null and ch.embedding is not null
       order by ch.embedding <=> query_embedding
       limit greatest(match_limit, 30) * 2
    ) transcript_hits
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
    proj.title as project_title,
    proj.description as project_description,
    coalesce(chunk_src.interview_date, excerpt_src.interview_date) as interview_date,
    coalesce(ch.start_ms, ex.start_ms) as start_ms,
    coalesce(ch.end_ms, ex.end_ms) as end_ms,
    ex.title,
    coalesce(ch.text, ex.excerpt_text, proj.description, '') as snippet,
    spk.label as speaker_label,
    f.fused_score::real as score
    from fused f
    left join public.tw_chunks ch on f.hit_kind = 'transcript' and ch.id = f.hit_id
    left join public.sw_source_excerpts ex on f.hit_kind = 'clip' and ex.id = f.hit_id
    left join public.sw_representations chunk_rep
      on f.hit_kind = 'transcript' and chunk_rep.id = ch.representation_id
    left join public.sw_sources chunk_src on chunk_src.id = chunk_rep.source_id
    left join public.sw_sources excerpt_src on f.hit_kind = 'clip' and excerpt_src.id = ex.source_id
    -- Referencing project for a chunk or excerpt hit. One row today (a
    -- source is only ever referenced by a second project once the
    -- "reference an existing source" UI exists) — takes the earliest
    -- reference if that changes.
    left join lateral (
      select ps.project_id
        from public.sw_project_sources ps
       where ps.source_id = coalesce(chunk_src.id, excerpt_src.id)
         and f.hit_kind in ('transcript', 'clip')
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
  'Hybrid keyword + semantic search across transcript chunks, source excerpts, and projects, merged with reciprocal rank fusion. SECURITY INVOKER — RLS on the underlying tables is still the boundary. Pass a null query_embedding to run keyword-only.';

revoke execute on function public.tw_search(text, extensions.vector, integer) from public, anon;
grant execute on function public.tw_search(text, extensions.vector, integer) to authenticated;
