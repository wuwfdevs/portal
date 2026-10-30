// Where a project stands in the Analyze -> Review -> Synthesize -> Piece flow, for the step strip
// and "next" band on the project's Sources tab. Pure: no Supabase, no JSX. It reports and suggests;
// it never gates, and every step can still be done by hand from its own tab in any order.

import { pluralize } from "@/lib/format";

export const PROJECT_STEPS = [
  { key: "sources", label: "Sources", view: null },
  { key: "analyze", label: "Analyze", view: null },
  { key: "review", label: "Review", view: "review" },
  { key: "synthesis", label: "Synthesis", view: "synthesis" },
  { key: "piece", label: "Piece", view: "pieces" },
] as const;

export type ProjectStepKey = (typeof PROJECT_STEPS)[number]["key"];

export interface ProjectStageInput {
  /** Sources attached to the project, whatever their state. */
  sourceCount: number;
  /** Sources that have finished processing and can be read. */
  readyCount: number;
  /** Ready sources Analyze has run to the end on. */
  analyzedCount: number;
  /** Findings and clips waiting for a decision. */
  waitingReview: number;
  acceptedFindings: number;
  hasSynthesis: boolean;
  pieceCount: number;
}

export type NextStep =
  | { kind: "add_sources" }
  | { kind: "wait_for_sources"; processing: number }
  | { kind: "analyze"; unanalyzed: number }
  | { kind: "review"; waiting: number }
  | { kind: "accept_first" }
  | { kind: "synthesize"; accepted: number }
  | { kind: "start_piece" }
  | { kind: "continue_piece"; pieces: number };

export interface ProjectStage {
  /** Index into PROJECT_STEPS of the step to do next; past the end when every step is done. */
  current: number;
  next: NextStep;
}

/**
 * Steps before `current` are done. Analyze counts as done as soon as one source has been analyzed:
 * a later source is another run of the same step, not a reason to send the reporter back past
 * Review, which is what they can already do.
 */
export function projectStage(input: ProjectStageInput): ProjectStage {
  if (input.sourceCount === 0) return { current: 0, next: { kind: "add_sources" } };
  if (input.readyCount === 0) {
    return {
      current: 0,
      next: { kind: "wait_for_sources", processing: input.sourceCount },
    };
  }
  if (input.analyzedCount === 0) {
    return { current: 1, next: { kind: "analyze", unanalyzed: input.readyCount } };
  }
  if (input.waitingReview > 0) {
    return { current: 2, next: { kind: "review", waiting: input.waitingReview } };
  }
  if (!input.hasSynthesis) {
    return input.acceptedFindings > 0
      ? { current: 3, next: { kind: "synthesize", accepted: input.acceptedFindings } }
      : { current: 3, next: { kind: "accept_first" } };
  }
  if (input.pieceCount === 0) return { current: 4, next: { kind: "start_piece" } };
  return {
    current: PROJECT_STEPS.length,
    next: { kind: "continue_piece", pieces: input.pieceCount },
  };
}

/**
 * Whether the overview (step strip and "next" band) has anything to say. A project that has reached
 * its pieces has every step done and a band that only repeats the Pieces tab, so it shows nothing.
 */
export function hasNextStep(next: NextStep): boolean {
  return next.kind !== "continue_piece";
}

/** The "next" band's lead line. */
export function nextStepHeadline(next: NextStep): string {
  switch (next.kind) {
    case "add_sources":
      return "Add the interviews and documents this project is about.";
    case "wait_for_sources":
      return `${pluralize(next.processing, "source")} ${next.processing === 1 ? "is" : "are"} still processing. Analyze is available once one is ready.`;
    case "analyze":
      return `${pluralize(next.unanalyzed, "source")} ${next.unanalyzed === 1 ? "is" : "are"} ready. Analyze reads each one and proposes findings and clips for you to decide on.`;
    case "review":
      return `${pluralize(next.waiting, "finding or clip", "findings and clips")} ${next.waiting === 1 ? "is" : "are"} waiting for your decision. Nothing is deleted by deciding.`;
    case "accept_first":
      return "Nothing is waiting for review, and no finding has been accepted yet. Accept at least one to synthesize.";
    case "synthesize":
      return `${pluralize(next.accepted, "accepted finding")} can be read together to answer your questions.`;
    case "start_piece":
      return "The synthesis is ready. Start a piece blank, or outline one with AI.";
    case "continue_piece":
      return `${pluralize(next.pieces, "piece")} in progress.`;
  }
}

/** The small caps line above the headline. */
export function nextStepEyebrow(next: NextStep): string {
  switch (next.kind) {
    case "review":
      return "Next: your decision";
    case "continue_piece":
      return "In progress";
    default:
      return "Next";
  }
}

export interface ProjectProgress {
  /** Steps finished, of PROJECT_STEPS.length. */
  done: number;
  /** One step is under way when the project is not finished. */
  inProgress: number;
  total: number;
  complete: boolean;
  /** Where it is, in a word or two, for under the bar. */
  label: string;
}

/** A project's progress for its row in the Projects list: the same rule as the project page's step strip. */
export function projectProgress(input: ProjectStageInput): ProjectProgress {
  const stage = projectStage(input);
  const total = PROJECT_STEPS.length;
  const complete = stage.current >= total;
  const done = Math.min(stage.current, total);
  let label: string;
  switch (stage.next.kind) {
    case "add_sources":
      label = "No sources";
      break;
    case "wait_for_sources":
      label = "Processing";
      break;
    case "continue_piece":
      label = "Piece started";
      break;
    default:
      label = PROJECT_STEPS[stage.current]?.label ?? "";
  }
  return {
    done,
    inProgress: complete ? 0 : input.sourceCount === 0 ? 0 : 1,
    total,
    complete,
    label,
  };
}
