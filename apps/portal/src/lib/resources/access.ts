import "server-only";
import { redirect } from "next/navigation";
import { lookupToolGrant } from "@/lib/auth/tool-grant";
import { isPlatformAdministrator } from "@/lib/auth/predicates";
import { ForbiddenError, assertToolAccess, requireToolAccess } from "@/lib/auth/authz";
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
  return normalizeToolRole((await lookupToolGrant(profile, tool)).role);
}

function contextFor(profile: Profile, tool: Tool, role: ResourcesRole): ResourcesContext {
  return {
    profile,
    tool,
    role,
    // An administrator edits too, matching private.is_resources_editor().
    isEditor: role === "editor" || isPlatformAdministrator(profile),
  };
}

/** Page gate for everything under /resources, layered on requireToolAccess(). */
export async function requireResourcesAccess(): Promise<ResourcesContext> {
  const { profile, tool } = await requireToolAccess(RESOURCES_TOOL_KEY);
  return contextFor(profile, tool, await lookupRole(profile, tool));
}

/** Page gate for the editing screens; a reader is sent back to /resources. */
export async function requireResourcesEditor(): Promise<ResourcesContext> {
  const context = await requireResourcesAccess();
  if (!context.isEditor) redirect("/resources");
  return context;
}

/** Server-action gate for reads (the Help panel); throws instead of redirecting. */
export async function assertResourcesAccess(): Promise<ResourcesContext> {
  const { profile, tool } = await assertToolAccess(RESOURCES_TOOL_KEY);
  return contextFor(profile, tool, await lookupRole(profile, tool));
}

/**
 * Server-action gate for writes. Throws rather than redirecting; the RLS
 * policies on rc_articles/rc_media and the storage bucket are the boundary,
 * and this is the layer in front of them.
 */
export async function assertResourcesEditor(): Promise<ResourcesContext> {
  const { profile, tool } = await assertToolAccess(RESOURCES_TOOL_KEY);
  const context = contextFor(profile, tool, await lookupRole(profile, tool));
  if (!context.isEditor) throw new ForbiddenError();
  return context;
}
