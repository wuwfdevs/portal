// Pure content-eligibility filtering — no Supabase import, colocated test.
// Decides which approved content library items a host is even offered for a
// given local-opportunity break (docs/log-design.md §11.2: "eligible
// existing content"). Deliberately does not filter by whether an item's
// duration fits the break's remaining time — that's a warning
// lib/log/timing.ts surfaces, not a reason to hide the item; a host may
// still choose to trim live or accept a short underrun, matching §1.2's
// "human control during live radio."

import type { LogContentType } from "@/lib/database.types";

export interface EligibilityBreakLike {
  permitted_content_types: string[];
}

export interface EligibilityContentItemLike {
  content_type: LogContentType;
  approval_status: string;
  effective_from: string;
  effective_to: string | null;
}

/**
 * Whether `item` may fill `brk` airing on `airDateISO`. All three
 * conditions — approved, permitted content type, and effective on the air
 * date — must hold. Content is never restricted to specific programs: an
 * earlier `eligible_program_ids` field modeled that, but no real WUWF
 * content turned out to need it, so it was removed (see CLAUDE.md's Log
 * content-library field trim).
 */
export function isContentItemEligibleForSlot(
  item: EligibilityContentItemLike,
  brk: EligibilityBreakLike,
  airDateISO: string,
): boolean {
  if (item.approval_status !== "approved") return false;
  if (!brk.permitted_content_types.includes(item.content_type)) return false;
  if (item.effective_from > airDateISO) return false;
  if (item.effective_to !== null && item.effective_to < airDateISO) return false;
  return true;
}

export function filterEligibleContent<T extends EligibilityContentItemLike>(
  items: T[],
  brk: EligibilityBreakLike,
  airDateISO: string,
): T[] {
  return items.filter((item) => isContentItemEligibleForSlot(item, brk, airDateISO));
}
