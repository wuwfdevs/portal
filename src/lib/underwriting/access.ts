import "server-only";
import { createClient } from "@/lib/supabase/server";
import { assertToolAccess, requireToolAccess } from "@/lib/auth/authz";
import type { Profile } from "@/lib/auth/session";
import type { Tool } from "@/lib/tools";
import { parseUnderwritingRoles, type UnderwritingRole } from "./roles";

export const UNDERWRITING_TOOL_KEY = "underwriting";

export interface UnderwritingContext {
  profile: Profile;
  tool: Tool;
  roles: UnderwritingRole[];
  /** UI hint only — the real boundary is private.is_underwriting_manager(), enforced inside log_place_underwriting_credit(). */
  isManager: boolean;
  /** UI hint only — the real boundary is private.is_underwriting_production(). */
  isProduction: boolean;
  isAdministrator: boolean;
}

async function lookupRoles(profile: Profile, tool: Tool): Promise<UnderwritingRole[]> {
  const supabase = await createClient();
  const { data: grant } = await supabase
    .from("tool_access")
    .select("tool_roles")
    .eq("user_id", profile.id)
    .eq("tool_id", tool.id)
    .is("revoked_at", null)
    .maybeSingle();

  return parseUnderwritingRoles(grant?.tool_roles ?? null);
}

function contextFor(profile: Profile, tool: Tool, roles: UnderwritingRole[]): UnderwritingContext {
  const isAdministrator = profile.platform_role === "administrator";
  return {
    profile,
    tool,
    roles,
    isManager: roles.includes("manager") || isAdministrator,
    isProduction: roles.includes("production") || isAdministrator,
    isAdministrator,
  };
}

/** Page gate for everything under /underwriting. */
export async function requireUnderwritingAccess(): Promise<UnderwritingContext> {
  const { profile, tool } = await requireToolAccess(UNDERWRITING_TOOL_KEY);
  return contextFor(profile, tool, await lookupRoles(profile, tool));
}

/** Server-action gate; throws instead of redirecting, mirroring assertToolAccess. */
export async function assertUnderwritingAccess(): Promise<UnderwritingContext> {
  const { profile, tool } = await assertToolAccess(UNDERWRITING_TOOL_KEY);
  return contextFor(profile, tool, await lookupRoles(profile, tool));
}

/**
 * The legacy-agreement migration (docs/underwriting-traffic-redesign.md §14)
 * is an administrator's tool: Underwriting access (the RLS on uw_* needs
 * it) and the administrator platform role. The table's own policies say the
 * same; this is the courtesy check in front of them.
 */
export async function requireAgreementMigrationAccess(): Promise<UnderwritingContext | null> {
  const context = await requireUnderwritingAccess();
  return context.isAdministrator ? context : null;
}

export async function assertAgreementMigrationAccess(): Promise<UnderwritingContext> {
  const context = await assertUnderwritingAccess();
  if (!context.isAdministrator)
    throw new Error("Only an administrator can migrate legacy records.");
  return context;
}
