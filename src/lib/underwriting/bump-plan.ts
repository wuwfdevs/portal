// Bumping a movable credit to seat a constrained one
// (docs/underwriting-traffic-redesign.md §10). Pure: no Supabase import,
// colocated tests. When a fixed-position unit — an exact time, a program's
// opening or closing avail — finds every eligible break full, this looks
// for one movable credit (a window, preferred or any line's placement) in
// one of those breaks that has another legal home in its own demand
// bucket, and plans a single move: relocate that credit, then seat the
// constrained unit in the room it leaves. One hop, never a chain; a
// makegood placement, an aired credit, a credit with any recorded outcome,
// and anything in a frozen rundown or a past break are never moved. When
// no clean move exists nothing moves, and the unit is reported as a named
// capacity conflict for staff. Host content (promos, PSAs) is never
// displaced — an open policy question, so a break full of it is reported
// as exactly that. The execution side (auto-fill.ts) carries the move
// through log_bump_underwriting_credit(), which re-runs every contractual
// check; this module only chooses.

import type { UwServiceLevel, UwTimeMode } from "@/lib/database.types";
import { isFixedPosition } from "./fill-order";
import { automationBlockFor } from "./freeze";
import type { CandidateBreak } from "./inventory-selection";

/** One item currently sitting in a break, as log_list_placeable_rundown_breaks() reports it. Placement fields are null for host content. */
export interface BreakItemLike {
  itemId: string;
  position: number;
  durationSeconds: number;
  placementId: string | null;
  scheduleLineId: string | null;
  contractId: string | null;
  underwriterId: string | null;
  categoryId: string | null;
  timeMode: UwTimeMode | null;
  serviceLevel: UwServiceLevel | null;
  makegoodId: string | null;
  bucketId: string | null;
  /** Any broadcast event recorded against the item — aired, missed, moved. */
  hasOutcome: boolean;
}

export interface BumpBreak extends CandidateBreak {
  items: BreakItemLike[];
}

/** The constrained unit that could not be seated. */
export interface BumpUnit {
  scheduleLineId: string;
  bucketId: string;
  contractId: string;
  underwriterId: string;
  categoryId: string | null;
  /** The shortest approved copy the unit could air — the room it needs. */
  copyDurationSeconds: number;
}

export interface BumpMove {
  placementId: string;
  itemId: string;
  movedScheduleLineId: string;
  movedContractId: string;
  fromBreakId: string;
  toBreakId: string;
  /** The break the constrained unit is seated in once the move clears it — always fromBreakId. */
  seatBreakId: string;
}

export type CapacityConflictReason =
  /** No eligible break at all, or every one is frozen or holds this contract. */
  | "no_eligible_break"
  /** The eligible breaks are full of host content only — never displaced (open policy question). */
  | "host_content_only"
  /** The eligible breaks hold only fixed credits (exact/opening/closing, makegoods, aired). */
  | "no_movable_credit"
  /** A movable credit exists, but has no legal home elsewhere in its own bucket. */
  | "no_legal_alternative";

export interface CapacityConflict {
  scheduleLineId: string;
  bucketId: string;
  reason: CapacityConflictReason;
  /** The breaks considered. */
  breakIds: string[];
}

export type BumpPlan =
  { kind: "bump"; move: BumpMove } | { kind: "conflict"; conflict: CapacityConflict };

/** A placed credit that automation may move: a window/preferred/any line's fresh placement with no outcome yet. */
export function isMovableCredit(item: BreakItemLike): boolean {
  return (
    item.placementId !== null &&
    item.scheduleLineId !== null &&
    item.timeMode !== null &&
    !isFixedPosition({ time_mode: item.timeMode }) &&
    item.makegoodId === null &&
    !item.hasOutcome
  );
}

function sameIdentity(
  a: { underwriterId: string | null; categoryId: string | null },
  b: { underwriterId: string | null; categoryId: string | null },
): boolean {
  if (a.underwriterId !== null && a.underwriterId === b.underwriterId) return true;
  if (a.categoryId !== null && a.categoryId === b.categoryId) return true;
  return false;
}

/** The item that would hold the break's highest position once `removed` leaves it. */
function lastItemWithout(items: BreakItemLike[], removed: BreakItemLike): BreakItemLike | null {
  return (
    items
      .filter((item) => item.itemId !== removed.itemId)
      .sort((a, b) => b.position - a.position)[0] ?? null
  );
}

/**
 * Plans one move that seats `unit` in one of `breaks` (every break eligible
 * for its line, full or not). `alternativesByLine` maps a movable credit's
 * schedule line to that line's own eligible breaks, as
 * log_list_placeable_rundown_breaks() reports them.
 */
export function planBump(
  unit: BumpUnit,
  breaks: BumpBreak[],
  alternativesByLine: Map<string, CandidateBreak[]>,
  nowISO: string,
): BumpPlan {
  const eligible = breaks.filter(
    (brk) => automationBlockFor(brk, nowISO) === null && !brk.holdsThisContract,
  );
  const breakIds = eligible.map((brk) => brk.breakId);
  const conflict = (reason: CapacityConflictReason): BumpPlan => ({
    kind: "conflict",
    conflict: { scheduleLineId: unit.scheduleLineId, bucketId: unit.bucketId, reason, breakIds },
  });
  if (eligible.length === 0) return conflict("no_eligible_break");

  interface Option {
    brk: BumpBreak;
    item: BreakItemLike;
    alternatives: CandidateBreak[];
  }
  const options: Option[] = [];
  let sawMovable = false;
  let sawCredit = false;

  for (const brk of eligible) {
    for (const item of brk.items) {
      if (item.placementId !== null) sawCredit = true;
      if (!isMovableCredit(item)) continue;
      sawMovable = true;
      if (brk.remainingSeconds + item.durationSeconds < unit.copyDurationSeconds) continue;
      const newLast = lastItemWithout(brk.items, item);
      if (newLast && sameIdentity(newLast, unit)) continue;
      const alternatives = (alternativesByLine.get(item.scheduleLineId!) ?? []).filter(
        (alt) =>
          alt.breakId !== brk.breakId &&
          alt.bucketId === item.bucketId &&
          alt.remainingSeconds >= item.durationSeconds &&
          automationBlockFor(alt, nowISO) === null &&
          !alt.holdsThisContract &&
          !sameIdentity(
            { underwriterId: alt.lastItemUnderwriterId, categoryId: alt.lastItemCategoryId },
            item,
          ),
      );
      if (alternatives.length === 0) continue;
      options.push({ brk, item, alternatives });
    }
  }

  if (options.length === 0) {
    if (sawMovable) return conflict("no_legal_alternative");
    if (sawCredit) return conflict("no_movable_credit");
    return conflict(
      eligible.some((brk) => brk.items.length > 0) ? "host_content_only" : "no_movable_credit",
    );
  }

  // Prefer moving bonus over guaranteed, then the credit with the most
  // alternatives; then the earliest break, for determinism.
  options.sort(
    (a, b) =>
      (a.item.serviceLevel === "bonus" ? 0 : 1) - (b.item.serviceLevel === "bonus" ? 0 : 1) ||
      b.alternatives.length - a.alternatives.length ||
      a.brk.airDate.localeCompare(b.brk.airDate) ||
      a.brk.minutesOfDay - b.brk.minutesOfDay ||
      a.brk.breakId.localeCompare(b.brk.breakId) ||
      a.item.position - b.item.position,
  );
  const chosen = options[0]!;
  // The new home closest to where the credit was: same day first, nearest
  // time, then the earliest date.
  const destination = [...chosen.alternatives].sort(
    (a, b) =>
      (a.airDate === chosen.brk.airDate ? 0 : 1) - (b.airDate === chosen.brk.airDate ? 0 : 1) ||
      a.airDate.localeCompare(b.airDate) ||
      Math.abs(a.minutesOfDay - chosen.brk.minutesOfDay) -
        Math.abs(b.minutesOfDay - chosen.brk.minutesOfDay) ||
      a.breakId.localeCompare(b.breakId),
  )[0]!;

  return {
    kind: "bump",
    move: {
      placementId: chosen.item.placementId!,
      itemId: chosen.item.itemId,
      movedScheduleLineId: chosen.item.scheduleLineId!,
      movedContractId: chosen.item.contractId ?? "",
      fromBreakId: chosen.brk.breakId,
      toBreakId: destination.breakId,
      seatBreakId: chosen.brk.breakId,
    },
  };
}

export const CAPACITY_CONFLICT_LABEL: Record<CapacityConflictReason, string> = {
  no_eligible_break: "no eligible break is open to automation",
  host_content_only: "its only eligible breaks are full of host content, which is never displaced",
  no_movable_credit: "its only eligible breaks hold fixed credits that cannot be moved",
  no_legal_alternative: "a credit could make room, but has no other legal break in its own period",
};
