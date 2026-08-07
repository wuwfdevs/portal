// Pure content-eligibility filtering — no Supabase import, colocated test.
// Decides which approved content library items a host is even offered for a
// given clock slot (docs/log-design.md §11.2: "eligible existing content").
// Deliberately does not filter by whether an item's duration fits the
// slot — that's a warning lib/log/timing.ts surfaces, not a reason to hide
// the item; a host may still choose to trim live or accept a short
// underrun, matching §1.2's "human control during live radio."

import type { LogContentType } from "@/lib/database.types";

export interface EligibilitySlotLike {
  permitted_content_types: string[];
}

export interface EligibilityContentItemLike {
  content_type: LogContentType;
  approval_status: string;
  effective_from: string;
  effective_to: string | null;
  eligible_program_ids: string[];
}

/**
 * Whether `item` may fill `slot` for a broadcast of `programId` airing on
 * `airDateISO`. All four conditions — approved, permitted content type,
 * effective on the air date, and (if the item restricts itself) eligible for
 * this program — must hold.
 */
export function isContentItemEligibleForSlot(
  item: EligibilityContentItemLike,
  slot: EligibilitySlotLike,
  programId: string,
  airDateISO: string,
): boolean {
  if (item.approval_status !== "approved") return false;
  if (!slot.permitted_content_types.includes(item.content_type)) return false;
  if (item.effective_from > airDateISO) return false;
  if (item.effective_to !== null && item.effective_to < airDateISO) return false;
  if (item.eligible_program_ids.length > 0 && !item.eligible_program_ids.includes(programId)) return false;
  return true;
}

export function filterEligibleContent<T extends EligibilityContentItemLike>(
  items: T[],
  slot: EligibilitySlotLike,
  programId: string,
  airDateISO: string,
): T[] {
  return items.filter((item) => isContentItemEligibleForSlot(item, slot, programId, airDateISO));
}
