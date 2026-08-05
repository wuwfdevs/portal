import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ForbiddenError, assertToolAccess, requireToolAccess } from "@/lib/auth/authz";
import type { Profile } from "@/lib/auth/session";
import type { Tool } from "@/lib/tools";
import { normalizeToolRole, type AcademicPartnershipsRole } from "./roles";

export const ACADEMIC_PARTNERSHIPS_TOOL_KEY = "academic-partnerships";

export interface AcademicPartnershipsContext {
  profile: Profile;
  tool: Tool;
  role: AcademicPartnershipsRole;
  isCoordinator: boolean;
  isAdministrator: boolean;
}

async function lookupRole(profile: Profile, tool: Tool): Promise<AcademicPartnershipsRole> {
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

function contextFor(
  profile: Profile,
  tool: Tool,
  role: AcademicPartnershipsRole,
): AcademicPartnershipsContext {
  const isAdministrator = profile.platform_role === "administrator";
  return {
    profile,
    tool,
    role,
    isCoordinator: role === "coordinator" || isAdministrator,
    isAdministrator,
  };
}

/** Page gate for everything under /academic-partnerships, layered on requireToolAccess(). */
export async function requireAcademicPartnershipsAccess(): Promise<AcademicPartnershipsContext> {
  const { profile, tool } = await requireToolAccess(ACADEMIC_PARTNERSHIPS_TOOL_KEY);
  return contextFor(profile, tool, await lookupRole(profile, tool));
}

/** Server-action gate; throws instead of redirecting, mirroring assertToolAccess. */
export async function assertAcademicPartnershipsAccess(): Promise<AcademicPartnershipsContext> {
  const { profile, tool } = await assertToolAccess(ACADEMIC_PARTNERSHIPS_TOOL_KEY);
  return contextFor(profile, tool, await lookupRole(profile, tool));
}

/**
 * For Settings' write actions. Throws rather than redirecting even though the
 * screen hides these controls — the buttons are a courtesy, the
 * is_academic_partnerships_coordinator() RLS predicate is the boundary, and
 * this is the layer in between.
 */
export async function assertAcademicPartnershipsCoordinator(): Promise<AcademicPartnershipsContext> {
  const context = await assertAcademicPartnershipsAccess();
  if (!context.isCoordinator) throw new ForbiddenError();
  return context;
}

/** Page gate for a screen only a coordinator should reach. */
export async function requireAcademicPartnershipsCoordinator(): Promise<AcademicPartnershipsContext> {
  const context = await requireAcademicPartnershipsAccess();
  if (!context.isCoordinator) redirect("/academic-partnerships");
  return context;
}
