-- Remote Interview: Phase 4 slice 4 (completion, recovery, and delivery).
-- One RLS change, no new tables or columns: assembling a local track writes
-- the assembled file to *that participant's* storage prefix, but assembly
-- is host-triggered (design doc §3F: "The host can retry a failed
-- assembly") and runs from a Server Action on the RLS-scoped client, not
-- the admin client (CLAUDE.md: never bypass RLS for convenience). For a
-- guest's track, the acting user (the host) is not the object's owner per
-- private.ri_owns_storage_object, so the Foundation migration's
-- ri_media_insert/ri_media_update policies would reject the write.
--
-- Same shape as the slice 3 studio migration's ri_tracks_insert/update
-- broadening (20260729190000_remote_interview_studio_rls.sql): scoped to
-- the session's host specifically, not every tool member, because writing
-- into a participant's media prefix on their behalf is a host-only action
-- here, mirroring how recording control itself is host-only.

create function private.ri_host_owns_storage_object(object_name text, uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.ri_participants p
    join public.ri_sessions s on s.id = p.session_id
    where object_name like p.storage_prefix || '/%'
      and s.created_by = uid
  );
$$;

revoke execute on function private.ri_host_owns_storage_object(text, uuid) from public, anon;
grant execute on function private.ri_host_owns_storage_object(text, uuid) to authenticated;

drop policy ri_media_insert on storage.objects;
drop policy ri_media_update on storage.objects;

create policy ri_media_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'remote-interview-media'
    and (
      private.ri_owns_storage_object(name, auth.uid())
      or private.ri_host_owns_storage_object(name, auth.uid())
    )
  );

create policy ri_media_update on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'remote-interview-media'
    and (
      private.ri_owns_storage_object(name, auth.uid())
      or private.ri_host_owns_storage_object(name, auth.uid())
    )
  )
  with check (
    bucket_id = 'remote-interview-media'
    and (
      private.ri_owns_storage_object(name, auth.uid())
      or private.ri_host_owns_storage_object(name, auth.uid())
    )
  );
