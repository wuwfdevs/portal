-- Remote Interview: Phase 4 slice 2 (Preflight and guest join). Adds the
-- waiting-room state and the two security-definer functions that let an
-- anonymously-authenticated guest bind to their participant row and enter
-- the waiting room, without ever needing a raw RLS policy that would let a
-- guest write arbitrary columns (in particular admitted_at — see design doc
-- §3C: "Nobody joins an interview that has already started without the host
-- knowing").
--
-- See docs/remote-interview-design.md §3B/§3C/"Guest identity" and
-- docs/remote-interview-technical-assessment.md's "Guest identity" section
-- (Part 3) for the product and security rationale.

alter table public.ri_participants
  add column waiting_since timestamptz;

comment on column public.ri_participants.waiting_since is
  'Set when a guest finishes preflight and enters the waiting room. Null again has no meaning once admitted_at is set — the two are read together to derive UI state, never independently.';

-- Binds the join token's participant row to the caller's own auth.uid().
-- Runs before any RLS-visible relationship exists between the caller and the
-- row (an unbound anonymous user cannot SELECT it), so this has to bypass RLS
-- internally rather than rely on a policy — the token itself is what proves
-- authorization here, exactly as it does for the join link overall (see
-- tokens.ts: "the capability: whoever holds it can join as this participant").
-- Deliberately callable by `authenticated` only, not `anon`: the caller must
-- already hold a real (if anonymous) session — see design doc, "Guest
-- identity" — signInAnonymously() happens first, this runs second.
create function public.ri_bind_guest_participant(p_token text)
returns public.ri_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ri_participants;
begin
  if auth.uid() is null then
    return null;
  end if;

  update public.ri_participants
  set guest_user_id = auth.uid()
  where join_token = p_token
    and role = 'guest'
    and revoked_at is null
    and (token_expires_at is null or token_expires_at > now())
  returning * into r;

  return r;
end;
$$;

comment on function public.ri_bind_guest_participant(text) is
  'Guest-join entry point. Validates the token (unrevoked, unexpired, a guest row) and binds it to the calling anonymous user, rebinding is intentional and idempotent so reopening the same link always works. Returns null for any invalid token rather than distinguishing why — the UI shows one generic "this link isn''t valid" message either way.';

revoke execute on function public.ri_bind_guest_participant(text) from public, anon;
grant execute on function public.ri_bind_guest_participant(text) to authenticated;

-- The only way waiting_since (and, incidentally, display_name) can be
-- written by a guest. Scoped narrowly on purpose: a plain RLS UPDATE policy
-- keyed on guest_user_id = auth.uid() would also let a guest set
-- admitted_at, role, or revoked_at on their own row via a hand-crafted
-- request, which is exactly the self-admission bypass the design doc rules
-- out. admitted_at is only ever set by the host, through the existing
-- ri_participants_update policy (created_by = auth.uid()) in
-- src/app/(portal)/remote-interview/actions.ts.
create function public.ri_guest_join_waiting_room(p_participant_id uuid, p_display_name text default null)
returns public.ri_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ri_participants;
begin
  if auth.uid() is null then
    return null;
  end if;

  update public.ri_participants
  set
    display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
    waiting_since = now()
  where id = p_participant_id
    and guest_user_id = auth.uid()
    and revoked_at is null
    and admitted_at is null
  returning * into r;

  return r;
end;
$$;

comment on function public.ri_guest_join_waiting_room(uuid, text) is
  'Called once preflight completes. No-ops (returns null) if the caller isn''t bound to that row, the link was revoked, or the participant is already admitted.';

revoke execute on function public.ri_guest_join_waiting_room(uuid, text) from public, anon;
grant execute on function public.ri_guest_join_waiting_room(uuid, text) to authenticated;
