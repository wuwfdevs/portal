import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ForbiddenError, assertToolAccess, requireToolAccess } from "@/lib/auth/authz";
import type { Profile } from "@/lib/auth/session";
import type { Tool } from "@/lib/tools";
import { normalizeToolRole, type RoadmapRole } from "./roles";

export const ROADMAP_TOOL_KEY = "roadmap";

export interface RoadmapContext {
  profile: Profile;
  tool: Tool;
  role: RoadmapRole;
  isCurator: boolean;
  isAdministrator: boolean;
}

/**
 * Unlike Editorial's equivalent, the role lookup never decides *entry* — the
 * registry row is approved_staff, so requireToolAccess/assertToolAccess already
 * admit every active staff member (see lib/tool-access-rules.ts). A grant only
 * ever adds curation. RLS and the rd_posts guard trigger are the real boundary;
 * this decides which controls to render.
 */
async function lookupRole(profile: Profile, tool: Tool): Promise<RoadmapRole> {
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

function contextFor(profile: Profile, tool: Tool, role: RoadmapRole): RoadmapContext {
  const isAdministrator = profile.platform_role === "administrator";
  return {
    profile,
    tool,
    role,
    // An administrator curates too: they are the only ones who can promote a
    // proposal into a registry row, and the guard trigger admits them for the
    // same reason.
    isCurator: role === "curator" || isAdministrator,
    isAdministrator,
  };
}

/** Page gate for everything under /roadmap, layered on requireToolAccess(). */
export async function requireRoadmapAccess(): Promise<RoadmapContext> {
  const { profile, tool } = await requireToolAccess(ROADMAP_TOOL_KEY);
  return contextFor(profile, tool, await lookupRole(profile, tool));
}

/** Server-action gate; throws instead of redirecting, mirroring assertToolAccess. */
export async function assertRoadmapAccess(): Promise<RoadmapContext> {
  const { profile, tool } = await assertToolAccess(ROADMAP_TOOL_KEY);
  return contextFor(profile, tool, await lookupRole(profile, tool));
}

/**
 * For the curation actions. Throws rather than redirecting even though the
 * screens hide these controls — the buttons are a courtesy, the guard trigger
 * on rd_posts is the boundary, and this is the layer in between.
 */
export async function assertRoadmapCurator(): Promise<RoadmapContext> {
  const context = await assertRoadmapAccess();
  if (!context.isCurator) throw new ForbiddenError();
  return context;
}

/** Page gate for a screen only a curator should reach. */
export async function requireRoadmapCurator(): Promise<RoadmapContext> {
  const context = await requireRoadmapAccess();
  if (!context.isCurator) redirect("/roadmap");
  return context;
}
