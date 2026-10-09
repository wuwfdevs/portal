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
            ? "Reading the document. Extraction can start when it finishes."
            : "Transcribing. Extraction can start when it finishes.",
      };
    case "idle":
      return { text: "Not extracted yet" };
    case "running":
      return { text: "Extracting data points…" };
    case "failed":
      return { text: "Extraction didn't finish. Try again." };
    case "done":
      if (state.total === 0) return { text: "No data points found" };
      return state.toReview > 0
        ? { text: `${pluralize(state.total, "data point")} · `, strong: `${state.toReview} to review` }
        : { text: `${pluralize(state.total, "data point")} · all reviewed` };
  }
}

// Where a project stands ------------------------------------------------------------

export type StepState = "done" | "current" | "upcoming";

export interface Standing {
  steps: { label: string; shortLabel: string; state: StepState }[];
  message: string;
  /** Where the message's link goes, if it has one. */
  link: { label: string; to: "setup" | "sources" } | null;
}

export interface StandingSource {
  title: string;
  state: ExtractionState;
}

/**
 * The four-step status on the Setup tab. It reports; it never gates. Review
 * themes is Phase B, so it is always "upcoming" until that tab exists.
 */
export function projectStanding(input: {
  questionCount: number;
  sources: readonly StandingSource[];
  toReviewTotal: number;
}): Standing {
  const { questionCount, sources, toReviewTotal } = input;
  const total = sources.length;
  const extractable = sources.filter((source) => source.state.kind !== "source_failed");
  const processing = extractable.filter((source) => source.state.kind === "waiting");
  const running = sources.filter((source) => source.state.kind === "running");
  const extracted = extractable.filter((source) => source.state.kind === "done");
  const needing = extractable.filter((source) => canExtract(source.state) && source.state.kind !== "done");

  const hasQuestions = questionCount > 0;
  const hasSources = total > 0;
  const extractDone =
    hasSources && extractable.length > 0 && extracted.length === extractable.length;

  const states: StepState[] = [
    hasQuestions ? "done" : "current",
    hasSources ? "done" : hasQuestions ? "current" : "upcoming",
    extractDone ? "done" : hasQuestions && hasSources ? "current" : "upcoming",
    "upcoming",
  ];
  const labels = [
    ["Research questions", "Questions"],
    ["Add sources", "Add sources"],
    ["Extract data points", "Extract"],
    ["Review themes", "Review themes"],
  ] as const;
  const steps = labels.map(([label, shortLabel], index) => ({
    label,
    shortLabel,
    state: states[index]!,
  }));

  if (!hasQuestions) {
    return {
      steps,
      message:
        "Add the questions you are trying to answer. Data points that answer one are tagged with it; passages worth using that answer none are kept as story material.",
      link: null,
    };
  }
  if (!hasSources) {
    return {
      steps,
      message: "Add sources. Interviews and PDFs can be extracted once they are ready.",
      link: { label: "Go to Sources", to: "sources" },
    };
  }
  if (extractable.length === 0) {
    return {
      steps,
      message: "None of this project's sources is usable yet. Open Sources to see what went wrong.",
      link: { label: "Go to Sources", to: "sources" },
    };
  }

  if (extractDone) {
    return {
      steps,
      message:
        toReviewTotal > 0
          ? `${total === 1 ? "The source is" : `All ${total} sources are`} extracted. ${pluralize(toReviewTotal, "data point")} ${toReviewTotal === 1 ? "is" : "are"} waiting for review in the sources.`
          : `${total === 1 ? "The source is" : `All ${total} sources are`} extracted and reviewed.`,
      link: { label: "Go to Sources", to: "sources" },
    };
  }

  const parts: string[] = [`${extracted.length} of ${total} ${total === 1 ? "source is" : "sources are"} extracted.`];
  if (running.length > 0) {
    parts.push(
      running.length === 1
        ? `${running[0]!.title} is being extracted now.`
        : `${running.length} are being extracted now.`,
    );
  }
  if (processing.length > 0) {
    const first = processing[0]!;
    parts.push(
      processing.length === 1
        ? `${first.title} is still processing, so extraction can start for it when it finishes.`
        : `${first.title} and ${processing.length - 1} more are still processing, so extraction can start for them when they finish.`,
    );
  }
  if (needing.length > 0 && processing.length === 0 && running.length === 0) {
    parts.push(
      `${needing.length === 1 ? "One is" : `${needing.length} are`} ready to extract.`,
    );
  }
  return { steps, message: parts.join(" "), link: { label: "Go to Sources", to: "sources" } };
}
