import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getProjectById, getSourceDetail, getTranscriptForRepresentation } from "@/lib/transcription/projects";
import { getDocumentContentForRepresentation } from "@/lib/transcription/document-content";
import { speakerDisplayLabel } from "@/lib/transcription/transcript";
import { formatDuration } from "@/lib/transcription/media";
import { SOURCE_KIND_LABEL } from "@/lib/transcription/status";
import { RESEARCH_MODEL } from "./model";
import { callExtractionModel } from "./extraction-ai";
import {
  buildDocumentUnits,
  buildTranscriptUnits,
  dropOverlapping,
  overlapRatio,
  resolveSpans,
  unitIdsForSpan,
  windowUnits,
  SAME_PASSAGE_OVERLAP,
  type ExtractionGroup,
  type ExtractionUnit,
} from "./extraction-units";
import {
  buildExtractionInput,
  emptyDropped,
  parseExtractionOutput,
  sumDropped,
  type CandidatePoint,
  type DropReason,
  type ExtractionNote,
  type ExtractionQuestion,
} from "./extraction-prompt";
import { listContextNotes, listDataPointsForSource, listResearchQuestions, getLivePrompt } from "./research-queries";
import { finishRun, startRun } from "./research-runs";
import { ensureContext } from "./context-run";

// Extraction, end to end (docs/sourcework-analysis-design.md §5.2). Reading a
// source into units and asking the model about them is shared with the editors'
// "Try this draft"; writing the answer into the project is only done here.

export interface ReadSource {
  sourceId: string;
  sourceTitle: string;
  sourceKindLabel: string;
  representationId: string;
  units: ExtractionUnit[];
  groups: ExtractionGroup[];
  /** The speaker row at each transcript unit, for attributing a data point. */
  speakerByUnit: Map<number, string | null>;
  /** Display names of the people on the recording, for keeping them out of searches. */
  speakerNames: string[];
}

export type ReadSourceResult = { ok: true; source: ReadSource } | { ok: false; error: string };

/** A source as numbered units: its transcript's sentences or its document's blocks. */
export async function readSourceUnits(projectId: string, sourceId: string): Promise<ReadSourceResult> {
  const detail = await getSourceDetail(sourceId);
  if (!detail || !detail.projects.some((project) => project.id === projectId)) {
    return { ok: false, error: "That source isn't part of this project." };
  }
  const representation = detail.transcript;
  if (detail.status !== "ready" || !representation || representation.status !== "ready") {
    return {
      ok: false,
      error:
        detail.kind === "document"
          ? "This document's text isn't ready yet. Extraction can start when it is."
          : "This recording hasn't finished transcribing. Extraction can start when it does.",
    };
  }

  if (detail.kind === "document") {
    const content = await getDocumentContentForRepresentation(representation.id);
    const { units, groups } = buildDocumentUnits(
      content.blocks.map((block) => ({
        id: block.id,
        pageNumber: block.pageNumber,
        blockType: block.blockType,
        text: block.text,
      })),
    );
    if (units.length === 0) return { ok: false, error: "This document has no text to read." };
    return {
      ok: true,
      source: {
        sourceId,
        sourceTitle: detail.title,
        sourceKindLabel: SOURCE_KIND_LABEL[detail.kind],
        representationId: representation.id,
        units,
        groups,
        speakerByUnit: new Map(),
        speakerNames: [],
      },
    };
  }

  const transcript = await getTranscriptForRepresentation(representation.id);
  const speakerById = new Map(transcript.speakers.map((speaker) => [speaker.id, speaker]));
  const { units, groups } = buildTranscriptUnits(
    transcript.segments.map((segment) => {
      const speaker = segment.speakerId ? speakerById.get(segment.speakerId) : undefined;
      return {
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text,
        words: segment.words,
        speakerLabel: speaker
          ? speakerDisplayLabel(speaker.diarizationLabel, speaker.displayName)
          : "Unknown speaker",
      };
    }),
    formatDuration,
  );
  if (units.length === 0) return { ok: false, error: "This recording's transcript has no speech to read." };

  const speakerByUnit = new Map<number, string | null>();
  for (const unit of units) {
    speakerByUnit.set(unit.id, transcript.segments[unit.segmentIndex ?? -1]?.speakerId ?? null);
  }
  return {
    ok: true,
    source: {
      sourceId,
      sourceTitle: detail.title,
      sourceKindLabel: SOURCE_KIND_LABEL[detail.kind],
      representationId: representation.id,
      units,
      groups,
      speakerByUnit,
      speakerNames: transcript.speakers
        .map((speaker) => speaker.displayName?.trim() ?? "")
        .filter((name) => name !== ""),
    },
  };
}

export interface ExtractionContext {
  projectTitle: string;
  projectDescription: string | null;
  /** The active questions, in order, numbered from 1 for the model. */
  questions: { id: string; number: number; question: string }[];
  notes: ExtractionNote[];
}

export async function loadExtractionContext(projectId: string): Promise<
  { ok: true; context: ExtractionContext } | { ok: false; error: string }
> {
  const project = await getProjectById(projectId);
  if (!project) return { ok: false, error: "That project doesn't exist." };
  const questions = (await listResearchQuestions(projectId)).filter((question) => !question.archivedAt);
  if (questions.length === 0) {
    return { ok: false, error: "Add a research question on the Setup tab before extracting data points." };
  }
  const notes = (await listContextNotes(projectId)).filter((note) => note.status === "active");
  return {
    ok: true,
    context: {
      projectTitle: project.title,
      projectDescription: project.description,
      questions: questions.map((question, index) => ({
        id: question.id,
        number: index + 1,
        question: question.question,
      })),
      notes: notes.map((note) => ({ title: note.title, summary: note.summary })),
    },
  };
}

export interface ExtractedCandidates {
  candidates: CandidatePoint[];
  dropped: Record<DropReason, number>;
  duplicates: number;
  windows: number;
}

export type ExtractCandidatesResult =
  { ok: true; value: ExtractedCandidates } | { ok: false; error: string };

/** Asks the model about every window of a source with the given guide and merges its answers. */
export async function extractCandidates(args: {
  source: ReadSource;
  context: ExtractionContext;
  guide: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<ExtractCandidatesResult> {
  const { source, context, guide, onProgress } = args;
  const windows = windowUnits(source.units);
  const questionIds = context.questions.map((question) => question.id);
  const questions: ExtractionQuestion[] = context.questions.map(({ number, question }) => ({ number, question }));

  const all: CandidatePoint[] = [];
  let dropped = emptyDropped();
  onProgress?.(0, windows.length);

  for (let index = 0; index < windows.length; index++) {
    const window = windows[index]!;
    const input = buildExtractionInput({
      projectTitle: context.projectTitle,
      projectDescription: context.projectDescription,
      questions,
      notes: context.notes,
      sourceTitle: source.sourceTitle,
      sourceKindLabel: source.sourceKindLabel,
      units: window,
      groups: source.groups,
      windowLabel: windows.length > 1 ? `Part ${index + 1} of ${windows.length}` : null,
    });
    const called = await callExtractionModel({ guide, input });
    if (!called.ok) return { ok: false, error: called.error };

    const parsed = parseExtractionOutput(called.text, {
      questionIds,
      validUnitIds: new Set(window.map((unit) => unit.id)),
    });
    if (parsed.dropped.unreadable > 0 && parsed.points.length === 0) {
      return { ok: false, error: "The extraction step returned an answer that couldn't be read. Try again." };
    }
    dropped = sumDropped(dropped, parsed.dropped);
    all.push(...parsed.points);
    onProgress?.(index + 1, windows.length);
  }

  const { kept, dropped: duplicates } = dropOverlapping(all);
  return { ok: true, value: { candidates: kept, dropped, duplicates, windows: windows.length } };
}

export interface ExtractionOutcome {
  runId: string;
  /** Suggestions written. */
  added: number;
  /** Candidates that sat on a passage a person had already decided on. */
  skippedReviewed: number;
  /** Candidates the model proposed that failed the checks. */
  dropped: number;
}

export type ExtractionResult = ({ ok: true } & ExtractionOutcome) | { ok: false; error: string };

/**
 * Extracts one source for one project: reads it, asks the model, and replaces
 * the source's still-suggested data points with the new suggestions. Accepted
 * and rejected points are never touched, and a fresh suggestion that lands on
 * a passage a person already decided on is not made again.
 */
export async function runExtraction(args: {
  projectId: string;
  sourceId: string;
  userId: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<ExtractionResult> {
  const { projectId, sourceId, userId, onProgress } = args;
  const supabase = await createClient();

  const read = await readSourceUnits(projectId, sourceId);
  if (!read.ok) return read;
  const loaded = await loadExtractionContext(projectId);
  if (!loaded.ok) return loaded;

  // Background first, so the model reads "the redoubt" correctly. Its failure never stops extraction.
  const ensured = await ensureContext({ projectId, userId });
  const context = ensured.refreshed
    ? await loadExtractionContext(projectId).then((again) => (again.ok ? again.context : loaded.context))
    : loaded.context;

  const live = await getLivePrompt("extraction");
  const started = await startRun(supabase, {
    kind: "extraction",
    projectId,
    sourceId,
    promptVersionId: live.versionId,
    trial: false,
    model: RESEARCH_MODEL,
    userId,
  });
  if (!started.ok) return { ok: false, error: started.error };
  const runId = started.runId;

  try {
    const extracted = await extractCandidates({ source: read.source, context, guide: live.body, onProgress });
    if (!extracted.ok) {
      await finishRun(supabase, runId, { status: "failed", error: extracted.error });
      return { ok: false, error: extracted.error };
    }
    const { candidates, dropped, duplicates, windows } = extracted.value;

    // What a person has already decided on this source stays decided.
    const existing = await listDataPointsForSource(projectId, sourceId);
    const reviewed = existing
      .filter((point) => point.status !== "suggested")
      .map((point) => ({
        relevance: point.relevance,
        questionKey: point.relevance === "question" ? point.questionId : null,
        unitIds: new Set(point.spans.flatMap((span) => [...unitIdsForSpan(span, read.source.units)])),
      }));
    const fresh = candidates.filter(
      (candidate) =>
        !reviewed.some(
          (point) =>
            point.relevance === candidate.relevance &&
            point.questionKey === candidate.questionKey &&
            overlapRatio(point.unitIds, candidate.unitIds) >= SAME_PASSAGE_OVERLAP,
        ),
    );
    const skippedReviewed = candidates.length - fresh.length;

    const unitsById = new Map(read.source.units.map((unit) => [unit.id, unit]));
    const pointRows = fresh.map((candidate) => ({
      id: randomUUID(),
      project_id: projectId,
      source_id: sourceId,
      representation_id: read.source.representationId,
      question_id: candidate.questionId,
      relevance: candidate.relevance,
      story_element: candidate.storyElement,
      claim: candidate.claim,
      ai_claim: candidate.claim,
      speaker_id: read.source.speakerByUnit.get(candidate.ranges[0]!.from) ?? null,
      kind: candidate.kind,
      status: "suggested" as const,
      prompt_version_id: live.versionId,
      run_id: runId,
      candidate,
    }));

    const spanRows = pointRows.flatMap((row) =>
      resolveSpans(row.candidate.ranges, unitsById).map((span, position) => ({
        data_point_id: row.id,
        position,
        locator_kind: span.kind,
        start_ms: span.kind === "temporal" ? span.startMs : null,
        end_ms: span.kind === "temporal" ? span.endMs : null,
        page_number: span.kind === "document" ? span.pageNumber : null,
        first_block_id: span.kind === "document" ? span.firstBlockId : null,
        last_block_id: span.kind === "document" ? span.lastBlockId : null,
      })),
    );

    if (pointRows.length > 0) {
      const inserted = await supabase
        .from("sw_data_points")
        .insert(pointRows.map(({ candidate: _candidate, ...row }) => row));
      if (inserted.error) throw new Error(`Could not save the data points: ${inserted.error.message}`);

      const spansInserted = await supabase.from("sw_data_point_spans").insert(spanRows);
      if (spansInserted.error) {
        // Points without their passages would be claims with no evidence; take them back out.
        await supabase.from("sw_data_points").delete().eq("run_id", runId);
        throw new Error(`Could not save the data points' passages: ${spansInserted.error.message}`);
      }
    }

    // The new suggestions are in; only now do the previous run's still-unreviewed ones go.
    const cleared = await supabase
      .from("sw_data_points")
      .delete()
      .eq("project_id", projectId)
      .eq("source_id", sourceId)
      .eq("status", "suggested")
      .or(`run_id.is.null,run_id.neq.${runId}`);
    if (cleared.error) throw new Error(`Could not replace the earlier suggestions: ${cleared.error.message}`);

    const droppedTotal = Object.values(dropped).reduce((sum, count) => sum + count, 0);
    await finishRun(supabase, runId, {
      status: "succeeded",
      counts: {
        windows,
        proposed: candidates.length + duplicates,
        duplicates,
        added: pointRows.length,
        skipped_reviewed: skippedReviewed,
        dropped,
      },
    });
    return { ok: true, runId, added: pointRows.length, skippedReviewed, dropped: droppedTotal };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extraction failed.";
    console.error("Sourcework extraction failed:", error);
    await finishRun(supabase, runId, { status: "failed", error: message });
    return { ok: false, error: message };
  }
}
