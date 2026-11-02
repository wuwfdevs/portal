// Pure logic for Workflow F (docs/underwriting-design.md) — deriving the
// makegoods list page's display state from uw_makegoods' own three-value
// status column plus scheduled_placement_id, rather than storing a fourth
// "awaiting a slot" status. See the migration file header
// (20260807240000_underwriting_makegoods.sql) for why the schema is shaped
// this way.

import type { UwMakegoodStatus } from "@/lib/database.types";

export type MakegoodDisplayState = "awaiting_slot" | "slot_scheduled" | "aired" | "cancelled";

export interface MakegoodStateInput {
  status: UwMakegoodStatus;
  scheduled_placement_id: string | null;
}

export function describeMakegoodState(makegood: MakegoodStateInput): MakegoodDisplayState {
  if (makegood.status === "aired") return "aired";
  if (makegood.status === "cancelled") return "cancelled";
  return makegood.scheduled_placement_id === null ? "awaiting_slot" : "slot_scheduled";
}

export const MAKEGOOD_STATE_LABEL: Record<MakegoodDisplayState, string> = {
  awaiting_slot: "Awaiting a slot",
  slot_scheduled: "Slot scheduled",
  aired: "Aired",
  cancelled: "Cancelled",
};
