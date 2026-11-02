import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readPage } from "@/lib/pagination-read";
import { pageRange } from "@/lib/pagination";
import type { DataPointKind, DataPointStatus } from "./research";

// The read behind the project's Data points section (`?view=points`): findings already decided on
// (or all of them), across the project's current sources, a page at a time. Browsing only; deciding
// stays on the Review tab. Through the caller's session, so RLS is still the boundary.

export type PointsFilter = "accepted" | "rejected" | "all";

export function parsePointsFilter(raw: string | undefined): PointsFilter {
  return raw === "rejected" || raw === "all" ? raw : "accepted";
}

export interface BrowsedPoint {
  id: string;
  sourceId: string;
  questionId: string | null;
  relevance: "question" | "story" | "general";
  claim: string;
  significance: string | null;
  kind: DataPointKind;
  status: DataPointStatus;
}

export async function listProjectPoints(
  projectId: string,
  sourceIds: readonly string[],
  options: { filter: PointsFilter; page: number },
): Promise<{ rows: BrowsedPoint[]; total: number }> {
  if (sourceIds.length === 0) return { rows: [], total: 0 };
  const supabase = await createClient();
  const { from, to } = pageRange(options.page);
  const base = () => {
    const query = supabase
      .from("sw_data_points")
      .select("id, source_id, question_id, relevance, claim, significance, kind, status", {
        count: "exact",
      })
      .eq("project_id", projectId)
      .in("source_id", [...sourceIds]);
    return options.filter === "all"
      ? query.neq("status", "suggested")
      : query.eq("status", options.filter);
  };
  const { rows, total } = await readPage(
    await base().order("created_at").order("id").range(from, to),
    "this project's data points",
    async () => (await base().limit(0)).count ?? 0,
  );
  return {
    rows: rows.map((row) => ({
      id: row.id,
      sourceId: row.source_id,
      questionId: row.question_id,
      relevance: row.relevance,
      claim: row.claim,
      significance: row.significance,
      kind: row.kind,
      status: row.status,
    })),
    total,
  };
}
