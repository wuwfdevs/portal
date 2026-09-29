-- Documents-only entries for the legacy-agreement migration
-- (docs/underwriting-traffic-redesign.md §14.3).
--
-- A fallback for agreements the manifest doesn't list: each chosen
-- document becomes its own entry, keyed 'sha256:<hash of the file>', with
-- no manifest facts — the reading supplies them, as "Create from the
-- agreement" does. Such an entry has no underwriter name; every manifest
-- entry still must. document_sha256 gets an index because an import now
-- refuses a document another entry already imported, which is what stops
-- a manifest entry and a documents-only entry making two contracts from
-- one PDF.

alter table public.uw_agreement_migration_items
  alter column underwriter_name drop not null,
  add constraint uw_agreement_migration_items_underwriter check (
    underwriter_name is not null or source_key like 'sha256:%'
  );

comment on column public.uw_agreement_migration_items.underwriter_name is
  'The manifest''s underwriter. Null only for a documents-only entry (source_key ''sha256:…''), whose facts all come from the reading.';

create index uw_agreement_migration_items_document_idx
  on public.uw_agreement_migration_items (document_sha256)
  where document_sha256 is not null;
