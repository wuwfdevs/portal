-- Sourcework Phase 1: splits Source (immutable original material) out of
-- tw_projects' 1:1 media-as-columns model, and generalizes the transcript
-- into one instance of a Representation. See docs/sourcework-design.md.
--
-- Nothing in this database is live yet, so this migrates directly to the
-- intended shape rather than staging through deprecated columns — see that
-- doc's "why restructure directly" note.
--
-- Trick used throughout the backfill below: a new sw_sources/sw_representations
-- row is given the *same id* as the tw_projects row it was split from. That
-- means tw_segments/tw_speakers/tw_chunks's existing project_id values are
-- already the correct representation_id — the rekey below is a column rename,
-- not a data rewrite.

create type public.sw_source_kind as enum ('audio_video');
create type public.sw_source_status as enum ('uploading', 'ready', 'failed');
create type public.sw_representation_kind as enum ('transcript', 'ocr_text', 'translated_text');
create type public.sw_representation_status as enum ('pending', 'processing', 'ready', 'failed');

-- Immutable original material. `interview_date` lives here, not on the
-- project: it's a fact about the recording, not about whichever project(s)
-- later reference it.
create table public.sw_sources (
  id uuid primary key default gen_random_uuid(),
  kind public.sw_source_kind not null default 'audio_video',
  title text not null,
  interview_date date,
  status public.sw_source_status not null default 'uploading',
  error_message text,
  original_storage_path text,
  original_content_type text,
  original_size_bytes bigint,
  original_duration_ms integer,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sw_sources_duration_check check (original_duration_ms is null or original_duration_ms > 0)
);

comment on table public.sw_sources is
  'Immutable original material (one recording per row). Shared-by-default within the transcription tool, same trust model as tw_projects — see docs/sourcework-design.md.';

create index sw_sources_created_by_idx on public.sw_sources (created_by);

-- Derived content: one instance of a kind, produced from a source (or from
-- another representation, e.g. a translation of an OCR'd document — not used
-- yet, but the column exists for Phase 3). A transcript is the only kind that
-- exists today.
create table public.sw_representations (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sw_sources (id) on delete cascade,
  parent_representation_id uuid references public.sw_representations (id) on delete set null,
  kind public.sw_representation_kind not null,
  produced_by text,
  config jsonb not null default '{}'::jsonb,
  status public.sw_representation_status not null default 'pending',
  error_message text,
  provider_job_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sw_representations is
  'Derived content generalizing the transcript: a transcription job is a property of a specific representation, not of the project that happens to reference its source. See docs/sourcework-design.md.';

create index sw_representations_source_id_idx on public.sw_representations (source_id);
create index sw_representations_parent_idx on public.sw_representations (parent_representation_id);

-- Many-to-many from day one: a project can reference several sources, and a
-- source (an interview) can matter to more than one project over time — the
-- gap in the old 1:1 tw_projects model this split exists to close.
create table public.sw_project_sources (
  project_id uuid not null references public.tw_projects (id) on delete cascade,
  source_id uuid not null references public.sw_sources (id) on delete cascade,
  added_by uuid not null references public.profiles (id) on delete restrict,
  added_at timestamptz not null default now(),
  primary key (project_id, source_id)
);

create index sw_project_sources_source_id_idx on public.sw_project_sources (source_id);

create trigger set_sw_sources_updated_at
  before update on public.sw_sources
  for each row execute function public.set_updated_at();

create trigger set_sw_representations_updated_at
  before update on public.sw_representations
  for each row execute function public.set_updated_at();

-- Backfill ----------------------------------------------------------------
-- One source + one transcript representation per existing tw_projects row,
-- reusing the project's own id for both (see header comment on why). Status
-- attribution: tw_projects.status conflated upload and transcription status
-- into one field, so a historical 'failed' is attributed to the source only
-- when no media had been recorded yet — otherwise the upload plainly
-- succeeded and the failure was the transcription attempt's.

insert into public.sw_sources (
  id, kind, title, interview_date, status, error_message,
  original_storage_path, original_content_type, original_size_bytes, original_duration_ms,
  created_by, created_at, updated_at
)
select
  p.id,
  'audio_video',
  p.title,
  p.interview_date,
  case
    when p.status = 'uploading' then 'uploading'
    when p.status = 'failed' and p.media_storage_path is null then 'failed'
    else 'ready'
  end::public.sw_source_status,
  case
    when p.status = 'failed' and p.media_storage_path is null then p.error_message
    else null
  end,
  p.media_storage_path, p.media_content_type, p.media_size_bytes, p.media_duration_ms,
  p.created_by, p.created_at, p.updated_at
from public.tw_projects p;

insert into public.sw_representations (
  id, source_id, kind, produced_by, status, error_message, provider_job_id, created_at, updated_at
)
select
  p.id,
  p.id,
  'transcript',
  'assemblyai',
  case
    when p.status = 'processing' then 'processing'
    when p.status = 'ready' then 'ready'
    when p.status = 'failed' and p.media_storage_path is not null then 'failed'
    else 'pending'
  end::public.sw_representation_status,
  case
    when p.status = 'failed' and p.media_storage_path is not null then p.error_message
    else null
  end,
  p.transcription_provider_job_id,
  p.created_at, p.updated_at
from public.tw_projects p;

insert into public.sw_project_sources (project_id, source_id, added_by, added_at)
select p.id, p.id, p.created_by, p.created_at
from public.tw_projects p;

-- Rekey tw_segments / tw_speakers / tw_chunks ------------------------------
-- project_id -> representation_id. Values are already correct (see header
-- comment); this is a rename plus an FK retarget, not a data rewrite.

alter table public.tw_segments rename column project_id to representation_id;
alter table public.tw_segments drop constraint tw_segments_project_id_fkey;
alter table public.tw_segments
  add constraint tw_segments_representation_id_fkey
  foreign key (representation_id) references public.sw_representations (id) on delete cascade;
alter index tw_segments_project_position_idx rename to tw_segments_representation_position_idx;

alter table public.tw_speakers rename column project_id to representation_id;
alter table public.tw_speakers drop constraint tw_speakers_project_id_fkey;
alter table public.tw_speakers
  add constraint tw_speakers_representation_id_fkey
  foreign key (representation_id) references public.sw_representations (id) on delete cascade;

alter table public.tw_chunks rename column project_id to representation_id;
alter table public.tw_chunks drop constraint tw_chunks_project_id_fkey;
alter table public.tw_chunks
  add constraint tw_chunks_representation_id_fkey
  foreign key (representation_id) references public.sw_representations (id) on delete cascade;
alter index tw_chunks_project_id_idx rename to tw_chunks_representation_id_idx;
alter index tw_chunks_stale_idx rename to tw_chunks_representation_stale_idx;

comment on column public.tw_segments.representation_id is
  'The transcript representation this segment belongs to (sw_representations, kind=transcript).';
comment on column public.tw_chunks.representation_id is
  'The transcript representation this retrieval window was built from.';

-- Shrink tw_projects --------------------------------------------------------
-- "Is this project ready" isn't well-defined once a project can reference
-- multiple independently-progressing sources — the UI now derives status
-- per source/representation instead. See lib/transcription/projects.ts.
--
-- The old search migration's tw_projects_flag_chunks trigger references
-- interview_date directly, so it has to go before the column does — its
-- rekeyed replacement is created further below, after the staleness
-- functions it calls are (re)defined.
drop trigger tw_projects_flag_chunks on public.tw_projects;

alter table public.tw_projects
  drop column status,
  drop column interview_date,
  drop column media_storage_path,
  drop column media_content_type,
  drop column media_size_bytes,
  drop column media_duration_ms,
  drop column transcription_provider_job_id,
  drop column error_message,
  drop column transcribed_at;

drop type public.tw_project_status;

-- tw_shift_segment_positions: rekeyed parameter ----------------------------

drop function public.tw_shift_segment_positions(uuid, integer, integer);

create function public.tw_shift_segment_positions(p_representation_id uuid, after_position integer, delta integer)
returns void
language sql
set search_path = public
as $$
  update public.tw_segments
  set position = position + delta
  where representation_id = p_representation_id
    and position > after_position;
$$;

grant execute on function public.tw_shift_segment_positions(uuid, integer, integer) to authenticated;

-- Staleness triggers: rekeyed ------------------------------------------------

create or replace function public.tw_flag_chunks_for_segment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.tw_chunks
     set stale = true
   where representation_id = coalesce(new.representation_id, old.representation_id)
     and start_ms <= coalesce(new.end_ms, old.end_ms)
     and end_ms >= coalesce(new.start_ms, old.start_ms);
  return null;
end;
$$;

create or replace function public.tw_flag_chunks_for_speaker()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.tw_chunks set stale = true where representation_id = new.representation_id;
  return null;
end;
$$;

-- A project's title/description are still an embedding-header ingredient
-- (see lib/transcription/chunking.ts), so editing them invalidates chunks for
-- every transcript representation reachable through this project's
-- referenced sources.
create or replace function public.tw_flag_chunks_for_project()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.tw_chunks
     set stale = true
   where representation_id in (
     select r.id
       from public.sw_representations r
       join public.sw_project_sources ps on ps.source_id = r.source_id
      where ps.project_id = new.id
        and r.kind = 'transcript'
   );
  return null;
end;
$$;

create trigger tw_projects_flag_chunks
  after update of title, description on public.tw_projects
  for each row
  when (new.title is distinct from old.title or new.description is distinct from old.description)
  execute function public.tw_flag_chunks_for_project();

-- interview_date moved to sw_sources — a change there is the other half of
-- the embedding header (see buildEmbeddingInput), so it needs the same
-- invalidation the project trigger above does for title/description.
create function public.tw_flag_chunks_for_source()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.tw_chunks
     set stale = true
   where representation_id in (
     select r.id from public.sw_representations r
      where r.source_id = new.id and r.kind = 'transcript'
   );
  return null;
end;
$$;

create trigger sw_sources_flag_chunks
  after update of title, interview_date on public.sw_sources
  for each row
  when (new.title is distinct from old.title or new.interview_date is distinct from old.interview_date)
  execute function public.tw_flag_chunks_for_source();

-- tw_search: chunk/project resolution rekeyed --------------------------------
-- Clip resolution is untouched here (tw_clips still carries project_id
-- directly) — Sourcework Phase 2's migration folds tw_clips into
-- sw_source_excerpts and rewrites this function again for that half.

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
    coalesce(chunk_src.interview_date, clip_ctx.interview_date) as interview_date,
    coalesce(ch.start_ms, cl.start_ms) as start_ms,
    coalesce(ch.end_ms, cl.end_ms) as end_ms,
    cl.title,
    coalesce(ch.text, cl.excerpt, proj.description, '') as snippet,
    spk.label as speaker_label,
    f.fused_score::real as score
    from fused f
    left join public.tw_chunks ch on f.hit_kind = 'transcript' and ch.id = f.hit_id
    left join public.tw_clips cl on f.hit_kind = 'clip' and cl.id = f.hit_id
    left join public.sw_representations chunk_rep
      on f.hit_kind = 'transcript' and chunk_rep.id = ch.representation_id
    left join public.sw_sources chunk_src on chunk_src.id = chunk_rep.source_id
    -- Referencing project for a chunk hit. One row today (a source is only
    -- ever referenced by a second project once the "reference an existing
    -- source" UI exists) — takes the earliest reference if that changes.
    left join lateral (
      select ps.project_id
        from public.sw_project_sources ps
       where f.hit_kind = 'transcript' and ps.source_id = chunk_src.id
       order by ps.added_at
       limit 1
    ) chunk_project on true
    left join lateral (
      select r.id as representation_id, s.interview_date
        from public.sw_project_sources ps2
        join public.sw_representations r on r.source_id = ps2.source_id and r.kind = 'transcript'
        join public.sw_sources s on s.id = ps2.source_id
       where f.hit_kind = 'clip' and ps2.project_id = cl.project_id
       limit 1
    ) clip_ctx on true
    join public.tw_projects proj
      on proj.id = case f.hit_kind
                     when 'project' then f.hit_id
                     when 'transcript' then chunk_project.project_id
                     else cl.project_id
                   end
    left join lateral (
      select coalesce(nullif(trim(sp.display_name), ''), 'Speaker ' || sp.diarization_label) as label
        from public.tw_segments sg
        left join public.tw_speakers sp on sp.id = sg.speaker_id
       where f.hit_kind = 'clip'
         and sg.representation_id = clip_ctx.representation_id
         and sg.start_ms <= cl.start_ms
       order by sg.start_ms desc
       limit 1
    ) spk on true
   order by f.fused_score desc, proj.created_at desc
   limit match_limit;
$$;

comment on function public.tw_search(text, extensions.vector, integer) is
  'Hybrid keyword + semantic search across transcript chunks, clips, and projects, merged with reciprocal rank fusion. SECURITY INVOKER — RLS on the underlying tables is still the boundary. Pass a null query_embedding to run keyword-only.';

revoke execute on function public.tw_search(text, extensions.vector, integer) from public, anon;
grant execute on function public.tw_search(text, extensions.vector, integer) to authenticated;

-- Row Level Security ----------------------------------------------------------

alter table public.sw_sources enable row level security;
alter table public.sw_representations enable row level security;
alter table public.sw_project_sources enable row level security;

grant select, insert, update, delete on public.sw_sources to authenticated;
grant select, insert, update, delete on public.sw_representations to authenticated;
grant select, insert, update, delete on public.sw_project_sources to authenticated;

-- sw_sources: same shape as tw_projects — any member reads/updates, only the
-- uploader deletes their own (matches the design doc's "delete restricted to
-- creator" call, same reasoning as tw_projects).
create policy sw_sources_select on public.sw_sources
  for select
  to authenticated
  using (private.has_transcription_access(auth.uid()));

create policy sw_sources_insert on public.sw_sources
  for insert
  to authenticated
  with check (private.has_transcription_access(auth.uid()) and created_by = auth.uid());

create policy sw_sources_update on public.sw_sources
  for update
  to authenticated
  using (private.has_transcription_access(auth.uid()))
  with check (private.has_transcription_access(auth.uid()));

create policy sw_sources_delete on public.sw_sources
  for delete
  to authenticated
  using (private.has_transcription_access(auth.uid()) and created_by = auth.uid());

-- sw_representations / sw_project_sources: sub-resources, full CRUD for any
-- tool member — same collaborative model as tw_speakers/tw_segments/tw_clips.
create policy sw_representations_member_all on public.sw_representations
  for all
  to authenticated
  using (private.has_transcription_access(auth.uid()))
  with check (private.has_transcription_access(auth.uid()));

create policy sw_project_sources_member_all on public.sw_project_sources
  for all
  to authenticated
  using (private.has_transcription_access(auth.uid()))
  with check (private.has_transcription_access(auth.uid()));
