-- "Disabled" has to mean disabled in the database, not only on the pages.
--
-- 20260824140000 made seven tool-access predicates check `tools.enabled`, so that an
-- administrator switching a tool off at /admin/tools actually revokes access at the
-- row-security layer, not just on the portal's own pages. Three predicates written after
-- it copied the older shape and left the check out again:
--
--   private.has_bookings_access   (20261005140000_bookings_foundation.sql)
--   private.has_website_access    (20261105140000_website_tool_registry.sql)
--   private.has_tool_role         (20261002150000_broadcast_roles_stackable.sql)
--
-- Effect of the gap: someone who held a grant on a disabled tool could still read and
-- write its data through a direct PostgREST call, and every `is_*_lead` / `is_*_director`
-- style role helper built on has_tool_role kept returning true for a disabled tool.
-- With this migration a grant on a disabled tool grants nothing in the database, which is
-- what the switch has always been described as doing.
--
-- Platform administrators keep the has_tool_role bypass they already had (the trailing
-- `or private.is_administrator(uid)`): that is deliberate and unchanged, and it is how an
-- administrator can still see a disabled tool's data to switch it back on.
--
-- `create or replace` keeps each function's existing grants and revokes, so none are
-- repeated here. The bodies are the previous definitions with one added line each.

create or replace function private.has_bookings_access(uid uuid)
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
      and t.key = 'bookings'
      and t.enabled
      and ta.revoked_at is null
      and p.account_status = 'active'
  );
$$;

create or replace function private.has_website_access(uid uuid)
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
      and t.enabled
      and ta.revoked_at is null
      and p.account_status = 'active'
  );
$$;

create or replace function private.has_tool_role(uid uuid, p_tool_key text, p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tool_access ta
    join public.tools t on t.id = ta.tool_id
    join public.profiles p on p.id = uid
    where ta.user_id = uid
      and t.key = p_tool_key
      and t.enabled
      and ta.revoked_at is null
      and p_role = any (ta.tool_roles)
      and p.account_status = 'active'
  ) or private.is_administrator(uid);
$$;
