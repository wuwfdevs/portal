-- Sourcework Phase 3b: PDF documents and a document-processing pipeline.
-- See docs/sourcework-design.md §8 for the full design — this migration
-- implements §8.2 (source kind), §8.3 (representation kind), §8.4 (canonical
-- page/block structure), §8.6 (processing-run audit log), §8.7 (document
-- excerpt locators), and §8.8 (chunk/search generalization).
--
-- Additive throughout: no existing column is dropped or narrowed, no
-- existing row's meaning changes. Every table added here follows the same
-- shared-workspace RLS model as the rest of Sourcework
-- (private.has_transcription_access(auth.uid()), for-all).
--
-- tw_search()'s rewrite (§8.8) is a SEPARATE migration
-- (20260731181000_sourcework_documents_search.sql), not folded in here:
-- Postgres refuses to use a freshly-added enum value ('document_text') in a
-- query planned within the same transaction that added it (error 55P04,
-- "unsafe use of new value... must be committed before they can be used") —
-- confirmed by hitting it while applying this migration. The two-value
-- ALTER TYPE ADD VALUE statements below must land in their own committed
-- migration before anything can compare against them.

-- New enum values -----------------------------------------------------------
-- Additive to existing enums (created in
-- 20260731120000_sourcework_sources_representations.sql). Neither new value
-- is used in DML anywhere in this file, so there is no same-transaction
-- add-then-use hazard.
--
-- 'ocr_text' (defined in that migration, never read or written by any code
-- path) is deliberately NOT reused here — see design doc §8.3 on why
-- 'document_text' names the artifact, not the mechanism that produced it.
-- 'ocr_text' is left in place rather than dropped, per this repo's
-- additive-only migration discipline.
alter type public.sw_source_kind add value 'document';
alter type public.sw_representation_kind add value 'document_text';

create type public.sw_document_block_type as enum (
  'heading', 'paragraph', 'list_item', 'table', 'table_cell',
  'figure', 'caption', 'header', 'footer', 'other'
);

-- sw_sources: page count -----------------------------------------------------
-- Generic (not PDF-specific) for the same reason original_duration_ms is
-- generic to "audio/video" — see design doc §8.2. Null for audio/video
-- sources, exactly as original_duration_ms stays null for document sources.

alter table public.sw_sources add column page_count integer;

comment on column public.sw_sources.page_count is
  'Page count for a paginated source (documents today). Null for audio/video — see docs/sourcework-design.md §8.2.';

-- Canonical document structure -----------------------------------------------
-- One row per page, one row per block, both scoped to the document_text
-- representation that produced them. See design doc §8.4 for the schema
-- rationale (fractional bbox, representation-scoped reading_order, no
-- search/embedding columns here since chunks — not blocks — are the
-- retrieval unit, see below).

create table public.sw_document_pages (
  id uuid primary key default gen_random_uuid(),
  representation_id uuid not null references public.sw_representations (id) on delete cascade,
  page_number integer not null,
  width_pt real,
  height_pt real,
  rotation_degrees integer not null default 0,
  created_at timestamptz not null default now(),
  constraint sw_document_pages_page_number_check check (page_number > 0),
  unique (representation_id, page_number)
);

comment on table public.sw_document_pages is
  'One row per page of a document_text representation — dimensions and rotation, when known. See docs/sourcework-design.md §8.4.';

create index sw_document_pages_representation_id_idx on public.sw_document_pages (representation_id);

create table public.sw_document_blocks (
  id uuid primary key default gen_random_uuid(),
  representation_id uuid not null references public.sw_representations (id) on delete cascade,
  page_id uuid not null references public.sw_document_pages (id) on delete cascade,
  page_number integer not null,
  reading_order integer not null,
  block_type public.sw_document_block_type not null default 'paragraph',
  text text not null default '',
  bbox jsonb,
  confidence real,
  source text not null check (source in ('native', 'ocr')),
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint sw_document_blocks_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1)),
  unique (representation_id, reading_order)
);

comment on table public.sw_document_blocks is
  'Ordered, typed text blocks for a document_text representation — the stable identifiers a chunk, excerpt, or later transform references. See docs/sourcework-design.md §8.4.';
comment on column public.sw_document_blocks.bbox is
  'Fractional {x0,y0,x1,y1} of page width/height, or null when a reliable box could not be recovered — resolution-independent, so a viewer maps it at any zoom.';
comment on column public.sw_document_blocks.confidence is
  'OCR only (0..1); null for natively-extracted text, which is exact rather than probabilistic.';

create index sw_document_blocks_representation_reading_order_idx
  on public.sw_document_blocks (representation_id, reading_order);
create index sw_document_blocks_page_id_idx on public.sw_document_blocks (page_id);

-- Processing runs -------------------------------------------------------------
-- A plain audit log, not a job queue — see design doc §8.6. The partial
-- unique index is the actual idempotency guard against a duplicate in-flight
-- processing attempt for the same representation.

create table public.sw_document_processing_runs (
  id uuid primary key default gen_random_uuid(),
  representation_id uuid not null references public.sw_representations (id) on delete cascade,
  attempt integer not null,
  method text not null check (method in ('native', 'ocr')),
  provider text,
  provider_model text,
  options jsonb not null default '{}'::jsonb,
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  error_message text,
  raw_response jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint sw_document_processing_runs_attempt_check check (attempt > 0)
);

comment on table public.sw_document_processing_runs is
  'Attempt-by-attempt audit log for document processing (native extraction or Mistral OCR) — diagnostics and reprocessing, never the primary read path. See docs/sourcework-design.md §8.6.';
comment on column public.sw_document_processing_runs.raw_response is
  'Provider''s raw payload (OCR only) — retained for diagnostics/future reprocessing, never the application''s primary data model (see sw_document_blocks).';

create index sw_document_processing_runs_representation_id_idx
  on public.sw_document_processing_runs (representation_id);

-- At most one in-flight run per representation.
create unique index sw_document_processing_runs_one_active_idx
  on public.sw_document_processing_runs (representation_id)
  where status = 'processing';

-- Document excerpt locators --------------------------------------------------
-- sw_source_excerpts already generalized past "clip" in Phase 2 and already
-- has a nullable representation_id. What's missing is *where in the
-- document* — start_ms/end_ms are a temporal concept that doesn't apply.
-- See design doc §8.7 for the full rationale, including why block_id is
-- ON DELETE SET NULL rather than CASCADE.

alter table public.sw_source_excerpts
  add column locator_kind text not null default 'temporal'
    check (locator_kind in ('temporal', 'document')),
  alter column start_ms drop not null,
  alter column end_ms drop not null;

alter table public.sw_source_excerpts drop constraint sw_source_excerpts_time_range_check;
alter table public.sw_source_excerpts add constraint sw_source_excerpts_locator_check check (
  (locator_kind = 'temporal' and start_ms is not null and end_ms is not null and end_ms > start_ms)
  or
  (locator_kind = 'document' and start_ms is null and end_ms is null)
);

comment on column public.sw_source_excerpts.locator_kind is
  'Which location shape this excerpt uses: temporal (start_ms/end_ms, audio/video) or document (sw_excerpt_document_locations rows). See docs/sourcework-design.md §8.7.';

create table public.sw_excerpt_document_locations (
  id uuid primary key default gen_random_uuid(),
  excerpt_id uuid not null references public.sw_source_excerpts (id) on delete cascade,
  sequence integer not null,
  page_number integer not null,
  block_id uuid references public.sw_document_blocks (id) on delete set null,
  start_offset integer,
  end_offset integer,
  bbox jsonb,
  constraint sw_excerpt_document_locations_sequence_check check (sequence >= 0),
  unique (excerpt_id, sequence)
);

comment on table public.sw_excerpt_document_locations is
  'Ordered page/block/offset/bbox locations for a document-kind excerpt — one row per spanned region. See docs/sourcework-design.md §8.7.';
comment on column public.sw_excerpt_document_locations.block_id is
  'SET NULL (not CASCADE) on the referenced block''s deletion: reprocessing a representation regenerates its blocks wholesale, and an excerpt made against a previous run should not be destroyed by a later retry — see docs/sourcework-design.md §8.7.';

create index sw_excerpt_document_locations_excerpt_id_idx
  on public.sw_excerpt_document_locations (excerpt_id);
create index sw_excerpt_document_locations_block_id_idx
  on public.sw_excerpt_document_locations (block_id);

-- tw_chunks: document-shaped location columns --------------------------------
-- Generalizing the existing chunk table's position columns rather than
-- standing up a parallel one — see design doc §8.8.

alter table public.tw_chunks
  alter column start_ms drop not null,
  alter column end_ms drop not null,
  add column page_start integer,
  add column page_end integer,
  add column anchor_block_id uuid references public.sw_document_blocks (id) on delete set null;

alter table public.tw_chunks drop constraint tw_chunks_time_range_check;
alter table public.tw_chunks add constraint tw_chunks_location_check check (
  (start_ms is not null and end_ms is not null and end_ms > start_ms)
  or
  (start_ms is null and end_ms is null and page_start is not null and page_end is not null and page_end >= page_start)
);

comment on column public.tw_chunks.page_start is
  'Document chunks only: the lowest page number spanned by this window''s blocks. Null for transcript chunks (start_ms/end_ms instead) — see docs/sourcework-design.md §8.8.';
comment on column public.tw_chunks.anchor_block_id is
  'Document chunks only: this window''s first block, for deep-linking to a highlighted region. SET NULL on reprocess, same reasoning as sw_excerpt_document_locations.block_id.';

-- Storage: allow PDFs in the existing bucket ---------------------------------
-- No new bucket — RLS on transcription-media is membership-scoped, not
-- content-type-scoped (see docs/sourcework-design.md §8.2). Additive; touches
-- no existing entry, same pattern 20260730170000_audience_listening.sql used
-- to add audio/ogg here.

update storage.buckets
set allowed_mime_types = allowed_mime_types || array['application/pdf']
where id = 'transcription-media'
  and not ('application/pdf' = any (allowed_mime_types));

-- Row Level Security ----------------------------------------------------------
-- Same shared-workspace model as every other Sourcework sub-resource table:
-- full CRUD for any transcription tool member.

alter table public.sw_document_pages enable row level security;
alter table public.sw_document_blocks enable row level security;
alter table public.sw_document_processing_runs enable row level security;
alter table public.sw_excerpt_document_locations enable row level security;

grant select, insert, update, delete on public.sw_document_pages to authenticated;
grant select, insert, update, delete on public.sw_document_blocks to authenticated;
grant select, insert, update, delete on public.sw_document_processing_runs to authenticated;
grant select, insert, update, delete on public.sw_excerpt_document_locations to authenticated;

create policy sw_document_pages_member_all on public.sw_document_pages
  for all
  to authenticated
  using (private.has_transcription_access(auth.uid()))
  with check (private.has_transcription_access(auth.uid()));

create policy sw_document_blocks_member_all on public.sw_document_blocks
  for all
  to authenticated
  using (private.has_transcription_access(auth.uid()))
  with check (private.has_transcription_access(auth.uid()));

create policy sw_document_processing_runs_member_all on public.sw_document_processing_runs
  for all
  to authenticated
  using (private.has_transcription_access(auth.uid()))
  with check (private.has_transcription_access(auth.uid()));

create policy sw_excerpt_document_locations_member_all on public.sw_excerpt_document_locations
  for all
  to authenticated
  using (private.has_transcription_access(auth.uid()))
  with check (private.has_transcription_access(auth.uid()));
