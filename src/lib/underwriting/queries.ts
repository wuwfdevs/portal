import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { listPlaceableRundownBreaks, type PlaceableRundownBreak, type UnderwritingRpcResult } from "./placement";
import { sumExpectedOccurrences } from "./schedule-lines";
import { computeFulfillment, type FulfillmentResult } from "./fulfillment";
import type { Database } from "@/lib/database.types";

/**
 * Data access for Underwriting & Traffic. Every read goes through the
 * RLS-scoped server client, so private.has_underwriting_access is what
 * actually decides what comes back — these functions add shape, not
 * authorization. Reads are unwrapped rather than defaulted to `[]`, per
 * CLAUDE.md: a query that errors and falls back to empty renders exactly
 * like a healthy empty state.
 */

export type UwUnderwriterRow = Database["public"]["Tables"]["uw_underwriters"]["Row"];
export type UwContractRow = Database["public"]["Tables"]["uw_contracts"]["Row"];
export type UwContractScheduleLineRow = Database["public"]["Tables"]["uw_contract_schedule_lines"]["Row"];
export type UwCopyRow = Database["public"]["Tables"]["uw_copy"]["Row"];
export type UwScheduledPlacementRow = Database["public"]["Tables"]["uw_scheduled_placements"]["Row"];
export type UwExceptionRow = Database["public"]["Tables"]["uw_exceptions"]["Row"];
export type UwMakegoodRow = Database["public"]["Tables"]["uw_makegoods"]["Row"];
export type UwAffidavitRow = Database["public"]["Tables"]["uw_affidavits"]["Row"];
export type UwAffidavitLineItemRow = Database["public"]["Tables"]["uw_affidavit_line_items"]["Row"];
export type LogBroadcastEventRow = Database["public"]["Tables"]["log_broadcast_events"]["Row"];

/**
 * Display names are a courtesy column: `profiles` RLS only shows a non-admin
 * their own row, so this read is frequently short and must never be an
 * error — same commented exception as lib/roadmap/queries.ts's own
 * displayNames().
 */
async function displayNames(userIds: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter((id): id is string => id !== null))];
  if (unique.length === 0) return new Map();

  const supabase = await createClient();
  const result = await supabase.from("profiles").select("id, display_name").in("id", unique);
  const rows = result.error ? [] : (result.data ?? []);
  return new Map(rows.map((row) => [row.id, row.display_name]));
}

// Underwriters -----------------------------------------------------------

export async function listUnderwriters(): Promise<UwUnderwriterRow[]> {
  const supabase = await createClient();
  return (
    unwrapRead(await supabase.from("uw_underwriters").select("*").order("name"), "the underwriters") ?? []
  );
}

export async function getUnderwriter(id: string): Promise<UwUnderwriterRow | null> {
  const supabase = await createClient();
  return unwrapRead(
    await supabase.from("uw_underwriters").select("*").eq("id", id).maybeSingle(),
    "this underwriter",
  );
}

export interface UnderwriterDetail extends UwUnderwriterRow {
  contracts: UwContractRow[];
}

export async function getUnderwriterDetail(id: string): Promise<UnderwriterDetail | null> {
  const underwriter = await getUnderwriter(id);
  if (!underwriter) return null;
  const supabase = await createClient();
  const contracts =
    unwrapRead(
      await supabase.from("uw_contracts").select("*").eq("underwriter_id", id).order("effective_from", { ascending: false }),
      "this underwriter's contracts",
    ) ?? [];
  return { ...underwriter, contracts };
}

// Contracts ----------------------------------------------------------------

export interface ContractWithUnderwriter extends UwContractRow {
  underwriter: UwUnderwriterRow;
}

export async function listContracts(): Promise<ContractWithUnderwriter[]> {
  const supabase = await createClient();
  const contracts =
    unwrapRead(
      await supabase.from("uw_contracts").select("*").order("effective_from", { ascending: false }),
      "the contracts",
    ) ?? [];
  if (contracts.length === 0) return [];

  const underwriterIds = [...new Set(contracts.map((contract) => contract.underwriter_id))];
  const underwriters =
    unwrapRead(
      await supabase.from("uw_underwriters").select("*").in("id", underwriterIds),
      "these contracts' underwriters",
    ) ?? [];
  const underwriterById = new Map(underwriters.map((underwriter) => [underwriter.id, underwriter]));

  return contracts.flatMap((contract) => {
    const underwriter = underwriterById.get(contract.underwriter_id);
    return underwriter ? [{ ...contract, underwriter }] : [];
  });
}

export async function getContract(id: string): Promise<UwContractRow | null> {
  const supabase = await createClient();
  return unwrapRead(
    await supabase.from("uw_contracts").select("*").eq("id", id).maybeSingle(),
    "this contract",
  );
}

export interface ContractDetail extends UwContractRow {
  underwriter: UwUnderwriterRow;
  scheduleLines: UwContractScheduleLineRow[];
  copy: UwCopyRow[];
}

/** A contract plus its underwriter, schedule lines, and every copy version linked to it (via uw_contract_copy). */
export async function getContractDetail(id: string): Promise<ContractDetail | null> {
  const supabase = await createClient();
  const contract = unwrapRead(
    await supabase.from("uw_contracts").select("*").eq("id", id).maybeSingle(),
    "this contract",
  );
  if (!contract) return null;

  const underwriter = await getUnderwriter(contract.underwriter_id);
  if (!underwriter) return null;

  const scheduleLines =
    unwrapRead(
      await supabase
        .from("uw_contract_schedule_lines")
        .select("*")
        .eq("contract_id", id)
        .order("created_at"),
      "this contract's schedule lines",
    ) ?? [];

  const links =
    unwrapRead(
      await supabase.from("uw_contract_copy").select("copy_id").eq("contract_id", id),
      "this contract's linked copy",
    ) ?? [];
  const copyIds = links.map((link) => link.copy_id);

  const copy =
    copyIds.length === 0
      ? []
      : (unwrapRead(
          await supabase.from("uw_copy").select("*").in("id", copyIds).order("created_at"),
          "this contract's linked copy",
        ) ?? []);

  return { ...contract, underwriter, scheduleLines, copy };
}

/**
 * Derived fulfillment for a contract (point 31 of the domain redesign) —
 * never a stored status. Aggregates its schedule lines' expected occurrence
 * total against confirmed airings, open exceptions, and open makegoods —
 * see lib/underwriting/fulfillment.ts.
 */
export async function getContractFulfillment(
  contractId: string,
  scheduleLines: UwContractScheduleLineRow[],
): Promise<FulfillmentResult> {
  const supabase = await createClient();
  const lineIds = scheduleLines.map((line) => line.id);
  if (lineIds.length === 0) {
    return computeFulfillment({ expectedOccurrences: null, completedCount: 0, openExceptionCount: 0, openMakegoodCount: 0 });
  }

  const [placementsResult, exceptionsResult, makegoodsResult] = await Promise.all([
    supabase.from("uw_scheduled_placements").select("*").in("schedule_line_id", lineIds).neq("status", "superseded"),
    supabase.from("uw_exceptions").select("id").in("schedule_line_id", lineIds).eq("resolution_status", "open"),
    supabase.from("uw_makegoods").select("id").in("schedule_line_id", lineIds).eq("status", "scheduled"),
  ]);
  const placements = unwrapRead(placementsResult, "this contract's placements") ?? [];
  const openExceptions = unwrapRead(exceptionsResult, "this contract's open exceptions") ?? [];
  const openMakegoods = unwrapRead(makegoodsResult, "this contract's open makegoods") ?? [];

  // null for a cleared placement (log_clear_underwriting_credit nulls it on
  // delete rather than cascading the row away — see
  // 20260809130000_underwriting_credit_relocation.sql) — nothing to look up
  // a broadcast event by in that case.
  const rundownItemIds = placements
    .map((placement) => placement.log_rundown_item_id)
    .filter((id): id is string => id !== null);
  const events =
    rundownItemIds.length === 0
      ? []
      : (unwrapRead(
          await supabase.from("log_broadcast_events").select("outcome").in("rundown_item_id", rundownItemIds),
          "this contract's broadcast events",
        ) ?? []);
  const completedCount = events.filter((event) => event.outcome === "aired_as_scheduled").length;

  return computeFulfillment({
    expectedOccurrences: sumExpectedOccurrences(scheduleLines),
    completedCount,
    openExceptionCount: openExceptions.length,
    openMakegoodCount: openMakegoods.length,
  });
}

// Copy -----------------------------------------------------------------------

export async function listCopy(): Promise<UwCopyRow[]> {
  const supabase = await createClient();
  return (
    unwrapRead(await supabase.from("uw_copy").select("*").order("created_at", { ascending: false }), "the copy library") ??
    []
  );
}

export interface CopyDetail extends UwCopyRow {
  contracts: UwContractRow[];
}

/** One piece of copy plus every contract it's linked to (via uw_contract_copy). */
export async function getCopyDetail(id: string): Promise<CopyDetail | null> {
  const supabase = await createClient();
  const copy = unwrapRead(
    await supabase.from("uw_copy").select("*").eq("id", id).maybeSingle(),
    "this copy",
  );
  if (!copy) return null;

  const links =
    unwrapRead(
      await supabase.from("uw_contract_copy").select("contract_id").eq("copy_id", id),
      "this copy's linked contracts",
    ) ?? [];
  const contractIds = links.map((link) => link.contract_id);

  const contracts =
    contractIds.length === 0
      ? []
      : (unwrapRead(
          await supabase.from("uw_contracts").select("*").in("id", contractIds),
          "this copy's linked contracts",
        ) ?? []);

  return { ...copy, contracts };
}

// Placements -----------------------------------------------------------------

/** Active (non-superseded) placements for one schedule line, most recent first — this table is select-only from RLS, so a plain read is fine here (writes go through lib/underwriting/placement.ts's RPC calls). */
export async function listPlacementsForScheduleLine(scheduleLineId: string): Promise<UwScheduledPlacementRow[]> {
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase
        .from("uw_scheduled_placements")
        .select("*")
        .eq("schedule_line_id", scheduleLineId)
        .neq("status", "superseded")
        .order("scheduled_at"),
      "this schedule line's scheduled placements",
    ) ?? []
  );
}

export interface ScheduleLinePlacementContext {
  scheduleLine: UwContractScheduleLineRow;
  placements: UwScheduledPlacementRow[];
  placeable: UnderwritingRpcResult<{ breaks: PlaceableRundownBreak[] }>;
}

/**
 * Existing placements plus currently-placeable open breaks, per schedule
 * line — shared by the contract detail screen's "Place a credit" section
 * and the dashboard's conflict check (lib/underwriting/conflicts.ts), so
 * the two don't drift on how that pair of reads is combined. One
 * log_list_placeable_rundown_breaks RPC call per schedule line, unbatched —
 * fine at this tool's current scale (a handful of contracts for one
 * station), same tradeoff Academic Partnerships' dashboard makes
 * aggregating in application code rather than a new SQL aggregate.
 */
export async function listScheduleLinePlacementContexts(
  scheduleLines: UwContractScheduleLineRow[],
): Promise<ScheduleLinePlacementContext[]> {
  return Promise.all(
    scheduleLines.map(async (scheduleLine) => {
      const [placements, placeable] = await Promise.all([
        listPlacementsForScheduleLine(scheduleLine.id),
        listPlaceableRundownBreaks(scheduleLine.id),
      ]);
      return { scheduleLine, placements, placeable };
    }),
  );
}

export interface NearbyPlacementForAdjacency {
  underwriterId: string;
  category: string | null;
}

/**
 * Every other active placement on the same program, for the competitive-
 * adjacency advisory (point 30 of the domain redesign, lib/underwriting/
 * adjacency.ts) — a simple "same program" window, not spacing/clustering by
 * exact time. Excludes the contract currently being scheduled from, so a
 * contract never warns against its own other placements.
 */
export async function listNearbyPlacementsForAdjacency(
  programId: string,
  excludeContractId: string,
): Promise<NearbyPlacementForAdjacency[]> {
  const supabase = await createClient();
  const placements =
    unwrapRead(
      await supabase
        .from("uw_scheduled_placements")
        .select("schedule_line_id")
        .eq("program_id", programId)
        .neq("status", "superseded"),
      "nearby placements",
    ) ?? [];
  if (placements.length === 0) return [];

  const scheduleLineIds = [...new Set(placements.map((p) => p.schedule_line_id))];
  const scheduleLines =
    unwrapRead(
      await supabase.from("uw_contract_schedule_lines").select("id, contract_id").in("id", scheduleLineIds),
      "nearby placements' schedule lines",
    ) ?? [];
  const contractIds = [...new Set(scheduleLines.map((line) => line.contract_id))].filter((id) => id !== excludeContractId);
  if (contractIds.length === 0) return [];

  const contracts =
    unwrapRead(
      await supabase.from("uw_contracts").select("id, underwriter_id").in("id", contractIds),
      "nearby placements' contracts",
    ) ?? [];
  const underwriterIds = [...new Set(contracts.map((c) => c.underwriter_id))];
  const underwriters =
    underwriterIds.length === 0
      ? []
      : (unwrapRead(
          await supabase.from("uw_underwriters").select("id, category").in("id", underwriterIds),
          "nearby placements' underwriters",
        ) ?? []);
  const categoryByUnderwriter = new Map(underwriters.map((u) => [u.id, u.category]));

  return contracts.map((contract) => ({
    underwriterId: contract.underwriter_id,
    category: categoryByUnderwriter.get(contract.underwriter_id) ?? null,
  }));
}

export interface ScheduleLineWithContract extends UwContractScheduleLineRow {
  contract: ContractWithUnderwriter;
}

/** Every schedule line under an active contract — Workflow D's conflict dashboard starting point. A line under a paused/terminated contract can't be placed regardless of inventory, so it's excluded rather than flagged as a conflict. */
export async function listScheduleLinesWithActiveContracts(): Promise<ScheduleLineWithContract[]> {
  const contracts = await listContracts();
  const activeContracts = contracts.filter((contract) => contract.status === "active");
  if (activeContracts.length === 0) return [];

  const supabase = await createClient();
  const scheduleLines =
    unwrapRead(
      await supabase
        .from("uw_contract_schedule_lines")
        .select("*")
        .in(
          "contract_id",
          activeContracts.map((contract) => contract.id),
        ),
      "the active schedule lines",
    ) ?? [];

  const contractById = new Map(activeContracts.map((contract) => [contract.id, contract]));
  return scheduleLines.flatMap((line) => {
    const contract = contractById.get(line.contract_id);
    return contract ? [{ ...line, contract }] : [];
  });
}

/** Every uw_copy row linked (via uw_contract_copy) to any of the given contracts, grouped by contract id. */
export async function listCopyLinkedToContracts(contractIds: string[]): Promise<Map<string, UwCopyRow[]>> {
  if (contractIds.length === 0) return new Map();
  const supabase = await createClient();
  const links =
    unwrapRead(
      await supabase.from("uw_contract_copy").select("contract_id, copy_id").in("contract_id", contractIds),
      "linked copy",
    ) ?? [];
  const copyIds = [...new Set(links.map((link) => link.copy_id))];
  const copyRows =
    copyIds.length === 0
      ? []
      : (unwrapRead(await supabase.from("uw_copy").select("*").in("id", copyIds), "linked copy") ?? []);
  const copyById = new Map(copyRows.map((copy) => [copy.id, copy]));

  const result = new Map<string, UwCopyRow[]>();
  for (const link of links) {
    const copy = copyById.get(link.copy_id);
    if (!copy) continue;
    const list = result.get(link.contract_id) ?? [];
    list.push(copy);
    result.set(link.contract_id, list);
  }
  return result;
}

// Exceptions -------------------------------------------------------------------

export interface ExceptionListItem extends UwExceptionRow {
  scheduleLine: UwContractScheduleLineRow;
  contract: ContractWithUnderwriter;
}

/** Every exception, newest first, joined to its schedule line and contract for display. */
export async function listExceptions(): Promise<ExceptionListItem[]> {
  const supabase = await createClient();
  const exceptions =
    unwrapRead(
      await supabase.from("uw_exceptions").select("*").order("created_at", { ascending: false }),
      "the exceptions",
    ) ?? [];
  if (exceptions.length === 0) return [];

  const scheduleLineIds = [...new Set(exceptions.map((exception) => exception.schedule_line_id))];
  const scheduleLines =
    unwrapRead(
      await supabase.from("uw_contract_schedule_lines").select("*").in("id", scheduleLineIds),
      "these exceptions' schedule lines",
    ) ?? [];
  const scheduleLineById = new Map(scheduleLines.map((line) => [line.id, line]));

  const contracts = await listContracts();
  const contractById = new Map(contracts.map((contract) => [contract.id, contract]));

  return exceptions.flatMap((exception) => {
    const scheduleLine = scheduleLineById.get(exception.schedule_line_id);
    const contract = scheduleLine ? contractById.get(scheduleLine.contract_id) : undefined;
    return scheduleLine && contract ? [{ ...exception, scheduleLine, contract }] : [];
  });
}

export interface ExceptionDetail extends UwExceptionRow {
  scheduleLine: UwContractScheduleLineRow;
  contract: ContractWithUnderwriter;
  /** Read via the additive log_broadcast_events_select_for_underwriting policy — null only if the event's since been deleted (log_broadcast_events cascades from log_rundown_items). */
  broadcastEvent: LogBroadcastEventRow | null;
  /** The placement this exception's item was under, however it stands now — for program/break context, since uw_exceptions itself doesn't store those. */
  placement: UwScheduledPlacementRow | null;
}

export async function getExceptionDetail(id: string): Promise<ExceptionDetail | null> {
  const supabase = await createClient();
  const exception = unwrapRead(
    await supabase.from("uw_exceptions").select("*").eq("id", id).maybeSingle(),
    "this exception",
  );
  if (!exception) return null;

  const [scheduleLineResult, broadcastEventResult] = await Promise.all([
    supabase.from("uw_contract_schedule_lines").select("*").eq("id", exception.schedule_line_id).maybeSingle(),
    supabase.from("log_broadcast_events").select("*").eq("id", exception.log_broadcast_event_id).maybeSingle(),
  ]);
  const scheduleLine = unwrapRead(scheduleLineResult, "this exception's schedule line");
  const broadcastEvent = unwrapRead(broadcastEventResult, "this exception's broadcast event");
  if (!scheduleLine) return null;

  const contract = (await listContracts()).find((c) => c.id === scheduleLine.contract_id);
  if (!contract) return null;

  const placement = broadcastEvent
    ? unwrapRead(
        await supabase
          .from("uw_scheduled_placements")
          .select("*")
          .eq("log_rundown_item_id", broadcastEvent.rundown_item_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        "this exception's placement",
      )
    : null;

  return { ...exception, scheduleLine, contract, broadcastEvent, placement };
}

// Makegoods ----------------------------------------------------------------

/** Every makegood created against this exception, newest first — the exception detail page's own "Makegoods" panel. */
export async function listMakegoodsForException(exceptionId: string): Promise<UwMakegoodRow[]> {
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase
        .from("uw_makegoods")
        .select("*")
        .eq("exception_id", exceptionId)
        .order("created_at", { ascending: false }),
      "this exception's makegoods",
    ) ?? []
  );
}

export interface MakegoodListItem extends UwMakegoodRow {
  exception: UwExceptionRow;
  scheduleLine: UwContractScheduleLineRow;
  contract: ContractWithUnderwriter;
  placement: UwScheduledPlacementRow | null;
  /** Eligible open breaks for this makegood's schedule line — only fetched for one still awaiting a slot, since a scheduled/aired/cancelled makegood's own screen state doesn't need it. */
  placeable: UnderwritingRpcResult<{ breaks: PlaceableRundownBreak[] }> | null;
  /** Copy linked to this makegood's contract — the same picker the "Place a credit" form on the contract page offers. */
  linkedCopy: UwCopyRow[];
}

/** Workflow F's "Makegood tracking" screen (docs/underwriting-design.md §4) — every makegood, newest first, with enough context to schedule or cancel it inline. */
export async function listMakegoods(): Promise<MakegoodListItem[]> {
  const supabase = await createClient();
  const makegoods =
    unwrapRead(
      await supabase.from("uw_makegoods").select("*").order("created_at", { ascending: false }),
      "the makegoods",
    ) ?? [];
  if (makegoods.length === 0) return [];

  const exceptionIds = [...new Set(makegoods.map((makegood) => makegood.exception_id))];
  const exceptions =
    unwrapRead(
      await supabase.from("uw_exceptions").select("*").in("id", exceptionIds),
      "these makegoods' exceptions",
    ) ?? [];
  const exceptionById = new Map(exceptions.map((exception) => [exception.id, exception]));

  const scheduleLineIds = [...new Set(makegoods.map((makegood) => makegood.schedule_line_id))];
  const scheduleLines =
    unwrapRead(
      await supabase.from("uw_contract_schedule_lines").select("*").in("id", scheduleLineIds),
      "these makegoods' schedule lines",
    ) ?? [];
  const scheduleLineById = new Map(scheduleLines.map((line) => [line.id, line]));

  const contracts = await listContracts();
  const contractById = new Map(contracts.map((contract) => [contract.id, contract]));

  const placementIds = [
    ...new Set(makegoods.flatMap((makegood) => (makegood.scheduled_placement_id ? [makegood.scheduled_placement_id] : []))),
  ];
  const placements =
    placementIds.length === 0
      ? []
      : (unwrapRead(
          await supabase.from("uw_scheduled_placements").select("*").in("id", placementIds),
          "these makegoods' placements",
        ) ?? []);
  const placementById = new Map(placements.map((placement) => [placement.id, placement]));

  const copyByContract = await listCopyLinkedToContracts([...new Set(scheduleLines.map((line) => line.contract_id))]);

  return Promise.all(
    makegoods.flatMap((makegood) => {
      const exception = exceptionById.get(makegood.exception_id);
      const scheduleLine = scheduleLineById.get(makegood.schedule_line_id);
      const contract = scheduleLine ? contractById.get(scheduleLine.contract_id) : undefined;
      if (!exception || !scheduleLine || !contract) return [];

      return [
        (async (): Promise<MakegoodListItem> => {
          const placement = makegood.scheduled_placement_id
            ? (placementById.get(makegood.scheduled_placement_id) ?? null)
            : null;
          const placeable =
            makegood.status === "scheduled" && makegood.scheduled_placement_id === null
              ? await listPlaceableRundownBreaks(makegood.schedule_line_id)
              : null;
          return {
            ...makegood,
            exception,
            scheduleLine,
            contract,
            placement,
            placeable,
            linkedCopy: copyByContract.get(contract.id) ?? [],
          };
        })(),
      ];
    }),
  );
}

// Affidavits -----------------------------------------------------------------

export interface AffidavitEvidenceItem {
  placement: UwScheduledPlacementRow;
  broadcastEvent: LogBroadcastEventRow;
}

/**
 * Every broadcast event behind this contract's placements within a
 * campaign period (Workflow G) — the raw evidence affidavit generation
 * turns into uw_affidavit_line_items rows. Reads
 * log_broadcast_events_select_for_underwriting_placements, the broader read
 * policy affidavit generation needs beyond the exception-scoped one.
 * Superseded placements are included too: a placement cleared after it
 * already aired is still real air history (docs/underwriting-design.md
 * §17).
 */
export async function findAffidavitEvidence(
  contractId: string,
  periodStart: string,
  periodEnd: string,
): Promise<AffidavitEvidenceItem[]> {
  const supabase = await createClient();
  const scheduleLines =
    unwrapRead(
      await supabase.from("uw_contract_schedule_lines").select("id").eq("contract_id", contractId),
      "this contract's schedule lines",
    ) ?? [];
  if (scheduleLines.length === 0) return [];

  const placements =
    unwrapRead(
      await supabase
        .from("uw_scheduled_placements")
        .select("*")
        .in(
          "schedule_line_id",
          scheduleLines.map((line) => line.id),
        )
        .gte("placement_date", periodStart)
        .lte("placement_date", periodEnd),
      "this contract's placements in this period",
    ) ?? [];
  if (placements.length === 0) return [];

  // A cleared placement's log_rundown_item_id is null (the item is gone,
  // but the row survives — see 20260809130000_underwriting_credit_relocation.sql)
  // — nothing was ever confirmed against it, so it contributes no evidence.
  const livePlacements = placements.filter(
    (placement): placement is typeof placement & { log_rundown_item_id: string } =>
      placement.log_rundown_item_id !== null,
  );
  if (livePlacements.length === 0) return [];

  const events =
    unwrapRead(
      await supabase
        .from("log_broadcast_events")
        .select("*")
        .in(
          "rundown_item_id",
          livePlacements.map((placement) => placement.log_rundown_item_id),
        )
        .order("recorded_at", { ascending: true }),
      "these placements' broadcast events",
    ) ?? [];

  const placementByRundownItem = new Map(
    livePlacements.map((placement) => [placement.log_rundown_item_id, placement]),
  );
  return events.flatMap((event) => {
    const placement = placementByRundownItem.get(event.rundown_item_id);
    return placement ? [{ placement, broadcastEvent: event }] : [];
  });
}

export interface AffidavitListItem extends UwAffidavitRow {
  contract: ContractWithUnderwriter;
}

/** Every affidavit, newest first, with its contract for display. */
export async function listAffidavits(): Promise<AffidavitListItem[]> {
  const supabase = await createClient();
  const affidavits =
    unwrapRead(
      await supabase.from("uw_affidavits").select("*").order("generated_at", { ascending: false }),
      "the affidavits",
    ) ?? [];
  if (affidavits.length === 0) return [];

  const contracts = await listContracts();
  const contractById = new Map(contracts.map((contract) => [contract.id, contract]));

  return affidavits.flatMap((affidavit) => {
    const contract = contractById.get(affidavit.contract_id);
    return contract ? [{ ...affidavit, contract }] : [];
  });
}

export interface AffidavitLineItemDetail {
  lineItem: UwAffidavitLineItemRow;
  broadcastEvent: LogBroadcastEventRow;
  placement: UwScheduledPlacementRow;
  /** The exception this line item's broadcast event raised, if any — looked up by log_broadcast_event_id rather than stored, same as getExceptionDetail's own placement lookup. */
  exception: UwExceptionRow | null;
}

export interface AffidavitDetail extends UwAffidavitRow {
  contract: ContractWithUnderwriter;
  lineItems: AffidavitLineItemDetail[];
  certifyingStaffName: string | null;
}

export async function getAffidavitDetail(id: string): Promise<AffidavitDetail | null> {
  const supabase = await createClient();
  const affidavit = unwrapRead(
    await supabase.from("uw_affidavits").select("*").eq("id", id).maybeSingle(),
    "this affidavit",
  );
  if (!affidavit) return null;

  const contract = (await listContracts()).find((c) => c.id === affidavit.contract_id);
  if (!contract) return null;

  const certifyingStaffNames = await displayNames([affidavit.certifying_staff_id]);
  const certifyingStaffName = affidavit.certifying_staff_id
    ? (certifyingStaffNames.get(affidavit.certifying_staff_id) ?? null)
    : null;

  const lineItemRows =
    unwrapRead(
      await supabase.from("uw_affidavit_line_items").select("*").eq("affidavit_id", id),
      "this affidavit's line items",
    ) ?? [];
  if (lineItemRows.length === 0) return { ...affidavit, contract, lineItems: [], certifyingStaffName };

  const broadcastEventIds = lineItemRows.map((row) => row.log_broadcast_event_id);
  const placementIds = [...new Set(lineItemRows.map((row) => row.scheduled_placement_id))];

  const [broadcastEventsResult, placementsResult, exceptionsResult] = await Promise.all([
    supabase.from("log_broadcast_events").select("*").in("id", broadcastEventIds),
    supabase.from("uw_scheduled_placements").select("*").in("id", placementIds),
    supabase.from("uw_exceptions").select("*").in("log_broadcast_event_id", broadcastEventIds),
  ]);
  const broadcastEvents = unwrapRead(broadcastEventsResult, "this affidavit's broadcast events") ?? [];
  const placements = unwrapRead(placementsResult, "this affidavit's placements") ?? [];
  const exceptions = unwrapRead(exceptionsResult, "this affidavit's exceptions") ?? [];
  const broadcastEventById = new Map(broadcastEvents.map((event) => [event.id, event]));
  const placementById = new Map(placements.map((placement) => [placement.id, placement]));
  const exceptionByBroadcastEventId = new Map(
    exceptions.map((exception) => [exception.log_broadcast_event_id, exception]),
  );

  const lineItems = lineItemRows.flatMap((lineItem) => {
    const broadcastEvent = broadcastEventById.get(lineItem.log_broadcast_event_id);
    const placement = placementById.get(lineItem.scheduled_placement_id);
    if (!broadcastEvent || !placement) return [];
    return [
      {
        lineItem,
        broadcastEvent,
        placement,
        exception: exceptionByBroadcastEventId.get(broadcastEvent.id) ?? null,
      },
    ];
  });
  lineItems.sort(
    (a, b) => new Date(a.broadcastEvent.recorded_at).getTime() - new Date(b.broadcastEvent.recorded_at).getTime(),
  );

  return { ...affidavit, contract, lineItems, certifyingStaffName };
}
