import "server-only";
import { stationTodayISO } from "@/lib/log/timezone";
import {
  bumpCredit,
  listPlaceableRundownBreaks,
  placeCredit,
  type PlaceableRundownBreak,
} from "./placement";
import { provisionRundownsForDates } from "./rundown-provisioning";
import { isFixedPosition, orderLinesForFill } from "./fill-order";
import { automationBlockFor } from "./freeze";
import { planBump, type BumpBreak, type BumpMove, type CapacityConflict } from "./bump-plan";
import {
  buildSelectionDemand,
  getContract,
  getRevision,
  getUnderwriter,
  listBucketsForLines,
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
  selectCopyForBreak,
  type CandidateBreak,
  type CopyCandidate,
  type UnplaceableUnit,
} from "./inventory-selection";

/**
 * Execution side of the scheduler (docs/underwriting-traffic-redesign.md
 * §9): the demand buckets say which periods need how many units;
 * inventory selection (inventory-selection.ts) picks real Log breaks for
 * them; this module gathers the inputs, provisions the rundowns a plan is
 * still short, and writes every planned item through the exact same
 * log_place_underwriting_credit() RPC the manual "Place a credit" form
 * uses — never an override, since the planner only ever selects approved,
 * in-date, flight-appropriate copy. The RPC re-checks every contractual
 * limit under a row lock, so a plan built from stale reads fails an item
 * rather than over-filling.
 *
 * Rundowns are provisioned as credits are scheduled against them, not as
 * a separate pre-pass: the first ("probe") plan runs against inventory that
 * already exists, datesNeedingInventory() names exactly the dates the plan
 * is still short, provisioning generates those, and a second plan against
 * the combined inventory is the one that executes. One computation drives
 * both what gets generated and what gets filled — see CLAUDE.md's
 * 2026-08-09 note on why that distinction matters.
 *
 * Three rules added 2026-09-25 (docs/underwriting-traffic-redesign.md §10):
 * every automated write passes `automated: true`, so the SQL guard refuses
 * a live or submitted rundown and a break that has already started
 * (freeze.ts filters the same breaks out of the plan first); when several
 * lines are filled in one run they go most-constrained first
 * (fill-order.ts); and a fixed-position unit (exact, opening, closing)
 * that finds every eligible break full may bump one movable credit to
 * another legal break in its own bucket (bump-plan.ts chooses,
 * log_bump_underwriting_credit() executes atomically) — or is reported
 * as a named capacity conflict when no clean move exists.
 */

/** A bump this run carried out: the moved placement, where it went, and the constrained unit seated in the room it left. */
export interface ExecutedBump extends BumpMove {
  /** The moved credit's new placement id (the old one is superseded). */
  newPlacementId: string;
  seatedScheduleLineId: string;
  seatedPlacementId: string;
}

export interface AutoFillResult {
  placedCount: number;
  makegoodsResolvedCount: number;
  /** New Log rundowns this run provisioned to cover a real shortfall — see rundown-provisioning.ts. */
  rundownsGeneratedCount: number;
  /** Dates this line still needs but no program it can use has an active Log schedule entry, a clock version in effect, or an underwriting-eligible local opportunity on. */
  unschedulableAirDates: string[];
  /** Demand units the plan could not place, with the reason. */
  unplaceable: UnplaceableUnit[];
  /** Movable credits this run relocated so a constrained unit could be seated. */
  bumps: ExecutedBump[];
  /** Constrained units that could not be seated even by bumping — named for staff. */
  capacityConflicts: CapacityConflict[];
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
  bumps: [],
  capacityConflicts: [],
  skippedReason: null,
  errors: [],
};

/** The planner's view of a listed break. Items are kept beside it for the bump planner. */
function toCandidate(
  brk: PlaceableRundownBreak,
  lastItem?: { underwriterId: string; categoryId: string | null },
): CandidateBreak {
  return {
    breakId: brk.break_id,
    airDate: brk.air_date,
    minutesOfDay: brk.minutes_of_day,
    scheduledAt: brk.scheduled_at,
    rundownStatus: brk.rundown_status,
    remainingSeconds: brk.remaining_seconds,
    lastItemUnderwriterId: lastItem?.underwriterId ?? null,
    lastItemCategoryId: lastItem?.categoryId ?? null,
    holdsThisContract: brk.holds_this_contract,
    bucketId: brk.bucket_id,
  };
}

function toBumpBreak(brk: PlaceableRundownBreak, candidate: CandidateBreak): BumpBreak {
  return {
    ...candidate,
    items: brk.items.map((item) => ({
      itemId: item.item_id,
      position: item.position,
      durationSeconds: item.duration_seconds,
      placementId: item.placement_id,
      scheduleLineId: item.schedule_line_id,
      contractId: item.contract_id,
      underwriterId: item.underwriter_id,
      categoryId: item.category_id,
      timeMode: item.time_mode,
      serviceLevel: item.service_level,
      makegoodId: item.makegood_id,
      bucketId: item.bucket_id,
      hasOutcome: item.has_outcome,
    })),
  };
}

/** Lists a line's eligible breaks with each one's last-item adjacency resolved — the shape both the planner and the bump planner read. */
async function listCandidates(
  scheduleLineId: string,
): Promise<
  | { ok: true; breaks: PlaceableRundownBreak[]; candidates: CandidateBreak[] }
  | { ok: false; message: string }
> {
  const placeable = await listPlaceableRundownBreaks(scheduleLineId);
  if (!placeable.ok) return { ok: false, message: placeable.message };
  const adjacencyByItemId = await resolveLastItemAdjacency(
    placeable.breaks.map((brk) => brk.last_item_id),
  );
  return {
    ok: true,
    breaks: placeable.breaks,
    candidates: placeable.breaks.map((brk) =>
      toCandidate(brk, brk.last_item_id ? adjacencyByItemId.get(brk.last_item_id) : undefined),
    ),
  };
}

/** How many breaks a line could fill right now — its candidate count for constraint ordering. */
function countOpenCandidates(
  candidates: CandidateBreak[],
  todayISO: string,
  nowISO: string,
): number {
  return candidates.filter(
    (brk) =>
      brk.airDate >= todayISO &&
      brk.remainingSeconds > 0 &&
      !brk.holdsThisContract &&
      automationBlockFor(brk, nowISO) === null,
  ).length;
}

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
  const revision = await getRevision(scheduleLine.revision_id);
  if (!revision || revision.status !== "current") {
    return {
      ...EMPTY_RESULT,
      skippedReason: "This schedule line belongs to a revision that isn't current.",
    };
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
  const nowISO = new Date().toISOString();
  const [bucketsByLine, listed, copyByContract, pools, activePlacements] = await Promise.all([
    listBucketsForLines([scheduleLine.id]),
    // Never the same underwriter, or the same industry, back to back within
    // one break — listCandidates resolves each break's last item for that.
    listCandidates(scheduleLine.id),
    listCopyLinkedToContracts([scheduleLine.contract_id]),
    listInventoryPools(),
    listPlacementsForScheduleLine(scheduleLine.id),
  ]);
  if (!listed.ok) {
    return { ...EMPTY_RESULT, errors: [listed.message] };
  }
  const demand = await buildSelectionDemand(
    scheduleLine,
    contract,
    underwriter,
    bucketsByLine.get(scheduleLine.id) ?? [],
    todayISO,
    nowISO,
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

  const existingCandidates = listed.candidates;
  let listedBreaks = listed.breaks;

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
    // Dates come from the buckets' own periods and the line's eligible
    // days — an exact-date bucket names its date, a weekly quota asks only
    // for as many days as it is short.
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
      const refreshed = await listCandidates(scheduleLine.id);
      if (refreshed.ok) {
        finalCandidates = refreshed.candidates;
        listedBreaks = refreshed.breaks;
      }
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
      automated: true,
    });
    if (!result.ok) {
      errors.push(result.message);
      continue;
    }
    placedCount++;
    if (item.makegoodId) makegoodsResolvedCount++;
  }

  // Bumping: a fixed-position unit that found every eligible break full
  // may move one movable credit out of the way — one hop, inside that
  // credit's own bucket, through every check the guard makes. Anything
  // it can't seat cleanly is named as a capacity conflict, never forced.
  const bumps: ExecutedBump[] = [];
  const capacityConflicts: CapacityConflict[] = [];
  let unplaceable = finalPlan.unplaceable;
  if (isFixedPosition(scheduleLine)) {
    const bumped = await bumpToSeat(
      scheduleLine,
      demand.underwriterId,
      demand.categoryId,
      unplaceable,
      listedBreaks,
      finalCandidates,
      copyCandidates,
      usageCounts,
      nowISO,
    );
    bumps.push(...bumped.bumps);
    capacityConflicts.push(...bumped.capacityConflicts);
    errors.push(...bumped.errors);
    placedCount += bumped.placedCount;
    makegoodsResolvedCount += bumped.makegoodsResolvedCount;
    unplaceable = bumped.stillUnplaceable;
  }

  return {
    placedCount,
    makegoodsResolvedCount,
    rundownsGeneratedCount,
    unschedulableAirDates,
    unplaceable,
    bumps,
    capacityConflicts,
    skippedReason: null,
    errors,
  };
}

/**
 * For each unit a fixed-position line could not seat for lack of room,
 * plans and carries out at most one bump (bump-plan.ts), then seats the
 * unit. Movable credits' own legal homes come from the same listing RPC,
 * asked once per line involved.
 */
async function bumpToSeat(
  scheduleLine: UwContractScheduleLineRow,
  underwriterId: string,
  categoryId: string | null,
  unplaceable: UnplaceableUnit[],
  listedBreaks: PlaceableRundownBreak[],
  candidates: CandidateBreak[],
  copyCandidates: CopyCandidate[],
  usageCounts: Map<string, number>,
  nowISO: string,
): Promise<{
  bumps: ExecutedBump[];
  capacityConflicts: CapacityConflict[];
  stillUnplaceable: UnplaceableUnit[];
  placedCount: number;
  makegoodsResolvedCount: number;
  errors: string[];
}> {
  const result = {
    bumps: [] as ExecutedBump[],
    capacityConflicts: [] as CapacityConflict[],
    stillUnplaceable: [] as UnplaceableUnit[],
    placedCount: 0,
    makegoodsResolvedCount: 0,
    errors: [] as string[],
  };
  const approvedDurations = copyCandidates
    .filter((copy) => copy.approvalStatus === "approved" && copy.durationSeconds != null)
    .map((copy) => copy.durationSeconds as number);
  const shortest = approvedDurations.length > 0 ? Math.min(...approvedDurations) : null;
  const candidateById = new Map(candidates.map((candidate) => [candidate.breakId, candidate]));
  const alternativesByLine = new Map<string, CandidateBreak[]>();
  const usage = new Map(usageCounts);

  for (const unit of unplaceable) {
    // Only room is bumpable: a unit short of inventory or of copy that
    // fits. Anything else (day cap, adjacency, separation, no copy at all)
    // is not a capacity problem a move would solve.
    if ((unit.why !== "no_inventory" && unit.why !== "no_eligible_copy") || shortest == null) {
      result.stillUnplaceable.push(unit);
      continue;
    }
    const bumpBreaks = listedBreaks
      .filter((brk) => brk.bucket_id === unit.bucketId || unit.reason === "makegood")
      .flatMap((brk) => {
        const candidate = candidateById.get(brk.break_id);
        return candidate ? [toBumpBreak(brk, candidate)] : [];
      });
    for (const brk of bumpBreaks) {
      for (const item of brk.items) {
        if (!item.scheduleLineId || item.placementId === null) continue;
        if (alternativesByLine.has(item.scheduleLineId)) continue;
        const homes = await listCandidates(item.scheduleLineId);
        alternativesByLine.set(item.scheduleLineId, homes.ok ? homes.candidates : []);
      }
    }
    const plan = planBump(
      {
        scheduleLineId: scheduleLine.id,
        bucketId: unit.bucketId,
        contractId: scheduleLine.contract_id,
        underwriterId,
        categoryId,
        copyDurationSeconds: shortest,
      },
      bumpBreaks,
      alternativesByLine,
      nowISO,
    );
    if (plan.kind === "conflict") {
      result.capacityConflicts.push(plan.conflict);
      result.stillUnplaceable.push(unit);
      continue;
    }

    const moved = await bumpCredit(plan.move.placementId, plan.move.toBreakId);
    if (!moved.ok) {
      result.errors.push(`Could not move a credit to make room: ${moved.message}`);
      result.stillUnplaceable.push(unit);
      continue;
    }
    const seat = bumpBreaks.find((brk) => brk.breakId === plan.move.seatBreakId)!;
    const movedItem = seat.items.find((item) => item.itemId === plan.move.itemId)!;
    const copy = selectCopyForBreak(
      copyCandidates,
      {
        remainingSeconds: seat.remainingSeconds + movedItem.durationSeconds,
        airDate: seat.airDate,
      },
      scheduleLine.flight_id,
      usage,
    );
    if (!copy) {
      result.errors.push(
        "Moved a credit to make room, but no linked copy fits the room it left; the moved credit stays where it is now.",
      );
      result.stillUnplaceable.push(unit);
      continue;
    }
    const seated = await placeCredit({
      breakId: seat.breakId,
      scheduleLineId: scheduleLine.id,
      copyId: copy.id,
      makegoodId: unit.makegoodId,
      automated: true,
    });
    if (!seated.ok) {
      result.errors.push(
        `Moved a credit to make room, but the constrained credit could not be seated: ${seated.message}`,
      );
      result.stillUnplaceable.push(unit);
      continue;
    }
    usage.set(copy.id, (usage.get(copy.id) ?? 0) + 1);
    seat.remainingSeconds =
      seat.remainingSeconds + movedItem.durationSeconds - (copy.durationSeconds ?? 0);
    seat.items = seat.items.filter((item) => item.itemId !== plan.move.itemId);
    result.placedCount++;
    if (unit.makegoodId) result.makegoodsResolvedCount++;
    result.bumps.push({
      ...plan.move,
      newPlacementId: moved.placementId,
      seatedScheduleLineId: scheduleLine.id,
      seatedPlacementId: seated.placementId,
    });
  }
  return result;
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
 * lock is the backstop, not the plan). Most-constrained first
 * (fill-order.ts): an exact-time or opening/closing line claims its one
 * break before an any-time line takes it by accident of list order, and
 * within a tier the line with fewer open candidates goes first.
 */
async function runAutoFillOverLines(
  scheduleLines: UwContractScheduleLineRow[],
  contract?: UwContractRow,
): Promise<AutoFillAllResult> {
  const perLine: { scheduleLine: UwContractScheduleLineRow; result: AutoFillResult }[] = [];

  const todayISO = stationTodayISO();
  const nowISO = new Date().toISOString();
  const candidateCounts = new Map<string, number | null>();
  for (const scheduleLine of scheduleLines) {
    const listed = await listCandidates(scheduleLine.id);
    candidateCounts.set(
      scheduleLine.id,
      listed.ok ? countOpenCandidates(listed.candidates, todayISO, nowISO) : null,
    );
  }
  const ordered = orderLinesForFill(scheduleLines, (line) => candidateCounts.get(line.id) ?? null);

  for (const scheduleLine of ordered) {
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
      bumps: [...acc.bumps, ...result.bumps],
      capacityConflicts: [...acc.capacityConflicts, ...result.capacityConflicts],
      skippedReason: acc.skippedReason ?? result.skippedReason,
      errors: [...acc.errors, ...result.errors],
    }),
    { ...EMPTY_RESULT },
  );

  return { perLine, totals };
}

/** Runs auto-fill across every active schedule line under the current revision of every active contract — Workflow D's dashboard, one click. */
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
