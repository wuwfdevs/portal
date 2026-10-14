import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import type { SwSourceKind } from "@/lib/database.types";
import type { BackgroundLink, ContextNote, DataPoint } from "./research";
import type { QuoteSuggestion } from "./quotes";
import {
  DATA_POINT_COLUMNS,
  listBackgroundForPoints,
  listContextNotes,
  listResearchQuestions,
  spansFor,
  toDataPoint,
} from "./research-queries";
import { listWaitingClipsForProject } from "./quote-queries";

// The reads behind the project's Review tab (docs/sourcework-analysis-design.md §25): every finding
// and clip Analyze left waiting, across all of the project's current sources, in one list. Through
// the caller's session, so RLS is still the boundary.

export interface ReviewSource {
  id: string;
  title: string;
  kind: SwSourceKind;
}

export interface ReviewGroup {
  source: ReviewSource;
  points: DataPoint[];
  clips: QuoteSuggestion[];
}

export interface ProjectReview {
  groups: ReviewGroup[];
  pointCount: number;
  clipCount: number;
  /** Question id -> "Q1", for the card tags. */
  labels: Record<string, string>;
  /** Question id -> the question as worded. */
  questionTexts: Record<string, string>;
  /** Finding id -> the pages the model consulted for it. */
  background: Record<string, BackgroundLink[]>;
  /** Every page consulted in this project that nobody dismissed. */
  pagesConsulted: ContextNote[];
}

/**
 * What is waiting for a decision in a project. `sources` are its current sources (a detached source's
 * leftovers do not count), in the order the project lists them; a source with nothing waiting is left out.
 */
export async function getProjectReview(
  projectId: string,
  sources: readonly ReviewSource[],
): Promise<ProjectReview> {
  const supabase = await createClient();
  const current = new Set(sources.map((source) => source.id));
  const [rows, clips, questions, notes] = await Promise.all([
    supabase
      .from("sw_data_points")
      .select(DATA_POINT_COLUMNS)
      .eq("project_id", projectId)
      .eq("status", "suggested")
      .order("created_at")
      .order("id")
      .then((result) => unwrapRead(result, "this project's findings to review") ?? []),
    listWaitingClipsForProject(projectId),
    listResearchQuestions(projectId),
    listContextNotes(projectId),
  ]);

  const waitingRows = rows.filter((row) => current.has(row.source_id));
  const spans = await spansFor(waitingRows.map((row) => row.id));
  const points = waitingRows.map((row) => toDataPoint(row, spans.get(row.id) ?? []));
  const waitingClips = clips.filter((clip) => current.has(clip.sourceId));

  const background = await listBackgroundForPoints(points.map((point) => point.id));
  const groups: ReviewGroup[] = [];
  for (const source of sources) {
    const sourcePoints = points
      .filter((point) => point.sourceId === source.id)
      .sort((a, b) => spanOrder(a) - spanOrder(b));
    const sourceClips = waitingClips.filter((clip) => clip.sourceId === source.id);
    if (sourcePoints.length === 0 && sourceClips.length === 0) continue;
    groups.push({ source, points: sourcePoints, clips: sourceClips });
  }

  return {
    groups,
    pointCount: points.length,
    clipCount: waitingClips.length,
    labels: Object.fromEntries(questions.map((question) => [question.id, question.label])),
    background: Object.fromEntries(background),
    pagesConsulted: notes.filter((note) => note.status === "active"),
    questionTexts: Object.fromEntries(
      questions.map((question) => [question.id, question.question]),
    ),
  };
}

/** Where a finding sits in its source: first start time, or page, so a group reads in the order it occurs. */
function spanOrder(point: DataPoint): number {
  const span = point.spans[0];
  if (!span) return Number.MAX_SAFE_INTEGER;
  return span.kind === "temporal" ? span.startMs : span.pageNumber * 1_000_000;
}

/** How many findings and clips wait, for the tab's badge. Counts only the project's current sources. */
export async function countWaitingReview(
  projectId: string,
  sourceIds: readonly string[],
): Promise<number> {
  if (sourceIds.length === 0) return 0;
  const supabase = await createClient();
  const current = new Set(sourceIds);
  const [points, clips] = await Promise.all([
    supabase
      .from("sw_data_points")
      .select("source_id")
      .eq("project_id", projectId)
      .eq("status", "suggested")
      .then((result) => unwrapRead(result, "this project's findings to review") ?? []),
    supabase
      .from("sw_quote_suggestions")
      .select("source_id")
      .eq("project_id", projectId)
      .eq("status", "suggested")
      .then((result) => unwrapRead(result, "this project's clips to review") ?? []),
  ]);
  return (
    points.filter((row) => current.has(row.source_id)).length +
    clips.filter((row) => current.has(row.source_id)).length
  );
}
