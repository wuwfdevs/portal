import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { logAuditEvent } from "@/lib/audit";
import { rebalanceContractRotation } from "./rotation-rebalance";
import {
  creationOrder,
  type LegacyCopyPlan,
  type LegacyCopySnapshot,
  type PlannedCopy,
} from "./legacy-copy";

// The write half of seeding copy from RadioTraffic (docs/underwriting-
// traffic-redesign.md §15). The plan (legacy-copy.ts) decides everything;
// this writes exactly its "ready" copies, through the caller's own session,
// so RLS applies as it does on the copy screens.

/** Everything the plan compares the export against, read in one pass. */
export async function loadLegacyCopySnapshot(): Promise<LegacyCopySnapshot> {
  const supabase = await createClient();
  const [underwriters, copy, contracts, flights, links, lines, pools, revisions] =
    await Promise.all([
      supabase.from("uw_underwriters").select("id, name"),
      supabase
        .from("uw_copy")
        .select(
          "id, underwriter_id, label, cart_identifier, script, execution_kind, duration_seconds, effective_from, effective_to, approval_status, created_at",
        ),
      supabase
        .from("uw_contracts")
        .select(
          "id, underwriter_id, contract_identifier, sponsorship_category, status, effective_from, effective_to",
        ),
      supabase
        .from("uw_contract_flights")
        .select("id, contract_id, name, start_date, end_date, status"),
      supabase.from("uw_contract_copy").select("contract_id, copy_id, flight_id, schedule_line_id"),
      supabase
        .from("uw_contract_schedule_lines")
        .select("id, contract_id, revision_id, label, pool_id")
        .eq("status", "active"),
      supabase.from("uw_inventory_pools").select("id, name"),
      supabase.from("uw_contract_revisions").select("id").eq("status", "current"),
    ]);
  const currentRevisions = new Set(
    (unwrapRead(revisions, "the contracts' current revisions") ?? []).map((row) => row.id),
  );
  const poolName = new Map(
    (unwrapRead(pools, "the inventory pools") ?? []).map((pool) => [pool.id, pool.name]),
  );
  return {
    underwriters: unwrapRead(underwriters, "the underwriters") ?? [],
    copy: unwrapRead(copy, "the copy library") ?? [],
    contracts: unwrapRead(contracts, "the contracts") ?? [],
    flights: unwrapRead(flights, "the contract flights") ?? [],
    links: unwrapRead(links, "the contract copy links") ?? [],
    lines: (unwrapRead(lines, "the contracts' schedule lines") ?? [])
      .filter((line) => currentRevisions.has(line.revision_id))
      .map((line) => ({
        id: line.id,
        contract_id: line.contract_id,
        label: line.label || "Untitled line",
        pool_name: line.pool_id ? (poolName.get(line.pool_id) ?? null) : null,
      })),
  };
}

export type LegacyCopyOutcome = "created" | "updated" | "linked" | "failed";

export interface LegacyCopyImportRow {
  key: string;
  rows: number[];
  underwriter: string;
  label: string;
  outcome: LegacyCopyOutcome;
  /** For a failure: what went wrong. Otherwise what was written, in words. */
  detail: string;
}

export interface LegacyCopyImportResult {
  created: number;
  updated: number;
  linked: number;
  underwriterOnly: number;
  underwritersAdded: string[];
  failed: number;
  rows: LegacyCopyImportRow[];
  rebalanced: { contracts: number; changed: number };
}

/**
 * Writes the plan's ready copies. Each copy is its own small unit — the
 * row, then its links — so one failure never blocks the rest, and a rerun
 * picks up exactly what didn't land: the copy it did create is found again
 * by its script, and a link that exists is skipped.
 */
export async function executeLegacyCopyImport(
  plan: LegacyCopyPlan,
  snapshot: LegacyCopySnapshot,
  actorId: string,
  sourceName: string,
): Promise<LegacyCopyImportResult> {
  const supabase = await createClient();
  const result: LegacyCopyImportResult = {
    created: 0,
    updated: 0,
    linked: 0,
    underwriterOnly: 0,
    underwritersAdded: [],
    failed: 0,
    rows: [],
    rebalanced: { contracts: 0, changed: 0 },
  };

  // Underwriters first. A name that appeared since the preview is reused, never doubled.
  const underwriterIds = new Map<string, string>();
  const failedUnderwriters = new Map<string, string>();
  for (const name of plan.newUnderwriters) {
    const existing = snapshot.underwriters.find(
      (entry) => entry.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (existing) {
      underwriterIds.set(name, existing.id);
      continue;
    }
    const { data, error } = await supabase
      .from("uw_underwriters")
      .insert({ name, created_by: actorId })
      .select("id")
      .single();
    if (error || !data) {
      failedUnderwriters.set(name, error?.message ?? "no row returned");
      continue;
    }
    underwriterIds.set(name, data.id);
    result.underwritersAdded.push(name);
  }

  const touchedContracts = new Set<string>();
  const ready = creationOrder(plan.copies.filter((copy) => copy.status === "ready"));
  for (const planned of ready) {
    const outcome = await writeOne(planned);
    result.rows.push(outcome);
    if (outcome.outcome === "failed") result.failed += 1;
  }

  async function writeOne(planned: PlannedCopy): Promise<LegacyCopyImportRow> {
    const base = {
      key: planned.key,
      rows: planned.rows,
      underwriter:
        planned.underwriter.kind === "unresolved"
          ? planned.sourceUnderwriter
          : planned.underwriter.name,
      label: planned.label,
    };
    const fail = (detail: string): LegacyCopyImportRow => ({ ...base, outcome: "failed", detail });

    const underwriterId =
      planned.underwriter.kind === "matched"
        ? planned.underwriter.id
        : planned.underwriter.kind === "create"
          ? (underwriterIds.get(planned.underwriter.name) ?? null)
          : null;
    if (!underwriterId)
      return fail(
        planned.underwriter.kind === "create"
          ? `Could not add the underwriter: ${failedUnderwriters.get(planned.underwriter.name) ?? "unknown error"}`
          : "No underwriter",
      );

    let copyId: string;
    const done: string[] = [];
    let outcome: LegacyCopyOutcome = "linked";
    if (planned.copy.action === "create") {
      const { data, error } = await supabase
        .from("uw_copy")
        .insert({
          underwriter_id: underwriterId,
          label: planned.label,
          cart_identifier: planned.cart,
          script: planned.script,
          execution_kind: planned.executionKind,
          duration_seconds: planned.durationSeconds,
          effective_from: planned.startDate ?? undefined,
          effective_to: planned.endDate,
          approval_status: "approved",
          created_by: actorId,
        })
        .select("id")
        .single();
      if (error || !data)
        return fail(`Could not create the copy: ${error?.message ?? "no row returned"}`);
      copyId = data.id;
      outcome = "created";
      result.created += 1;
      done.push(
        planned.executionKind === "recorded"
          ? "Created as a recorded spot"
          : "Created as a live read",
      );
    } else if (planned.copy.action === "reuse") {
      copyId = planned.copy.id;
      if (planned.copy.changes.length > 0) {
        const { error } = await supabase
          .from("uw_copy")
          .update(planned.copy.updates)
          .eq("id", copyId);
        if (error) return fail(`Could not update the copy: ${error.message}`);
        // Its existing links re-sequence too: new dates or wording change what may air.
        for (const link of snapshot.links)
          if (link.copy_id === copyId) touchedContracts.add(link.contract_id);
        outcome = "updated";
        result.updated += 1;
        done.push(...planned.copy.changes);
      }
    } else {
      return fail("Nothing to write");
    }

    const newLinks = planned.links.filter((link) => !link.exists);
    for (const link of newLinks) {
      const { error } = await supabase.from("uw_contract_copy").upsert(
        {
          contract_id: link.contractId,
          copy_id: copyId,
          flight_id: link.flightId,
          schedule_line_id: link.scheduleLineId,
        },
        { onConflict: "contract_id,copy_id", ignoreDuplicates: true },
      );
      if (error)
        return {
          ...base,
          outcome: "failed",
          detail: `${done.length > 0 ? `${done.join("; ")}. ` : ""}Could not link it to ${link.contractLabel}: ${error.message}`,
        };
      touchedContracts.add(link.contractId);
      result.linked += 1;
      done.push(
        `Linked to ${link.contractLabel}${link.flightName ? `, ${link.flightName} flight` : ""}${link.scheduleLineLabel ? `, only on ${link.scheduleLineLabel}` : ""}`,
      );
    }
    if (planned.links.length === 0) {
      result.underwriterOnly += 1;
      if (planned.unlinkedReason)
        done.push(`Underwriter only: ${planned.unlinkedReason.toLowerCase()}`);
    }
    return { ...base, outcome, detail: done.join("; ") };
  }

  // Rotation: every contract whose linked copy changed, once each. A no-op
  // for a draft contract; an active one re-sequences its future placements.
  for (const contractId of touchedContracts) {
    const rebalance = await rebalanceContractRotation(contractId, actorId);
    result.rebalanced.contracts += 1;
    result.rebalanced.changed += rebalance.changed;
  }

  await logAuditEvent({
    actorId,
    action: "underwriting.copy.legacy_imported",
    targetType: "uw_copy",
    metadata: {
      source: sourceName,
      created: result.created,
      updated: result.updated,
      linked: result.linked,
      underwriter_only: result.underwriterOnly,
      underwriters_added: result.underwritersAdded,
      failed: result.failed,
      left_out_rows: plan.copies
        .filter((copy) => copy.status === "waiting" || copy.status === "excluded")
        .flatMap((copy) => copy.rows),
      rotation_changed: result.rebalanced.changed,
    },
  });

  return result;
}
