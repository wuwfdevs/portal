// Where an exception stands, as one step (docs/underwriting-traffic-
// redesign.md §17). The exceptions list's filter chips, its "Next step"
// column, the exception page's step strip, and the dashboard's "Missed
// credits" tiles all read this one derivation, so a count and the list it
// links to always agree. Pure, so it is tested without Supabase.
//
// Every open exception is at exactly one step:
//   agency          — the contract needs the agency's approval and it hasn't answered
//   awaiting_break  — a makegood exists with no break chosen (auto-fill will place it)
//   makegood_scheduled — a makegood has its break and hasn't aired yet
//   decision        — anything else that's open: no makegood yet, the agency
//                     declined, or every makegood was cancelled
// A resolved exception is "resolved". An exception closes itself when its
// last scheduled makegood airs (20261001120000_underwriting_exception_auto_close.sql).

import type {
  UwMakegoodApproval,
  UwMakegoodStatus,
  UwResolutionAction,
  UwResolutionStatus,
} from "@/lib/database.types";

export type ExceptionStep =
  "decision" | "agency" | "awaiting_break" | "makegood_scheduled" | "resolved";

export const EXCEPTION_FILTERS = [
  "decision",
  "agency",
  "awaiting_break",
  "makegood_scheduled",
  "resolved",
  "all",
] as const;
export type ExceptionFilter = (typeof EXCEPTION_FILTERS)[number];

/** The open steps, in the order the work happens. */
export const OPEN_EXCEPTION_STEPS: readonly ExceptionStep[] = [
  "decision",
  "agency",
  "awaiting_break",
  "makegood_scheduled",
];

export const EXCEPTION_FILTER_LABEL: Record<ExceptionFilter, string> = {
  decision: "Need a decision",
  agency: "Waiting on the agency",
  awaiting_break: "Makegood awaiting a break",
  makegood_scheduled: "Makegood scheduled",
  resolved: "Resolved",
  all: "All",
};

export interface ExceptionStepInput {
  resolution_status: UwResolutionStatus;
  makegood_approval: UwMakegoodApproval;
  makegoods: readonly { status: UwMakegoodStatus; scheduled_placement_id: string | null }[];
}

export function exceptionStep(exception: ExceptionStepInput): ExceptionStep {
  if (exception.resolution_status === "resolved") return "resolved";
  if (exception.makegood_approval === "pending") return "agency";
  const active = exception.makegoods.filter((makegood) => makegood.status === "scheduled");
  if (active.some((makegood) => makegood.scheduled_placement_id === null)) return "awaiting_break";
  if (active.length > 0) return "makegood_scheduled";
  return "decision";
}

export function matchesExceptionFilter(
  exception: ExceptionStepInput,
  filter: ExceptionFilter,
): boolean {
  return filter === "all" || exceptionStep(exception) === filter;
}

/** The filter the list opens on: the first open step with anything in it, else everything. */
export function defaultExceptionFilter(exceptions: readonly ExceptionStepInput[]): ExceptionFilter {
  const steps = new Set(exceptions.map(exceptionStep));
  return OPEN_EXCEPTION_STEPS.find((step) => steps.has(step)) ?? "all";
}

export function countByExceptionFilter(
  exceptions: readonly ExceptionStepInput[],
): Record<ExceptionFilter, number> {
  const counts = Object.fromEntries(EXCEPTION_FILTERS.map((filter) => [filter, 0])) as Record<
    ExceptionFilter,
    number
  >;
  for (const exception of exceptions) counts[exceptionStep(exception)] += 1;
  counts.all = exceptions.length;
  return counts;
}

/** Plain-language names for a recorded decision — the list's resolved rows and the exception page's choices. */
export const RESOLUTION_ACTION_LABEL: Record<UwResolutionAction, string> = {
  schedule_makegood: "Make it good",
  accept_alternate: "Accept the alternate airing",
  waive: "Waive",
  closed: "Close, no action",
  reassign: "Reassign the obligation",
  clarification_requested: "Ask for clarification",
  corrected: "Correct the record",
};
