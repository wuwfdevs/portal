-- Portal-level schema: profiles, tools, tool access, access requests, audit log.
-- Tool-specific schemas (editorial planning, etc.) live in their own future migrations.

create type public.platform_role as enum ('administrator', 'staff', 'student', 'faculty_partner');
create type public.account_status as enum ('invited', 'pending', 'active', 'disabled');
create type public.tool_status as enum ('available', 'in_development', 'planned');
create type public.access_request_status as enum ('pending', 'approved', 'denied');

-- One row per authenticated user. Created automatically by handle_new_auth_user().
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null,
  platform_role public.platform_role not null default 'staff',
  account_status public.account_status not null default 'invited',
  invited_by uuid references public.profiles (id) on delete set null,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Platform-level identity and role for every authenticated user. Disabling access sets account_status; rows are never deleted so history is preserved.';

-- The tool registry. Adding a tool means inserting a row here plus its own routes/migrations.
create table public.tools (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text not null,
  route text not null,
  status public.tool_status not null default 'planned',
  enabled boolean not null default false,
  default_access text not null default 'invite_only',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tools_default_access_check check (default_access in ('invite_only', 'approved_staff', 'open'))
);

comment on table public.tools is
  'Explicit registry of portal-linked tools. Not a plugin system: adding a tool is a normal code change plus a row here.';
comment on column public.tools.default_access is
  'invite_only: user needs an explicit tool_access row. approved_staff: any active user may open it. open: informational only in phase 1, not yet enforced beyond active accounts.';

-- Per-user, per-tool grants. A user may have at most one active (non-revoked) grant per tool.
create table public.tool_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  tool_id uuid not null references public.tools (id) on delete cascade,
  tool_role text,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null
);

comment on table public.tool_access is
  'Tool-specific role text (tool_role) is interpreted by the tool itself, not by the portal. Revoking sets revoked_at rather than deleting the row.';

create unique index tool_access_active_unique
  on public.tool_access (user_id, tool_id)
  where revoked_at is null;

-- Self-service "I need access" submissions from people without a profile yet.
create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null,
  note text,
  status public.access_request_status not null default 'pending',
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz
);

-- Append-only log of privileged actions, written by server actions only.
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_events is
  'Append-only. Written exclusively by server-side code after a privileged action succeeds; never updated or deleted by the application.';

create index audit_events_created_at_idx on public.audit_events (created_at desc);
create index tool_access_user_id_idx on public.tool_access (user_id);
create index tool_access_tool_id_idx on public.tool_access (tool_id);

-- updated_at maintenance -----------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger set_tools_updated_at
  before update on public.tools
  for each row execute function public.set_updated_at();

-- auth.users provisioning -----------------------------------------------------
-- Admin invites (auth.admin.inviteUserByEmail) pass platform_role/display_name in
-- user metadata; this trigger turns that into a profile row. It is the only path
-- that creates a profile, since public self-signup is disabled (see supabase/config.toml).

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Flip invited -> active on first successful sign-in and track last_active_at.
create function public.handle_auth_user_sign_in()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    last_active_at = now(),
    account_status = case when account_status = 'invited' then 'active' else account_status end
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_sign_in
  after update of last_sign_in_at on auth.users
  for each row
  when (new.last_sign_in_at is distinct from old.last_sign_in_at)
  execute function public.handle_auth_user_sign_in();

-- Authorization helper used throughout RLS policies (see 20260722120001_rls_policies.sql).
create function public.is_administrator(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = uid
      and platform_role = 'administrator'
      and account_status = 'active'
  );
$$;

-- handle_new_auth_user/handle_auth_user_sign_in must only run via their
-- triggers, never as a direct RPC call; is_administrator is only needed by
-- RLS policies evaluated as the authenticated role. Triggers do not require
-- the firing role to hold EXECUTE, so revoking these is safe.
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.handle_auth_user_sign_in() from public, anon, authenticated;
revoke execute on function public.is_administrator(uuid) from public, anon;
grant execute on function public.is_administrator(uuid) to authenticated;
