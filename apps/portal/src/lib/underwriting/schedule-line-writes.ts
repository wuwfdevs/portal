import "server-only";
// The one write path for a new schedule line: the row, then its compiled
// demand buckets. Shared by the schedule editor's addScheduleLine and the
// agreement import (agreement-import-service.ts, docs/underwriting-
// traffic-redesign.md §12), so a line read from a document is stored exactly the
// way a hand-entered one is — same parser upstream, same insert here.

import type { createClient } from "@/lib/supabase/server";
import type { ParsedScheduleLine } from "./schedule-line-form";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export interface ScheduleLineOwner {
  contractId: string;
  revisionId: string;
  createdBy: string;
}

export type InsertScheduleLineResult = { ok: true; id: string } | { ok: false; error: string };

export async function insertScheduleLineWithBuckets(
  supabase: ServerSupabase,
  owner: ScheduleLineOwner,
  parsed: ParsedScheduleLine,
): Promise<InsertScheduleLineResult> {
  const { entry_spec, ...lineFields } = parsed.line;
  const { data, error } = await supabase
    .from("uw_contract_schedule_lines")
    .insert({
      ...lineFields,
      entry_spec,
      contract_id: owner.contractId,
      revision_id: owner.revisionId,
      created_by: owner.createdBy,
    })
    .select("id")
    .single();
  if (error) {
    console.error("Could not add the schedule line", error);
    return { ok: false, error: `Could not add the schedule line: ${error.message}` };
  }
  if (!data) return { ok: false, error: "Could not add the schedule line." };

  const { error: bucketError } = await supabase.from("uw_demand_buckets").insert(
    parsed.buckets.map((bucket) => ({
      schedule_line_id: data.id,
      period_start: bucket.periodStart,
      period_end: bucket.periodEnd,
      quantity_required: bucket.quantity,
      source_label: bucket.sourceLabel,
    })),
  );
  if (bucketError) {
    console.error("Added the line, but could not save its demand", bucketError);
    return {
      ok: false,
      error: `Added the line, but could not save its demand: ${bucketError.message}`,
    };
  }
  return { ok: true, id: data.id };
}
