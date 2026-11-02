-- Log: Slice 2 (Content library) — Workflow C from docs/log-design.md §3.
-- Newsroom and promotions staff create/browse/retire content items (news,
-- promos, PSAs, legal IDs, etc.) and their timed components (live intro,
-- recorded audio, live outro, optional tag). Per the design doc: "content
-- authorship is open to any tool member... neither needs a producer role to
-- do it" — unlike clocks/programs/schedule (Slice 1), which stay
-- producer-gated. So RLS here keys off private.has_log_access() alone, with
-- no is_log_producer() branch at all.
--
-- Unlike log_clock_versions/log_clock_slots, these rows are NOT insert-only:
-- a content item's own metadata (script, tags, expected duration) is
-- expected to be corrected in place, and "retire stale content" is an
-- ordinary update (approval_status -> 'retired'), the same
-- deactivate-don't-delete lifecycle ep_criteria/ep_form_fields use. No
-- delete policy is granted, matching that precedent.

create type public.log_content_type as enum (
  'news',
  'station_promo',
  'program_promo',
  'membership_message',
  'university_announcement',
  'psa',
  'legal_id',
  'interview_feature',
  'host_created'
);

create type public.log_approval_status as enum ('draft', 'approved', 'retired');

create type public.log_component_type as enum (
  'live_intro',
  'recorded_audio',
  'live_outro',
  'optional_tag'
);

create table public.log_content_items (
  id uuid primary key default gen_random_uuid(),
  content_type public.log_content_type not null,
  title text not null,
  script text,
  -- Object path in the log-media bucket, for a content item that's a single
  -- audio file with no separate intro/outro components (e.g. a simple PSA).
  -- A multi-component item (§7.3's "30-second promo with a required 8-second
  -- outro") instead carries its audio per-component below.
  audio_object_path text,
  summary text,
  expected_duration_seconds integer,
  effective_from date not null default current_date,
  effective_to date,
  owner_id uuid references public.profiles (id) on delete set null,
  approval_status public.log_approval_status not null default 'draft',
  eligible_program_ids uuid[] not null default '{}'::uuid[],
  -- Free integer, lower = higher priority in rotation. Not enforced or
  -- interpreted by this schema (no rotation engine exists yet) — a plain
  -- sort/filter hint for the library browser and, later, rundown building.
  priority integer,
  frequency_guidance text,
  reusable boolean not null default true,
  geography_tags text[] not null default '{}'::text[],
  subject_tags text[] not null default '{}'::text[],
  -- Free text in this milestone; becomes a real reference once FCC
  -- Reporting's taxonomy exists — see docs/log-design.md §6.
  community_issue_tags text[] not null default '{}'::text[],
  reporter_or_editor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint log_content_items_duration_check
    check (expected_duration_seconds is null or expected_duration_seconds > 0),
  constraint log_content_items_effective_range_check
    check (effective_to is null or effective_to >= effective_from)
);

comment on table public.log_content_items is
  'Reusable or one-time content (news, promos, PSAs, legal IDs, etc.) — docs/log-design.md §2/§7. Open to any tool member to author; approval_status tracks draft/approved/retired, never deleted.';

create index log_content_items_content_type_idx on public.log_content_items (content_type);
create index log_content_items_approval_status_idx on public.log_content_items (approval_status);
create index log_content_items_owner_idx on public.log_content_items (owner_id);

create table public.log_content_components (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.log_content_items (id) on delete cascade,
  component_type public.log_component_type not null,
  sequence integer not null,
  duration_seconds integer not null,
  required boolean not null default true,
  script text,
  audio_object_path text,
  constraint log_content_components_duration_check check (duration_seconds > 0)
);

comment on table public.log_content_components is
  'A timed part of a content item (live intro, recorded audio, live outro, optional tag). Total occupied time is the sum of required components — see computeTotalDurationSeconds in lib/log/content-library.ts.';

create index log_content_components_item_idx on public.log_content_components (content_item_id, sequence);

create trigger set_log_content_items_updated_at
  before update on public.log_content_items
  for each row execute function public.set_updated_at();

-- Row Level Security ------------------------------------------------------------
-- Any tool member — no producer gate, per the design doc (see file header).

alter table public.log_content_items enable row level security;
alter table public.log_content_components enable row level security;

grant select, insert, update on public.log_content_items to authenticated;
grant select, insert, update on public.log_content_components to authenticated;

create policy log_content_items_select on public.log_content_items
  for select to authenticated
  using (private.has_log_access(auth.uid()));

create policy log_content_items_insert on public.log_content_items
  for insert to authenticated
  with check (private.has_log_access(auth.uid()));

create policy log_content_items_update on public.log_content_items
  for update to authenticated
  using (private.has_log_access(auth.uid()))
  with check (private.has_log_access(auth.uid()));

create policy log_content_components_select on public.log_content_components
  for select to authenticated
  using (private.has_log_access(auth.uid()));

create policy log_content_components_insert on public.log_content_components
  for insert to authenticated
  with check (private.has_log_access(auth.uid()));

create policy log_content_components_update on public.log_content_components
  for update to authenticated
  using (private.has_log_access(auth.uid()))
  with check (private.has_log_access(auth.uid()));

-- Storage -----------------------------------------------------------------------
-- Private bucket for content-item and component audio, same trust model as
-- transcription-media: uniform membership access, no per-row ownership.
-- Object paths are fixed per entity (`<content_item_id>/audio.<ext>`,
-- `<content_item_id>/components/<component_id>.<ext>`) and every upload
-- passes upsert: true, so a corrected re-upload of the same file type
-- overwrites cleanly — see lib/log/content-library.ts.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'log-media',
  'log-media',
  false,
  536870912, -- 512 MiB — spot audio, not full-length interviews
  array['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/x-m4a']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy log_media_select on storage.objects
  for select to authenticated
  using (bucket_id = 'log-media' and private.has_log_access(auth.uid()));

create policy log_media_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'log-media' and private.has_log_access(auth.uid()));

create policy log_media_update on storage.objects
  for update to authenticated
  using (bucket_id = 'log-media' and private.has_log_access(auth.uid()))
  with check (bucket_id = 'log-media' and private.has_log_access(auth.uid()));
