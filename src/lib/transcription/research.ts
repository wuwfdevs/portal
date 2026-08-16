import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import type { Database, SwExcerptLocatorKind } from "@/lib/database.types";

// Sourcework Phase 4 (docs/sourcework-design.md §9): a project-scoped list
// of research questions, plus data points — a reporter's own articulated
// findings, grounded by zero or more excerpts, optionally answering one
// research question. Reads only; writes live in [id]/research-actions.ts.

type Client = SupabaseClient<Database>;

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

/**
 * Resolves each of a set of data points' grounding excerpts, keyed by data
 * point id. Shared by listDataPoints below and Phase 5's getThemeDetail
 * (lib/transcription/themes.ts) — the same chip data either screen renders,
 * so this is the one place it's assembled. Flat queries, per this
 * codebase's established "PostgREST embedding doesn't type reliably"
 * convention (listLibraryClips already follows the same shape).
 */
export async function resolveExcerptRefsForDataPoints(
  supabase: Client,
  dataPointIds: string[],
): Promise<Map<string, DataPointExcerptRef[]>> {
  if (dataPointIds.length === 0) return new Map();

  const links =
    unwrapRead(
      await supabase
        .from("sw_data_point_excerpts")
        .select("data_point_id, excerpt_id")
        .in("data_point_id", dataPointIds),
      "these data points' grounding excerpts",
    ) ?? [];
  if (links.length === 0) return new Map();

  const excerptIds = [...new Set(links.map((link) => link.excerpt_id))];
  const excerpts =
    unwrapRead(
      await supabase
        .from("sw_source_excerpts")
        .select("id, title, locator_kind, start_ms, end_ms, source_id")
        .in("id", excerptIds),
      "these excerpts",
    ) ?? [];

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
  const result = new Map<string, DataPointExcerptRef[]>();
  for (const link of links) {
    const excerpt = excerptById.get(link.excerpt_id);
    if (!excerpt) continue;
    const list = result.get(link.data_point_id) ?? [];
    list.push({
      excerptId: excerpt.id,
      title: excerpt.title,
      locatorKind: excerpt.locator_kind,
      startMs: excerpt.start_ms,
      endMs: excerpt.end_ms,
      pageNumber: firstPageByExcerptId.get(excerpt.id) ?? null,
      sourceId: excerpt.source_id,
    });
    result.set(link.data_point_id, list);
  }
  return result;
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
 * "Add evidence" prompt rather than an empty list).
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

  const excerptsByDataPoint = await resolveExcerptRefsForDataPoints(
    supabase,
    dataPoints.map((dp) => dp.id),
  );

  return dataPoints.map((dataPoint) => ({
    id: dataPoint.id,
    summary: dataPoint.summary,
    researchQuestionId: dataPoint.research_question_id,
    createdAt: dataPoint.created_at,
    excerpts: excerptsByDataPoint.get(dataPoint.id) ?? [],
  }));
}
