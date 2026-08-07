import "server-only";
import { createClient } from "@/lib/supabase/server";
import { assertToolAccess, requireToolAccess } from "@/lib/auth/authz";
import type { Profile } from "@/lib/auth/session";
import type { Tool } from "@/lib/tools";
import { normalizeToolRole, type UnderwritingRole } from "./roles";

export const UNDERWRITING_TOOL_KEY = "underwriting";

export interface UnderwritingContext {
  profile: Profile;
  tool: Tool;
  role: UnderwritingRole;
  /** UI hint only — the real boundary is private.is_underwriting_manager(), enforced inside log_place_underwriting_credit(). */
  isManager: boolean;
  isAdministrator: boolean;
}

async function lookupRole(profile: Profile, tool: Tool): Promise<UnderwritingRole> {
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

function contextFor(profile: Profile, tool: Tool, role: UnderwritingRole): UnderwritingContext {
  const isAdministrator = profile.platform_role === "administrator";
  return {
    profile,
    tool,
    role,
    isManager: role === "manager" || isAdministrator,
    isAdministrator,
  };
}

/** Page gate for everything under /underwriting. */
export async function requireUnderwritingAccess(): Promise<UnderwritingContext> {
  const { profile, tool } = await requireToolAccess(UNDERWRITING_TOOL_KEY);
  return contextFor(profile, tool, await lookupRole(profile, tool));
}

/** Server-action gate; throws instead of redirecting, mirroring assertToolAccess. */
export async function assertUnderwritingAccess(): Promise<UnderwritingContext> {
  const { profile, tool } = await assertToolAccess(UNDERWRITING_TOOL_KEY);
  return contextFor(profile, tool, await lookupRole(profile, tool));
}
