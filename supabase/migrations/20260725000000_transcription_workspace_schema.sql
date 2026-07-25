-- Transcription Workspace: first substantive tool built on the portal foundation.
-- One project per interview/recording session; source media, transcript
-- segments, speakers, and clips all live under it. See
-- docs/transcription-workspace-design.md for the product/architecture design
-- this schema implements (Phase 1: foundation — no transcription pipeline
-- yet, that lands in a later migration alongside the ASR webhook handler).
--
-- Tables are prefixed tw_ to keep this tool's schema visually distinct
-- within the shared `public` schema, per CLAUDE.md's directory conventions.

create type public.tw_project_status as enum ('uploading', 'processing', 'ready', 'failed');

-- One row per interview/recording. Source media is folded in as columns
-- (project:media is 1:1 in this design) rather than a separate table — see
-- the design doc for why. created first with status='uploading' so an
-- abandoned upload is a visible, cleanable row rather than an orphaned
-- storage object.
create table public.tw_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  interview_date date,
  status public.tw_project_status not null default 'uploading',
  media_storage_path text,
  media_content_type text,
  media_size_bytes bigint,
  media_duration_ms integer,
  transcription_provider_job_id text,
  error_message text,
  transcribed_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tw_projects_duration_check check (media_duration_ms is null or media_duration_ms > 0)
);

comment on table public.tw_projects is
  'One row per interview/recording. Shared-by-default within the tool (any transcription tool member can see every project) — see design doc §3F on why the archive goal requires this.';
comment on column public.tw_projects.error_message is
  'Human-readable failure reason, covering both upload failures (Phase 1) and future transcription failures (Phase 2+). Cleared on retry.';

create index tw_projects_created_by_idx on public.tw_projects (created_by);

-- Diarization label -> human name, per project. Not a global people table;
-- see design doc §2 for why.
create table public.tw_speakers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tw_projects (id) on delete cascade,
  diarization_label text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, diarization_label)
);

-- Ordered transcript segments. Word-level timings go stale (not
-- re-aligned) when a segment's text is edited — text_edited flags that;
-- see design doc §5.
create table public.tw_segments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tw_projects (id) on delete cascade,
  speaker_id uuid references public.tw_speakers (id) on delete set null,
  position integer not null,
  start_ms integer not null,
  end_ms integer not null,
  text text not null default '',
  words jsonb not null default '[]'::jsonb,
  text_edited boolean not null default false,
  search tsvector generated always as (to_tsvector('english', text)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tw_segments_time_range_check check (end_ms > start_ms)
);

comment on column public.tw_segments.words is
  'Word-level timings from the ASR provider: [{"w": "text", "s": start_ms, "e": end_ms}, ...]. Approximate/stale once text_edited is true.';

create index tw_segments_project_position_idx on public.tw_segments (project_id, position);
create index tw_segments_speaker_id_idx on public.tw_segments (speaker_id);
create index tw_segments_search_idx on public.tw_segments using gin (search);

-- Non-destructive [start_ms, end_ms) reference into a project's source
-- media, plus the editorial metadata needed to find and export it. Audio is
-- rendered only on export (Phase 4) — a clip row is free to create.
create table public.tw_clips (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tw_projects (id) on delete cascade,
  title text not null,
  start_ms integer not null,
  end_ms integer not null,
  excerpt text not null default '',
  export_storage_path text,
  exported_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tw_clips_time_range_check check (end_ms > start_ms)
);

create index tw_clips_project_id_idx on public.tw_clips (project_id);

-- updated_at maintenance (reuses public.set_updated_at() from the platform schema) ---

create trigger set_tw_projects_updated_at
  before update on public.tw_projects
  for each row execute function public.set_updated_at();

create trigger set_tw_speakers_updated_at
  before update on public.tw_speakers
  for each row execute function public.set_updated_at();

create trigger set_tw_segments_updated_at
  before update on public.tw_segments
  for each row execute function public.set_updated_at();

create trigger set_tw_clips_updated_at
  before update on public.tw_clips
  for each row execute function public.set_updated_at();

-- Row Level Security ----------------------------------------------------------

-- Membership check for this tool specifically, mirroring
-- private.is_administrator()'s shape. Lives in `private` (created by
-- 20260724120000_private_authz_functions.sql, which runs before this
-- migration), not `public` — a function in `public` is reachable as a
-- PostgREST RPC endpoint (/rest/v1/rpc/...), letting any signed-in user
-- probe other people's tool access; `private` isn't in PostgREST's exposed
-- schema list, so this stays usable inside policies without being an API
-- surface. See that migration's comment for the full rationale.
--
-- Deliberately does NOT bypass for platform administrators: tool access in
-- this portal is always an explicit tool_access grant, even for admins (see
-- how dana_id in seed.sql only has editorial-planning access, not automatic
-- access to every tool) — this keeps that convention intact.
create function private.has_transcription_access(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tool_access ta
    join public.tools t on t.id = ta.tool_id
    join public.profiles p on p.id = uid
    where ta.user_id = uid
      and t.key = 'transcription'
      and ta.revoked_at is null
      and p.account_status = 'active'
  );
$$;

revoke execute on function private.has_transcription_access(uuid) from public, anon;
grant execute on function private.has_transcription_access(uuid) to authenticated;

alter table public.tw_projects enable row level security;
alter table public.tw_speakers enable row level security;
alter table public.tw_segments enable row level security;
alter table public.tw_clips enable row level security;

grant select, insert, update, delete on public.tw_projects to authenticated;
grant select, insert, update, delete on public.tw_speakers to authenticated;
grant select, insert, update, delete on public.tw_segments to authenticated;
grant select, insert, update, delete on public.tw_clips to authenticated;

-- tw_projects: any member reads/updates; only the uploader (or nobody else)
-- deletes their own project row, matching the design doc's "delete
-- restricted to creator" call. Deleting the underlying storage object is an
-- application-level concern (src/app/(portal)/transcription/actions.ts),
-- since it spans both Postgres and Storage and RLS can't express that as
-- one transaction.
create policy tw_projects_select on public.tw_projects
  for select
  to authenticated
  using (private.has_transcription_access(auth.uid()));

create policy tw_projects_insert on public.tw_projects
  for insert
  to authenticated
  with check (private.has_transcription_access(auth.uid()) and created_by = auth.uid());

create policy tw_projects_update on public.tw_projects
  for update
  to authenticated
  using (private.has_transcription_access(auth.uid()))
  with check (private.has_transcription_access(auth.uid()));

create policy tw_projects_delete on public.tw_projects
  for delete
  to authenticated
  using (private.has_transcription_access(auth.uid()) and created_by = auth.uid());

-- tw_speakers / tw_segments / tw_clips: full CRUD for any tool member, no
-- per-row ownership. These are sub-resources of a project the member
-- already has shared access to (speaker naming, transcript correction, and
-- clip creation are all collaborative in this design) — matches the
-- shared-workspace trust model chosen throughout, per design doc §2/§3F.
create policy tw_speakers_member_all on public.tw_speakers
  for all
  to authenticated
  using (private.has_transcription_access(auth.uid()))
  with check (private.has_transcription_access(auth.uid()));

create policy tw_segments_member_all on public.tw_segments
  for all
  to authenticated
  using (private.has_transcription_access(auth.uid()))
  with check (private.has_transcription_access(auth.uid()));

create policy tw_clips_member_all on public.tw_clips
  for all
  to authenticated
  using (private.has_transcription_access(auth.uid()))
  with check (private.has_transcription_access(auth.uid()));

-- Storage ---------------------------------------------------------------------
-- Private bucket for source media (and, from Phase 4, rendered clip
-- exports). All access is via short-lived signed URLs generated server-side
-- after the RLS-scoped select policy below allows it — never a public URL.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'transcription-media',
  'transcription-media',
  false,
  2147483648, -- 2 GiB
  array[
    'audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/x-m4a',
    'video/mp4', 'video/quicktime', 'video/webm', 'audio/webm'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Uniform membership-based access, same trust model as the sub-resource
-- tables above: any transcription tool member can read/write any object in
-- this bucket. The one ownership rule this tool enforces (only a project's
-- creator deletes it) is applied at the application layer in
-- deleteProject(), which checks ownership before removing the storage
-- object and the row together — see the tw_projects policy comment above.
create policy tw_media_select on storage.objects
  for select
  to authenticated
  using (bucket_id = 'transcription-media' and private.has_transcription_access(auth.uid()));

create policy tw_media_insert on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'transcription-media' and private.has_transcription_access(auth.uid()));

create policy tw_media_update on storage.objects
  for update
  to authenticated
  using (bucket_id = 'transcription-media' and private.has_transcription_access(auth.uid()))
  with check (bucket_id = 'transcription-media' and private.has_transcription_access(auth.uid()));

create policy tw_media_delete on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'transcription-media' and private.has_transcription_access(auth.uid()));

-- Tool registry -----------------------------------------------------------------
-- status='available' (not 'in_development'): Phase 1 ships real, usable
-- functionality — upload, playback, project list — even though transcription
-- itself lands in a later phase. See docs/transcription-workspace-design.md
-- phased plan. default_access mirrors the other invite-only interview tools.

insert into public.tools (key, name, description, route, status, enabled, default_access, sort_order)
values (
  'transcription',
  'Transcription Workspace',
  'Turn raw interviews into production-ready audio clips: transcribe, identify speakers, correct the transcript, and export actualities.',
  '/transcription',
  'available',
  true,
  'invite_only',
  5
)
on conflict (key) do nothing;
