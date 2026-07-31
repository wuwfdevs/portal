-- Phase C of the capability-layer/MCP-server work
-- (docs/agent-capabilities-design.md §10, §11 risk 3): the MCP server
-- (src/app/api/mcp/route.ts, src/lib/mcp/server.ts) logs one audit_events
-- row per tool invocation, under the "mcp." action prefix, regardless of
-- which tool's capability was called — that's what makes an
-- agent-originated write distinguishable from a UI-originated one.
--
-- The existing audit_events insert policies are scoped to administrators,
-- Editorial Planning editors, and Audience Listening members only. A
-- Sourcework- or Remote-Interview-only user calling an MCP tool would have
-- that insert rejected by RLS and silently swallowed by logAuditEvent()'s
-- console.error — the exact failure mode already called out in
-- 20260730170000_audience_listening.sql for that tool's own writes.
--
-- This policy is scoped to the "mcp." action namespace specifically, so it
-- doesn't become a general bypass of the per-tool policies above — only the
-- MCP layer, which always sets that prefix itself (see buildMcpAuditEvent
-- in src/lib/mcp/audit.ts), benefits from it.

create function private.is_active_profile(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = uid
      and account_status = 'active'
  );
$$;

grant execute on function private.is_active_profile(uuid) to authenticated;

create policy audit_events_insert_mcp on public.audit_events
  for insert
  to authenticated
  with check (
    private.is_active_profile(auth.uid())
    and actor_id = auth.uid()
    and action like 'mcp.%'
  );
