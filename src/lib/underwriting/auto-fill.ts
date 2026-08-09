import "server-only";
import { createClient } from "@/lib/supabase/server";
import { stationTodayISO } from "@/lib/log/timezone";
import { listPlaceableRundownBreaks, placeCredit } from "./placement";
import { minutesOfDayInStationTime, provisionRundownsForDates } from "./rundown-provisioning";
import {
  getContract,
  getScheduleLineAutoFillDemand,
  getUnderwriter,
  listCopyLinkedToContracts,
  listPlacementsForScheduleLine,
  listScheduleLinesWithActiveContracts,
  resolveLastItemAdjacency,
  type UwContractScheduleLineRow,
} from "./queries";
import { remainingOccurrenceDates } from "./schedule-lines";
import {
  planAutoFill,
  type AutoFillBreakCandidate,
  type AutoFillCopyCandidate,
  type AutoFillDemand,
  type AutoFillSkippedBreak,
} from "./auto-fill-plan";

/**
 * Execution side of the rules-based scheduler (docs/underwriting-design.md
 * §7 "Automatic rules-based scheduling"). Every planned item
 * (lib/underwriting/auto-fill-plan.ts) is written through the exact same
 * log_place_underwriting_credit() RPC the manual "Place a credit" form
 * calls — never an override, since auto-fill only ever selects approved,
 * in-date copy in the first place (§6: override support stays a UI-only
 * judgment call, deliberately not something the scheduler exercises).
 *
 * Rundowns get provisioned as credits are actually scheduled against them,
 * not as a separate pre-pass sized by its own independent guess at what a
 * schedule line's campaign needs: autoFillScheduleLine() plans against
 * whatever inventory already exists first (the "probe" plan below), and
 * only ever asks lib/underwriting/rundown-provisioning.ts for exactly the
 * additional days that first plan is still short — never more, never a
 * number computed some other way. See that module's own header for why
 * this replaced an earlier, separately-sized version.
 */

export interface AutoFillResult {
  placedCount: number;
  makegoodsResolvedCount: number;
  /** New Log rundowns this run provisioned to cover a real shortfall — see rundown-provisioning.ts. */
  rundownsGeneratedCount: number;
  /** Dates this schedule line still needs but has no active Log schedule entry, no clock version in effect, or no underwriting-eligible local opportunity on that clock at all. */
  unschedulableAirDates: string[];
  skipped: AutoFillSkippedBreak[];
  demandExceedsSupply: boolean;
  errors: string[];
}

const EMPTY_RESULT: AutoFillResult = {
  placedCount: 0,
  makegoodsResolvedCount: 0,
  rundownsGeneratedCount: 0,
  unschedulableAirDates: [],
  skipped: [],
  demandExceedsSupply: false,
  errors: [],
};

/** A schedule line's target_time ("HH:MM:SS", already station-local wall-clock — no timezone conversion needed) as minutes since midnight. */
function minutesFromTimeString(time: string): number {
  const [hourStr, minuteStr] = time.split(":");
  return Number(hourStr) * 60 + Number(minuteStr);
}

/** Runs the scheduler for one schedule line: gathers its current demand, its underwriter/category, and its eligible open breaks (with each one's current last item, for the adjacency rule below), plans an assignment, then executes it. */
export async function autoFillScheduleLine(scheduleLine: UwContractScheduleLineRow): Promise<AutoFillResult> {
  const contract = await getContract(scheduleLine.contract_id);
  if (!contract) {
    return { ...EMPTY_RESULT, errors: ["This schedule line's contract no longer exists."] };
  }
  const underwriter = await getUnderwriter(contract.underwriter_id);
  if (!underwriter) {
    return { ...EMPTY_RESULT, errors: ["This schedule line's underwriter no longer exists."] };
  }

  const [demand, placeable, placements, copyByContract] = await Promise.all([
    getScheduleLineAutoFillDemand(scheduleLine),
    listPlaceableRundownBreaks(scheduleLine.id),
    listPlacementsForScheduleLine(scheduleLine.id),
    listCopyLinkedToContracts([scheduleLine.contract_id]),
  ]);

  if (!placeable.ok) {
    return { ...EMPTY_RESULT, errors: [placeable.message] };
  }

  // Never the same underwriter, or the same industry, back to back within
  // one break — see auto-fill-plan.ts's header for why this is enforced
  // here rather than left as the manual-placement advisory.
  const adjacencyByItemId = await resolveLastItemAdjacency(placeable.breaks.map((brk) => brk.last_item_id));

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

  const existingBreakCandidates: AutoFillBreakCandidate[] = placeable.breaks.map((brk) => {
    const lastItem = brk.last_item_id ? adjacencyByItemId.get(brk.last_item_id) : undefined;
    return {
      breakId: brk.break_id,
      airDate: brk.air_date,
      minutesOfDay: minutesOfDayInStationTime(brk.scheduled_at),
      remainingSeconds: brk.remaining_seconds,
      lastItemUnderwriterId: lastItem?.underwriterId ?? null,
      lastItemCategory: lastItem?.category ?? null,
    };
  });

  const demandInput: AutoFillDemand = {
    awaitingSlotMakegoodIds: demand.awaitingSlotMakegoodIds,
    freshOccurrencesNeeded: demand.freshOccurrencesNeeded,
    underwriterId: underwriter.id,
    category: underwriter.category,
    targetTimeMinutes: scheduleLine.target_time ? minutesFromTimeString(scheduleLine.target_time) : null,
    // Active (non-superseded — see listPlacementsForScheduleLine) placements
    // this line already has, by their own air date — a day already spoken
    // for is dropped from consideration entirely, fresh or makegood.
    coveredAirDates: placements.map((placement) => placement.placement_date),
  };

  // Probe: what can this run do with inventory that already exists? Sizes
  // exactly how much more is actually needed — the one number provisioning
  // below is allowed to act on.
  const probePlan = planAutoFill(existingBreakCandidates, demandInput, copyCandidates);

  let finalBreakCandidates = existingBreakCandidates;
  let rundownsGeneratedCount = 0;
  let unschedulableAirDates: string[] = [];
  const provisioningErrors: string[] = [];

  const totalRequests = demandInput.awaitingSlotMakegoodIds.length + (demandInput.freshOccurrencesNeeded ?? existingBreakCandidates.length);
  const remaining = totalRequests - probePlan.items.length;
  // No point generating inventory nothing could ever fill: a schedule line
  // with no approved copy at all would just skip a freshly-provisioned
  // break the same way it skipped every existing one.
  const canProvision =
    copyCandidates.some((copy) => copy.approvalStatus === "approved") &&
    scheduleLine.program_id != null &&
    scheduleLine.end_date != null &&
    scheduleLine.occurrence_count_override == null;

  if (remaining > 0 && canProvision) {
    const excludeDates = [...demandInput.coveredAirDates, ...existingBreakCandidates.map((brk) => brk.airDate)];
    const candidateDates = remainingOccurrenceDates(scheduleLine, stationTodayISO(), excludeDates);

    const provisioning = await provisionRundownsForDates(scheduleLine, candidateDates, remaining);
    rundownsGeneratedCount = provisioning.generatedCount;
    unschedulableAirDates = provisioning.unschedulableAirDates;
    provisioningErrors.push(...provisioning.errors);

    if (provisioning.provisionedBreaks.length > 0) {
      const newBreakCandidates: AutoFillBreakCandidate[] = provisioning.provisionedBreaks.map((brk) => ({
        breakId: brk.breakId,
        airDate: brk.airDate,
        minutesOfDay: brk.minutesOfDay,
        remainingSeconds: brk.remainingSeconds,
        // Never adjacent to anything — this break didn't exist a moment ago.
        lastItemUnderwriterId: null,
        lastItemCategory: null,
      }));
      finalBreakCandidates = [...existingBreakCandidates, ...newBreakCandidates];
    }
  }

  const finalPlan =
    finalBreakCandidates === existingBreakCandidates
      ? probePlan
      : planAutoFill(finalBreakCandidates, demandInput, copyCandidates);

  const supabase = await createClient();
  let placedCount = 0;
  let makegoodsResolvedCount = 0;
  const errors: string[] = [...provisioningErrors];

  for (const item of finalPlan.items) {
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
    rundownsGeneratedCount,
    unschedulableAirDates,
    skipped: finalPlan.skipped,
    demandExceedsSupply: finalPlan.demandExceedsSupply,
    errors,
  };
}

export interface AutoFillAllResult {
  perLine: { scheduleLine: UwContractScheduleLineRow; result: AutoFillResult }[];
  totals: AutoFillResult;
}

/**
 * Runs auto-fill over a given list of schedule lines, one after another —
 * shared by the dashboard-wide sweep and the per-contract one below.
 * Sequential, not parallel: two lines racing for the same open break is a
 * real possibility (e.g. two different underwriters both eligible for one
 * generic local avail — and, now that a break can hold several credits,
 * exactly the case the adjacency rule in auto-fill-plan.ts exists for), and
 * log_list_placeable_rundown_breaks() reads live occupancy at call time, so
 * running lines one after another is what keeps both the occupancy count
 * and the adjacency check correct.
 */
async function runAutoFillOverLines(scheduleLines: UwContractScheduleLineRow[]): Promise<AutoFillAllResult> {
  const perLine: { scheduleLine: UwContractScheduleLineRow; result: AutoFillResult }[] = [];

  for (const scheduleLine of scheduleLines) {
    const result = await autoFillScheduleLine(scheduleLine);
    perLine.push({ scheduleLine, result });
  }

  const totals = perLine.reduce<AutoFillResult>(
    (acc, { result }) => ({
      placedCount: acc.placedCount + result.placedCount,
      makegoodsResolvedCount: acc.makegoodsResolvedCount + result.makegoodsResolvedCount,
      rundownsGeneratedCount: acc.rundownsGeneratedCount + result.rundownsGeneratedCount,
      unschedulableAirDates: [...acc.unschedulableAirDates, ...result.unschedulableAirDates],
      skipped: [...acc.skipped, ...result.skipped],
      demandExceedsSupply: acc.demandExceedsSupply || result.demandExceedsSupply,
      errors: [...acc.errors, ...result.errors],
    }),
    { ...EMPTY_RESULT },
  );

  return { perLine, totals };
}

/** Runs auto-fill across every schedule line under every active contract — Workflow D's dashboard, one click. */
export async function autoFillActiveScheduleLines(): Promise<AutoFillAllResult> {
  return runAutoFillOverLines(await listScheduleLinesWithActiveContracts());
}

/**
 * Runs auto-fill across every schedule line under one contract — the
 * middle ground between the per-line button and the dashboard's
 * every-active-contract sweep, for a traffic staffer who just wants "fill
 * everything for this renewal conversation" without leaving the contract
 * page. Same sequential execution and per-line skip/error reporting as the
 * dashboard version, just scoped to one contract's own lines.
 */
export async function autoFillContractScheduleLines(scheduleLines: UwContractScheduleLineRow[]): Promise<AutoFillAllResult> {
  return runAutoFillOverLines(scheduleLines);
}
