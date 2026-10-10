import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { eligibleSamples, type SampleProject } from "./trial-sample";
import { parseTrialResults, type TrialResults } from "./trials";
import type { PromptSlot } from "./prompts";

// Reads behind "Try this draft": which projects and sources can be a sample, and
// the editor's own stored trials. Everything runs as the caller, so RLS applies
// (a trial row is visible to its creator only).

const IN_CHUNK = 100;

function chunked<T>(values: readonly T[]): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += IN_CHUNK)
    chunks.push(values.slice(index, index + IN_CHUNK));
  return chunks;
}

/** Projects with an active research question and at least one ready source, each with its ready sources. */
export async function listTrialSamples(): Promise<SampleProject[]> {
  const supabase = await createClient();
  const questions =
    unwrapRead(
      await supabase
        .from("sw_research_questions")
        .select("project_id")
        .is("archived_at", null)
        .limit(5000),
      "the projects' research questions",
    ) ?? [];
  const projectsWithQuestions = new Set(questions.map((row) => row.project_id));
  if (projectsWithQuestions.size === 0) return [];

  const projectIds = [...projectsWithQuestions];
  const links: { projectId: string; sourceId: string }[] = [];
  const projects: { id: string; title: string }[] = [];
  for (const ids of chunked(projectIds)) {
    const [linkRows, projectRows] = await Promise.all([
      supabase.from("sw_project_sources").select("project_id, source_id").in("project_id", ids),
      supabase.from("tw_projects").select("id, title").in("id", ids),
    ]);
    for (const row of unwrapRead(linkRows, "the projects' sources") ?? []) {
      links.push({ projectId: row.project_id, sourceId: row.source_id });
    }
    projects.push(...(unwrapRead(projectRows, "the projects") ?? []));
  }

  const sourceIds = [...new Set(links.map((link) => link.sourceId))];
  const sources: { id: string; title: string; status: string; durationMs: number | null }[] = [];
  for (const ids of chunked(sourceIds)) {
    // A source being "ready" means its upload landed; a run also needs its
    // transcript or document text to be ready (readSourceUnits refuses otherwise).
    const readyRepresentations = new Set(
      (
        unwrapRead(
          await supabase
            .from("sw_representations")
            .select("source_id")
            .in("source_id", ids)
            .in("kind", ["transcript", "document_text"])
            .eq("status", "ready"),
          "the sources' transcripts",
        ) ?? []
      ).map((row) => row.source_id),
    );
    const rows =
      unwrapRead(
        await supabase
          .from("sw_sources")
          .select("id, title, status, original_duration_ms")
          .in("id", ids)
          .eq("status", "ready"),
        "the sources",
      ) ?? [];
    sources.push(
      ...rows
        .filter((row) => readyRepresentations.has(row.id))
        .map((row) => ({
          id: row.id,
          title: row.title,
          status: row.status,
          durationMs: row.original_duration_ms,
        })),
    );
  }
  return eligibleSamples({ projectsWithQuestions, projects, links, sources });
}

export interface TrialRecord {
  id: string;
  slot: string;
  status: "running" | "succeeded" | "failed";
  error: string | null;
  results: TrialResults | null;
  projectId: string;
  sourceId: string;
  projectTitle: string;
  sourceTitle: string;
  createdAt: string;
  finishedAt: string | null;
  expiresAt: string;
}

const TRIAL_COLUMNS =
  "id, slot, status, error, results, project_id, source_id, created_at, finished_at, expires_at";

async function withTitles(
  rows: {
    id: string;
    slot: string;
    status: string;
    error: string | null;
    results: unknown;
    project_id: string;
    source_id: string | null;
    created_at: string;
    finished_at: string | null;
    expires_at: string;
  }[],
): Promise<TrialRecord[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const [projects, sources] = await Promise.all([
    supabase
      .from("tw_projects")
      .select("id, title")
      .in("id", [...new Set(rows.map((r) => r.project_id))]),
    supabase
      .from("sw_sources")
      .select("id, title")
      .in("id", [
        ...new Set(rows.map((r) => r.source_id).filter((id): id is string => id !== null)),
      ]),
  ]);
  const projectTitle = new Map(
    (unwrapRead(projects, "the trial projects") ?? []).map((p) => [p.id, p.title]),
  );
  const sourceTitle = new Map(
    (unwrapRead(sources, "the trial sources") ?? []).map((s) => [s.id, s.title]),
  );
  return rows.map((row) => ({
    id: row.id,
    slot: row.slot,
    status: row.status as TrialRecord["status"],
    error: row.error,
    results: parseTrialResults(row.results),
    projectId: row.project_id,
    sourceId: row.source_id ?? "",
    projectTitle: projectTitle.get(row.project_id) ?? "a deleted project",
    sourceTitle: (row.source_id && sourceTitle.get(row.source_id)) || "a deleted source",
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    expiresAt: row.expires_at,
  }));
}

/** One of the editor's own trials; null when it is missing, someone else's, or expired. */
export async function getTrial(
  trialId: string,
  userId: string,
  slot: PromptSlot,
): Promise<TrialRecord | null> {
  const supabase = await createClient();
  const row = unwrapRead(
    await supabase
      .from("sw_prompt_trials")
      .select(TRIAL_COLUMNS)
      .eq("id", trialId)
      .eq("created_by", userId)
      .eq("slot", slot)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle(),
    "this trial",
  );
  return row ? ((await withTitles([row]))[0] ?? null) : null;
}

/** The editor's latest unexpired trials for a slot, newest first. */
export async function listRecentTrials(
  userId: string,
  slot: PromptSlot,
  limit = 8,
): Promise<TrialRecord[]> {
  const supabase = await createClient();
  const rows =
    unwrapRead(
      await supabase
        .from("sw_prompt_trials")
        .select(TRIAL_COLUMNS)
        .eq("created_by", userId)
        .eq("slot", slot)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(limit),
      "your recent trials",
    ) ?? [];
  return withTitles(rows);
}
