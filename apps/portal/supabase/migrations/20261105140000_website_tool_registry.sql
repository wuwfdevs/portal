-- Website: the Portal as identity provider for the public site's CMS (apps/site).
--
-- Opening this tool mints a short-lived signed token and redirects to the site (src/app/(portal)/website/
-- route.ts); the site verifies it and provisions the staff member's CMS account from their grant's roles.
-- Roles stack (tool_access.tool_roles), the shape On Air and Bookings use: editor, publisher, administrator,
-- sponsorship, membership. The site, not the Portal, maps them to permissions.
--
-- Invite-only: a grant is the ticket in, with no default_access branch, exactly like Log
-- (private.has_log_access). The site is a separate app with its own database; nothing here reads or writes
-- it, and nothing in this migration touches another tool's tables.
--
-- Registered `available` but NOT enabled. Until the site is deployed the card should read "Unavailable",
-- not "Restricted" (which would imply a working tool). An administrator switches it on from /admin/tools at
-- launch, and the Resources release note ships with that step, not before: announcing a tool nobody can
-- open would only add noise to "What's new". Re-running this migration never changes `enabled`.

-- Access predicate ------------------------------------------------------------------------------------------

create function private.has_website_access(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tool_access ta
    join public.tools t on t.id = ta.tool_id
    join public.profiles p on p.id = uid
    where ta.user_id = uid
      and t.key = 'website'
      and ta.revoked_at is null
      and p.account_status = 'active'
  );
$$;

revoke execute on function private.has_website_access(uuid) from public, anon;
grant execute on function private.has_website_access(uuid) to authenticated;

-- Audit ----------------------------------------------------------------------------------------------------
-- The route records `website.sso.opened`. audit_events is select-restricted to administrators and has
-- per-tool insert policies; without one for this tool the insert would be silently dropped by RLS. Scoped to
-- the `website.` action prefix so it cannot become a general way to write audit rows (the same reasoning as
-- audit_events_insert_roadmap_curator and audit_events_insert_mcp).

create policy audit_events_insert_website on public.audit_events
  for insert to authenticated
  with check (
    (select private.has_website_access((select auth.uid())))
    and actor_id = (select auth.uid())
    and action like 'website.%'
  );

-- Registry row ---------------------------------------------------------------------------------------------
-- Upsert rather than update, per the audience-listening/remote-interview lesson: a bare update silently
-- no-ops on a project whose seed never ran. `enabled` is deliberately absent from the update set.

insert into public.tools (key, name, description, route, status, enabled, default_access, sort_order)
values (
  'website',
  'Website',
  'Sign in to the WUWF.org content system to write, review and publish stories, manage sponsors and agreements, and review listening answers.',
  '/website',
  'available',
  false,
  'invite_only',
  12
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  route = excluded.route,
  status = excluded.status,
  default_access = excluded.default_access;
