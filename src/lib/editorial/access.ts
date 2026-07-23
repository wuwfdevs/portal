import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ForbiddenError, requireActiveProfile } from "@/lib/auth/authz";
import { getCurrentProfile, type Profile } from "@/lib/auth/session";
import { isActive } from "@/lib/auth/predicates";
import { normalizeToolRole, roleAtLeast, type EditorialRole } from "./roles";

export const EDITORIAL_TOOL_KEY = "editorial-planning";

export interface EditorialContext {
  profile: Profile;
  role: EditorialRole;
  toolId: string;
}

async function lookupContext(profile: Profile): Promise<EditorialContext | null> {
  const supabase = await createClient();
  const { data: tool } = await supabase
    .from("tools")
    .select("id, enabled")
    .eq("key", EDITORIAL_TOOL_KEY)
    .maybeSingle();
  if (!tool?.enabled) return null;

  const { data: grant } = await supabase
    .from("tool_access")
    .select("tool_role")
    .eq("user_id", profile.id)
    .eq("tool_id", tool.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (!grant) return null;

  return { profile, role: normalizeToolRole(grant.tool_role), toolId: tool.id };
}

/**
 * Page gate for everything under /editorial, layered on requireActiveProfile()
 * the same way requireAdministrator() is. RLS remains the real boundary; this
 * keeps people without a grant (or below the needed role) off the screens.
 */
export async function requireEditorialAccess(
  minimum: EditorialRole = "contributor",
): Promise<EditorialContext> {
  const profile = await requireActiveProfile();
  const context = await lookupContext(profile);
  if (!context) redirect("/dashboard");
  if (!roleAtLeast(context.role, minimum)) redirect("/editorial");
  return context;
}

/** Server-action gate; throws instead of redirecting, mirroring assertAdministrator(). */
export async function assertEditorialRole(minimum: EditorialRole): Promise<EditorialContext> {
  const profile = await getCurrentProfile();
  if (!isActive(profile)) throw new ForbiddenError();
  const context = await lookupContext(profile);
  if (!context || !roleAtLeast(context.role, minimum)) throw new ForbiddenError();
  return context;
}
