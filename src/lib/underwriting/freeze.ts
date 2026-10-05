// Frozen rundowns (docs/underwriting-traffic-redesign.md §10). Pure, tested.
// Automated writes — auto-fill, rundown provisioning, and bumping — never
// add, move or clear a credit in a rundown that is live or already
// submitted, nor in a break whose start has already passed: the log is
// the host's once the broadcast starts, and the as-aired record after it.
// Host actions (fill, move, aired/missed, relocate) and a traffic
// staffer's own manual placement are not automation and stay
// unrestricted. This is the TypeScript twin of the SQL guard's
// uw_automation_block() (20260925190000) — keep them in step: the planner
// filters with this, the database refuses with that.
//
// A second rule applies to *adding* a credit only (auto-fill's and
// bumping's destination, never a clear or a copy swap): hours closed to
// underwriting (lib/log/underwriting-hours.ts, 20261005130000). Its SQL
// twin is the hours_closed check in log_place_underwriting_credit(), not
// uw_automation_block(), because automation must still be able to clear a
// credit a staffer placed by hand into closed hours.

import type { LogRundownStatus } from "@/lib/database.types";

export const FROZEN_RUNDOWN_STATUSES: readonly LogRundownStatus[] = ["in_progress", "submitted"];

export type AutomationBlock = "rundown_frozen" | "break_in_past";

export function isRundownFrozen(status: LogRundownStatus): boolean {
  return FROZEN_RUNDOWN_STATUSES.includes(status);
}

/** A break whose scheduled start is at or before `nowISO` — already on air or gone. */
export function isBreakInPast(scheduledAtISO: string, nowISO: string): boolean {
  return Date.parse(scheduledAtISO) <= Date.parse(nowISO);
}

export type AutomationPlacementBlock = AutomationBlock | "hours_closed";

export interface FreezeCheckBreak {
  rundownStatus: LogRundownStatus;
  scheduledAt: string;
  /** The break starts in hours closed to underwriting (isClosedToUnderwriting); automation never adds a credit there. */
  closedToUnderwriting?: boolean;
}

/** Why automation may not write into this break, or null when it may. */
export function automationBlockFor(brk: FreezeCheckBreak, nowISO: string): AutomationBlock | null {
  if (isRundownFrozen(brk.rundownStatus)) return "rundown_frozen";
  if (isBreakInPast(brk.scheduledAt, nowISO)) return "break_in_past";
  return null;
}

/** Why automation may not add a credit to this break, or null when it may: the freeze rule, then the hours closed to underwriting. */
export function automationPlacementBlockFor(
  brk: FreezeCheckBreak,
  nowISO: string,
): AutomationPlacementBlock | null {
  const block = automationBlockFor(brk, nowISO);
  if (block) return block;
  if (brk.closedToUnderwriting) return "hours_closed";
  return null;
}
