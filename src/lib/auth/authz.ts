import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, type Profile } from "@/lib/auth/session";
import { isActive, isActiveAdministrator } from "@/lib/auth/predicates";
import { getToolByKey, type Tool } from "@/lib/tools";
import { grantRequiredForTool } from "@/lib/tool-access-rules";

/**
 * Single source of truth for "is this user allowed to do X". Every
 * server action and admin page should call one of these rather than
 * re-checking platform_role/account_status inline.
 */

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Requires an active account; redirects to /login otherwise. For use in pages. */
export async function requireActiveProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!isActive(profile)) {
    redirect("/login");
  }
  return profile;
}

/**
 * Requires an active account; throws ForbiddenError otherwise. For use in
 * contexts where a redirect would be the wrong response (route handlers) —
 * mirrors assertAdministrator/assertToolAccess's shape. requireActiveProfile
 * above stays the one pages use.
 */
export async function assertActiveProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!isActive(profile)) {
    throw new ForbiddenError();
  }
  return profile;
}

/** Requires an active administrator; redirects to /dashboard otherwise. For use in pages. */
export async function requireAdministrator(): Promise<Profile> {
  const profile = await requireActiveProfile();
  if (profile.platform_role !== "administrator") {
    redirect("/dashboard");
  }
  return profile;
}

/**
 * Requires an active administrator; throws ForbiddenError otherwise. For use
 * in server actions, where a redirect would be the wrong response.
 */
export async function assertAdministrator(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!isActiveAdministrator(profile)) {
    throw new ForbiddenError();
  }
  return profile as Profile;
}

/** Whether the given user currently has an active (non-revoked) grant for a tool. */
export async function hasToolAccess(userId: string, toolId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tool_access")
    .select("id")
    .eq("user_id", userId)
    .eq("tool_id", toolId)
    .is("revoked_at", null)
    .maybeSingle();

  return data !== null;
}

/**
 * Whether this user may open this tool: the registry row must be enabled,
 * and the user needs either an active grant or a registry row whose
 * `default_access` opens it to every active staff member. The `enabled`
 * check applies regardless of which access path admits the user — a tool an
 * administrator has switched off via /admin/tools must not stay reachable
 * for someone who already holds a grant from before it was disabled. The
 * grant-vs-open-access branch is `grantRequiredForTool` in
 * lib/tool-access-rules.ts — see that file, and docs/roadmap-design.md §6,
 * for why the column is read rather than a tool key special-cased. RLS is
 * still the real boundary; the matching predicate in SQL is each tool's own
 * `private.has_*_access`.
 */
async function canOpenTool(userId: string, tool: Tool): Promise<boolean> {
  if (!tool.enabled) return false;
  if (!grantRequiredForTool(tool)) return true;
  return hasToolAccess(userId, tool.id);
}

/**
 * Requires an active profile allowed to open the given tool (looked up by its
 * `tools.key`); redirects to /dashboard otherwise. For use in pages of tools
 * beyond the placeholder stage — mirrors requireAdministrator's shape.
 * Platform administrators are not special-cased: like every other user, they
 * need an explicit tool_access grant (see how dana_id in seed.sql only has
 * editorial-planning access, not every tool) unless the tool itself is open to
 * all active staff.
 */
export async function requireToolAccess(
  toolKey: string,
): Promise<{ profile: Profile; tool: Tool }> {
  const profile = await requireActiveProfile();
  const tool = await getToolByKey(toolKey);
  if (!tool || !(await canOpenTool(profile.id, tool))) {
    redirect("/dashboard");
  }
  return { profile, tool };
}

/**
 * Requires an active profile allowed to open the given tool; throws
 * ForbiddenError otherwise. For use in that tool's server actions, where a
 * redirect would be the wrong response — mirrors assertAdministrator.
 */
export async function assertToolAccess(toolKey: string): Promise<{ profile: Profile; tool: Tool }> {
  const profile = await getCurrentProfile();
  if (!isActive(profile)) {
    throw new ForbiddenError();
  }
  const tool = await getToolByKey(toolKey);
  if (!tool || !(await canOpenTool(profile.id, tool))) {
    throw new ForbiddenError();
  }
  return { profile, tool };
}
