-- Remote Interview: Phase 4 Foundation slice. Schema, RLS, storage bucket,
-- and the registry row narrowing. See docs/remote-interview-design.md §5/§7
-- and docs/remote-interview-technical-assessment.md (which supersedes the
-- design doc where they disagree) for the product rationale. This slice adds
-- the tables and their security boundary; the call layer, capture pipeline,
-- and guest identity binding are later slices in the same phase.
--
-- Tables are prefixed ri_ per CLAUDE.md's directory conventions, following
-- the tw_* precedent (20260725000000_transcription_workspace_schema.sql).
--
-- Before writing this migration, read Finding 4 in the technical assessment:
-- both hosted projects carry a `harden_functions` step with no corresponding
-- file in this directory, already folded into 20260722120000_platform_schema.sql.
-- That's a pre-existing, non-blocking audit-trail gap — not something this
-- migration needs to touch or reproduce.

create type public.ri_session_status as enum
  ('scheduled', 'live', 'recording', 'processing', 'ready', 'needs_recovery', 'failed');
create type public.ri_participant_role as enum ('host', 'guest');
create type public.ri_track_source as enum ('local', 'cloud');
create type public.ri_track_status as enum
  ('recording', 'uploading', 'assembling', 'complete', 'partial', 'missing', 'failed');

-- One row per interview. recording_started_at is THE reference instant every
-- participant's track is aligned to at assembly (design doc §6, "Track
-- synchronization") — null until recording actually starts.
create table public.ri_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  scheduled_at timestamptz,
  status public.ri_session_status not null default 'scheduled',
  recording_started_at timestamptz,
  recording_stopped_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ri_sessions is
  'One row per interview. The host (created_by) is also a ri_participants row with role=host — see that table.';
comment on column public.ri_sessions.recording_started_at is
  'The reference instant every participant''s tracks are aligned to. Null until recording starts.';

create index ri_sessions_created_by_idx on public.ri_sessions (created_by);

-- One row per person in the room, host or guest. A guest has no profiles row
-- (design doc §2: "guests are not portal users") — they're identified by a
-- join token today and, from Phase 4 slice 2, an anonymous-auth binding.
-- join_token is generated for every row, including the host's, to keep the
-- column simple (not null, unique) even though the host never uses theirs to
-- join — they're already authenticated through the portal.
create table public.ri_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ri_sessions (id) on delete cascade,
  display_name text not null,
  role public.ri_participant_role not null,
  profile_id uuid references public.profiles (id),
  guest_user_id uuid references auth.users (id),
  join_token text not null unique,
  token_expires_at timestamptz,
  revoked_at timestamptz,
  admitted_at timestamptz,
  clock_offset_ms integer,
  storage_prefix text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.ri_participants.join_token is
  '256-bit random, base64url. The capability: whoever holds it can join as this participant. Never logged.';
comment on column public.ri_participants.storage_prefix is
  'This participant''s object prefix in the remote-interview-media bucket, e.g. "<session id>/<participant id>". Guests can reach only objects under their own prefix — see the storage policies below.';

create index ri_participants_session_id_idx on public.ri_participants (session_id);
-- At most one host per session; guests are unbounded.
create unique index ri_participants_single_host_idx on public.ri_participants (session_id)
  where role = 'host';

-- One per participant per recording run (a stop/restart or a rejoin yields
-- more than one) and per source (local master vs. cloud backup) — see design
-- doc §5's modeling notes on why this isn't folded into ri_participants.
create table public.ri_tracks (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.ri_participants (id) on delete cascade,
  source public.ri_track_source not null,
  run_index integer not null default 0,
  status public.ri_track_status not null default 'recording',
  started_at_ms integer,
  expected_part_count integer,
  storage_path text,
  content_type text,
  size_bytes bigint,
  duration_ms integer,
  sample_rate integer,
  checksum text,
  verified_at timestamptz,
  assembled_at timestamptz,
  error_message text,
  unique (participant_id, source, run_index)
);

create index ri_tracks_participant_id_idx on public.ri_tracks (participant_id);

-- One per uploaded chunk. unique(track_id, sequence) makes a duplicate
-- submission an idempotent no-op — the duplicate-chunk defence lives in the
-- schema, not in retry logic (design doc §5/§6).
create table public.ri_track_parts (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.ri_tracks (id) on delete cascade,
  sequence integer not null,
  storage_path text not null,
  size_bytes bigint not null,
  checksum text not null,
  started_at_ms integer not null,
  duration_ms integer,
  uploaded_at timestamptz not null default now(),
  unique (track_id, sequence)
);

create index ri_track_parts_track_id_idx on public.ri_track_parts (track_id);

-- Append-only operational log, so the completion view answers "what actually
-- happened to Dr. Okafor's recording?" from history rather than reconstructing
-- a guess from final state (design doc §5). No update/delete grant below —
-- append-only is enforced by what's granted, not just by convention.
create table public.ri_session_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ri_sessions (id) on delete cascade,
  participant_id uuid references public.ri_participants (id) on delete cascade,
  kind text not null,
  detail jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);

create index ri_session_events_session_id_idx on public.ri_session_events (session_id);
create index ri_session_events_participant_id_idx on public.ri_session_events (participant_id);

-- updated_at maintenance (reuses public.set_updated_at() from the platform schema) ---

create trigger set_ri_sessions_updated_at
  before update on public.ri_sessions
  for each row execute function public.set_updated_at();

create trigger set_ri_participants_updated_at
  before update on public.ri_participants
  for each row execute function public.set_updated_at();

-- Row Level Security ----------------------------------------------------------

-- Membership check for this tool, mirroring private.has_transcription_access's
-- shape exactly (20260725000000_transcription_workspace_schema.sql:135-155).
-- Lives in `private`, not `public`, for the same reason: a function in
-- `public` is reachable as a PostgREST RPC endpoint, letting any signed-in
-- user probe other people's tool access. Deliberately does NOT bypass for
-- platform administrators — tool access is always an explicit tool_access
-- grant in this portal, even for admins.
create function private.has_remote_interview_access(uid uuid)
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
      and t.key = 'remote-interview'
      and ta.revoked_at is null
      and p.account_status = 'active'
  );
$$;

-- A participant row belongs to whoever is bound to it: the host via
-- profile_id, or a guest via guest_user_id once anonymous-auth binding lands
-- in the next slice (design doc, "Guest identity" — "every policy keys on
-- guest_user_id being already bound to a live participant row"). A revoked
-- link owns nothing.
create function private.ri_is_own_participant(pid uuid, uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.ri_participants p
    where p.id = pid
      and p.revoked_at is null
      and (p.profile_id = uid or p.guest_user_id = uid)
  );
$$;

-- Same, one join further down for tables that key off a track rather than a
-- participant directly.
create function private.ri_is_own_track(tid uuid, uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.ri_tracks t
    join public.ri_participants p on p.id = t.participant_id
    where t.id = tid
      and p.revoked_at is null
      and (p.profile_id = uid or p.guest_user_id = uid)
  );
$$;

-- Storage-prefix ownership, shared by the bucket policies below: an object
-- name under a participant's own storage_prefix, for whoever is bound to
-- that (unrevoked) participant row.
create function private.ri_owns_storage_object(object_name text, uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.ri_participants p
    where p.revoked_at is null
      and (p.profile_id = uid or p.guest_user_id = uid)
      and object_name like p.storage_prefix || '/%'
  );
$$;

revoke execute on function private.has_remote_interview_access(uuid) from public, anon;
revoke execute on function private.ri_is_own_participant(uuid, uuid) from public, anon;
revoke execute on function private.ri_is_own_track(uuid, uuid) from public, anon;
revoke execute on function private.ri_owns_storage_object(text, uuid) from public, anon;

grant execute on function private.has_remote_interview_access(uuid) to authenticated;
grant execute on function private.ri_is_own_participant(uuid, uuid) to authenticated;
grant execute on function private.ri_is_own_track(uuid, uuid) to authenticated;
grant execute on function private.ri_owns_storage_object(text, uuid) to authenticated;

alter table public.ri_sessions enable row level security;
alter table public.ri_participants enable row level security;
alter table public.ri_tracks enable row level security;
alter table public.ri_track_parts enable row level security;
alter table public.ri_session_events enable row level security;

-- ri_sessions: shared visibility for any tool member (matches the tw_projects
-- precedent), but writes — including "recording controls are host-only"
-- (design doc, "Security and access") — are restricted to the session's
-- creator.
grant select, insert, update, delete on public.ri_sessions to authenticated;

create policy ri_sessions_select on public.ri_sessions
  for select
  to authenticated
  using (private.has_remote_interview_access(auth.uid()));

create policy ri_sessions_insert on public.ri_sessions
  for insert
  to authenticated
  with check (private.has_remote_interview_access(auth.uid()) and created_by = auth.uid());

create policy ri_sessions_update on public.ri_sessions
  for update
  to authenticated
  using (private.has_remote_interview_access(auth.uid()) and created_by = auth.uid())
  with check (private.has_remote_interview_access(auth.uid()) and created_by = auth.uid());

create policy ri_sessions_delete on public.ri_sessions
  for delete
  to authenticated
  using (private.has_remote_interview_access(auth.uid()) and created_by = auth.uid());

-- ri_participants: any tool member can see a session's participant list and
-- join links (shared-workspace model, same trust level as the session
-- itself); a bound participant can also see their own row, ahead of Phase 4
-- slice 2 actually authenticating guests this way. Only the session's host
-- adds or changes participants — join links, revocation, and admission are
-- all host actions (design doc §3A/§3C).
grant select, insert, update on public.ri_participants to authenticated;

create policy ri_participants_select on public.ri_participants
  for select
  to authenticated
  using (
    private.has_remote_interview_access(auth.uid())
    or profile_id = auth.uid()
    or guest_user_id = auth.uid()
  );

create policy ri_participants_insert on public.ri_participants
  for insert
  to authenticated
  with check (
    private.has_remote_interview_access(auth.uid())
    and exists (
      select 1 from public.ri_sessions s
      where s.id = session_id and s.created_by = auth.uid()
    )
  );

create policy ri_participants_update on public.ri_participants
  for update
  to authenticated
  using (
    private.has_remote_interview_access(auth.uid())
    and exists (
      select 1 from public.ri_sessions s
      where s.id = session_id and s.created_by = auth.uid()
    )
  )
  with check (
    private.has_remote_interview_access(auth.uid())
    and exists (
      select 1 from public.ri_sessions s
      where s.id = session_id and s.created_by = auth.uid()
    )
  );

-- ri_tracks / ri_track_parts: no UI writes these yet (that's the studio and
-- capture slices), but RLS ships now rather than later, per CLAUDE.md — a
-- table without RLS enabled from its first migration is a bug. Staff see
-- everything (session detail screen); a track's own participant (host or
-- guest, matched via ri_is_own_participant/ri_is_own_track) can read and
-- write only their own.
grant select, insert, update on public.ri_tracks to authenticated;
grant select, insert on public.ri_track_parts to authenticated;

create policy ri_tracks_select on public.ri_tracks
  for select
  to authenticated
  using (
    private.has_remote_interview_access(auth.uid())
    or private.ri_is_own_participant(participant_id, auth.uid())
  );

create policy ri_tracks_insert on public.ri_tracks
  for insert
  to authenticated
  with check (private.ri_is_own_participant(participant_id, auth.uid()));

create policy ri_tracks_update on public.ri_tracks
  for update
  to authenticated
  using (private.ri_is_own_participant(participant_id, auth.uid()))
  with check (private.ri_is_own_participant(participant_id, auth.uid()));

create policy ri_track_parts_select on public.ri_track_parts
  for select
  to authenticated
  using (
    private.has_remote_interview_access(auth.uid())
    or private.ri_is_own_track(track_id, auth.uid())
  );

create policy ri_track_parts_insert on public.ri_track_parts
  for insert
  to authenticated
  with check (private.ri_is_own_track(track_id, auth.uid()));

-- ri_session_events: append-only (no update/delete grant at all). Staff read
-- the full history; a participant can log an event about themselves (e.g.
-- "upload_stalled"), and staff can log session-level events not tied to any
-- one participant (e.g. "recording_started").
grant select, insert on public.ri_session_events to authenticated;

create policy ri_session_events_select on public.ri_session_events
  for select
  to authenticated
  using (private.has_remote_interview_access(auth.uid()));

create policy ri_session_events_insert on public.ri_session_events
  for insert
  to authenticated
  with check (
    private.has_remote_interview_access(auth.uid())
    or (participant_id is not null and private.ri_is_own_participant(participant_id, auth.uid()))
  );

-- Storage ---------------------------------------------------------------------
-- Private bucket for local-master parts/assembled tracks and cloud-backup
-- files. audio/wav for the local master, audio/ogg for the Opus cloud
-- backup, application/json for Daily's raw-tracks timing event — see design
-- doc §6. Size limit matches the transcription-media bucket's, generously
-- covering a multi-hour assembled master (~345 MB/participant-hour per the
-- technical assessment's bandwidth arithmetic).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'remote-interview-media',
  'remote-interview-media',
  false,
  2147483648, -- 2 GiB
  array['audio/wav', 'audio/x-wav', 'audio/ogg', 'application/json']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Guests reach only their own participant prefix and nothing else (design
-- doc, "Security and access"); staff can read anything for the session
-- detail/download screens. Delete is staff-only — nothing in the design
-- gives a guest the ability to remove their own uploaded evidence.
create policy ri_media_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'remote-interview-media'
    and (
      private.has_remote_interview_access(auth.uid())
      or private.ri_owns_storage_object(name, auth.uid())
    )
  );

create policy ri_media_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'remote-interview-media'
    and private.ri_owns_storage_object(name, auth.uid())
  );

create policy ri_media_update on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'remote-interview-media'
    and private.ri_owns_storage_object(name, auth.uid())
  )
  with check (
    bucket_id = 'remote-interview-media'
    and private.ri_owns_storage_object(name, auth.uid())
  );

create policy ri_media_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'remote-interview-media'
    and private.has_remote_interview_access(auth.uid())
  );

-- Tool registry -----------------------------------------------------------------
-- Narrows the row per design doc §2. It's currently seed-only (unlike
-- Transcription Workspace's, which is inserted by its own migration) —
-- editorial-planning, remote-interview, and audience-listening's rows
-- predate that convention — so this updates the existing key rather than
-- assuming an insert. status stays 'in_development': that flips to
-- 'available' once the vertical slice (through the studio and delivery) is
-- proven, not at this Foundation slice.
update public.tools
set
  description = 'Record remote interviews, capturing each participant locally at full quality.',
  route = '/remote-interview'
where key = 'remote-interview';
