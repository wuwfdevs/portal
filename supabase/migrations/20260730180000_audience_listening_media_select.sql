-- Fixes a real production failure: the participant-facing upload always
-- passes upsert: true (a redo must overwrite the same fixed object key —
-- see al_answers.storage_path's comment in 20260730170000), and
-- storage-js's own upload() docs say upserting requires select, insert
-- and update on storage.objects, not just insert/update. al_media_select
-- was staff-only, so every participant upload — including a first-time one,
-- since the client always sends upsert: true — failed with "new row
-- violates row-level security policy for table 'objects'" even though the
-- insert/update policies (and private.al_owns_open_submission_object itself)
-- were individually correct. Confirmed against production logs and by
-- exercising private.al_owns_open_submission_object directly before writing
-- this fix.
--
-- This is the same deliberate exception CLAUDE.md already documents for
-- this bucket: storage RLS, not the staff-only al_* table RLS, scoped to
-- the object prefix of an in-progress submission the caller owns. It adds a
-- policy rather than editing al_media_select so the existing staff policy
-- is untouched — Postgres OR's permissive policies together.
create policy al_media_select_own on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'audience-listening-media'
    and private.al_owns_open_submission_object(name, auth.uid())
  );
