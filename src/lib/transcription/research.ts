import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import type { Database, SwExcerptLocatorKind } from "@/lib/database.types";

// Sourcework Phase 4 (docs/sourcework-design.md §9): a project-scoped list
// of research questions, plus data points — a reporter's own articulated
// findings, grounded by zero or more excerpts, optionally answering one
// research question. Reads only; writes live in [id]/research-actions.ts.

export type SwResearchQuestion = Database["public"]["Tables"]["sw_research_questions"]["Row"];

export async function listResearchQuestions(projectId: string): Promise<SwResearchQuestion[]> {
  const supabase = await createClient();
  const rows = unwrapRead(
    await supabase
      .from("sw_research_questions")
      .select("*")
      .eq("project_id", projectId)
      .order("position"),
    "this project's research questions",
  );
  return rows ?? [];
}

/** One excerpt grounding a data point — just enough to render a chip and deep-link back to it. */
export interface DataPointExcerptRef {
  excerptId: string;
  title: string;
  locatorKind: SwExcerptLocatorKind;
  startMs: number | null;
  endMs: number | null;
  /** Document excerpts only — the first spanned page (§8.7's deep-link shape). */
  pageNumber: number | null;
  sourceId: string;
}

export interface ProjectDataPoint {
  id: string;
  summary: string;
  researchQuestionId: string | null;
  createdAt: string;
  excerpts: DataPointExcerptRef[];
}

/**
 * A project's data points, oldest first, each with its grounding excerpts
 * (§9.3 — a data point may have none, which the Research tab shows as an
 * "Add evidence" prompt rather than an empty list). Flat queries, per this
 * codebase's established "PostgREST embedding doesn't type reliably"
 * convention (listLibraryClips already follows the same shape).
 */
export async function listDataPoints(projectId: string): Promise<ProjectDataPoint[]> {
  const supabase = await createClient();

  const dataPoints =
    unwrapRead(
      await supabase
        .from("sw_data_points")
        .select("id, summary, research_question_id, created_at")
        .eq("project_id", projectId)
        .order("created_at"),
      "this project's data points",
    ) ?? [];
  if (dataPoints.length === 0) return [];

  const dataPointIds = dataPoints.map((dp) => dp.id);
  const links =
    unwrapRead(
      await supabase
        .from("sw_data_point_excerpts")
        .select("data_point_id, excerpt_id")
        .in("data_point_id", dataPointIds),
      "these data points' grounding excerpts",
    ) ?? [];

  const excerptIds = [...new Set(links.map((link) => link.excerpt_id))];
  const excerpts =
    excerptIds.length === 0
      ? []
      : (unwrapRead(
          await supabase
            .from("sw_source_excerpts")
            .select("id, title, locator_kind, start_ms, end_ms, source_id")
            .in("id", excerptIds),
          "these excerpts",
        ) ?? []);

  const documentExcerptIds = excerpts
    .filter((excerpt) => excerpt.locator_kind === "document")
    .map((excerpt) => excerpt.id);
  const locations =
    documentExcerptIds.length === 0
      ? []
      : (unwrapRead(
          await supabase
            .from("sw_excerpt_document_locations")
            .select("excerpt_id, page_number, sequence")
            .in("excerpt_id", documentExcerptIds)
            .order("sequence"),
          "these excerpts' page locations",
        ) ?? []);

  const firstPageByExcerptId = new Map<string, number>();
  for (const location of locations) {
    if (!firstPageByExcerptId.has(location.excerpt_id)) {
      firstPageByExcerptId.set(location.excerpt_id, location.page_number);
    }
  }

  const excerptById = new Map(excerpts.map((excerpt) => [excerpt.id, excerpt]));
  const excerptIdsByDataPoint = new Map<string, string[]>();
  for (const link of links) {
    const list = excerptIdsByDataPoint.get(link.data_point_id) ?? [];
    list.push(link.excerpt_id);
    excerptIdsByDataPoint.set(link.data_point_id, list);
  }

  return dataPoints.map((dataPoint) => ({
    id: dataPoint.id,
    summary: dataPoint.summary,
    researchQuestionId: dataPoint.research_question_id,
    createdAt: dataPoint.created_at,
    excerpts: (excerptIdsByDataPoint.get(dataPoint.id) ?? [])
      .map((excerptId) => excerptById.get(excerptId))
      .filter((excerpt): excerpt is NonNullable<typeof excerpt> => Boolean(excerpt))
      .map((excerpt) => ({
        excerptId: excerpt.id,
        title: excerpt.title,
        locatorKind: excerpt.locator_kind,
        startMs: excerpt.start_ms,
        endMs: excerpt.end_ms,
        pageNumber: firstPageByExcerptId.get(excerpt.id) ?? null,
        sourceId: excerpt.source_id,
      })),
  }));
}
