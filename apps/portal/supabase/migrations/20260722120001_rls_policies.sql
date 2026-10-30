-- Row Level Security is the enforcement point for every portal table. Application
-- code must never rely on hidden UI alone, and privileged writes that RLS can't
-- express (e.g. creating an auth.users row for an invite) happen server-side with
-- the service-role client, gated by is_administrator() checks in application code,
-- and are logged to audit_events.

alter table public.profiles enable row level security;
alter table public.tools enable row level security;
alter table public.tool_access enable row level security;
alter table public.access_requests enable row level security;
alter table public.audit_events enable row level security;

grant usage on schema public to anon, authenticated;

-- profiles --------------------------------------------------------------------

grant select, update on public.profiles to authenticated;

create policy profiles_select_own_or_admin on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or public.is_administrator(auth.uid()));

-- Only administrators change role/status/display_name; there is no self-service
-- profile edit in this phase.
create policy profiles_update_admin_only on public.profiles
  for update
  to authenticated
  using (public.is_administrator(auth.uid()))
  with check (public.is_administrator(auth.uid()));

-- No insert/delete policy for profiles: rows are created only by the
-- handle_new_auth_user() trigger (security definer) and are never deleted from
-- the application so history is preserved.

-- tools -------------------------------------------------------------------------

grant select, insert, update, delete on public.tools to authenticated;

-- Any active user can see enabled tools (so the dashboard can show restricted
-- states); administrators can also see disabled/unpublished tools for the
-- registry screen.
create policy tools_select_enabled_or_admin on public.tools
  for select
  to authenticated
  using (
    public.is_administrator(auth.uid())
    or (
      enabled = true
      and exists (
        select 1 from public.profiles
        where id = auth.uid() and account_status = 'active'
      )
    )
  );

create policy tools_write_admin_only on public.tools
  for all
  to authenticated
  using (public.is_administrator(auth.uid()))
  with check (public.is_administrator(auth.uid()));

-- tool_access ---------------------------------------------------------------------

grant select, insert, update, delete on public.tool_access to authenticated;

create policy tool_access_select_own_or_admin on public.tool_access
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_administrator(auth.uid()));

create policy tool_access_write_admin_only on public.tool_access
  for all
  to authenticated
  using (public.is_administrator(auth.uid()))
  with check (public.is_administrator(auth.uid()));

-- access_requests ------------------------------------------------------------------

grant insert on public.access_requests to anon, authenticated;
grant select, update on public.access_requests to authenticated;

-- Anyone (including a signed-out visitor) can submit a request; this is the
-- one deliberately open write path in the schema, matching the "request
-- access" flow for people who don't have a profile yet.
create policy access_requests_insert_anyone on public.access_requests
  for insert
  to anon, authenticated
  with check (char_length(email) > 3 and char_length(display_name) > 0);

create policy access_requests_select_admin_only on public.access_requests
  for select
  to authenticated
  using (public.is_administrator(auth.uid()));

create policy access_requests_update_admin_only on public.access_requests
  for update
  to authenticated
  using (public.is_administrator(auth.uid()))
  with check (public.is_administrator(auth.uid()));

-- audit_events ----------------------------------------------------------------------

grant select, insert on public.audit_events to authenticated;

create policy audit_events_select_admin_only on public.audit_events
  for select
  to authenticated
  using (public.is_administrator(auth.uid()));

-- Written by server actions acting as the signed-in administrator; actor_id
-- must match the caller so the log can't be forged as someone else.
create policy audit_events_insert_admin_only on public.audit_events
  for insert
  to authenticated
  with check (public.is_administrator(auth.uid()) and actor_id = auth.uid());
