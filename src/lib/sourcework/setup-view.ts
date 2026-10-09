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

export function extractButtonLabel(count: number): string {
  return count > 0 ? `Extract data points (${count})` : "Extract data points";
}

/** "1 of 1 running"-style summary is the panel's job; this is the footer line. */
export const EXTRACTION_FOOTER =
  "You can leave this page; it keeps running while it is open in another tab.";

/** Error line for a failed background run, or null when the failure is only "not configured". */
export function isNotConfiguredMessage(message: string): boolean {
  return /isn.t configured/i.test(message);
}

export function dataPointsLabel(count: number): string {
  return pluralize(count, "data point");
}
