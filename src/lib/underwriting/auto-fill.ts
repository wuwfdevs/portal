import "server-only";
import { createClient } from "@/lib/supabase/server";
import { listPlaceableRundownBreaks, placeCredit } from "./placement";
import {
  getScheduleLineAutoFillDemand,
  listCopyLinkedToContracts,
  listPlacementsForScheduleLine,
  listScheduleLinesWithActiveContracts,
  type UwContractScheduleLineRow,
} from "./queries";
import { planAutoFill, type AutoFillBreakCandidate, type AutoFillCopyCandidate } from "./auto-fill-plan";

/**
 * Execution side of the rules-based scheduler (docs/underwriting-design.md
 * §7 "Automatic rules-based scheduling"). Every planned item
 * (lib/underwriting/auto-fill-plan.ts) is written through the exact same
 * log_place_underwriting_credit() RPC the manual "Place a credit" form
 * calls — never an override, since auto-fill only ever selects approved,
 * in-date copy in the first place (§6: override support stays a UI-only
 * judgment call, deliberately not something the scheduler exercises).
 */

export interface AutoFillResult {
  placedCount: number;
  makegoodsResolvedCount: number;
  skippedBreakIds: string[];
  demandExceedsSupply: boolean;
  errors: string[];
}

const EMPTY_RESULT: AutoFillResult = {
  placedCount: 0,
  makegoodsResolvedCount: 0,
  skippedBreakIds: [],
  demandExceedsSupply: false,
  errors: [],
};

/** Runs the scheduler for one schedule line: gathers its current demand and eligible open breaks, plans an assignment, then executes it. */
export async function autoFillScheduleLine(scheduleLine: UwContractScheduleLineRow): Promise<AutoFillResult> {
  const [demand, placeable, placements, copyByContract] = await Promise.all([
    getScheduleLineAutoFillDemand(scheduleLine),
    listPlaceableRundownBreaks(scheduleLine.id),
    listPlacementsForScheduleLine(scheduleLine.id),
    listCopyLinkedToContracts([scheduleLine.contract_id]),
  ]);

  if (!placeable.ok) {
    return { ...EMPTY_RESULT, errors: [placeable.message] };
  }
  if (placeable.breaks.length === 0) {
    return EMPTY_RESULT;
  }

  // Rotation fairness is seeded from every currently-active placement on
  // this line, not just ones this pass adds — a superseded (cleared)
  // placement's copy usage isn't counted, matching that it's no longer a
  // live commitment.
  const usageCounts = new Map<string, number>();
  for (const placement of placements) {
    usageCounts.set(placement.copy_id, (usageCounts.get(placement.copy_id) ?? 0) + 1);
  }

  const copyCandidates: AutoFillCopyCandidate[] = (copyByContract.get(scheduleLine.contract_id) ?? []).map((copy) => ({
    id: copy.id,
    approvalStatus: copy.approval_status,
    durationSeconds: copy.duration_seconds,
    effectiveFrom: copy.effective_from,
    effectiveTo: copy.effective_to,
    existingUsageCount: usageCounts.get(copy.id) ?? 0,
  }));

  const breakCandidates: AutoFillBreakCandidate[] = placeable.breaks.map((brk) => ({
    breakId: brk.break_id,
    airDate: brk.air_date,
    remainingSeconds: brk.remaining_seconds,
  }));

  const plan = planAutoFill(
    breakCandidates,
    { awaitingSlotMakegoodIds: demand.awaitingSlotMakegoodIds, freshOccurrencesNeeded: demand.freshOccurrencesNeeded },
    copyCandidates,
  );

  const supabase = await createClient();
  let placedCount = 0;
  let makegoodsResolvedCount = 0;
  const errors: string[] = [];

  for (const item of plan.items) {
    const result = await placeCredit({ breakId: item.breakId, scheduleLineId: scheduleLine.id, copyId: item.copyId });
    if (!result.ok) {
      errors.push(result.message);
      continue;
    }
    placedCount++;

    if (item.makegoodId) {
      // Mirrors makegood-actions.ts's scheduleMakegoodAction: record the
      // new placement against the makegood it resolves.
      const { data: placementRow } = await supabase
        .from("uw_scheduled_placements")
        .select("scheduled_at")
        .eq("id", result.placementId)
        .maybeSingle();
      const { error } = await supabase
        .from("uw_makegoods")
        .update({ scheduled_placement_id: result.placementId, scheduled_for: placementRow?.scheduled_at ?? null })
        .eq("id", item.makegoodId);
      if (error) {
        errors.push(`Placed the credit, but could not record it against its makegood: ${error.message}`);
      } else {
        makegoodsResolvedCount++;
      }
    }
  }

  return {
    placedCount,
    makegoodsResolvedCount,
    skippedBreakIds: plan.skippedBreakIds,
    demandExceedsSupply: plan.demandExceedsSupply,
    errors,
  };
}

export interface AutoFillAllResult {
  perLine: { scheduleLine: UwContractScheduleLineRow; result: AutoFillResult }[];
  totals: AutoFillResult;
}

/**
 * Runs auto-fill across every schedule line under an active contract —
 * Workflow D's dashboard, one click. Sequential, not parallel: two lines
 * racing for the same open break is a real possibility (e.g. two different
 * underwriters both eligible for one generic local avail), and
 * log_list_placeable_rundown_breaks() reads live occupancy at call time, so
 * running lines one after another is what keeps that correct.
 */
export async function autoFillActiveScheduleLines(): Promise<AutoFillAllResult> {
  const scheduleLines = await listScheduleLinesWithActiveContracts();
  const perLine: { scheduleLine: UwContractScheduleLineRow; result: AutoFillResult }[] = [];

  for (const scheduleLine of scheduleLines) {
    const result = await autoFillScheduleLine(scheduleLine);
    perLine.push({ scheduleLine, result });
  }

  const totals = perLine.reduce<AutoFillResult>(
    (acc, { result }) => ({
      placedCount: acc.placedCount + result.placedCount,
      makegoodsResolvedCount: acc.makegoodsResolvedCount + result.makegoodsResolvedCount,
      skippedBreakIds: [...acc.skippedBreakIds, ...result.skippedBreakIds],
      demandExceedsSupply: acc.demandExceedsSupply || result.demandExceedsSupply,
      errors: [...acc.errors, ...result.errors],
    }),
    { ...EMPTY_RESULT },
  );

  return { perLine, totals };
}
