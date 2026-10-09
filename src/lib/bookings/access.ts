import "server-only";
import { lookupToolGrant } from "@/lib/auth/tool-grant";
import { isPlatformAdministrator } from "@/lib/auth/predicates";
import { ForbiddenError, assertToolAccess, requireToolAccess } from "@/lib/auth/authz";
import type { Profile } from "@/lib/auth/session";
import type { Tool } from "@/lib/tools";
import { parseBookingsRoles, type BookingsRole } from "./roles";

export const BOOKINGS_TOOL_KEY = "bookings";

export interface BookingsContext {
  profile: Profile;
  tool: Tool;
  roles: BookingsRole[];
  /** UI hints; the private.is_bookings_*() predicates are the boundary. */
  isProduction: boolean;
  isDirector: boolean;
  isFinance: boolean;
  isExecutive: boolean;
  isAdministrator: boolean;
}

async function lookupRoles(profile: Profile, tool: Tool): Promise<BookingsRole[]> {
  return parseBookingsRoles((await lookupToolGrant(profile, tool)).roles);
}

function contextFor(profile: Profile, tool: Tool, roles: BookingsRole[]): BookingsContext {
  const isAdministrator = isPlatformAdministrator(profile);
  return {
    profile,
    tool,
    roles,
    isProduction: roles.includes("production") || isAdministrator,
    isDirector: roles.includes("director") || isAdministrator,
    isFinance: roles.includes("finance") || isAdministrator,
    isExecutive: roles.includes("executive") || isAdministrator,
    isAdministrator,
  };
}

/** Page gate for everything under /bookings, layered on requireToolAccess(). */
export async function requireBookingsAccess(): Promise<BookingsContext> {
  const { profile, tool } = await requireToolAccess(BOOKINGS_TOOL_KEY);
  return contextFor(profile, tool, await lookupRoles(profile, tool));
}

/** Server-action gate; throws instead of redirecting, mirroring assertToolAccess. */
export async function assertBookingsAccess(): Promise<BookingsContext> {
  const { profile, tool } = await assertToolAccess(BOOKINGS_TOOL_KEY);
  return contextFor(profile, tool, await lookupRoles(profile, tool));
}

/** Rate model writes: assumptions, pools, packages, versions. is_bookings_finance() is the boundary. */
export async function assertBookingsFinance(): Promise<BookingsContext> {
  const context = await assertBookingsAccess();
  if (!context.isFinance) throw new ForbiddenError();
  return context;
}

/** Adopting a rate card version. is_bookings_executive() is the boundary (a guard trigger). */
export async function assertBookingsExecutive(): Promise<BookingsContext> {
  const context = await assertBookingsAccess();
  if (!context.isExecutive) throw new ForbiddenError();
  return context;
}

/** The term plan, its resources, blackouts and holds. is_bookings_director() is the boundary. */
export async function assertBookingsDirector(): Promise<BookingsContext> {
  const context = await assertBookingsAccess();
  if (!context.isDirector) throw new ForbiddenError();
  return context;
}

/** Booking a window: production staff or the director (the executive, for an exception). */
export async function assertBookingsScheduler(): Promise<BookingsContext> {
  const context = await assertBookingsAccess();
  if (!context.isProduction && !context.isDirector && !context.isExecutive) {
    throw new ForbiddenError();
  }
  return context;
}

/** The asset inventory: the director's resources, priced by finance — either may keep it. */
export async function assertBookingsAssetWriter(): Promise<BookingsContext> {
  const context = await assertBookingsAccess();
  if (!context.isFinance && !context.isDirector) throw new ForbiddenError();
  return context;
}

/** The public intake form's settings: whether WUWF is taking requests and what it offers — the director's or the executive's. */
export async function assertBookingsIntakeEditor(): Promise<BookingsContext> {
  const context = await assertBookingsAccess();
  if (!context.isDirector && !context.isExecutive) throw new ForbiddenError();
  return context;
}

/** Keeping or releasing a reserved block, and ending an agreement: the director's or the executive's (§6.1). */
export async function assertBookingsBlockKeeper(): Promise<BookingsContext> {
  const context = await assertBookingsAccess();
  if (!context.isDirector && !context.isExecutive) throw new ForbiddenError();
  return context;
}
