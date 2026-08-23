import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  planAssignedContentPlacements,
  type InsertedBreakLike,
  type OpportunityAssignmentLike,
} from "@/lib/log/opportunity-assignments";
import { getContentItemsWithComponents } from "@/lib/log/queries";
import type { RundownBreakDraft } from "@/lib/log/rundown-generation";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The Log-side half of assigned-content placement — reads
 * log_opportunity_assignments and the content items they reference through
 * the caller's own RLS-scoped session (a Log-access session always has
 * has_log_access, so no boundary-crossing is needed here), plans with the
 * shared pure lib/log/opportunity-assignments.ts logic, and writes the
 * result. Underwriting's own auto-fill provisioning calls the same planner
 * directly (lib/underwriting/rundown-provisioning.ts) but reads/writes
 * through security-definer functions instead, since an underwriting-only
 * session has no RLS access to any of Log's tables at all — see that file
 * and 20260810130000_log_opportunity_assignment_placement_boundary.sql.
 *
 * insertedBreaks must only ever contain genuinely new rows, never a
 * pre-existing break — generateRundown/syncRundownBreaks already guarantee
 * this via their upsert + ignoreDuplicates' own .select(). Without that
 * guarantee this would re-place assigned content into a break that may
 * already hold it.
 *
 * Best-effort: a failed write here never fails the rundown generation that
 * triggered it — matching this repo's "an embedding failure is never fatal
 * to the write that triggered it" precedent (lib/transcription/indexing.ts)
 * for a secondary enhancement layered on an already-succeeded primary
 * write. The break still exists either way; a host can always place
 * something by hand.
 */
export async function placeAssignedContent(
  supabase: SupabaseServerClient,
  insertedBreaks: InsertedBreakLike[],
  drafts: RundownBreakDraft[],
  airDateISO: string,
): Promise<void> {
  if (insertedBreaks.length === 0) return;

  const opportunityIds = [
    ...new Set(
      insertedBreaks
        .map((brk) => brk.local_opportunity_id)
        .filter((id): id is string => id !== null),
    ),
  ];
  if (opportunityIds.length === 0) return;
  const { data: assignmentRows, error: assignmentsError } = await supabase
    .from("log_opportunity_assignments")
    .select("id, local_opportunity_id, content_item_id, hour_index, days_of_week, active")
    .in("local_opportunity_id", opportunityIds)
    .eq("active", true);
  if (assignmentsError) {
    console.error("Could not load opportunity assignments:", assignmentsError.message);
    return;
  }
  const assignments: OpportunityAssignmentLike[] = assignmentRows ?? [];
  if (assignments.length === 0) return;

  const contentItemIds = [...new Set(assignments.map((assignment) => assignment.content_item_id))];
  const contentItemDetails = await getContentItemsWithComponents(contentItemIds);
  const contentItems = new Map(
    [...contentItemDetails].map(([id, item]) => [
      id,
      { expected_duration_seconds: item.expected_duration_seconds, components: item.components },
    ]),
  );

  const rows = planAssignedContentPlacements(insertedBreaks, drafts, assignments, contentItems, airDateISO);
  if (rows.length === 0) return;

  const { error } = await supabase.from("log_rundown_items").insert(rows);
  if (error) {
    console.error("Could not auto-place assigned content:", error.message);
  }
}
