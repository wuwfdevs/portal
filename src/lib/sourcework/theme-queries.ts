import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { groupBy } from "@/lib/collections";
import { getDisplayNames } from "@/lib/profile-names";
import type { Database } from "@/lib/database.types";
import { DATA_POINT_COLUMNS, chunked, spansFor, toDataPoint } from "./research-queries";
import type { DataPoint, DataPointSpan } from "./research";
import {
  EMPTY_BREADTH,
  buildThemeHistory,
  type EvidenceItem,
  type HistoryEntry,
  type MergeSuggestion,
  type Stance,
  type Theme,
  type ThemeBreadth,
  type ThemeRow,
} from "./themes";

// Reads behind the Themes tab and the theme page (docs/sourcework-analysis-
// design.md §5.4, §7.1). Everything goes through the caller's session, so RLS
// is still the boundary, and a failed read throws rather than rendering as an
// empty state. Rejected themes are included (a reporter can bring one back);
// merged-away themes never are.

type Tables = Database["public"]["Tables"];

const THEME_COLUMNS =
  "id, project_id, title, definition, memo, status, origin, run_id, prompt_version_id, created_by, created_at, accepted_by, accepted_at";

type ThemeRowFields = Pick<
  Tables["sw_themes"]["Row"],
  | "id"
  | "project_id"
  | "title"
  | "definition"
  | "memo"
  | "status"
  | "origin"
  | "created_by"
  | "created_at"
  | "accepted_by"
  | "accepted_at"
>;

function toTheme(row: ThemeRowFields): Theme {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    definition: row.definition,
    memo: row.memo,
    status: row.status,
    origin: row.origin,
    createdBy: row.created_by,
    createdAt: row.created_at,
    acceptedBy: row.accepted_by,
    acceptedAt: row.accepted_at,
  };
}

// The Themes tab ------------------------------------------------------------------

/** Every live theme of a project (rejected included) with its computed breadth and the questions it answers. */
export async function listThemeRows(projectId: string): Promise<ThemeRow[]> {
  const supabase = await createClient();
  const [themeResult, breadthResult, questionResult] = await Promise.all([
    supabase
      .from("sw_themes")
      .select(THEME_COLUMNS)
      .eq("project_id", projectId)
      .is("merged_into_id", null)
      .order("created_at")
      .order("id"),
    supabase
      .from("sw_theme_breadth")
      .select("theme_id, source_count, speaker_count, supporting, complicating")
      .eq("project_id", projectId),
    supabase.from("sw_theme_questions").select("theme_id, question_id").eq("project_id", projectId),
  ]);
  const themes = unwrapRead(themeResult, "this project's themes") ?? [];
  const breadth = new Map(
    (unwrapRead(breadthResult, "this project's theme numbers") ?? []).map((row) => [
      row.theme_id,
      toBreadth(row),
    ]),
  );
  const questions = groupBy(
    unwrapRead(questionResult, "this project's theme questions") ?? [],
    (row) => row.theme_id,
  );
  return themes.map((row) => ({
    ...toTheme(row),
    breadth: breadth.get(row.id) ?? EMPTY_BREADTH,
    questionIds: (questions.get(row.id) ?? []).map((link) => link.question_id),
  }));
}

function toBreadth(row: {
  source_count: number;
  speaker_count: number;
  supporting: number;
  complicating: number;
}): ThemeBreadth {
  return {
    sourceCount: row.source_count,
    speakerCount: row.speaker_count,
    supporting: row.supporting,
    complicating: row.complicating,
  };
}

export interface MergeRow extends MergeSuggestion {
  fromTitle: string;
  intoTitle: string;
}

/** Merge suggestions still waiting, between two themes that are both still live and accepted. */
export async function listPendingMerges(projectId: string): Promise<MergeRow[]> {
  const supabase = await createClient();
  const rows =
    unwrapRead(
      await supabase
        .from("sw_theme_merge_suggestions")
        .select("id, from_theme_id, into_theme_id, reason, created_at")
        .eq("project_id", projectId)
        .eq("status", "suggested")
        .order("created_at")
        .order("id"),
      "this project's merge suggestions",
    ) ?? [];
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.flatMap((row) => [row.from_theme_id, row.into_theme_id]))];
  const themes = unwrapRead(
    await supabase.from("sw_themes").select("id, title, status, merged_into_id").in("id", ids),
    "the themes in a merge suggestion",
  );
  const byId = new Map((themes ?? []).map((theme) => [theme.id, theme]));
  const live = (id: string) => {
    const theme = byId.get(id);
    return theme && theme.status === "accepted" && theme.merged_into_id === null ? theme : null;
  };
  return rows.flatMap((row) => {
    const from = live(row.from_theme_id);
    const into = live(row.into_theme_id);
    if (!from || !into) return [];
    return [
      {
        id: row.id,
        fromThemeId: row.from_theme_id,
        intoThemeId: row.into_theme_id,
        reason: row.reason,
        createdAt: row.created_at,
        fromTitle: from.title,
        intoTitle: into.title,
      },
    ];
  });
}

/** What the tab's badge counts: suggested themes plus merges between live themes. */
export async function getThemeDecisionCounts(
  projectId: string,
): Promise<{ suggestedThemes: number; suggestedMerges: number }> {
  const supabase = await createClient();
  const row = unwrapRead(
    await supabase
      .from("sw_theme_decision_counts")
      .select("suggested_themes, suggested_merges")
      .eq("project_id", projectId)
      .maybeSingle(),
    "this project's theme decisions",
  );
  return {
    suggestedThemes: row?.suggested_themes ?? 0,
    suggestedMerges: row?.suggested_merges ?? 0,
  };
}

/**
 * Whether the Themes tab shows (§12.6): once a project has a research question
 * or any data point. A project with neither looks as it always did.
 */
export async function hasResearchSignal(projectId: string): Promise<boolean> {
  const supabase = await createClient();
  const [questions, points] = await Promise.all([
    supabase
      .from("sw_research_questions")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("archived_at", null),
    supabase
      .from("sw_data_points")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId),
  ]);
  const questionCount = unwrapRead(
    { data: questions.count, error: questions.error },
    "this project's research questions",
  );
  const pointCount = unwrapRead(
    { data: points.count, error: points.error },
    "this project's data points",
  );
  return (questionCount ?? 0) > 0 || (pointCount ?? 0) > 0;
}

/** The numbers behind the "Waiting for you" strip, apart from the decisions (getThemeDecisionCounts). */
export async function getWaitingNumbers(projectId: string): Promise<{
  toReviewBySource: { sourceId: string; count: number }[];
  unthemed: number;
}> {
  const supabase = await createClient();
  const [counts, pool] = await Promise.all([
    supabase
      .from("sw_data_point_counts")
      .select("source_id, to_review")
      .eq("project_id", projectId),
    supabase
      .from("sw_unthemed_data_points")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId),
  ]);
  const rows = unwrapRead(counts, "this project's data point counts") ?? [];
  const unthemed = unwrapRead(
    { data: pool.count, error: pool.error },
    "this project's unfiled data points",
  );
  return {
    toReviewBySource: rows.map((row) => ({ sourceId: row.source_id, count: row.to_review })),
    unthemed: unthemed ?? 0,
  };
}

// A source's data points, with where they sit --------------------------------------------

export interface PointThemeLink {
  themeId: string;
  title: string;
  stance: Stance;
}

/** For each given data point, the accepted themes it sits in (what a card's "Theme:" line names). */
export async function listThemesForDataPoints(
  dataPointIds: readonly string[],
): Promise<Map<string, PointThemeLink[]>> {
  const result = new Map<string, PointThemeLink[]>();
  if (dataPointIds.length === 0) return result;
  const supabase = await createClient();

  const links: Pick<
    Tables["sw_data_point_themes"]["Row"],
    "data_point_id" | "theme_id" | "stance"
  >[] = [];
  for (const ids of chunked(dataPointIds)) {
    links.push(
      ...(unwrapRead(
        await supabase
          .from("sw_data_point_themes")
          .select("data_point_id, theme_id, stance")
          .in("data_point_id", ids)
          .is("removed_at", null),
        "these data points' themes",
      ) ?? []),
    );
  }
  if (links.length === 0) return result;

  const themeIds = [...new Set(links.map((link) => link.theme_id))];
  const themes = new Map<string, string>();
  for (const ids of chunked(themeIds)) {
    for (const theme of unwrapRead(
      await supabase
        .from("sw_themes")
        .select("id, title")
        .in("id", ids)
        .eq("status", "accepted")
        .is("merged_into_id", null),
      "these data points' themes",
    ) ?? []) {
      themes.set(theme.id, theme.title);
    }
  }
  for (const link of links) {
    const title = themes.get(link.theme_id);
    if (!title) continue;
    const list = result.get(link.data_point_id) ?? [];
    list.push({ themeId: link.theme_id, title, stance: link.stance });
    result.set(link.data_point_id, list);
  }
  return result;
}

// The theme page --------------------------------------------------------------------------

export interface ThemeEvidence {
  item: EvidenceItem;
  spans: DataPointSpan[];
  assignedBy: "model" | "person";
}

export interface ThemeDetail {
  theme: Theme;
  breadth: ThemeBreadth;
  questionIds: string[];
  evidence: ThemeEvidence[];
  history: HistoryEntry[];
  /** Whether this theme was folded into another (the page then points there). */
  mergedIntoId: string | null;
  createdByName: string | null;
  acceptedByName: string | null;
}

export function evidencePosition(spans: readonly DataPointSpan[]): number {
  const first = spans[0];
  if (!first) return Number.MAX_SAFE_INTEGER;
  return first.kind === "temporal" ? first.startMs : first.pageNumber * 1_000_000;
}

/**
 * One theme with the accepted data points behind it, grouped later by the
 * caller. `sourceTitles` is the project's *current* sources: a detached
 * source's data points stay stored but never show, the same rule the counts
 * follow. Null when the theme isn't in this project.
 */
export async function getThemeDetail(
  projectId: string,
  themeId: string,
  sourceTitles: ReadonlyMap<string, string>,
): Promise<ThemeDetail | null> {
  const supabase = await createClient();
  const themeRow = unwrapRead(
    await supabase
      .from("sw_themes")
      .select(`${THEME_COLUMNS}, merged_into_id, run_id`)
      .eq("id", themeId)
      .eq("project_id", projectId)
      .maybeSingle(),
    "this theme",
  );
  if (!themeRow) return null;

  const [breadthResult, questionResult, membershipResult] = await Promise.all([
    supabase
      .from("sw_theme_breadth")
      .select("source_count, speaker_count, supporting, complicating")
      .eq("theme_id", themeId)
      .maybeSingle(),
    supabase.from("sw_theme_questions").select("question_id").eq("theme_id", themeId),
    supabase
      .from("sw_data_point_themes")
      .select("data_point_id, stance, assigned_by, run_id, created_at")
      .eq("theme_id", themeId)
      .is("removed_at", null)
      .order("created_at"),
  ]);
  const breadthRow = unwrapRead(breadthResult, "this theme's numbers");
  const questionIds = (unwrapRead(questionResult, "this theme's questions") ?? []).map(
    (row) => row.question_id,
  );
  const memberships = unwrapRead(membershipResult, "this theme's data points") ?? [];

  const points: DataPoint[] = [];
  for (const ids of chunked(memberships.map((m) => m.data_point_id))) {
    const rows =
      unwrapRead(
        await supabase.from("sw_data_points").select(DATA_POINT_COLUMNS).in("id", ids),
        "this theme's data points",
      ) ?? [];
    points.push(...rows.map((row) => toDataPoint(row, [])));
  }
  const currentPoints = points.filter((point) => sourceTitles.has(point.sourceId));
  const spans = await spansFor(
    currentPoints.filter((point) => point.status === "accepted").map((point) => point.id),
  );
  const byPoint = new Map(currentPoints.map((point) => [point.id, point]));

  const evidence: ThemeEvidence[] = [];
  for (const membership of memberships) {
    const point = byPoint.get(membership.data_point_id);
    if (!point || point.status !== "accepted") continue;
    const pointSpans = spans.get(point.id) ?? [];
    evidence.push({
      item: {
        dataPointId: point.id,
        sourceId: point.sourceId,
        sourceTitle: sourceTitles.get(point.sourceId) ?? "Source",
        stance: membership.stance,
        claim: point.claim,
        position: evidencePosition(pointSpans),
      },
      spans: pointSpans,
      assignedBy: membership.assigned_by,
    });
  }

  const names = await getDisplayNames([themeRow.created_by, themeRow.accepted_by], {
    degrade: true,
  });
  const theme = toTheme(themeRow);
  const createdByName = names.get(theme.createdBy) ?? null;
  const acceptedByName = theme.acceptedBy ? (names.get(theme.acceptedBy) ?? null) : null;

  return {
    theme,
    breadth: breadthRow ? toBreadth(breadthRow) : EMPTY_BREADTH,
    questionIds,
    evidence,
    mergedIntoId: themeRow.merged_into_id,
    createdByName,
    acceptedByName,
    history: buildThemeHistory({
      theme: { ...theme, runId: themeRow.run_id },
      createdByName,
      acceptedByName,
      memberships: memberships
        .filter((m) => {
          const point = byPoint.get(m.data_point_id);
          return Boolean(point);
        })
        .map((m) => ({
          createdAt: m.created_at,
          assignedBy: m.assigned_by,
          runId: m.run_id,
          sourceTitle: sourceTitles.get(byPoint.get(m.data_point_id)!.sourceId) ?? "a source",
        })),
    }),
  };
}

/** Accepted data points of the project that are not in this theme — the "Add data points" picker. */
export async function listPointsNotInTheme(
  projectId: string,
  themeId: string,
  sourceTitles: ReadonlyMap<string, string>,
  limit = 200,
): Promise<{ id: string; claim: string; sourceTitle: string }[]> {
  const supabase = await createClient();
  const [pointResult, memberResult] = await Promise.all([
    supabase
      .from("sw_data_points")
      .select("id, source_id, claim, created_at")
      .eq("project_id", projectId)
      .eq("status", "accepted")
      .order("created_at")
      .order("id")
      .limit(1000),
    supabase
      .from("sw_data_point_themes")
      .select("data_point_id")
      .eq("theme_id", themeId)
      .is("removed_at", null),
  ]);
  const members = new Set(
    (unwrapRead(memberResult, "this theme's data points") ?? []).map((row) => row.data_point_id),
  );
  return (unwrapRead(pointResult, "this project's data points") ?? [])
    .filter((row) => !members.has(row.id) && sourceTitles.has(row.source_id))
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      claim: row.claim,
      sourceTitle: sourceTitles.get(row.source_id) ?? "Source",
    }));
}
