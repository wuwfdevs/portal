import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { chunked } from "./research-queries";
import {
  groupQuoteSamples,
  parseQuoteTrialResults,
  playableEvidenceCounts,
  type QuoteSampleProject,
  type QuoteTrialResults,
} from "./quote-trials";

// Reads behind "Try this draft" for the quote quality guide: which themes can be a sample, and the
// editor's own stored trials. Everything runs as the caller, so RLS applies (a trial row is visible to
// its creator only).

/** Accepted themes that have evidence, grouped by project. */
export async function listQuoteTrialSamples(): Promise<QuoteSampleProject[]> {
  const supabase = await createClient();
  const themes =
    unwrapRead(
      await supabase
        .from("sw_themes")
        .select("id, project_id, title")
        .eq("status", "accepted")
        .is("merged_into_id", null)
        .limit(2000),
      "the accepted themes",
    ) ?? [];
  if (themes.length === 0) return [];

  // Only evidence a quote run could read counts: accepted, in a recording with a ready transcript, from
  // a source the project still has. Otherwise a theme backed only by documents would be offered and
  // always fail with "no accepted data points from a recording".
  const themeIds = themes.map((theme) => theme.id);
  const memberships: {
    themeId: string;
    dataPointId: string;
    stance: "supports" | "complicates";
  }[] = [];
  for (const ids of chunked(themeIds)) {
    for (const row of unwrapRead(
      await supabase
        .from("sw_data_point_themes")
        .select("theme_id, data_point_id, stance")
        .in("theme_id", ids)
        .is("removed_at", null),
      "the themes' data points",
    ) ?? []) {
      memberships.push({
        themeId: row.theme_id,
        dataPointId: row.data_point_id,
        stance: row.stance,
      });
    }
  }

  const pointIds = [...new Set(memberships.map((membership) => membership.dataPointId))];
  const points: { id: string; projectId: string; sourceId: string; accepted: boolean }[] = [];
  const temporalPointIds = new Set<string>();
  for (const ids of chunked(pointIds)) {
    const [pointRows, spanRows] = await Promise.all([
      supabase.from("sw_data_points").select("id, project_id, source_id, status").in("id", ids),
      supabase
        .from("sw_data_point_spans")
        .select("data_point_id")
        .in("data_point_id", ids)
        .eq("locator_kind", "temporal"),
    ]);
    for (const row of unwrapRead(pointRows, "the themes' data points") ?? []) {
      points.push({
        id: row.id,
        projectId: row.project_id,
        sourceId: row.source_id,
        accepted: row.status === "accepted",
      });
    }
    for (const row of unwrapRead(spanRows, "the data points' passages") ?? []) {
      temporalPointIds.add(row.data_point_id);
    }
  }

  const projectSourceKeys = new Set<string>();
  for (const ids of chunked([...new Set(themes.map((theme) => theme.project_id))])) {
    for (const row of unwrapRead(
      await supabase
        .from("sw_project_sources")
        .select("project_id, source_id")
        .in("project_id", ids),
      "the projects' sources",
    ) ?? []) {
      projectSourceKeys.add(`${row.project_id}:${row.source_id}`);
    }
  }

  const readySourceIds = new Set<string>();
  const sourceIds = [...new Set(points.map((point) => point.sourceId))];
  for (const ids of chunked(sourceIds)) {
    const [sources, transcripts] = await Promise.all([
      supabase.from("sw_sources").select("id").in("id", ids).eq("status", "ready"),
      supabase
        .from("sw_representations")
        .select("source_id")
        .in("source_id", ids)
        .eq("kind", "transcript")
        .eq("status", "ready"),
    ]);
    const withTranscript = new Set(
      (unwrapRead(transcripts, "the sources' transcripts") ?? []).map((row) => row.source_id),
    );
    for (const row of unwrapRead(sources, "the sources") ?? []) {
      if (withTranscript.has(row.id)) readySourceIds.add(row.id);
    }
  }

  const breadth = playableEvidenceCounts({
    memberships,
    points,
    temporalPointIds,
    projectSourceKeys,
    readySourceIds,
  });

  const projects: { id: string; title: string }[] = [];
  for (const ids of chunked([...new Set(themes.map((theme) => theme.project_id))])) {
    projects.push(
      ...(unwrapRead(
        await supabase.from("tw_projects").select("id, title").in("id", ids),
        "the themes' projects",
      ) ?? []),
    );
  }

  return groupQuoteSamples({
    projects,
    themes: themes.map((theme) => ({
      id: theme.id,
      projectId: theme.project_id,
      title: theme.title,
      supporting: breadth.get(theme.id)?.supporting ?? 0,
      complicating: breadth.get(theme.id)?.complicating ?? 0,
    })),
  });
}

export interface QuoteTrialRecord {
  id: string;
  status: "running" | "succeeded" | "failed";
  error: string | null;
  results: QuoteTrialResults | null;
  projectId: string;
  themeId: string;
  projectTitle: string;
  themeTitle: string;
  createdAt: string;
  finishedAt: string | null;
}

const TRIAL_COLUMNS = "id, status, error, results, project_id, theme_id, created_at, finished_at";

async function withTitles(
  rows: {
    id: string;
    status: string;
    error: string | null;
    results: unknown;
    project_id: string;
    theme_id: string | null;
    created_at: string;
    finished_at: string | null;
  }[],
): Promise<QuoteTrialRecord[]> {
  const complete = rows.filter(
    (row): row is typeof row & { theme_id: string } => row.theme_id !== null,
  );
  if (complete.length === 0) return [];
  const supabase = await createClient();
  const [projects, themes] = await Promise.all([
    supabase
      .from("tw_projects")
      .select("id, title")
      .in("id", [...new Set(complete.map((row) => row.project_id))]),
    supabase
      .from("sw_themes")
      .select("id, title")
      .in("id", [...new Set(complete.map((row) => row.theme_id))]),
  ]);
  const projectTitle = new Map(
    (unwrapRead(projects, "the trial projects") ?? []).map((p) => [p.id, p.title]),
  );
  const themeTitle = new Map(
    (unwrapRead(themes, "the trial themes") ?? []).map((t) => [t.id, t.title]),
  );
  return complete.map((row) => ({
    id: row.id,
    status: row.status as QuoteTrialRecord["status"],
    error: row.error,
    results: parseQuoteTrialResults(row.results),
    projectId: row.project_id,
    themeId: row.theme_id,
    projectTitle: projectTitle.get(row.project_id) ?? "a deleted project",
    themeTitle: themeTitle.get(row.theme_id) ?? "a deleted theme",
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  }));
}

/** One of the editor's own quote trials; null when it is missing, someone else's, or expired. */
export async function getQuoteTrial(
  trialId: string,
  userId: string,
): Promise<QuoteTrialRecord | null> {
  const supabase = await createClient();
  const row = unwrapRead(
    await supabase
      .from("sw_prompt_trials")
      .select(TRIAL_COLUMNS)
      .eq("id", trialId)
      .eq("created_by", userId)
      .eq("slot", "quote_quality")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle(),
    "this trial",
  );
  return row ? ((await withTitles([row]))[0] ?? null) : null;
}

/** The editor's latest unexpired quote trials, newest first. */
export async function listRecentQuoteTrials(
  userId: string,
  limit = 8,
): Promise<QuoteTrialRecord[]> {
  const supabase = await createClient();
  const rows =
    unwrapRead(
      await supabase
        .from("sw_prompt_trials")
        .select(TRIAL_COLUMNS)
        .eq("created_by", userId)
        .eq("slot", "quote_quality")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(limit),
      "your recent trials",
    ) ?? [];
  return withTitles(rows);
}
