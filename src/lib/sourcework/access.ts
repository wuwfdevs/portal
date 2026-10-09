import "server-only";
import { lookupToolGrant } from "@/lib/auth/tool-grant";
import { isPlatformAdministrator } from "@/lib/auth/predicates";
import { ForbiddenError, assertToolAccess, requireToolAccess } from "@/lib/auth/authz";
import type { Profile } from "@/lib/auth/session";
import type { Tool } from "@/lib/tools";
import { parseSourceworkRoles, type SourceworkRole } from "./roles";

export const SOURCEWORK_TOOL_KEY = "transcription";

export interface SourceworkContext {
  profile: Profile;
  tool: Tool;
  roles: SourceworkRole[];
  /** UI hint only — the real boundary is private.is_sourcework_editor() in the prompt tables' policies. */
  isEditor: boolean;
}

async function contextFor(profile: Profile, tool: Tool): Promise<SourceworkContext> {
  const roles = parseSourceworkRoles((await lookupToolGrant(profile, tool)).roles);
  return { profile, tool, roles, isEditor: roles.includes("editor") || isPlatformAdministrator(profile) };
}

/** Page gate for a screen that needs to know whether the viewer is an editor. */
export async function requireSourceworkContext(): Promise<SourceworkContext> {
  const { profile, tool } = await requireToolAccess(SOURCEWORK_TOOL_KEY);
  return contextFor(profile, tool);
}

/** Action/route gate: tool access, throwing instead of redirecting. */
export async function assertSourceworkContext(): Promise<SourceworkContext> {
  const { profile, tool } = await assertToolAccess(SOURCEWORK_TOOL_KEY);
  return contextFor(profile, tool);
}

/** Action/route gate for editing, trying and publishing prompts. */
export async function assertSourceworkEditor(): Promise<SourceworkContext> {
  const context = await assertSourceworkContext();
  if (!context.isEditor) throw new ForbiddenError();
  return context;
}

/** Page gate for the Editors screens; a non-editor gets the same 404 an unknown page would. */
export async function requireSourceworkEditor(): Promise<SourceworkContext | null> {
  const context = await requireSourceworkContext();
  return context.isEditor ? context : null;
}
