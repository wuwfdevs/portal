import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { listPlaceableRundownItems, type PlaceableRundownItem, type UnderwritingRpcResult } from "./placement";
import type { Database } from "@/lib/database.types";

/**
 * Data access for Underwriting & Traffic. Every read goes through the
 * RLS-scoped server client, so private.has_underwriting_access is what
 * actually decides what comes back — these functions add shape, not
 * authorization. Reads are unwrapped rather than defaulted to `[]`, per
 * CLAUDE.md: a query that errors and falls back to empty renders exactly
 * like a healthy empty state.
 */

export type UwContractRow = Database["public"]["Tables"]["uw_contracts"]["Row"];
export type UwPlacementObligationRow = Database["public"]["Tables"]["uw_placement_obligations"]["Row"];
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

export async function listContracts(): Promise<UwContractRow[]> {
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase.from("uw_contracts").select("*").order("underwriter_name"),
      "the contracts",
    ) ?? []
  );
}

export async function getContract(id: string): Promise<UwContractRow | null> {
  const supabase = await createClient();
  return unwrapRead(
    await supabase.from("uw_contracts").select("*").eq("id", id).maybeSingle(),
    "this contract",
  );
}

export interface ContractDetail extends UwContractRow {
  obligations: UwPlacementObligationRow[];
  copy: UwCopyRow[];
}

/** A contract plus its placement obligations and every copy version linked to it (via uw_contract_copy). */
export async function getContractDetail(id: string): Promise<ContractDetail | null> {
  const supabase = await createClient();
  const contract = unwrapRead(
    await supabase.from("uw_contracts").select("*").eq("id", id).maybeSingle(),
    "this contract",
  );
  if (!contract) return null;

  const obligations =
    unwrapRead(
      await supabase
        .from("uw_placement_obligations")
        .select("*")
        .eq("contract_id", id)
        .order("created_at"),
      "this contract's placement obligations",
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

  return { ...contract, obligations, copy };
}

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
          await supabase.from("uw_contracts").select("*").in("id", contractIds).order("underwriter_name"),
          "this copy's linked contracts",
        ) ?? []);

  return { ...copy, contracts };
}

/** Active (non-superseded) placements for one obligation, most recent first — this table is select-only from RLS, so a plain read is fine here (writes go through lib/underwriting/placement.ts's RPC calls). */
export async function listPlacementsForObligation(obligationId: string): Promise<UwScheduledPlacementRow[]> {
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase
        .from("uw_scheduled_placements")
        .select("*")
        .eq("obligation_id", obligationId)
        .neq("status", "superseded")
        .order("scheduled_at"),
      "this obligation's scheduled placements",
    ) ?? []
  );
}

export interface ObligationPlacementContext {
  obligation: UwPlacementObligationRow;
  placements: UwScheduledPlacementRow[];
  placeable: UnderwritingRpcResult<{ items: PlaceableRundownItem[] }>;
}

/**
 * Existing placements plus currently-placeable open slots, per obligation —
 * shared by the contract detail screen's "Place a credit" section and the
 * dashboard's conflict check (lib/underwriting/conflicts.ts), so the two
 * don't drift on how that pair of reads is combined. One
 * log_list_placeable_rundown_items RPC call per obligation, unbatched —
 * fine at this tool's current scale (a handful of contracts/obligations for
 * one station), same tradeoff Academic Partnerships' dashboard makes
 * aggregating in application code rather than a new SQL aggregate.
 */
export async function listObligationPlacementContexts(
  obligations: UwPlacementObligationRow[],
): Promise<ObligationPlacementContext[]> {
  return Promise.all(
    obligations.map(async (obligation) => {
      const [placements, placeable] = await Promise.all([
        listPlacementsForObligation(obligation.id),
        listPlaceableRundownItems(obligation.id),
      ]);
      return { obligation, placements, placeable };
    }),
  );
}

export interface ObligationWithContract extends UwPlacementObligationRow {
  contract: UwContractRow;
}

/** Every active obligation under an active contract — Workflow D's conflict dashboard starting point. An obligation under a paused/terminated contract can't be placed regardless of inventory, so it's excluded rather than flagged as a conflict. */
export async function listActiveObligationsWithContracts(): Promise<ObligationWithContract[]> {
  const supabase = await createClient();
  const obligations =
    unwrapRead(
      await supabase.from("uw_placement_obligations").select("*").eq("status", "active"),
      "the active obligations",
    ) ?? [];
  if (obligations.length === 0) return [];

  const contractIds = [...new Set(obligations.map((obligation) => obligation.contract_id))];
  const contracts =
    unwrapRead(
      await supabase.from("uw_contracts").select("*").in("id", contractIds).eq("status", "active"),
      "these obligations' contracts",
    ) ?? [];
  const contractById = new Map(contracts.map((contract) => [contract.id, contract]));

  return obligations.flatMap((obligation) => {
    const contract = contractById.get(obligation.contract_id);
    return contract ? [{ ...obligation, contract }] : [];
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

export interface ExceptionListItem extends UwExceptionRow {
  obligation: UwPlacementObligationRow;
  contract: UwContractRow;
}

/** Every exception, newest first, joined to its obligation and contract for display. */
export async function listExceptions(): Promise<ExceptionListItem[]> {
  const supabase = await createClient();
  const exceptions =
    unwrapRead(
      await supabase.from("uw_exceptions").select("*").order("created_at", { ascending: false }),
      "the exceptions",
    ) ?? [];
  if (exceptions.length === 0) return [];

  const obligationIds = [...new Set(exceptions.map((exception) => exception.obligation_id))];
  const obligations =
    unwrapRead(
      await supabase.from("uw_placement_obligations").select("*").in("id", obligationIds),
      "these exceptions' obligations",
    ) ?? [];
  const obligationById = new Map(obligations.map((obligation) => [obligation.id, obligation]));

  const contractIds = [...new Set(obligations.map((obligation) => obligation.contract_id))];
  const contracts =
    contractIds.length === 0
      ? []
      : (unwrapRead(
          await supabase.from("uw_contracts").select("*").in("id", contractIds),
          "these exceptions' contracts",
        ) ?? []);
  const contractById = new Map(contracts.map((contract) => [contract.id, contract]));

  return exceptions.flatMap((exception) => {
    const obligation = obligationById.get(exception.obligation_id);
    const contract = obligation ? contractById.get(obligation.contract_id) : undefined;
    return obligation && contract ? [{ ...exception, obligation, contract }] : [];
  });
}

export interface ExceptionDetail extends UwExceptionRow {
  obligation: UwPlacementObligationRow;
  contract: UwContractRow;
  /** Read via the additive log_broadcast_events_select_for_underwriting policy — null only if the event's since been deleted (log_broadcast_events cascades from log_rundown_items). */
  broadcastEvent: LogBroadcastEventRow | null;
  /** The placement this exception's item was under, however it stands now — for program/slot context, since uw_exceptions itself doesn't store those. */
  placement: UwScheduledPlacementRow | null;
}

export async function getExceptionDetail(id: string): Promise<ExceptionDetail | null> {
  const supabase = await createClient();
  const exception = unwrapRead(
    await supabase.from("uw_exceptions").select("*").eq("id", id).maybeSingle(),
    "this exception",
  );
  if (!exception) return null;

  const [obligationResult, broadcastEventResult] = await Promise.all([
    supabase.from("uw_placement_obligations").select("*").eq("id", exception.obligation_id).maybeSingle(),
    supabase.from("log_broadcast_events").select("*").eq("id", exception.log_broadcast_event_id).maybeSingle(),
  ]);
  const obligation = unwrapRead(obligationResult, "this exception's obligation");
  const broadcastEvent = unwrapRead(broadcastEventResult, "this exception's broadcast event");
  if (!obligation) return null;

  const contract = unwrapRead(
    await supabase.from("uw_contracts").select("*").eq("id", obligation.contract_id).maybeSingle(),
    "this exception's contract",
  );
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

  return { ...exception, obligation, contract, broadcastEvent, placement };
}

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
  obligation: UwPlacementObligationRow;
  contract: UwContractRow;
  placement: UwScheduledPlacementRow | null;
  /** Eligible open slots for this makegood's obligation — only fetched for one still awaiting a slot, since a scheduled/aired/cancelled makegood's own screen state doesn't need it. */
  placeable: UnderwritingRpcResult<{ items: PlaceableRundownItem[] }> | null;
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

  const obligationIds = [...new Set(makegoods.map((makegood) => makegood.obligation_id))];
  const obligations =
    unwrapRead(
      await supabase.from("uw_placement_obligations").select("*").in("id", obligationIds),
      "these makegoods' obligations",
    ) ?? [];
  const obligationById = new Map(obligations.map((obligation) => [obligation.id, obligation]));

  const contractIds = [...new Set(obligations.map((obligation) => obligation.contract_id))];
  const contracts =
    contractIds.length === 0
      ? []
      : (unwrapRead(
          await supabase.from("uw_contracts").select("*").in("id", contractIds),
          "these makegoods' contracts",
        ) ?? []);
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

  const copyByContract = await listCopyLinkedToContracts(contractIds);

  return Promise.all(
    makegoods.flatMap((makegood) => {
      const exception = exceptionById.get(makegood.exception_id);
      const obligation = obligationById.get(makegood.obligation_id);
      const contract = obligation ? contractById.get(obligation.contract_id) : undefined;
      if (!exception || !obligation || !contract) return [];

      return [
        (async (): Promise<MakegoodListItem> => {
          const placement = makegood.scheduled_placement_id
            ? (placementById.get(makegood.scheduled_placement_id) ?? null)
            : null;
          const placeable =
            makegood.status === "scheduled" && makegood.scheduled_placement_id === null
              ? await listPlaceableRundownItems(makegood.obligation_id)
              : null;
          return {
            ...makegood,
            exception,
            obligation,
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

export interface AffidavitEvidenceItem {
  placement: UwScheduledPlacementRow;
  broadcastEvent: LogBroadcastEventRow;
}

/**
 * Every broadcast event behind this contract's placements within a
 * campaign period (Workflow G) — the raw evidence affidavit generation
 * turns into uw_affidavit_line_items rows. Reads
 * log_broadcast_events_select_for_underwriting_placements (Slice 5), the
 * broader read policy affidavit generation needs beyond Slice 3's
 * exception-scoped one. Superseded placements are included too: a
 * placement cleared after it already aired is still real air history
 * (docs/underwriting-design.md §17).
 */
export async function findAffidavitEvidence(
  contractId: string,
  periodStart: string,
  periodEnd: string,
): Promise<AffidavitEvidenceItem[]> {
  const supabase = await createClient();
  const obligations =
    unwrapRead(
      await supabase.from("uw_placement_obligations").select("id").eq("contract_id", contractId),
      "this contract's obligations",
    ) ?? [];
  if (obligations.length === 0) return [];

  const placements =
    unwrapRead(
      await supabase
        .from("uw_scheduled_placements")
        .select("*")
        .in(
          "obligation_id",
          obligations.map((obligation) => obligation.id),
        )
        .gte("placement_date", periodStart)
        .lte("placement_date", periodEnd),
      "this contract's placements in this period",
    ) ?? [];
  if (placements.length === 0) return [];

  const events =
    unwrapRead(
      await supabase
        .from("log_broadcast_events")
        .select("*")
        .in(
          "rundown_item_id",
          placements.map((placement) => placement.log_rundown_item_id),
        )
        .order("recorded_at", { ascending: true }),
      "these placements' broadcast events",
    ) ?? [];

  const placementByRundownItem = new Map(placements.map((placement) => [placement.log_rundown_item_id, placement]));
  return events.flatMap((event) => {
    const placement = placementByRundownItem.get(event.rundown_item_id);
    return placement ? [{ placement, broadcastEvent: event }] : [];
  });
}

export interface AffidavitListItem extends UwAffidavitRow {
  contract: UwContractRow;
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

  const contractIds = [...new Set(affidavits.map((affidavit) => affidavit.contract_id))];
  const contracts =
    unwrapRead(
      await supabase.from("uw_contracts").select("*").in("id", contractIds),
      "these affidavits' contracts",
    ) ?? [];
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
  contract: UwContractRow;
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

  const contract = unwrapRead(
    await supabase.from("uw_contracts").select("*").eq("id", affidavit.contract_id).maybeSingle(),
    "this affidavit's contract",
  );
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
