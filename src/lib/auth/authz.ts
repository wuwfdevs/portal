import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, type Profile } from "@/lib/auth/session";
import { isActive, isActiveAdministrator } from "@/lib/auth/predicates";

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
