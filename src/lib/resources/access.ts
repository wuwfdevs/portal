import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireToolAccess } from "@/lib/auth/authz";
import type { Profile } from "@/lib/auth/session";
import type { Tool } from "@/lib/tools";
import { normalizeToolRole, type ResourcesRole } from "./roles";

export const RESOURCES_TOOL_KEY = "resources";

export interface ResourcesContext {
  profile: Profile;
  tool: Tool;
  role: ResourcesRole;
  isEditor: boolean;
}

/**
 * Mirrors lib/roadmap/access.ts: the registry row is approved_staff, so
 * requireToolAccess admits every active user and the grant lookup only ever
 * adds editing. RLS on rc_articles (private.is_resources_editor) is the real
 * boundary; this decides which controls to render.
 */
async function lookupRole(profile: Profile, tool: Tool): Promise<ResourcesRole> {
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

/** Page gate for everything under /resources, layered on requireToolAccess(). */
export async function requireResourcesAccess(): Promise<ResourcesContext> {
  const { profile, tool } = await requireToolAccess(RESOURCES_TOOL_KEY);
  const role = await lookupRole(profile, tool);
  return {
    profile,
    tool,
    role,
    // An administrator edits too, matching private.is_resources_editor().
    isEditor: role === "editor" || profile.platform_role === "administrator",
  };
}
