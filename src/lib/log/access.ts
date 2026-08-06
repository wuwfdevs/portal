import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ForbiddenError, assertToolAccess, requireToolAccess } from "@/lib/auth/authz";
import type { Profile } from "@/lib/auth/session";
import type { Tool } from "@/lib/tools";
import { normalizeToolRole, type LogRole } from "./roles";

export const LOG_TOOL_KEY = "log";

export interface LogContext {
  profile: Profile;
  tool: Tool;
  role: LogRole;
  isProducer: boolean;
  isAdministrator: boolean;
}

async function lookupRole(profile: Profile, tool: Tool): Promise<LogRole> {
  const supabase = await createClient();
  const { data: grant } = await supabase
    .from("tool_access")
    .select("tool_role")
    .eq("user_id", profile.id)
    .eq("tool_id", tool.id)
    .is("revoked_at", null)
    .maybeSingle();

  return normalizeToolRole(grant?.tool_role ?? null);
}

function contextFor(profile: Profile, tool: Tool, role: LogRole): LogContext {
  const isAdministrator = profile.platform_role === "administrator";
  return {
    profile,
    tool,
    role,
    isProducer: role === "producer" || isAdministrator,
    isAdministrator,
  };
}

/** Page gate for everything under /log, layered on requireToolAccess(). */
export async function requireLogAccess(): Promise<LogContext> {
  const { profile, tool } = await requireToolAccess(LOG_TOOL_KEY);
  return contextFor(profile, tool, await lookupRole(profile, tool));
}

/** Server-action gate; throws instead of redirecting, mirroring assertToolAccess. */
export async function assertLogAccess(): Promise<LogContext> {
  const { profile, tool } = await assertToolAccess(LOG_TOOL_KEY);
  return contextFor(profile, tool, await lookupRole(profile, tool));
}

/**
 * For clock/schedule write actions. Throws rather than redirecting even
 * though the screen hides these controls — the buttons are a courtesy, the
 * is_log_producer() RLS predicate is the boundary, and this is the layer in
 * between.
 */
export async function assertLogProducer(): Promise<LogContext> {
  const context = await assertLogAccess();
  if (!context.isProducer) throw new ForbiddenError();
  return context;
}

/** Page gate for a screen only a producer should reach. */
export async function requireLogProducer(): Promise<LogContext> {
  const context = await requireLogAccess();
  if (!context.isProducer) redirect("/log");
  return context;
}
