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
export type LogBroadcastEventRow = Database["public"]["Tables"]["log_broadcast_events"]["Row"];

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
