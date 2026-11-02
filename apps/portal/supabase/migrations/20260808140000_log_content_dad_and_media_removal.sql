-- Log: domain redesign, part 3 — ENCO/DAD is WUWF's audio playback/
-- automation system of record (docs/broadcast-operations-strategy.md's
-- product boundary; see CLAUDE.md's "Log domain redesign" note). Hosts play
-- recorded material through DAD, not the portal.
--
-- Inspecting the actual implementation (not just the design doc's
-- aspiration) confirmed there is no real workflow consuming
-- log-media-bucket audio anywhere in this codebase: audio_object_path is
-- written by an upload widget and read back in exactly two places, both as
-- a boolean to toggle upload-hint text — never a signed URL, never an
-- <audio> element, never a preview. That's write-only infrastructure with
-- no product use, the exact case CLAUDE.md's rules-for-making-changes and
-- this redesign's own instructions call out for removal rather than
-- preservation.
--
-- Replacing it: dad_cart_number, a plain optional text reference to the
-- item's identifier in ENCO/DAD — descriptive metadata, not a duplicate
-- copy of the audio itself. Script/intro/outro/tag copy, duration, and this
-- cart reference are what Log actually needs to represent a recorded item;
-- the bytes live in DAD.

alter table public.log_content_items
  drop column audio_object_path,
  add column dad_cart_number text;

alter table public.log_content_components
  drop column audio_object_path,
  add column dad_cart_number text;

comment on column public.log_content_items.dad_cart_number is
  'Optional identifier for this item''s recorded audio in ENCO/DAD, WUWF''s playback system of record. The portal does not store or play the audio itself.';
comment on column public.log_content_components.dad_cart_number is
  'Optional identifier for this component''s recorded audio in ENCO/DAD. Only meaningful for component_type = recorded_audio.';

-- Remove the now-unused storage bucket's policies. No files of consequence
-- exist in either environment (no production data — see CLAUDE.md).
-- Dropping the policies alone fully locks the bucket down (RLS defaults to
-- deny with no policy present) — the bucket *row* itself can't be removed
-- from a migration: Supabase's storage.protect_delete() trigger rejects a
-- direct DELETE against storage.objects/storage.buckets ("Use the Storage
-- API instead"), confirmed while applying this migration. Removing the
-- inert, now-inaccessible bucket row is a follow-up via the dashboard or
-- `supabase storage rm`, not a migration statement.

drop policy if exists log_media_select on storage.objects;
drop policy if exists log_media_insert on storage.objects;
drop policy if exists log_media_update on storage.objects;
