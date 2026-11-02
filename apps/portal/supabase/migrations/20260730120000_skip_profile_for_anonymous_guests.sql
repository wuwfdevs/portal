-- Fixes a crash in guest sign-in surfaced while enabling anonymous auth for
-- Remote Interview (design doc "Guest identity"; guest.ts's
-- bindGuestParticipant() calls signInAnonymously()). The on_auth_user_created
-- trigger (handle_new_auth_user, in 20260722120000_platform_schema.sql) fires
-- for every new auth.users row with no exception for anonymous ones, and
-- inserts a public.profiles row with email = new.email. Supabase leaves
-- email null for an anonymous sign-in, which violates profiles.email's NOT
-- NULL constraint and aborts the trigger — and because the trigger runs
-- inside the same transaction as the auth.users insert, that abort fails
-- signInAnonymously() itself. A guest never needs a profiles row in the
-- first place: they're identified by ri_participants.guest_user_id, not by
-- profiles (see guest.ts, tokens.ts). Fix is to skip profile creation for
-- anonymous users rather than work around the constraint.
--
-- Note for whoever next touches handle_new_auth_user(): see the technical
-- assessment doc's Finding 4 first. The live function on both hosted
-- projects already carries a `revoke execute ... from public, anon,
-- authenticated` (folded into platform_schema.sql, not a separate tracked
-- migration) — CREATE OR REPLACE below preserves that, since replacing a
-- function's body doesn't reset its existing grants.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_anonymous then
    return new;
  end if;

  insert into public.profiles (id, email, display_name, platform_role, account_status, invited_by)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.email),
    coalesce((new.raw_user_meta_data ->> 'platform_role')::public.platform_role, 'staff'),
    'invited',
    nullif(new.raw_user_meta_data ->> 'invited_by', '')::uuid
  );
  return new;
end;
$$;
