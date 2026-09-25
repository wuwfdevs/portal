import "server-only";
import { stationTodayISO } from "@/lib/log/timezone";
import { listPlaceableRundownBreaks, placeCredit } from "./placement";
import { provisionRundownsForDates } from "./rundown-provisioning";
import {
  buildSelectionDemand,
  getContract,
  getUnderwriter,
  listAllocationsForLines,
  listCopyLinkedToContracts,
  listInventoryPools,
  listPlacementsForScheduleLine,
  listScheduleLinesWithActiveContracts,
  resolveLastItemAdjacency,
  type UwContractRow,
  type UwContractScheduleLineRow,
} from "./queries";
import {
  datesNeedingInventory,
  planInventorySelection,
  type CandidateBreak,
  type CopyCandidate,
  type UnplaceableUnit,
} from "./inventory-selection";

/**
 * Execution side of the scheduler (docs/underwriting-traffic-redesign.md
 * §4): demand expansion (lib/underwriting/demand.ts) says which periods
 * need how many units; inventory selection (inventory-selection.ts) picks
 * real Log breaks for them; this module gathers the inputs, provisions the
 * rundowns a plan is still short, and writes every planned item through
 * the exact same log_place_underwriting_credit() RPC the manual "Place a
 * credit" form uses — never an override, since the planner only ever
 * selects approved, in-date, flight-appropriate copy. The RPC re-checks
 * every contractual limit under a row lock, so a plan built from stale
 * reads fails an item rather than over-filling.
 *
 * Rundowns are provisioned as credits are scheduled against them, not as
 * a separate pre-pass: the first ("probe") plan runs against inventory that
 * already exists, datesNeedingInventory() names exactly the dates the plan
 * is still short, provisioning generates those, and a second plan against
 * the combined inventory is the one that executes. One computation drives
 * both what gets generated and what gets filled — see CLAUDE.md's
 * 2026-08-09 note on why that distinction matters.
 */

export interface AutoFillResult {
  placedCount: number;
  makegoodsResolvedCount: number;
  /** New Log rundowns this run provisioned to cover a real shortfall — see rundown-provisioning.ts. */
  rundownsGeneratedCount: number;
  /** Dates this line still needs but no program it can use has an active Log schedule entry, a clock version in effect, or an underwriting-eligible local opportunity on. */
  unschedulableAirDates: string[];
  /** Demand units the plan could not place, with the reason. */
  unplaceable: UnplaceableUnit[];
  /** A reason the whole line was skipped before planning, if any. */
  skippedReason: string | null;
  errors: string[];
}

const EMPTY_RESULT: AutoFillResult = {
  placedCount: 0,
  makegoodsResolvedCount: 0,
  rundownsGeneratedCount: 0,
  unschedulableAirDates: [],
  unplaceable: [],
  skippedReason: null,
  errors: [],
};

/** The programs auto-fill may provision rundowns for on a line's behalf: its own program, else every program its pool names explicitly. A pool target with no program ("any program") provisions nothing — it fills whatever rundowns exist. */
export function programsForLine(
  line: UwContractScheduleLineRow,
  poolTargets: { pool_id: string; program_id: string | null }[],
): string[] {
  if (line.program_id) return [line.program_id];
  if (!line.pool_id) return [];
  return [
    ...new Set(
      poolTargets
        .filter((target) => target.pool_id === line.pool_id && target.program_id !== null)
        .map((target) => target.program_id as string),
    ),
  ];
}

/** Runs the scheduler for one schedule line: gathers its open demand, its eligible open breaks (with each one's current last item, for the adjacency rule), plans, provisions the shortfall, plans again, executes. */
export async function autoFillScheduleLine(
  scheduleLine: UwContractScheduleLineRow,
  preloaded: { contract?: UwContractRow | null } = {},
): Promise<AutoFillResult> {
  if (scheduleLine.status !== "active") {
    return { ...EMPTY_RESULT, skippedReason: "This schedule line is cancelled." };
  }
  const contract = preloaded.contract ?? (await getContract(scheduleLine.contract_id));
  if (!contract) {
    return { ...EMPTY_RESULT, errors: ["This schedule line's contract no longer exists."] };
  }
  if (contract.status !== "active") {
    return { ...EMPTY_RESULT, skippedReason: "The contract isn't active." };
  }
  if (contract.separation_source_text && contract.separation_policy === "unspecified") {
    return {
      ...EMPTY_RESULT,
      skippedReason:
        "The order states a separation rule that hasn't been turned into a policy yet — decide it on the contract before auto-filling.",
    };
  }
  const underwriter = await getUnderwriter(contract.underwriter_id);
  if (!underwriter) {
    return { ...EMPTY_RESULT, errors: ["This schedule line's underwriter no longer exists."] };
  }

  const todayISO = stationTodayISO();
  const [allocationsByLine, placeable, copyByContract, pools, activePlacements] = await Promise.all(
    [
      listAllocationsForLines([scheduleLine.id]),
      listPlaceableRundownBreaks(scheduleLine.id),
      listCopyLinkedToContracts([scheduleLine.contract_id]),
      listInventoryPools(),
      listPlacementsForScheduleLine(scheduleLine.id),
    ],
  );
  if (!placeable.ok) {
    return { ...EMPTY_RESULT, errors: [placeable.message] };
  }
  const allocations = allocationsByLine.get(scheduleLine.id) ?? [];
  const { demand } = await buildSelectionDemand(
    scheduleLine,
    contract,
    underwriter,
    allocations,
    todayISO,
  );

  // Never the same underwriter, or the same industry, back to back within
  // one break — see inventory-selection.ts's header.
  const adjacencyByItemId = await resolveLastItemAdjacency(
    placeable.breaks.map((brk) => brk.last_item_id),
  );

  // Rotation fairness is seeded from every currently-active placement on
  // this line, not just ones this pass adds.
  const usageCounts = new Map<string, number>();
  for (const placement of activePlacements) {
    usageCounts.set(placement.copy_id, (usageCounts.get(placement.copy_id) ?? 0) + 1);
  }
  const copyCandidates: CopyCandidate[] = (copyByContract.get(scheduleLine.contract_id) ?? []).map(
    ({ copy, flightId }) => ({
      id: copy.id,
      approvalStatus: copy.approval_status,
      durationSeconds: copy.duration_seconds,
      effectiveFrom: copy.effective_from,
      effectiveTo: copy.effective_to,
      flightId,
      existingUsageCount: usageCounts.get(copy.id) ?? 0,
    }),
  );

  const toCandidate = (brk: (typeof placeable.breaks)[number]): CandidateBreak => {
    const lastItem = brk.last_item_id ? adjacencyByItemId.get(brk.last_item_id) : undefined;
    return {
      breakId: brk.break_id,
      airDate: brk.air_date,
      minutesOfDay: brk.minutes_of_day,
      remainingSeconds: brk.remaining_seconds,
      lastItemUnderwriterId: lastItem?.underwriterId ?? null,
      lastItemCategory: lastItem?.category ?? null,
      holdsThisContract: brk.holds_this_contract,
    };
  };
  const existingCandidates = placeable.breaks.map(toCandidate);

  // Probe: what can this run do with inventory that already exists? Its
  // shortfall is the one number provisioning is allowed to act on.
  const probePlan = planInventorySelection(existingCandidates, demand, copyCandidates);

  let finalCandidates = existingCandidates;
  let rundownsGeneratedCount = 0;
  let unschedulableAirDates: string[] = [];
  const provisioningErrors: string[] = [];

  const remaining = probePlan.unplaceable.filter(
    (unit) => unit.why === "no_inventory" || unit.why === "day_cap",
  ).length;
  const canProvision = copyCandidates.some((copy) => copy.approvalStatus === "approved");
  const programs = programsForLine(
    scheduleLine,
    pools.flatMap((pool) =>
      pool.targets.map((target) => ({ pool_id: target.pool_id, program_id: target.program_id })),
    ),
  );

  if (remaining > 0 && canProvision && programs.length > 0) {
    const candidateDates = datesNeedingInventory(demand, existingCandidates, remaining);
    for (const programId of programs) {
      const provisioning = await provisionRundownsForDates(programId, candidateDates, remaining);
      rundownsGeneratedCount += provisioning.generatedCount;
      unschedulableAirDates = provisioning.unschedulableAirDates;
      provisioningErrors.push(...provisioning.errors);
    }
    if (rundownsGeneratedCount > 0) {
      // Re-read candidates: the new breaks need the pool/window/date filter
      // the RPC applies, not a guess at which of them qualify.
      const refreshed = await listPlaceableRundownBreaks(scheduleLine.id);
      if (refreshed.ok) finalCandidates = refreshed.breaks.map(toCandidate);
    }
  }

  const finalPlan =
    finalCandidates === existingCandidates
      ? probePlan
      : planInventorySelection(finalCandidates, demand, copyCandidates);

  let placedCount = 0;
  let makegoodsResolvedCount = 0;
  const errors: string[] = [...provisioningErrors];

  for (const item of finalPlan.items) {
    const result = await placeCredit({
      breakId: item.breakId,
      scheduleLineId: scheduleLine.id,
      copyId: item.copyId,
      makegoodId: item.makegoodId,
    });
    if (!result.ok) {
      errors.push(result.message);
      continue;
    }
    placedCount++;
    if (item.makegoodId) makegoodsResolvedCount++;
  }

  return {
    placedCount,
    makegoodsResolvedCount,
    rundownsGeneratedCount,
    unschedulableAirDates,
    unplaceable: finalPlan.unplaceable,
    skippedReason: null,
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
 * real possibility, and log_list_placeable_rundown_breaks() reads live
 * occupancy at call time, so running lines one after another is what keeps
 * both the occupancy count and the adjacency check correct (the RPC's row
 * lock is the backstop, not the plan).
 */
async function runAutoFillOverLines(
  scheduleLines: UwContractScheduleLineRow[],
  contract?: UwContractRow,
): Promise<AutoFillAllResult> {
  const perLine: { scheduleLine: UwContractScheduleLineRow; result: AutoFillResult }[] = [];

  for (const scheduleLine of scheduleLines) {
    const result = await autoFillScheduleLine(scheduleLine, { contract });
    perLine.push({ scheduleLine, result });
  }

  const totals = perLine.reduce<AutoFillResult>(
    (acc, { result }) => ({
      placedCount: acc.placedCount + result.placedCount,
      makegoodsResolvedCount: acc.makegoodsResolvedCount + result.makegoodsResolvedCount,
      rundownsGeneratedCount: acc.rundownsGeneratedCount + result.rundownsGeneratedCount,
      unschedulableAirDates: [
        ...new Set([...acc.unschedulableAirDates, ...result.unschedulableAirDates]),
      ],
      unplaceable: [...acc.unplaceable, ...result.unplaceable],
      skippedReason: acc.skippedReason ?? result.skippedReason,
      errors: [...acc.errors, ...result.errors],
    }),
    { ...EMPTY_RESULT },
  );

  return { perLine, totals };
}

/** Runs auto-fill across every active schedule line under every active contract — Workflow D's dashboard, one click. */
export async function autoFillActiveScheduleLines(): Promise<AutoFillAllResult> {
  return runAutoFillOverLines(await listScheduleLinesWithActiveContracts());
}

/** Runs auto-fill across every schedule line under one contract. */
export async function autoFillContractScheduleLines(
  contract: UwContractRow,
  scheduleLines: UwContractScheduleLineRow[],
): Promise<AutoFillAllResult> {
  return runAutoFillOverLines(scheduleLines, contract);
}
