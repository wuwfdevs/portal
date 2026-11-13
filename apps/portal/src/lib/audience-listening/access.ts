import "server-only";
import { lookupToolGrant } from "@/lib/auth/tool-grant";
import { isPlatformAdministrator } from "@/lib/auth/predicates";
import { ForbiddenError, assertToolAccess, requireToolAccess } from "@/lib/auth/authz";
import type { Profile } from "@/lib/auth/session";
import type { Tool } from "@/lib/tools";
import { parseAudienceListeningRoles, type AudienceListeningRole } from "./roles";

export const AUDIENCE_LISTENING_TOOL_KEY = "audience-listening";

export interface AudienceListeningContext {
  profile: Profile;
  tool: Tool;
  roles: AudienceListeningRole[];
  /** UI hint only. The boundary is private.is_audience_listening_coordinator() and the guard trigger on al_events. */
  isCoordinator: boolean;
}

async function contextFor(profile: Profile, tool: Tool): Promise<AudienceListeningContext> {
  const roles = parseAudienceListeningRoles((await lookupToolGrant(profile, tool)).roles);
  return { profile, tool, roles, isCoordinator: roles.includes("coordinator") || isPlatformAdministrator(profile) };
}

/** Page gate for a screen that needs to know whether the viewer is a coordinator. */
export async function requireAudienceListeningContext(): Promise<AudienceListeningContext> {
  const { profile, tool } = await requireToolAccess(AUDIENCE_LISTENING_TOOL_KEY);
  return contextFor(profile, tool);
}

/** Action gate: tool access, throwing instead of redirecting. */
export async function assertAudienceListeningContext(): Promise<AudienceListeningContext> {
  const { profile, tool } = await assertToolAccess(AUDIENCE_LISTENING_TOOL_KEY);
  return contextFor(profile, tool);
}

/** Action gate for approving or declining a public event. */
export async function assertAudienceListeningCoordinator(): Promise<AudienceListeningContext> {
  const context = await assertAudienceListeningContext();
  if (!context.isCoordinator) throw new ForbiddenError();
  return context;
}
