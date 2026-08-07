import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
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
