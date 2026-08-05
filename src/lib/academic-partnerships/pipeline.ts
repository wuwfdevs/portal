// Pure state derivation and labels for the pipeline. No Supabase, no React —
// colocated tests cover it directly, per CLAUDE.md's testing expectations.

import type { BadgeVariant } from "@/components/ui/badge";
import type { ApDisposition, ApStage } from "@/lib/database.types";

/** The seven primary kanban columns, in pipeline order. */
export const STAGES: ApStage[] = [
  "new",
  "reviewing",
  "meeting_requested",
  "scoping",
  "approved",
  "active",
  "completed",
];

export const STAGE_LABEL: Record<ApStage, string> = {
  new: "New",
  reviewing: "Reviewing",
  meeting_requested: "Meeting Requested",
  scoping: "Scoping",
  approved: "Approved",
  active: "Active",
  completed: "Completed",
};

export const DISPOSITIONS: ApDisposition[] = ["deferred", "declined", "withdrawn", "archived"];

export const DISPOSITION_LABEL: Record<ApDisposition, string> = {
  deferred: "Deferred",
  declined: "Declined",
  withdrawn: "Withdrawn",
  archived: "Archived",
};

export const DISPOSITION_BADGE: Record<ApDisposition, BadgeVariant> = {
  deferred: "warning",
  declined: "danger",
  withdrawn: "muted",
  archived: "neutral",
};

/** A reason is required for the three ways a submission closes early, not for archiving — mirrors the ap_submissions_disposition_reason_check constraint. */
export function dispositionRequiresReason(disposition: ApDisposition): boolean {
  return disposition === "deferred" || disposition === "declined" || disposition === "withdrawn";
}

/** Whole days between two ISO timestamps, floored — used for "age" and "time in stage". */
export function daysSince(isoTimestamp: string, now: Date = new Date()): number {
  const then = new Date(isoTimestamp).getTime();
  const diffMs = now.getTime() - then;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/** "Today" / "1 day" / "N days" — for a kanban card's age or time-in-stage line. */
export function formatDays(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

/** Null when valid; otherwise a sentence for the screen. Mirrors validatePostInput's shape. */
export function validateDispositionInput(
  disposition: ApDisposition,
  reason: string,
): string | null {
  if (dispositionRequiresReason(disposition) && reason.trim() === "") {
    return "Give a reason — it will show on the submission's closed disposition.";
  }
  return null;
}
