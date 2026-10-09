-- Sourcework pieces (docs/sourcework-analysis-design.md §4.7, §6, Phase D):
-- a finished item — a wrap, a voicer, a script — built by hand from narration
-- and a project's excerpts. No AI and no analysis data; it depends only on
-- excerpts, which already exist.
--
-- A piece is a row; its content is insert-only versions. `body` is an ordered
-- list of blocks:
--   { "id": uuid, "type": "narration", "text": text }
--   { "id": uuid, "type": "actuality", "excerpt_id": uuid, "in_ms"?: int, "out_ms"?: int }
-- An actuality is always a real excerpt; its words come from the transcript for
-- its range, never from the block. in_ms/out_ms are this piece's own trim.
-- There is no foreign key from a block to an excerpt (it lives in jsonb), so
-- the editor renders a deleted excerpt as a placeholder rather than failing.
--
-- Rows the application owns, derived in TypeScript (SQL never computes a
-- length — lib/sourcework/pieces.ts is the model):
--   current_version   the latest sw_piece_versions.version (0 = blank, no row yet)
--   length_seconds    the latest version's length, for the Pieces list
--   excerpt_ids       the excerpts the latest version uses, so an excerpt can say
--                     "also used in N other pieces" without scanning every body
-- All three are written together by sw_save_piece_version(), the one writer.

create table public.sw_pieces (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tw_projects (id) on delete cascade,
  title text not null default 'Untitled piece'
    check (char_length(btrim(title)) between 1 and 200),
  target_seconds integer check (target_seconds is null or target_seconds between 1 and 7200),
  current_version integer not null default 0 check (current_version >= 0),
  length_seconds integer not null default 0 check (length_seconds >= 0),
  excerpt_ids uuid[] not null default '{}',
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sw_pieces is
  'A wrap, voicer or script built from a project''s narration and excerpts. Content lives in sw_piece_versions. See docs/sourcework-analysis-design.md §6.';

create index sw_pieces_project_id_idx on public.sw_pieces (project_id, updated_at desc);
create index sw_pieces_excerpt_ids_idx on public.sw_pieces using gin (excerpt_ids);

create trigger set_sw_pieces_updated_at
  before update on public.sw_pieces
  for each row execute function public.set_updated_at();

create table public.sw_piece_versions (
  piece_id uuid not null references public.sw_pieces (id) on delete cascade,
  version integer not null check (version >= 1),
  body jsonb not null check (jsonb_typeof(body) = 'array'),
  saved_by uuid not null references public.profiles (id) on delete restrict,
  -- 'assistant' and 'generation' arrive with Phase E; the column is shaped for
  -- them now so History can say who saved a version without a later migration.
  saved_via text not null default 'person'
    check (saved_via in ('person', 'assistant', 'generation')),
  created_at timestamptz not null default now(),
  primary key (piece_id, version)
);

comment on table public.sw_piece_versions is
  'Insert-only history of a piece''s blocks. Every save is a version; restoring one saves it again as a new version.';

-- Row Level Security ----------------------------------------------------------
-- Same trust model as the rest of Sourcework: any tool member reads and writes
-- a project's pieces. Versions are select + insert only — no update or delete
-- policy, so a saved version can never change (a piece's deletion cascades).

alter table public.sw_pieces enable row level security;
alter table public.sw_piece_versions enable row level security;

grant select, insert, update, delete on public.sw_pieces to authenticated;
grant select, insert on public.sw_piece_versions to authenticated;

create policy sw_pieces_select on public.sw_pieces
  for select to authenticated
  using ((select private.has_transcription_access((select auth.uid()))));

create policy sw_pieces_insert on public.sw_pieces
  for insert to authenticated
  with check (
    (select private.has_transcription_access((select auth.uid())))
    and created_by = (select auth.uid())
  );

create policy sw_pieces_update on public.sw_pieces
  for update to authenticated
  using ((select private.has_transcription_access((select auth.uid()))))
  with check ((select private.has_transcription_access((select auth.uid()))));

create policy sw_pieces_delete on public.sw_pieces
  for delete to authenticated
  using ((select private.has_transcription_access((select auth.uid()))));

create policy sw_piece_versions_select on public.sw_piece_versions
  for select to authenticated
  using ((select private.has_transcription_access((select auth.uid()))));

create policy sw_piece_versions_insert on public.sw_piece_versions
  for insert to authenticated
  with check (
    (select private.has_transcription_access((select auth.uid())))
    and saved_by = (select auth.uid())
  );

-- The one writer of a piece's content ------------------------------------------
-- Saves `p_body` as the next version if, and only if, the piece is still at the
-- version the caller started from. Returns the new version number, or -1 when
-- someone else saved first (the caller reloads rather than overwriting them).
-- security invoker: RLS still applies to both writes.

create function public.sw_save_piece_version(
  p_piece_id uuid,
  p_base_version integer,
  p_body jsonb,
  p_saved_via text,
  p_length_seconds integer,
  p_excerpt_ids uuid[]
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current integer;
  v_next integer;
begin
  select current_version into v_current
    from public.sw_pieces
   where id = p_piece_id
   for update;

  if not found then
    raise exception 'piece_not_found' using errcode = 'P0002';
  end if;

  if v_current <> p_base_version then
    return -1;
  end if;

  v_next := v_current + 1;

  insert into public.sw_piece_versions (piece_id, version, body, saved_by, saved_via)
  values (p_piece_id, v_next, p_body, auth.uid(), p_saved_via);

  update public.sw_pieces
     set current_version = v_next,
         length_seconds = greatest(p_length_seconds, 0),
         excerpt_ids = coalesce(p_excerpt_ids, '{}')
   where id = p_piece_id;

  return v_next;
end;
$$;

revoke all on function public.sw_save_piece_version(uuid, integer, jsonb, text, integer, uuid[]) from public;
grant execute on function public.sw_save_piece_version(uuid, integer, jsonb, text, integer, uuid[]) to authenticated;

-- Who is speaking at an excerpt's first word --------------------------------------
-- The picker and the actuality cards name the speaker. Reading the transcript's
-- segments to find out would hit PostgREST's row limit on a long interview, so
-- this answers it per excerpt in one call. security invoker: RLS still applies.

create function public.sw_excerpt_speakers(p_excerpt_ids uuid[])
returns table (excerpt_id uuid, diarization_label text, display_name text)
language sql
stable
security invoker
set search_path = public
as $$
  select e.id, sp.diarization_label, sp.display_name
    from public.sw_source_excerpts e
    cross join lateral (
      select s.speaker_id
        from public.tw_segments s
       where s.representation_id = e.representation_id
         and s.start_ms <= e.start_ms
         and s.end_ms > e.start_ms
       order by s.position
       limit 1
    ) seg
    join public.tw_speakers sp on sp.id = seg.speaker_id
   where e.id = any (p_excerpt_ids)
$$;

revoke all on function public.sw_excerpt_speakers(uuid[]) from public;
grant execute on function public.sw_excerpt_speakers(uuid[]) to authenticated;
