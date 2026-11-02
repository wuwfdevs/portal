-- Bulk migration of legacy underwriting agreements
-- (docs/underwriting-traffic-redesign.md §14).
--
-- WUWF has 45–50 active or booked agreements held in legacy records. An
-- administrator submits a manifest (one row per agreement, prepared from
-- the station's Business Drive) and runs each entry, with its document,
-- through the same single-agreement import the order step uses
-- (lib/underwriting/agreement-import-service.ts). Two things make that safe
-- to rerun:
--
--   1. uw_contracts.import_source_key — the manifest entry's key, unique,
--      so a second import under one key fails at the insert however two
--      runs interleave. Null for every contract entered any other way.
--      Deleting a draft frees its key, which is how a bad import is redone.
--   2. uw_agreement_migration_items — one row per manifest entry, keyed on
--      the same source_key: the manifest's authoritative facts, the entry's
--      status, the contract it produced, the document's hash, and what the
--      reading found. It is the migration's record, not a job queue: each
--      entry runs in its own request, started from the migration screen.
--
-- Administrators with Underwriting access only — a migration tool, not a
-- traffic workflow. No delete: the rows are the migration's audit trail.

alter table public.uw_contracts
  add column import_source_key text;

create unique index uw_contracts_import_source_key_idx
  on public.uw_contracts (import_source_key)
  where import_source_key is not null;

comment on column public.uw_contracts.import_source_key is
  'The legacy-agreement migration entry this draft was imported from (uw_agreement_migration_items.source_key). Unique, so rerunning a migration never creates a second contract; null for contracts entered any other way.';

create type public.uw_agreement_migration_status as enum (
  'pending',
  'processing',
  'imported',
  'failed'
);

create table public.uw_agreement_migration_items (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  batch_label text not null,
  manifest_row integer,
  underwriter_name text not null,
  contract_identifier text,
  effective_from date,
  effective_to date,
  sponsorship_total numeric(12, 2),
  contract_type text,
  source_file text not null,
  drive_file_id text,
  documentation_status text,
  notes text,
  status public.uw_agreement_migration_status not null default 'pending',
  attempts integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  contract_id uuid references public.uw_contracts (id) on delete set null,
  document_sha256 text,
  last_error text,
  result jsonb,
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uw_agreement_migration_items_dates check (
    effective_to is null or effective_from is null or effective_to >= effective_from
  )
);

comment on table public.uw_agreement_migration_items is
  'One legacy agreement to migrate (docs/underwriting-traffic-redesign.md §14): the manifest''s facts, which win over the document''s reading; the run''s status; and the draft contract it produced. The record of the migration, not a job queue.';
comment on column public.uw_agreement_migration_items.result is
  'What the last successful import found: lines read/saved, unresolved instructions, flights created, and warnings — the merge''s, each unsaved line''s, and where the document disagrees with the manifest.';

create index uw_agreement_migration_items_batch_idx
  on public.uw_agreement_migration_items (batch_label, manifest_row);

create trigger uw_agreement_migration_items_updated_at
  before update on public.uw_agreement_migration_items
  for each row execute function public.set_updated_at();

alter table public.uw_agreement_migration_items enable row level security;

grant select, insert, update on public.uw_agreement_migration_items to authenticated;

create policy uw_agreement_migration_items_select on public.uw_agreement_migration_items
  for select to authenticated
  using (
    (select private.is_administrator((select auth.uid())))
    and (select private.has_underwriting_access((select auth.uid())))
  );

create policy uw_agreement_migration_items_insert on public.uw_agreement_migration_items
  for insert to authenticated
  with check (
    (select private.is_administrator((select auth.uid())))
    and (select private.has_underwriting_access((select auth.uid())))
  );

create policy uw_agreement_migration_items_update on public.uw_agreement_migration_items
  for update to authenticated
  using (
    (select private.is_administrator((select auth.uid())))
    and (select private.has_underwriting_access((select auth.uid())))
  )
  with check (
    (select private.is_administrator((select auth.uid())))
    and (select private.has_underwriting_access((select auth.uid())))
  );
