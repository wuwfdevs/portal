// What a source's extraction looks like to a screen, and where a project
// stands: derived from the run log and the data point counts, never stored
// (docs/sourcework-analysis-design.md §7.1: "derived from the project's state
// and never enforces an order"). Pure.

import { pluralize } from "@/lib/format";

/**
 * A run still marked running after this long lost its request (the route's
 * maxDuration is five minutes), so a new run may take over rather than the
 * source being stuck "extracting" forever. Same idea as
 * isStaleProcessingRun for documents.
 */
export const STALE_RUN_MS = 12 * 60 * 1000;

export function isStaleRun(startedAt: string, now: Date = new Date()): boolean {
  return now.getTime() - new Date(startedAt).getTime() > STALE_RUN_MS;
}

export type RunStatus = "running" | "succeeded" | "failed";

export interface SourceExtractionInput {
  /** The source's own upload/processing state, from computeProjectStatus(). */
  sourceStatus: "uploading" | "processing" | "ready" | "failed";
  sourceKind: "audio_video" | "document";
  /** The latest non-trial extraction run for this project and source, if any. */
  latestRun: { status: RunStatus; startedAt: string; error: string | null } | null;
  /** From sw_data_point_counts; zeros when there are none. */
  counts: { total: number; toReview: number };
}

export type ExtractionState =
  | { kind: "waiting"; reason: "uploading" | "processing" }
  | { kind: "source_failed" }
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "failed"; error: string | null }
  | { kind: "done"; total: number; toReview: number };

export function extractionState(
  input: SourceExtractionInput,
  now: Date = new Date(),
): ExtractionState {
  if (input.sourceStatus === "uploading" || input.sourceStatus === "processing") {
    return { kind: "waiting", reason: input.sourceStatus };
  }
  if (input.sourceStatus === "failed") return { kind: "source_failed" };

  const run = input.latestRun;
  if (run?.status === "running" && !isStaleRun(run.startedAt, now)) return { kind: "running" };
  if (run?.status === "succeeded") {
    return { kind: "done", total: input.counts.total, toReview: input.counts.toReview };
  }
  if (run?.status === "failed" || run?.status === "running") {
    // A run that is "running" but stale died with its request: say so, and let a retry take over.
    return { kind: "failed", error: run.status === "failed" ? run.error : null };
  }
  return { kind: "idle" };
}

/** Whether an extraction may be started for this state. A finished source can be run again. */
export function canExtract(state: ExtractionState): boolean {
  return state.kind === "idle" || state.kind === "failed" || state.kind === "done";
}

export interface ExtractionLine {
  text: string;
  /** The part the card emphasises ("3 to review"). */
  strong?: string;
}

/** The line a source card carries under its title, or null where the card has its own message. */
export function extractionLine(
  state: ExtractionState,
  sourceKind: "audio_video" | "document",
): ExtractionLine | null {
  switch (state.kind) {
    case "source_failed":
      return null;
    case "waiting":
      return {
        text:
          sourceKind === "document"
            ? "Reading the document. Analysis can start when it finishes."
            : "Transcribing. Analysis can start when it finishes.",
      };
    case "idle":
      return { text: "Not analyzed yet" };
    case "running":
      return { text: "Analyzing…" };
    case "failed":
      return { text: "Analysis didn't finish. Try again." };
    case "done":
      if (state.total === 0) return { text: "No findings" };
      return state.toReview > 0
        ? {
            text: `${pluralize(state.total, "finding")} · `,
            strong: `${state.toReview} to review`,
          }
        : { text: `${pluralize(state.total, "finding")} · all reviewed` };
  }
}

// Where a project stands ------------------------------------------------------------

export interface SynthesisStanding {
  /** Accepted findings the project has. */
  acceptedFindings: number;
  /** Whether a synthesis has been written. */
  hasSynthesis: boolean;
  /** Accepted findings that changed after the current synthesis was written. */
  changedSince: number;
}
