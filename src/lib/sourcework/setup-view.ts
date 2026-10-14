// Small pure rules behind the project's Setup and Sources tabs: which note is
// shown, what the batch button says, which sources it runs. No Supabase, no
// JSX (docs/sourcework-analysis-design.md §7.1).

import { pluralize } from "@/lib/format";
import { canExtract, type ExtractionState, type Standing } from "./run-state";
import type { ContextNote } from "./research";

/** Background notes shown before "Show N more". */
export const NOTES_SHOWN = 3;

export function splitContextNotes(notes: readonly ContextNote[]): {
  active: ContextNote[];
  dismissed: ContextNote[];
} {
  return {
    active: notes.filter((note) => note.status === "active"),
    dismissed: notes.filter((note) => note.status === "dismissed"),
  };
}

/** The `Steps` index of the first step not yet done; past the end when all are. */
export function currentStepIndex(steps: Standing["steps"]): number {
  const index = steps.findIndex((step) => step.state !== "done");
  return index === -1 ? steps.length : index;
}

/** Sources a batch should run: not extracted yet, or whose last try failed. */
export function sourcesToExtract<T extends { state: ExtractionState }>(sources: readonly T[]): T[] {
  return sources.filter((source) => canExtract(source.state) && source.state.kind !== "done");
}

export function analyzeButtonLabel(count: number): string {
  return count > 0 ? `Analyze (${count})` : "Analyze";
}

/** What a finished Analyze run says: findings and clips added for review, or that nothing new was found. */
export function analysisSummary(findings: number, clips: number): string {
  if (findings === 0 && clips === 0) return "Nothing new to review.";
  const parts = [];
  if (findings > 0) parts.push(pluralize(findings, "finding"));
  if (clips > 0) parts.push(pluralize(clips, "clip"));
  return `${parts.join(" and ")} added for review.`;
}

/** "1 of 1 running"-style summary is the panel's job; this is the footer line. */
export const EXTRACTION_FOOTER =
  "You can leave this page; it keeps running while it is open in another tab.";

export function dataPointsLabel(count: number): string {
  return pluralize(count, "data point");
}
