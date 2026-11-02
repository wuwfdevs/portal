import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { clearCredit } from "./placement";
import type { UwContractRevisionRow, UwDemandBucketRow, UwScheduledPlacementRow } from "./queries";

/**
 * Contract revisions (docs/underwriting-traffic-redesign.md §9, brief §10):
 * "a revision changes future demand, not historical truth." A draft is
 * entered beside the current revision; activating it, from its effective
 * date, supersedes the current revision's buckets still open on that date,
 * clears the current revision's future placements through the same
 * log_clear_underwriting_credit() an ordinary clear uses, drops the
 * draft's own buckets that end before the date (so no history is counted
 * twice), and makes the draft current. Aired placements, broadcast events,
 * exceptions, and the superseded revision's lines all stay exactly as
 * they were — read-only history, still visible on the contract page and
 * still counted by affidavits.
 */

export interface RevisionActivationPreview {
  revision: UwContractRevisionRow;
  current: UwContractRevisionRow | null;
  /** The current revision's active buckets still open on the effective date — they become superseded. */
  bucketsToSupersede: UwDemandBucketRow[];
  /** The current revision's active placements dated on or after the effective date — they are cleared. */
  placementsToClear: UwScheduledPlacementRow[];
  /** Placements before the effective date that stay with the old revision (already aired or about to). */
  placementsKept: number;
  /** Awaiting-slot makegoods under the current revision — left open for staff to resolve or cancel. */
  makegoodsLeftOpen: number;
  /** The draft's own buckets that end before its effective date — dropped at activation. */
  draftBucketsDropped: UwDemandBucketRow[];
}

async function lineIdsForRevision(revisionId: string): Promise<string[]> {
  const supabase = await createClient();
  const rows =
    unwrapRead(
      await supabase.from("uw_contract_schedule_lines").select("id").eq("revision_id", revisionId),
      "this revision's schedule lines",
    ) ?? [];
  return rows.map((row) => row.id);
}

/** What activating this draft would change — shown before the click, and the exact set the activation acts on. */
export async function previewRevisionActivation(
  revisionId: string,
): Promise<RevisionActivationPreview | null> {
  const supabase = await createClient();
  const revision = unwrapRead(
    await supabase.from("uw_contract_revisions").select("*").eq("id", revisionId).maybeSingle(),
    "this revision",
  );
  if (!revision) return null;

  const current = unwrapRead(
    await supabase
      .from("uw_contract_revisions")
      .select("*")
      .eq("contract_id", revision.contract_id)
      .eq("status", "current")
      .maybeSingle(),
    "the current revision",
  );

  const [currentLineIds, draftLineIds] = await Promise.all([
    current ? lineIdsForRevision(current.id) : Promise.resolve([]),
    lineIdsForRevision(revision.id),
  ]);

  const bucketsToSupersede =
    currentLineIds.length === 0
      ? []
      : (unwrapRead(
          await supabase
            .from("uw_demand_buckets")
            .select("*")
            .in("schedule_line_id", currentLineIds)
            .eq("status", "active")
            .gte("period_end", revision.effective_from)
            .order("period_start"),
          "the current revision's open demand",
        ) ?? []);

  const currentPlacements =
    currentLineIds.length === 0
      ? []
      : (unwrapRead(
          await supabase
            .from("uw_scheduled_placements")
            .select("*")
            .in("schedule_line_id", currentLineIds)
            .neq("status", "superseded")
            .order("scheduled_at"),
          "the current revision's placements",
        ) ?? []);
  const placementsToClear = currentPlacements.filter(
    (placement) => placement.placement_date >= revision.effective_from,
  );

  const makegoods =
    currentLineIds.length === 0
      ? []
      : (unwrapRead(
          await supabase
            .from("uw_makegoods")
            .select("id")
            .in("schedule_line_id", currentLineIds)
            .eq("status", "scheduled")
            .is("scheduled_placement_id", null),
          "the current revision's open makegoods",
        ) ?? []);

  const draftBucketsDropped =
    draftLineIds.length === 0
      ? []
      : (unwrapRead(
          await supabase
            .from("uw_demand_buckets")
            .select("*")
            .in("schedule_line_id", draftLineIds)
            .lt("period_end", revision.effective_from)
            .order("period_start"),
          "the draft's early demand",
        ) ?? []);

  return {
    revision,
    current,
    bucketsToSupersede,
    placementsToClear,
    placementsKept: currentPlacements.length - placementsToClear.length,
    makegoodsLeftOpen: makegoods.length,
    draftBucketsDropped,
  };
}

/**
 * Activates a draft revision per the preview above. Returns a message on
 * failure, null on success. Not one SQL transaction — each step is
 * idempotent and the order is chosen so a failure part-way leaves the
 * contract schedulable: placements are cleared before demand is
 * superseded, and the status flip is last.
 */
export async function activateRevision(
  revisionId: string,
  actorId: string,
): Promise<string | null> {
  const preview = await previewRevisionActivation(revisionId);
  if (!preview) return "That revision no longer exists.";
  if (preview.revision.status !== "draft") return "Only a draft revision can be activated.";
  const supabase = await createClient();

  for (const placement of preview.placementsToClear) {
    const result = await clearCredit(placement.id);
    if (!result.ok) return `Could not clear a future placement: ${result.message}`;
  }

  if (preview.bucketsToSupersede.length > 0) {
    const { error } = await supabase
      .from("uw_demand_buckets")
      .update({ status: "superseded", superseded_by_revision_id: revisionId })
      .in(
        "id",
        preview.bucketsToSupersede.map((bucket) => bucket.id),
      );
    if (error) return `Could not supersede the current revision's demand: ${error.message}`;
  }

  if (preview.draftBucketsDropped.length > 0) {
    const { error } = await supabase
      .from("uw_demand_buckets")
      .delete()
      .in(
        "id",
        preview.draftBucketsDropped.map((bucket) => bucket.id),
      );
    if (error) return `Could not drop the draft's early demand: ${error.message}`;
  }

  if (preview.current) {
    const { error } = await supabase
      .from("uw_contract_revisions")
      .update({ status: "superseded" })
      .eq("id", preview.current.id);
    if (error) return `Could not supersede the current revision: ${error.message}`;
  }

  const { error } = await supabase
    .from("uw_contract_revisions")
    .update({
      status: "current",
      supersedes_revision_id: preview.current?.id ?? null,
      activated_at: new Date().toISOString(),
      activated_by: actorId,
    })
    .eq("id", revisionId);
  return error ? `Could not activate the revision: ${error.message}` : null;
}
