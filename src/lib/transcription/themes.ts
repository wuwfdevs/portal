import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { resolveExcerptRefsForDataPoints, type DataPointExcerptRef } from "@/lib/transcription/research";

// Sourcework Phase 5 (docs/sourcework-analysis-design.md): themes group
// Phase 4 data points into a pattern, optionally nested under a parent
// theme (a "meta-theme" is simply a theme with children — no separate
// table) and optionally answering one research question. NOT
// project-scoped (§2) — membership derives entirely from which data points
// a theme groups, which can span more than one project.

export interface ThemeListItem {
  id: string;
  title: string;
  notes: string | null;
  parentThemeId: string | null;
  researchQuestionId: string | null;
  dataPointCount: number;
  /** Deduped project titles behind this theme's data points — the derived "spans: A, B" read from §5. */
  projectTitles: string[];
}

/** Every theme the caller can see (all of them — there is no project to scope this to), for the Themes tab. */
export async function listThemes(): Promise<ThemeListItem[]> {
  const supabase = await createClient();

  const themes =
    unwrapRead(
      await supabase
        .from("sw_themes")
        .select("id, title, notes, parent_theme_id, research_question_id")
        .order("created_at"),
      "themes",
    ) ?? [];
  if (themes.length === 0) return [];

  const themeIds = themes.map((theme) => theme.id);
  const links =
    unwrapRead(
      await supabase.from("sw_theme_data_points").select("theme_id, data_point_id").in("theme_id", themeIds),
      "these themes' data points",
    ) ?? [];

  const dataPointIds = [...new Set(links.map((link) => link.data_point_id))];
  const dataPoints =
    dataPointIds.length === 0
      ? []
      : (unwrapRead(
          await supabase.from("sw_data_points").select("id, project_id").in("id", dataPointIds),
          "these data points",
        ) ?? []);
  const projectIdByDataPointId = new Map(dataPoints.map((dp) => [dp.id, dp.project_id]));

  const projectIds = [...new Set(dataPoints.map((dp) => dp.project_id))];
  const projects =
    projectIds.length === 0
      ? []
      : (unwrapRead(
          await supabase.from("tw_projects").select("id, title").in("id", projectIds),
          "these projects",
        ) ?? []);
  const projectTitleById = new Map(projects.map((project) => [project.id, project.title]));

  const dataPointIdsByTheme = new Map<string, Set<string>>();
  for (const link of links) {
    const set = dataPointIdsByTheme.get(link.theme_id) ?? new Set<string>();
    set.add(link.data_point_id);
    dataPointIdsByTheme.set(link.theme_id, set);
  }

  return themes.map((theme) => {
    const dpIds = [...(dataPointIdsByTheme.get(theme.id) ?? [])];
    const projectTitles = [
      ...new Set(
        dpIds
          .map((id) => projectIdByDataPointId.get(id))
          .filter((id): id is string => Boolean(id))
          .map((projectId) => projectTitleById.get(projectId) ?? "Unknown project"),
      ),
    ];
    return {
      id: theme.id,
      title: theme.title,
      notes: theme.notes,
      parentThemeId: theme.parent_theme_id,
      researchQuestionId: theme.research_question_id,
      dataPointCount: dpIds.length,
      projectTitles,
    };
  });
}

export interface ThemeDataPointRef {
  id: string;
  summary: string;
  projectId: string;
  projectTitle: string;
  excerpts: DataPointExcerptRef[];
}

export interface ThemeDetail {
  id: string;
  title: string;
  notes: string | null;
  parentThemeId: string | null;
  parentThemeTitle: string | null;
  researchQuestionId: string | null;
  researchQuestionPrompt: string | null;
  researchQuestionProjectTitle: string | null;
  children: { id: string; title: string }[];
  dataPoints: ThemeDataPointRef[];
}

/** One theme plus its parent, children, and data points (each with its own excerpts and source) — §5. */
export async function getThemeDetail(themeId: string): Promise<ThemeDetail | null> {
  const supabase = await createClient();

  const theme = unwrapRead(
    await supabase.from("sw_themes").select("*").eq("id", themeId).maybeSingle(),
    "this theme",
  );
  if (!theme) return null;

  const [parentResult, childrenResult, questionResult, linksResult] = await Promise.all([
    theme.parent_theme_id
      ? supabase.from("sw_themes").select("id, title").eq("id", theme.parent_theme_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("sw_themes").select("id, title").eq("parent_theme_id", themeId).order("title"),
    theme.research_question_id
      ? supabase
          .from("sw_research_questions")
          .select("id, prompt, project_id")
          .eq("id", theme.research_question_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("sw_theme_data_points").select("data_point_id").eq("theme_id", themeId),
  ]);

  const parent = unwrapRead(parentResult, "this theme's parent");
  const children = unwrapRead(childrenResult, "this theme's children") ?? [];
  const question = unwrapRead(questionResult, "this theme's research question");
  const links = unwrapRead(linksResult, "this theme's data points") ?? [];

  let questionProjectTitle: string | null = null;
  if (question) {
    const { data: questionProject } = await supabase
      .from("tw_projects")
      .select("title")
      .eq("id", question.project_id)
      .maybeSingle();
    questionProjectTitle = questionProject?.title ?? null;
  }

  const dataPointIds = links.map((link) => link.data_point_id);
  const dataPoints =
    dataPointIds.length === 0
      ? []
      : (unwrapRead(
          await supabase.from("sw_data_points").select("id, summary, project_id").in("id", dataPointIds),
          "these data points",
        ) ?? []);

  const projectIds = [...new Set(dataPoints.map((dp) => dp.project_id))];
  const projects =
    projectIds.length === 0
      ? []
      : (unwrapRead(
          await supabase.from("tw_projects").select("id, title").in("id", projectIds),
          "these projects",
        ) ?? []);
  const projectTitleById = new Map(projects.map((project) => [project.id, project.title]));

  const excerptsByDataPoint = await resolveExcerptRefsForDataPoints(supabase, dataPointIds);

  return {
    id: theme.id,
    title: theme.title,
    notes: theme.notes,
    parentThemeId: theme.parent_theme_id,
    parentThemeTitle: parent?.title ?? null,
    researchQuestionId: theme.research_question_id,
    researchQuestionPrompt: question?.prompt ?? null,
    researchQuestionProjectTitle: questionProjectTitle,
    children: children.map((child) => ({ id: child.id, title: child.title })),
    dataPoints: dataPoints.map((dataPoint) => ({
      id: dataPoint.id,
      summary: dataPoint.summary,
      projectId: dataPoint.project_id,
      projectTitle: projectTitleById.get(dataPoint.project_id) ?? "Unknown project",
      excerpts: excerptsByDataPoint.get(dataPoint.id) ?? [],
    })),
  };
}

export interface ResearchQuestionOption {
  id: string;
  prompt: string;
  projectTitle: string;
}

/**
 * Every active research question, across every project — the "Answers…"
 * picker's option list (§5). Tool-wide by design: unlike Phase 4's own
 * per-project question list, a theme can answer any project's question, not
 * just one it happens to be viewed from.
 */
export async function listResearchQuestionsForPicker(): Promise<ResearchQuestionOption[]> {
  const supabase = await createClient();
  const questions =
    unwrapRead(
      await supabase
        .from("sw_research_questions")
        .select("id, prompt, project_id")
        .eq("active", true)
        .order("prompt"),
      "research questions",
    ) ?? [];
  if (questions.length === 0) return [];

  const projectIds = [...new Set(questions.map((question) => question.project_id))];
  const projects =
    unwrapRead(
      await supabase.from("tw_projects").select("id, title").in("id", projectIds),
      "these questions' projects",
    ) ?? [];
  const projectTitleById = new Map(projects.map((project) => [project.id, project.title]));

  return questions.map((question) => ({
    id: question.id,
    prompt: question.prompt,
    projectTitle: projectTitleById.get(question.project_id) ?? "Unknown project",
  }));
}

export interface ThemesAnsweringQuestion {
  id: string;
  title: string;
}

/**
 * Which theme(s) answer each of a set of research questions — the reverse
 * rollup Phase 4's Research tab renders as "Answered by: ..." (§1's "actual
 * deliverable" framing; docs/sourcework-design.md §9.5). Keyed by question
 * id so a caller with no themes at all still gets a plain empty map back.
 */
export async function listThemesAnsweringQuestions(
  questionIds: string[],
): Promise<Map<string, ThemesAnsweringQuestion[]>> {
  if (questionIds.length === 0) return new Map();

  const supabase = await createClient();
  const themes =
    unwrapRead(
      await supabase
        .from("sw_themes")
        .select("id, title, research_question_id")
        .in("research_question_id", questionIds),
      "the themes answering these questions",
    ) ?? [];

  const result = new Map<string, ThemesAnsweringQuestion[]>();
  for (const theme of themes) {
    if (!theme.research_question_id) continue;
    const list = result.get(theme.research_question_id) ?? [];
    list.push({ id: theme.id, title: theme.title });
    result.set(theme.research_question_id, list);
  }
  return result;
}
