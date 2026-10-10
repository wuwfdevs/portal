import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { unwrapRead } from "@/lib/read-result";
import { getProjectById } from "@/lib/transcription/projects";
import { speakerDisplayLabel } from "@/lib/transcription/transcript";
import { getEmbeddingProvider, toVectorLiteral } from "@/lib/transcription/embeddings";
import { RESEARCH_MODEL } from "./model";
import { callStructuredModel } from "./extraction-ai";
import {
  ASSIGNMENT_FRAMING,
  ASSIGN_BATCH,
  NEAREST_K,
  NARROW_ABOVE,
  REVIEW_FRAMING,
  REVIEW_POOL_LIMIT,
  buildAssignmentInput,
  buildAssignmentOutputSchema,
  buildReviewInput,
  buildReviewOutputSchema,
  chooseCandidateThemes,
  parseAssignmentOutput,
  parseReviewOutput,
  type AssignPointInput,
} from "./theme-prompt";
import {
  DATA_POINT_COLUMNS,
  chunked,
  type DataPointRow,
  getLivePrompt,
  listResearchQuestions,
  toDataPoint,
} from "./research-queries";
import { finishRun, startRun } from "./research-runs";
import { listThemeRows } from "./theme-queries";
import { compareByBreadth, type Stance } from "./themes";

// The two theme steps, end to end (docs/sourcework-analysis-design.md §5.4).
//
// Assignment is cheap and follows an accept: the data points just accepted are
// checked against the project's accepted themes and filed where they fit (the
// nearest few by embedding when there are many themes, all of them when there
// are few). A point that fits nothing is not filed; it waits in the pool.
//
// Review themes is a click. It reads the pool and the accepted themes, and
// proposes new themes and merges as suggestions. It never touches an accepted
// theme, and a theme it already proposed or that was turned down is not
// proposed again.

type Client = SupabaseClient<Database>;

/** Points the pool-wide assignment after a theme is accepted looks at, oldest first. */
const POOL_ASSIGN_LIMIT = 100;
const IN_LIMIT = 1000;

// Embeddings ---------------------------------------------------------------------------------
// Optional everywhere (docs: OPENAI_API_KEY is not required for embeddings): they only
// narrow which themes a point is checked against, so a failure here costs a wider
// candidate list, never a failed step.

async function embedStale(
  supabase: Client,
  args: { projectId: string; pointIds: readonly string[] },
): Promise<void> {
  const provider = getEmbeddingProvider();
  if (!provider) return;
  try {
    const points: { id: string; claim: string }[] = [];
    for (const ids of chunked(args.pointIds)) {
      const rows = unwrapRead(
        await supabase
          .from("sw_data_points")
          .select("id, claim")
          .in("id", ids)
          .eq("embedding_stale", true),
        "data points to embed",
      );
      points.push(...(rows ?? []));
    }
    const themes =
      unwrapRead(
        await supabase
          .from("sw_themes")
          .select("id, title, definition")
          .eq("project_id", args.projectId)
          .eq("status", "accepted")
          .is("merged_into_id", null)
          .eq("embedding_stale", true),
        "themes to embed",
      ) ?? [];

    const texts = [
      ...points.map((point) => point.claim),
      ...themes.map((theme) => `${theme.title}. ${theme.definition}`),
    ];
    if (texts.length === 0) return;
    const vectors = await provider.embed(texts);

    const writes = [
      ...points.map((point, index) =>
        supabase
          .from("sw_data_points")
          .update({ embedding: toVectorLiteral(vectors[index]!), embedding_stale: false })
          .eq("id", point.id),
      ),
      ...themes.map((theme, index) =>
        supabase
          .from("sw_themes")
          .update({
            embedding: toVectorLiteral(vectors[points.length + index]!),
            embedding_stale: false,
          })
          .eq("id", theme.id),
      ),
    ];
    for (const result of await Promise.all(writes)) {
      if (result.error) console.error("Could not store a theme embedding:", result.error);
    }
  } catch (error) {
    console.error(
      "Embedding data points and themes failed; using every theme as a candidate:",
      error,
    );
  }
}

async function nearestThemes(
  supabase: Client,
  projectId: string,
  pointIds: readonly string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  const rows = await supabase.rpc("sw_nearest_themes", {
    p_project_id: projectId,
    p_data_point_ids: [...pointIds],
    p_k: NEAREST_K,
  });
  if (rows.error) {
    console.error("Could not look up the nearest themes:", rows.error);
    return result;
  }
  for (const row of [...(rows.data ?? [])].sort((a, b) => b.similarity - a.similarity)) {
    const list = result.get(row.data_point_id) ?? [];
    list.push(row.theme_id);
    result.set(row.data_point_id, list);
  }
  return result;
}

// Shared context -------------------------------------------------------------------------------

async function describePoints(
  supabase: Client,
  projectId: string,
  points: readonly ReturnType<typeof toDataPoint>[],
): Promise<AssignPointInput[]> {
  const project = await getProjectById(projectId);
  const sourceTitles = new Map(
    (project?.sources ?? []).map((entry) => [entry.sourceId, entry.source.title]),
  );
  const labels = new Map(
    (await listResearchQuestions(projectId)).map((question) => [question.id, question.label]),
  );

  const speakerIds = [
    ...new Set(points.map((point) => point.speakerId).filter((id): id is string => Boolean(id))),
  ];
  const speakers = new Map<string, string>();
  for (const ids of chunked(speakerIds)) {
    for (const speaker of unwrapRead(
      await supabase
        .from("tw_speakers")
        .select("id, diarization_label, display_name")
        .in("id", ids),
      "these data points' speakers",
    ) ?? []) {
      speakers.set(
        speaker.id,
        speakerDisplayLabel(speaker.diarization_label, speaker.display_name),
      );
    }
  }

  return points.map((point, index) => ({
    number: index + 1,
    claim: point.claim,
    sourceTitle: sourceTitles.get(point.sourceId) ?? "Source",
    speaker: point.speakerId ? (speakers.get(point.speakerId) ?? null) : null,
    kind: point.kind,
    questionLabel: point.questionId ? (labels.get(point.questionId) ?? null) : null,
  }));
}

async function loadPoints(supabase: Client, ids: readonly string[], projectId: string) {
  const rows: DataPointRow[] = [];
  for (const chunk of chunked(ids)) {
    rows.push(
      ...(unwrapRead(
        await supabase
          .from("sw_data_points")
          .select(DATA_POINT_COLUMNS)
          .in("id", chunk)
          .eq("project_id", projectId)
          .eq("status", "accepted"),
        "data points to file",
      ) ?? []),
    );
  }
  return rows
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map((row) => toDataPoint(row, []));
}

// Assignment -------------------------------------------------------------------------------------

export interface AssignOutcome {
  /** Points the model placed in at least one theme. */
  filed: number;
  /** Points it answered for and placed nowhere; they wait in the pool. */
  waiting: number;
}

export type AssignResult =
  | ({ ok: true; skipped: null } & AssignOutcome)
  | { ok: true; skipped: "no_themes" | "nothing_to_file" | "running" }
  | { ok: false; error: string };

/**
 * Files the given accepted data points into the project's accepted themes. A
 * point that already sits in a live theme is left alone, and a theme a person
 * removed a point from is not offered for it again. Writes only
 * `assigned_by = 'model'` memberships into already-accepted themes.
 */
export async function assignDataPoints(args: {
  projectId: string;
  userId: string;
  dataPointIds: readonly string[];
}): Promise<AssignResult> {
  const { projectId, userId } = args;
  const supabase = await createClient();

  const themes = (await listThemeRows(projectId))
    .filter((theme) => theme.status === "accepted")
    .sort(compareByBreadth);
  if (themes.length === 0) return { ok: true, skipped: "no_themes" };

  const points = await loadPoints(supabase, args.dataPointIds, projectId);
  if (points.length === 0) return { ok: true, skipped: "nothing_to_file" };

  // What each point already has: live memberships (skip the point) and removed ones (skip that theme).
  const existing: { data_point_id: string; theme_id: string; removed_at: string | null }[] = [];
  for (const ids of chunked(points.map((point) => point.id))) {
    existing.push(
      ...(unwrapRead(
        await supabase
          .from("sw_data_point_themes")
          .select("data_point_id, theme_id, removed_at")
          .in("data_point_id", ids),
        "these data points' themes",
      ) ?? []),
    );
  }
  const liveThemeIds = new Set(themes.map((theme) => theme.id));
  const placed = new Set(
    existing
      .filter((row) => row.removed_at === null && liveThemeIds.has(row.theme_id))
      .map((row) => row.data_point_id),
  );
  const removedPairs = new Set(
    existing
      .filter((row) => row.removed_at !== null)
      .map((row) => `${row.data_point_id}:${row.theme_id}`),
  );
  const toFile = points.filter((point) => !placed.has(point.id));
  if (toFile.length === 0) return { ok: true, skipped: "nothing_to_file" };

  const live = await getLivePrompt("theme_assign");
  const started = await startRun(supabase, {
    kind: "theme_assign",
    projectId,
    sourceId: null,
    promptVersionId: live.versionId,
    trial: false,
    model: RESEARCH_MODEL,
    userId,
  });
  if (!started.ok) {
    return started.alreadyRunning
      ? { ok: true, skipped: "running" }
      : { ok: false, error: started.error };
  }
  const runId = started.runId;

  try {
    if (themes.length > NARROW_ABOVE) {
      await embedStale(supabase, { projectId, pointIds: toFile.map((point) => point.id) });
    }

    const described = await describePoints(supabase, projectId, toFile);
    const project = await getProjectById(projectId);
    const projectTitle = project?.title ?? "Project";

    let filed = 0;
    let waiting = 0;
    let dropped = 0;
    let batches = 0;

    for (const batch of chunked(
      toFile.map((_, index) => index),
      ASSIGN_BATCH,
    )) {
      const batchPoints = batch.map((index) => toFile[index]!);
      const nearest =
        themes.length > NARROW_ABOVE
          ? await nearestThemes(
              supabase,
              projectId,
              batchPoints.map((point) => point.id),
            )
          : new Map<string, string[]>();
      const candidates = chooseCandidateThemes({
        themes,
        nearestByPoint: nearest,
        pointIds: batchPoints.map((point) => point.id),
      });

      const called = await callStructuredModel({
        step: "theme assignment",
        schemaName: "theme_assignments",
        schema: buildAssignmentOutputSchema(),
        framing: ASSIGNMENT_FRAMING,
        guide: live.body,
        input: buildAssignmentInput({
          projectTitle,
          themes: candidates.map((theme, index) => ({
            number: index + 1,
            title: theme.title,
            definition: theme.definition,
          })),
          points: batch.map((index, position) => ({ ...described[index]!, number: position + 1 })),
        }),
      });
      if (!called.ok) {
        await finishRun(supabase, runId, {
          status: "failed",
          error: called.error,
          counts: { filed, waiting, batches },
        });
        return { ok: false, error: called.error };
      }

      const parsed = parseAssignmentOutput(called.text, {
        points: batchPoints.length,
        themes: candidates.length,
      });
      if (
        parsed.dropped.unreadable > 0 &&
        parsed.assignments.length === 0 &&
        parsed.noFit.length === 0
      ) {
        const error =
          "The theme assignment step returned an answer that couldn't be read. Try again.";
        await finishRun(supabase, runId, {
          status: "failed",
          error,
          counts: { filed, waiting, batches },
        });
        return { ok: false, error };
      }
      dropped += Object.values(parsed.dropped).reduce((sum, count) => sum + count, 0);

      const rows = parsed.assignments
        .filter(
          (a) =>
            !removedPairs.has(`${batchPoints[a.pointIndex]!.id}:${candidates[a.themeIndex]!.id}`),
        )
        .map((a) => ({
          data_point_id: batchPoints[a.pointIndex]!.id,
          theme_id: candidates[a.themeIndex]!.id,
          project_id: projectId,
          stance: a.stance as Stance,
          assigned_by: "model" as const,
          run_id: runId,
        }));
      if (rows.length > 0) {
        const written = await supabase
          .from("sw_data_point_themes")
          .upsert(rows, { onConflict: "data_point_id,theme_id", ignoreDuplicates: true });
        if (written.error) {
          throw new Error(`Could not file the data points: ${written.error.message}`);
        }
      }
      // Checked, whether or not it fit: it is looked at again only when a theme is accepted later.
      const checked = await supabase
        .from("sw_data_points")
        .update({ theme_checked_at: new Date().toISOString() })
        .in(
          "id",
          batchPoints.map((point) => point.id),
        );
      if (checked.error) console.error("Could not record a theme check:", checked.error);
      filed += new Set(rows.map((row) => row.data_point_id)).size;
      waiting += batchPoints.length - new Set(rows.map((row) => row.data_point_id)).size;
      batches += 1;
    }

    await finishRun(supabase, runId, {
      status: "succeeded",
      counts: { points: toFile.length, filed, waiting, dropped, batches },
    });
    return { ok: true, skipped: null, filed, waiting };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Filing data points into themes failed.";
    console.error("Sourcework theme assignment failed:", error);
    await finishRun(supabase, runId, { status: "failed", error: message });
    return { ok: false, error: message };
  }
}

/**
 * The pool's accepted points that no accepted theme has looked at yet — never
 * checked, or checked before the newest theme was accepted — oldest first. Run
 * after a theme is accepted, and at the start of Review themes, so a point that
 * belongs in a theme the reporter already accepted is filed there instead of
 * being offered to the model as raw material for a new one.
 */
export async function assignPool(args: {
  projectId: string;
  userId: string;
}): Promise<AssignResult> {
  const supabase = await createClient();
  const themes = (await listThemeRows(args.projectId)).filter(
    (theme) => theme.status === "accepted",
  );
  const newest = themes.reduce<string | null>(
    (latest, theme) =>
      theme.acceptedAt && (latest === null || theme.acceptedAt > latest)
        ? theme.acceptedAt
        : latest,
    null,
  );
  if (newest === null) return { ok: true, skipped: "no_themes" };

  const pool = unwrapRead(
    await supabase
      .from("sw_unthemed_data_points")
      .select("id")
      .eq("project_id", args.projectId)
      .limit(IN_LIMIT),
    "this project's unfiled data points",
  );
  const poolIds = (pool ?? []).map((row) => row.id);
  const stale: { id: string; created_at: string }[] = [];
  for (const ids of chunked(poolIds)) {
    for (const row of unwrapRead(
      await supabase
        .from("sw_data_points")
        .select("id, created_at, theme_checked_at")
        .in("id", ids),
      "this project's unfiled data points",
    ) ?? []) {
      if (row.theme_checked_at === null || row.theme_checked_at < newest) stale.push(row);
    }
  }
  if (stale.length === 0) return { ok: true, skipped: "nothing_to_file" };
  stale.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  return assignDataPoints({
    ...args,
    dataPointIds: stale.slice(0, POOL_ASSIGN_LIMIT).map((row) => row.id),
  });
}

/**
 * For a request that has already answered the reporter: assignment must never
 * fail the click that triggered it, and without the model key there is nothing
 * to try (and no reason to write a failed run for every accept).
 */
export async function assignQuietly(work: () => Promise<AssignResult>): Promise<void> {
  if (!process.env.OPENAI_API_KEY) return;
  try {
    const result = await work();
    if (!result.ok) console.error("Sourcework theme assignment did not finish:", result.error);
  } catch (error) {
    console.error("Sourcework theme assignment failed:", error);
  }
}

// Review themes --------------------------------------------------------------------------------------

export interface ReviewOutcome {
  runId: string;
  themes: number;
  merges: number;
  /** Pool points the model read, and how many the pool held. */
  reviewed: number;
  poolSize: number;
}

export type ReviewResult = ({ ok: true } & ReviewOutcome) | { ok: false; error: string };

/** Proposes new themes and merges from the pool and the accepted themes. Everything it writes is a suggestion. */
export async function reviewThemes(args: {
  projectId: string;
  userId: string;
}): Promise<ReviewResult> {
  const { projectId, userId } = args;
  const supabase = await createClient();

  const project = await getProjectById(projectId);
  if (!project) return { ok: false, error: "That project doesn't exist." };

  // Points that belong in a theme already accepted are filed there first, so what is left is
  // really unfiled. A failure here is not this click's failure; the main step reports its own.
  const swept = await assignPool({ projectId, userId }).catch((error: unknown) => {
    console.error("Sourcework theme sweep failed:", error);
    return null;
  });
  if (swept && !swept.ok) console.error("Sourcework theme sweep did not finish:", swept.error);

  const rows = await listThemeRows(projectId);
  const accepted = rows.filter((theme) => theme.status === "accepted").sort(compareByBreadth);

  const pool = unwrapRead(
    await supabase
      .from("sw_unthemed_data_points")
      .select("id")
      .eq("project_id", projectId)
      .limit(IN_LIMIT),
    "this project's unfiled data points",
  );
  const poolPoints = await loadPoints(
    supabase,
    (pool ?? []).map((row) => row.id),
    projectId,
  );
  const reviewed = poolPoints.slice(0, REVIEW_POOL_LIMIT);

  if (reviewed.length < 2 && accepted.length < 2) {
    return {
      ok: false,
      error:
        "There aren't enough accepted data points to look for themes yet. Accept a few in the sources first.",
    };
  }

  // Every title on file, merged-away ones too, so none is proposed again.
  const titles =
    unwrapRead(
      await supabase
        .from("sw_themes")
        .select("title, status, merged_into_id")
        .eq("project_id", projectId),
      "this project's themes",
    ) ?? [];
  const settledTitles = titles
    .filter((theme) => theme.status !== "accepted" || theme.merged_into_id !== null)
    .map((theme) => theme.title);

  const acceptedIndex = new Map(accepted.map((theme, index) => [theme.id, index]));
  const mergeRows =
    unwrapRead(
      await supabase
        .from("sw_theme_merge_suggestions")
        .select("from_theme_id, into_theme_id")
        .eq("project_id", projectId),
      "this project's merge suggestions",
    ) ?? [];
  const existingMergePairs = new Set(
    mergeRows.flatMap((row) => {
      const from = acceptedIndex.get(row.from_theme_id);
      const into = acceptedIndex.get(row.into_theme_id);
      return from === undefined || into === undefined ? [] : [`${from}:${into}`];
    }),
  );

  const questions = (await listResearchQuestions(projectId)).filter(
    (question) => !question.archivedAt,
  );
  const live = await getLivePrompt("theme_review");
  const started = await startRun(supabase, {
    kind: "theme_review",
    projectId,
    sourceId: null,
    promptVersionId: live.versionId,
    trial: false,
    model: RESEARCH_MODEL,
    userId,
  });
  if (!started.ok) return { ok: false, error: started.error };
  const runId = started.runId;

  try {
    const described = await describePoints(supabase, projectId, reviewed);
    const called = await callStructuredModel({
      step: "theme review",
      schemaName: "theme_review",
      schema: buildReviewOutputSchema(),
      framing: REVIEW_FRAMING,
      guide: live.body,
      input: buildReviewInput({
        projectTitle: project.title,
        projectDescription: project.description,
        projectSources: project.sources.length,
        questions: questions.map((question) => ({
          label: question.label,
          question: question.question,
        })),
        acceptedThemes: accepted.map((theme, index) => ({
          number: index + 1,
          title: theme.title,
          definition: theme.definition,
          sources: theme.breadth.sourceCount,
        })),
        settledTitles,
        points: described,
      }),
    });
    if (!called.ok) {
      await finishRun(supabase, runId, { status: "failed", error: called.error });
      return { ok: false, error: called.error };
    }

    const parsed = parseReviewOutput(called.text, {
      pointCount: reviewed.length,
      acceptedThemeCount: accepted.length,
      existingTitles: titles.map((theme) => theme.title),
      existingMergePairs,
    });
    const droppedTotal = Object.values(parsed.dropped).reduce((sum, count) => sum + count, 0);
    if (parsed.dropped.unreadable > 0 && parsed.themes.length === 0 && parsed.merges.length === 0) {
      const error = "The theme review step returned an answer that couldn't be read. Try again.";
      await finishRun(supabase, runId, { status: "failed", error });
      return { ok: false, error };
    }

    if (parsed.themes.length > 0) {
      const written = await supabase.rpc("sw_add_proposed_themes", {
        p_project_id: projectId,
        p_run_id: runId,
        p_prompt_version_id: live.versionId,
        p_themes: parsed.themes.map((theme) => ({
          title: theme.title,
          definition: theme.definition,
          members: theme.members.map((member) => ({
            data_point_id: reviewed[member.pointIndex]!.id,
            stance: member.stance,
          })),
        })),
      });
      if (written.error)
        throw new Error(`Could not save the proposed themes: ${written.error.message}`);
    }

    if (parsed.merges.length > 0) {
      const written = await supabase.from("sw_theme_merge_suggestions").upsert(
        parsed.merges.map((merge) => ({
          project_id: projectId,
          from_theme_id: accepted[merge.fromIndex]!.id,
          into_theme_id: accepted[merge.intoIndex]!.id,
          reason: merge.reason,
          run_id: runId,
          prompt_version_id: live.versionId,
          created_by: userId,
        })),
        { onConflict: "from_theme_id,into_theme_id", ignoreDuplicates: true },
      );
      if (written.error)
        throw new Error(`Could not save the merge suggestions: ${written.error.message}`);
    }

    await finishRun(supabase, runId, {
      status: "succeeded",
      counts: {
        pool: poolPoints.length,
        reviewed: reviewed.length,
        themes: parsed.themes.length,
        merges: parsed.merges.length,
        dropped: parsed.dropped,
        dropped_total: droppedTotal,
      },
    });
    return {
      ok: true,
      runId,
      themes: parsed.themes.length,
      merges: parsed.merges.length,
      reviewed: reviewed.length,
      poolSize: (pool ?? []).length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reviewing themes failed.";
    console.error("Sourcework theme review failed:", error);
    await finishRun(supabase, runId, { status: "failed", error: message });
    return { ok: false, error: message };
  }
}
