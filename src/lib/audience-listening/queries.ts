import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { computeProjectStatus } from "@/lib/transcription/projects";
import type { Database } from "@/lib/database.types";

/**
 * Staff-side data access. Every read here goes through the RLS-scoped server
 * client, so `private.has_audience_listening_access` is what actually decides
 * what comes back — these functions add shape, not authorization. Reads are
 * unwrapped rather than defaulted to `[]`, per CLAUDE.md: a query that errors
 * and falls back to empty renders exactly like a healthy empty state.
 */

export type AlQuery = Database["public"]["Tables"]["al_queries"]["Row"];
export type AlQuestion = Database["public"]["Tables"]["al_questions"]["Row"];
export type AlSubmission = Database["public"]["Tables"]["al_submissions"]["Row"];
export type AlAnswer = Database["public"]["Tables"]["al_answers"]["Row"];

export interface QueryListRow {
  query: AlQuery;
  ownerName: string | null;
  questionCount: number;
  submissionCount: number;
  unreviewedCount: number;
}

/**
 * The query list, newest first, with the three counts the list shows.
 *
 * Deliberately three flat reads aggregated here rather than embedded selects:
 * database.types.ts is hand-written with empty Relationships (see its header),
 * so Postgrest embedding has no foreign-key metadata to type against — the same
 * call lib/transcription/projects.ts documents.
 */
export async function listQueries(): Promise<QueryListRow[]> {
  const supabase = await createClient();

  const [queryResult, questionResult, submissionResult, profileResult] = await Promise.all([
    supabase.from("al_queries").select("*").order("updated_at", { ascending: false }),
    supabase.from("al_questions").select("query_id"),
    supabase.from("al_submissions").select("query_id, status, review_state"),
    supabase.from("profiles").select("id, display_name"),
  ]);

  const queries = unwrapRead(queryResult, "the query list") ?? [];
  const questions = unwrapRead(questionResult, "the query list's questions") ?? [];
  const submissions = unwrapRead(submissionResult, "the query list's submissions") ?? [];
  // Owner names are a courtesy column: profiles RLS only shows a non-admin
  // their own row, so this is frequently empty and must never be an error.
  const profiles = profileResult.error ? [] : (profileResult.data ?? []);

  const questionCounts = tally(questions.map((row) => row.query_id));
  const submittedOnly = submissions.filter((row) => row.status === "submitted");
  const submissionCounts = tally(submittedOnly.map((row) => row.query_id));
  const unreviewedCounts = tally(
    submittedOnly.filter((row) => row.review_state === "new").map((row) => row.query_id),
  );
  const nameById = new Map(profiles.map((row) => [row.id, row.display_name]));

  return queries.map((query) => ({
    query,
    ownerName: nameById.get(query.created_by) ?? null,
    questionCount: questionCounts.get(query.id) ?? 0,
    submissionCount: submissionCounts.get(query.id) ?? 0,
    unreviewedCount: unreviewedCounts.get(query.id) ?? 0,
  }));
}

function tally(keys: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
}

export async function getQueryById(id: string): Promise<AlQuery | null> {
  const supabase = await createClient();
  return unwrapRead(
    await supabase.from("al_queries").select("*").eq("id", id).maybeSingle(),
    "this query",
  );
}

export async function listQuestions(queryId: string): Promise<AlQuestion[]> {
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase
        .from("al_questions")
        .select("*")
        .eq("query_id", queryId)
        .order("position")
        .order("created_at"),
      "this query's questions",
    ) ?? []
  );
}

/** Completed submissions only, newest first — an in-progress row is someone mid-flow. */
export async function listSubmissions(queryId: string): Promise<AlSubmission[]> {
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase
        .from("al_submissions")
        .select("*")
        .eq("query_id", queryId)
        .eq("status", "submitted")
        .order("submitted_at", { ascending: false }),
      "this query's submissions",
    ) ?? []
  );
}

export async function getSubmissionById(id: string): Promise<AlSubmission | null> {
  const supabase = await createClient();
  return unwrapRead(
    await supabase.from("al_submissions").select("*").eq("id", id).maybeSingle(),
    "this submission",
  );
}

export async function listAnswersForSubmission(submissionId: string): Promise<AlAnswer[]> {
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase
        .from("al_answers")
        .select("*")
        .eq("submission_id", submissionId)
        .order("question_position"),
      "this submission's answers",
    ) ?? []
  );
}

/** Every answer in a query — drives the workspace's counts and the queued-for-transcription total. */
export async function listAnswersForQuery(queryId: string): Promise<AlAnswer[]> {
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase.from("al_answers").select("*").eq("query_id", queryId),
      "this query's answers",
    ) ?? []
  );
}

export async function getAnswerById(id: string): Promise<AlAnswer | null> {
  const supabase = await createClient();
  return unwrapRead(
    await supabase.from("al_answers").select("*").eq("id", id).maybeSingle(),
    "this answer",
  );
}

/**
 * Project status/title for the answers already handed to the Transcription
 * Workspace. Status is now derived from the project's source and transcript
 * representation (Sourcework split tw_projects.status out into those two —
 * see lib/transcription/projects.ts) rather than read off tw_projects
 * directly.
 */
export async function getLinkedProjects(
  projectIds: string[],
): Promise<Map<string, { id: string; title: string; status: string }>> {
  if (projectIds.length === 0) return new Map();

  const supabase = await createClient();
  // A member of this tool need not be a member of the Transcription Workspace,
  // and tw_projects' RLS will hand them nothing if they aren't. That is a
  // normal state (the link still renders, it just can't show live status), not
  // an outage — so this read defaults rather than throwing.
  const { data: projects, error } = await supabase
    .from("tw_projects")
    .select("id, title")
    .in("id", projectIds);

  if (error) {
    console.error("Could not read linked transcription projects:", error);
    return new Map();
  }
  if (!projects || projects.length === 0) return new Map();

  const { data: links } = await supabase
    .from("sw_project_sources")
    .select("project_id, source_id, added_at")
    .in("project_id", projectIds)
    .order("added_at");
  const sourceIdByProject = new Map<string, string>();
  for (const link of links ?? []) {
    if (!sourceIdByProject.has(link.project_id)) sourceIdByProject.set(link.project_id, link.source_id);
  }

  const sourceIds = [...new Set(sourceIdByProject.values())];
  const [{ data: sources }, { data: transcripts }] = await Promise.all([
    sourceIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase.from("sw_sources").select("id, status").in("id", sourceIds),
    sourceIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase.from("sw_representations").select("source_id, status").in("source_id", sourceIds).eq("kind", "transcript"),
  ]);
  const sourceById = new Map((sources ?? []).map((s) => [s.id, s]));
  const transcriptBySourceId = new Map((transcripts ?? []).map((t) => [t.source_id, t]));

  return new Map(
    projects.map((project) => {
      const sourceId = sourceIdByProject.get(project.id) ?? null;
      const source = sourceId ? (sourceById.get(sourceId) ?? null) : null;
      const transcript = sourceId ? (transcriptBySourceId.get(sourceId) ?? null) : null;
      return [
        project.id,
        { id: project.id, title: project.title, status: computeProjectStatus(source, transcript) },
      ];
    }),
  );
}
