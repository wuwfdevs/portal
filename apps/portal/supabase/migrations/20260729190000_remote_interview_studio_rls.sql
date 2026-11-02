-- Remote Interview: Phase 4 slice 3 (the studio). One RLS change, no new
-- tables or columns: recording start/stop is host-controlled (design doc
-- §3D — "The host starts and stops recording deliberately"), and part of
-- starting a recording run is creating the *cloud-backup* ri_tracks row for
-- every admitted participant, including guests. The Foundation migration's
-- ri_tracks_insert/update policies only let a participant write their own
-- row (private.ri_is_own_participant) — correct for the *local* track a
-- guest's own browser creates for itself, but too narrow for the cloud
-- track, which the host's server action creates on a guest's behalf.
--
-- Scoped to the session's host specifically (not every tool member), the
-- same shape as ri_participants_update, because recording control — and
-- therefore cloud-track bookkeeping — is a host-only action per the design
-- doc, not a general shared-workspace write.

drop policy ri_tracks_insert on public.ri_tracks;
drop policy ri_tracks_update on public.ri_tracks;

create policy ri_tracks_insert on public.ri_tracks
  for insert
  to authenticated
  with check (
    private.ri_is_own_participant(participant_id, auth.uid())
    or exists (
      select 1
      from public.ri_participants p
      join public.ri_sessions s on s.id = p.session_id
      where p.id = ri_tracks.participant_id and s.created_by = auth.uid()
    )
  );

create policy ri_tracks_update on public.ri_tracks
  for update
  to authenticated
  using (
    private.ri_is_own_participant(participant_id, auth.uid())
    or exists (
      select 1
      from public.ri_participants p
      join public.ri_sessions s on s.id = p.session_id
      where p.id = ri_tracks.participant_id and s.created_by = auth.uid()
    )
  )
  with check (
    private.ri_is_own_participant(participant_id, auth.uid())
    or exists (
      select 1
      from public.ri_participants p
      join public.ri_sessions s on s.id = p.session_id
      where p.id = ri_tracks.participant_id and s.created_by = auth.uid()
    )
  );
