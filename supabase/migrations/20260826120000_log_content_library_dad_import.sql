-- Log: DAD library import. dad_cart_number was added to log_content_items/
-- log_content_components in 20260808140000, then dropped again in
-- 20260810150000 for being captured on the form but never read anywhere —
-- the same "write-only" finding that removed audio_object_path in the first
-- place. It's back here for a real reason this time: importing WUWF's
-- existing DAD cut library (lib/log/dad-library-import.ts's parser +
-- lib/log/dad-library-plan.ts's planner) needs a stable key to reuse an
-- already-imported cut on a re-run rather than duplicating it, the same
-- "reuse before create" discipline the program-log importer's uw_copy
-- find-or-create already follows. dad_group is new — every row this import
-- creates or updates is tagged with the DAD group(s) it came from, so the
-- library stays traceable to its DAD source without needing to re-derive it.
--
-- Both columns are nullable and neither is read by any filter/eligibility
-- decision — same "descriptive, not load-bearing" status the original
-- dad_cart_number had — but this time dad_cart_number is genuinely
-- consumed, by the importer's own dedup lookup, which is the difference
-- that matters.

alter table public.log_content_items
  add column dad_cart_number text,
  add column dad_group text;

alter table public.log_content_components
  add column dad_cart_number text;

comment on column public.log_content_items.dad_cart_number is
  'Optional identifier for this item''s recorded audio in ENCO/DAD, WUWF''s playback system of record. Set by the DAD library import (lib/log/dad-library-plan.ts) as its reuse-on-reimport key; the portal does not store or play the audio itself.';
comment on column public.log_content_items.dad_group is
  'The DAD library group(s) (e.g. "UNEARTH", "PPA") this item was imported from, verbatim — traceability back to the source library, not interpreted by this schema.';
comment on column public.log_content_components.dad_cart_number is
  'Optional identifier for this component''s recorded audio in ENCO/DAD. Only meaningful for component_type = recorded_audio.';

create index log_content_items_dad_cart_number_idx
  on public.log_content_items (dad_cart_number)
  where dad_cart_number is not null;
