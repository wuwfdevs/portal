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

/**
 * Where the run hands control back to the reporter. Every stop but "analyze" accepts the suggested
 * findings and clips on the way, because the later steps read accepted findings only.
 */
export type AutopilotStop = "analyze" | "synthesize" | "outline" | "write";

export const AUTOPILOT_STOPS: readonly {
  value: AutopilotStop;
  title: string;
  hint: string;
}[] = [
  {
    value: "analyze",
    title: "Analyze",
    hint: "I\u2019ll decide what to keep on the Review tab.",
  },
  {
    value: "synthesize",
    title: "Synthesis",
    hint: "Accepts what Analyze found, then answers each research question. I\u2019ll edit the synthesis.",
  },
  {
    value: "outline",
    title: "Outline",
    hint: "Builds a beat outline with tape suggestions. I\u2019ll write the narration.",
  },
  {
    value: "write",
    title: "A first draft",
    hint: "Writes narration from the outline. I\u2019ll edit the piece.",
  },
];

/** The steps a run to `stop` performs, in order. */
export function stepsFor(stop: AutopilotStop): (typeof AUTOPILOT_STEPS)[number][] {
  const end = AUTOPILOT_STEPS.findIndex((step) => step.key === stop);
  return AUTOPILOT_STEPS.slice(0, end + 1);
}

/** Whether a run to `stop` accepts suggestions without the reporter's review. */
export function acceptsWithoutReview(stop: AutopilotStop): boolean {
  return stop !== "analyze";
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

/** The sentence under the dialog's button, so a person knows what one click will do. */
export function autopilotPromise(stop: AutopilotStop): string {
  switch (stop) {
    case "analyze":
      return "Reads each source and stops, so you decide what to keep on the Review tab before anything is written.";
    case "synthesize":
      return "Reads each source, accepts what it finds, and synthesizes. Findings can be put back for review afterwards.";
    case "outline":
      return "Reads, accepts, synthesizes and outlines. The outline is a version of a new piece you can undo.";
    case "write":
      return "Runs every step: reads each source, accepts what it finds, synthesizes, outlines and writes a first draft. The draft is a version you can undo, findings can be put back for review, and each step can be redone by hand.";
  }
}

/** The button's label for a stop. */
export function autopilotButtonLabel(stop: AutopilotStop): string {
  switch (stop) {
    case "analyze":
      return "Analyze and review";
    case "synthesize":
      return "Analyze and synthesize";
    case "outline":
      return "Write the outline";
    case "write":
      return "Write the story";
  }
}

/** The step labels a run will perform, minus the ones the project has already finished. */
export function autopilotRunSummary(stop: AutopilotStop, toAnalyze: number): string {
  const parts: string[] = [];
  const keys = stepsFor(stop).map((step) => step.key);
  if (keys.includes("analyze") && toAnalyze > 0) {
    parts.push(toAnalyze === 1 ? "Analyze 1 source" : `Analyze ${toAnalyze} sources`);
  }
  if (keys.includes("accept")) parts.push("Accept the suggestions");
  if (keys.includes("synthesize")) parts.push("Synthesize");
  if (keys.includes("outline")) parts.push("Outline");
  if (keys.includes("write")) parts.push("Write from outline");
  return parts.join(" \u00b7 ");
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
