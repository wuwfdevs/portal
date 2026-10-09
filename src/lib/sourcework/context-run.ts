import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getProjectById, getTranscriptForRepresentation } from "@/lib/transcription/projects";
import { getDocumentContentForRepresentation } from "@/lib/transcription/document-content";
import { RESEARCH_MODEL } from "./model";
import { callContextModel } from "./context-ai";
import {
  buildContextInput,
  contextNeedsRefresh,
  extractCandidateTerms,
  questionsFingerprint,
  selectNewNotes,
} from "./context-prompt";
import {
  getLivePrompt,
  listContextNotes,
  listProjectRuns,
  listResearchQuestions,
} from "./research-queries";
import { finishRun, startRun } from "./research-runs";

// Gathering a project's web background (docs/sourcework-analysis-design.md
// §5.1). Automatic in the only sense this repo can offer — there is no job
// queue — so it is run when it is needed (before an extraction) and when the
// Setup tab notices the questions have changed or never been looked at, plus on
// the Refresh button. A run never removes a note and never re-adds a dismissed
// one.

/** The most text read from one source to find the names and terms worth looking up. */
const MAX_TEXT_PER_SOURCE = 150_000;
const MAX_SOURCES_READ = 10;

export type ContextResult =
  | { ok: true; added: number; refreshed: boolean; skipped: "fresh" | "running" | null }
  | { ok: false; error: string };

/**
 * Gathers background if the project has questions and the last good gathering
 * was for different ones (or there never was one). `force` is the Refresh
 * button: gather again whatever the log says.
 */
export async function gatherContext(args: {
  projectId: string;
  userId: string;
  force?: boolean;
}): Promise<ContextResult> {
  const { projectId, userId, force = false } = args;
  const supabase = await createClient();

  const questions = (await listResearchQuestions(projectId))
    .filter((question) => !question.archivedAt)
    .map((question) => question.question);
  if (questions.length === 0) {
    return {
      ok: false,
      error: "Add a research question first; background is gathered for the questions.",
    };
  }

  const runs = await listProjectRuns(projectId);
  const last = runs.find((run) => run.kind === "context") ?? null;
  const fingerprint = questionsFingerprint(questions);
  if (!force) {
    const fingerprintOfLast =
      typeof last?.counts.questions_fingerprint === "string"
        ? last.counts.questions_fingerprint
        : null;
    const needs = contextNeedsRefresh({
      questions,
      lastRun: last ? { status: last.status, fingerprint: fingerprintOfLast } : null,
    });
    if (!needs) {
      return {
        ok: true,
        added: 0,
        refreshed: false,
        skipped: last?.status === "running" ? "running" : "fresh",
      };
    }
  }

  const project = await getProjectById(projectId);
  if (!project) return { ok: false, error: "That project doesn't exist." };

  const live = await getLivePrompt("context");
  const started = await startRun(supabase, {
    kind: "context",
    projectId,
    sourceId: null,
    promptVersionId: live.versionId,
    trial: false,
    model: RESEARCH_MODEL,
    userId,
  });
  if (!started.ok) {
    return started.alreadyRunning
      ? { ok: true, added: 0, refreshed: false, skipped: "running" }
      : { ok: false, error: started.error };
  }

  try {
    // The names and terms the sources use, and the people to keep out of a search.
    const texts: string[] = [];
    const speakerNames = new Set<string>();
    for (const entry of project.sources
      .filter((candidate) => candidate.status === "ready")
      .slice(0, MAX_SOURCES_READ)) {
      const representation = entry.transcript;
      if (!representation || representation.status !== "ready") continue;
      if (entry.source.kind === "document") {
        const content = await getDocumentContentForRepresentation(representation.id);
        texts.push(
          content.blocks
            .map((block) => block.text)
            .join("\n")
            .slice(0, MAX_TEXT_PER_SOURCE),
        );
      } else {
        const transcript = await getTranscriptForRepresentation(representation.id);
        texts.push(
          transcript.segments
            .map((segment) => segment.text)
            .join(" ")
            .slice(0, MAX_TEXT_PER_SOURCE),
        );
        for (const speaker of transcript.speakers) {
          if (speaker.displayName?.trim()) speakerNames.add(speaker.displayName.trim());
        }
      }
    }

    const called = await callContextModel({
      guide: live.body,
      input: buildContextInput({
        projectTitle: project.title,
        projectDescription: project.description,
        questions,
        sourceTitles: project.sources.map((entry) => entry.source.title),
        terms: extractCandidateTerms(texts, { exclude: [...speakerNames] }),
        speakerNames: [...speakerNames],
      }),
    });
    if (!called.ok) {
      await finishRun(supabase, started.runId, {
        status: "failed",
        error: called.error,
        counts: { questions_fingerprint: fingerprint },
      });
      return { ok: false, error: called.error };
    }

    const existing = await listContextNotes(projectId);
    const fresh = selectNewNotes(called.notes, existing);
    if (fresh.length > 0) {
      const inserted = await supabase.from("sw_context_notes").insert(
        fresh.map((note) => ({
          project_id: projectId,
          title: note.title,
          summary: note.summary,
          url: note.url,
          run_id: started.runId,
          created_by: userId,
        })),
      );
      if (inserted.error)
        throw new Error(`Could not save the background notes: ${inserted.error.message}`);
    }

    await finishRun(supabase, started.runId, {
      status: "succeeded",
      counts: {
        questions_fingerprint: fingerprint,
        found: called.notes.length,
        added: fresh.length,
        dropped: called.dropped,
      },
      queries: called.queries,
    });
    return { ok: true, added: fresh.length, refreshed: true, skipped: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gathering background failed.";
    console.error("Sourcework background gathering failed:", error);
    await finishRun(supabase, started.runId, {
      status: "failed",
      error: message,
      counts: { questions_fingerprint: fingerprint },
    });
    return { ok: false, error: message };
  }
}

/** Before an extraction: bring the background up to date if it needs it, never failing the extraction over it. */
export async function ensureContext(args: {
  projectId: string;
  userId: string;
}): Promise<{ refreshed: boolean }> {
  try {
    const result = await gatherContext(args);
    return { refreshed: result.ok && result.refreshed };
  } catch (error) {
    console.error("Background could not be gathered before extraction:", error);
    return { refreshed: false };
  }
}
