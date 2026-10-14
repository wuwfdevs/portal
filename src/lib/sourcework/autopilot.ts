// "Write a story" in one go (docs/sourcework-analysis-design.md §25): the existing steps — wait for the
// sources to finish processing, Analyze each, accept what Analyze suggested, Synthesize, Outline, Write
// from outline — chained from the browser. There is no job queue, so the chain runs while the page is
// open, and every step is the same request a person would make by hand; stopping part-way leaves the
// project exactly where that step left it. Pure: the planning and the wording, no Supabase, no fetch.

export const AUTOPILOT_STEPS = [
  { key: "wait", label: "Wait for transcripts" },
  { key: "analyze", label: "Analyze sources" },
  { key: "accept", label: "Accept suggestions" },
  { key: "synthesize", label: "Synthesize" },
  { key: "outline", label: "Outline" },
  { key: "write", label: "Write" },
] as const;

export type AutopilotStepKey = (typeof AUTOPILOT_STEPS)[number]["key"];

/** Where the run hands over to the reporter: at the end, or before anything is accepted. */
export type AutopilotMode = "story" | "review_first";

/** The steps a mode runs, in order. Review first stops after Analyze and opens the Review tab. */
export function stepsFor(mode: AutopilotMode): (typeof AUTOPILOT_STEPS)[number][] {
  const last = mode === "review_first" ? "analyze" : "write";
  const end = AUTOPILOT_STEPS.findIndex((step) => step.key === last);
  return AUTOPILOT_STEPS.slice(0, end + 1);
}

export interface AutopilotSource {
  id: string;
  title: string;
  /** Still uploading or being transcribed. */
  processing: boolean;
  /** The source itself failed; it cannot be analyzed. */
  failed: boolean;
  /** Analyze has already run to the end on this source. */
  analyzed: boolean;
  /** Analyze is running on it now, from a click elsewhere. */
  analyzing: boolean;
}

export interface AutopilotPlan {
  /** Sources to run Analyze on now. */
  toAnalyze: AutopilotSource[];
  /** Sources that were already analyzed and are left alone. */
  alreadyAnalyzed: number;
  /** Sources that cannot be used (failed). */
  unusable: AutopilotSource[];
  /** Sources still processing; the wait step is over only when this is empty. */
  waiting: AutopilotSource[];
  /** Nothing usable, so there is nothing to run on. */
  canRun: boolean;
}

export function planAutopilot(sources: readonly AutopilotSource[]): AutopilotPlan {
  const waiting = sources.filter((source) => source.processing && !source.failed);
  const unusable = sources.filter((source) => source.failed);
  const usable = sources.filter((source) => !source.failed);
  const toAnalyze = usable.filter(
    (source) => !source.processing && !source.analyzed && !source.analyzing,
  );
  return {
    toAnalyze,
    alreadyAnalyzed: usable.filter((source) => source.analyzed).length,
    unusable,
    waiting,
    canRun: usable.length > 0,
  };
}

/** The sentence under the button, so a person knows what one click will do. */
export function autopilotPromise(mode: AutopilotMode): string {
  return mode === "story"
    ? "Runs every step for you: reads each source, accepts what it finds, synthesizes, outlines and writes a first draft. Nothing is deleted at any step: the draft is a version you can undo, findings can be put back for review, and each step can be redone by hand."
    : "Reads each source and then stops, so you can accept or reject the findings and clips yourself on the Review tab before anything is written.";
}

export type AutopilotRunState =
  | { phase: "idle" }
  | { phase: "running"; step: AutopilotStepKey; detail: string | null }
  | { phase: "failed"; step: AutopilotStepKey; error: string }
  | { phase: "done" };

export function stepIndex(
  state: AutopilotRunState,
  steps: readonly { key: AutopilotStepKey }[],
): number {
  if (state.phase === "done") return steps.length;
  if (state.phase === "idle") return 0;
  return Math.max(
    0,
    steps.findIndex((step) => step.key === state.step),
  );
}
