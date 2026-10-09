import "server-only";
import { redirect } from "next/navigation";
import { lookupToolGrant } from "@/lib/auth/tool-grant";
import { isPlatformAdministrator } from "@/lib/auth/predicates";
import { ForbiddenError, assertToolAccess, requireToolAccess } from "@/lib/auth/authz";
import type { Profile } from "@/lib/auth/session";
import type { Tool } from "@/lib/tools";
import { parseLogRoles, type LogRole } from "./roles";

export const LOG_TOOL_KEY = "log";

export interface LogContext {
  profile: Profile;
  tool: Tool;
  roles: LogRole[];
  /** Clocks, schedule, programs, automated hours. UI hint; private.is_log_producer() is the boundary. */
  isProgramDirector: boolean;
  /** Station ID pins and the DAD log release. UI hint; private.is_log_traffic() is the boundary. */
  isTraffic: boolean;
  isAdministrator: boolean;
}

async function lookupRoles(profile: Profile, tool: Tool): Promise<LogRole[]> {
  return parseLogRoles((await lookupToolGrant(profile, tool)).roles);
}

function contextFor(profile: Profile, tool: Tool, roles: LogRole[]): LogContext {
  const isAdministrator = isPlatformAdministrator(profile);
  return {
    profile,
    tool,
    roles,
    isProgramDirector: roles.includes("program_director") || isAdministrator,
    isTraffic: roles.includes("traffic") || isAdministrator,
    isAdministrator,
  };
}

/** Page gate for everything under /log, layered on requireToolAccess(). */
export async function requireLogAccess(): Promise<LogContext> {
  const { profile, tool } = await requireToolAccess(LOG_TOOL_KEY);
  return contextFor(profile, tool, await lookupRoles(profile, tool));
}

/** Server-action gate; throws instead of redirecting, mirroring assertToolAccess. */
export async function assertLogAccess(): Promise<LogContext> {
  const { profile, tool } = await assertToolAccess(LOG_TOOL_KEY);
  return contextFor(profile, tool, await lookupRoles(profile, tool));
}

/**
 * For clock/schedule/program/automated-hours write actions. Throws rather
 * than redirecting even though the screen hides these controls — the buttons
 * are a courtesy, the is_log_producer() RLS predicate is the boundary, and
 * this is the layer in between.
 */
export async function assertProgramDirector(): Promise<LogContext> {
  const context = await assertLogAccess();
  if (!context.isProgramDirector) throw new ForbiddenError();
  return context;
}

/** Page gate for a screen only a program director should reach. */
export async function requireProgramDirector(): Promise<LogContext> {
  const context = await requireLogAccess();
  if (!context.isProgramDirector) redirect("/log");
  return context;
}

/** For the DAD log release; is_log_traffic() is the boundary. */
export async function assertLogTraffic(): Promise<LogContext> {
  const context = await assertLogAccess();
  if (!context.isTraffic) throw new ForbiddenError();
  return context;
}

/** For pinning station IDs and other required content: program director or traffic. */
export async function assertCanPinContent(): Promise<LogContext> {
  const context = await assertLogAccess();
  if (!context.isProgramDirector && !context.isTraffic) throw new ForbiddenError();
  return context;
}
