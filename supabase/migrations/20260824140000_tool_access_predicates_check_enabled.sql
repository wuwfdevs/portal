-- Seven of the nine tool-access predicates never checked tools.enabled, so an
-- administrator disabling a tool from /admin/tools never actually revoked a
-- previously-granted user's access at the RLS layer — the boundary CLAUDE.md
-- (and this migration's own predecessors) call "the real enforcement
-- boundary, not a convenience layer behind app-level checks". Only
-- private.ep_role (editorial-planning, 20260724120000) and
-- private.has_roadmap_access (roadmap, 20260801121000) checked it; every
-- predicate copied from private.has_transcription_access's shape did not,
-- despite has_roadmap_access's own comment claiming otherwise ("Still
-- requires the tool to be enabled ... exactly like the other four
-- predicates" — it wasn't, and this migration is what makes that true).
--
-- This corrects the app-layer half of the same bug fixed in
-- lib/auth/authz.ts's canOpenTool (which never checked tool.enabled for an
-- invite_only tool either) — a reporter who once held a grant on a disabled
-- tool must not still be able to read or write its data via a direct
-- PostgREST call, only via the portal's own pages.
--
-- create or replace preserves each function's existing grants/revokes, so
-- none of those statements need to be repeated here.

create or replace function private.has_transcription_access(uid uuid)
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
      and t.key = 'transcription'
      and t.enabled
      and ta.revoked_at is null
      and p.account_status = 'active'
  );
$$;

create or replace function private.has_remote_interview_access(uid uuid)
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
      and t.key = 'remote-interview'
      and t.enabled
      and ta.revoked_at is null
      and p.account_status = 'active'
  );
$$;

create or replace function private.has_audience_listening_access(uid uuid)
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
      and t.key = 'audience-listening'
      and t.enabled
      and ta.revoked_at is null
      and p.account_status = 'active'
  );
$$;

create or replace function private.has_academic_partnerships_access(uid uuid)
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
      and t.key = 'academic-partnerships'
      and t.enabled
      and ta.revoked_at is null
      and p.account_status = 'active'
  );
$$;

create or replace function private.has_log_access(uid uuid)
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
      and t.key = 'log'
      and t.enabled
      and ta.revoked_at is null
      and p.account_status = 'active'
  );
$$;

create or replace function private.has_underwriting_access(uid uuid)
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
      and t.key = 'underwriting'
      and t.enabled
      and ta.revoked_at is null
      and p.account_status = 'active'
  );
$$;

create or replace function private.has_editorial_inquiry_access(uid uuid)
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
      and t.key = 'editorial-inquiry'
      and t.enabled
      and ta.revoked_at is null
      and p.account_status = 'active'
  );
$$;
