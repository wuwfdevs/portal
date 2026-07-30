// Pure, dependency-free status-derivation logic for slice 4 (completion,
// recovery, and delivery — design doc §3E/§4/§6). Kept separate from the
// assembly/storage plumbing (assembly.ts, storage.ts) so the two decisions
// that matter most — "what does this track's provenance actually mean" and
// "can this guest safely close the tab" — are testable under Vitest, per
// CLAUDE.md's testing expectations and the same pattern as call-status.ts.

import type { BadgeVariant } from "@/components/ui/badge";
import type { LocalRecordingState } from "@/lib/remote-interview/call-status";

export type RiTrackStatus =
  | "recording"
  | "uploading"
  | "assembling"
  | "complete"
  | "partial"
  | "missing"
  | "failed";
export type RiTrackSource = "local" | "cloud";

/**
 * Design doc §6, "Provenance, which is never fudged": every file carries an
 * explicit source and integrity status. `in_progress` isn't one of the
 * doc's six labels — it covers the states before a track reaches a terminal
 * one, which the six labels don't need to describe.
 */
export type TrackProvenance =
  | "local_master_complete"
  | "local_master_recovered"
  | "local_partial"
  | "cloud_backup_complete"
  | "cloud_backup_partial"
  | "missing"
  | "in_progress";

export const TRACK_PROVENANCE_LABELS: Record<TrackProvenance, string> = {
  local_master_complete: "Local master — complete",
  local_master_recovered: "Local master — recovered after interruption",
  local_partial: "Local master — partial",
  cloud_backup_complete: "Cloud backup — complete",
  cloud_backup_partial: "Cloud backup — partial",
  missing: "Missing",
  in_progress: "In progress",
};

/**
 * `wasResumed` says whether this track's local capture had to be drained
 * from OPFS after a crash/reload (capture.ts's resume-on-reopen) — the
 * caller derives it from ri_session_events (kind 'local_track_resumed')
 * since this module stays pure. A resumed-but-complete track is still the
 * full recording; it just didn't get there in one unbroken run, which is
 * worth saying honestly rather than presenting it identically to a track
 * that never had trouble.
 */
export function deriveTrackProvenance(
  track: { source: RiTrackSource; status: RiTrackStatus },
  opts: { wasResumed?: boolean } = {},
): TrackProvenance {
  switch (track.status) {
    case "complete":
      if (track.source === "cloud") return "cloud_backup_complete";
      return opts.wasResumed ? "local_master_recovered" : "local_master_complete";
    case "partial":
      return track.source === "cloud" ? "cloud_backup_partial" : "local_partial";
    case "missing":
    case "failed":
      return "missing";
    default:
      return "in_progress";
  }
}

export function trackStatusBadgeVariant(status: RiTrackStatus): BadgeVariant {
  switch (status) {
    case "complete":
      return "success";
    case "partial":
      return "warning";
    case "missing":
    case "failed":
      return "danger";
    case "recording":
    case "uploading":
    case "assembling":
      return "neutral";
  }
}

export type SessionCompletionStatus = "processing" | "ready" | "needs_recovery" | "failed";

/**
 * Rolls a session's local-master track statuses (the production source, per
 * §2) up to a session-level completion status. Design doc §3E: "A session
 * is not 'complete' because the call ended — it is complete when the data
 * is verified present and readable." Cloud-backup status is surfaced
 * separately per track and never substituted into this rollup (§6: "The
 * system never substitutes the backup for the master silently").
 */
export function deriveSessionCompletionStatus(
  localTrackStatuses: RiTrackStatus[],
): SessionCompletionStatus {
  if (localTrackStatuses.length === 0) return "processing";

  const stillWorking = localTrackStatuses.some(
    (status) => status === "recording" || status === "uploading" || status === "assembling",
  );
  if (stillWorking) return "processing";

  const anyUsable = localTrackStatuses.some(
    (status) => status === "complete" || status === "partial",
  );
  if (!anyUsable) return "failed";

  const allComplete = localTrackStatuses.every((status) => status === "complete");
  return allComplete ? "ready" : "needs_recovery";
}

// Guest completion messaging (design doc §3E) ---------------------------------

export type GuestCompletionState = "uploading" | "reconnecting" | "safe" | "needs_reopen";

/**
 * The four states from §3E, verbatim. `needs_reopen` maps to a local
 * recording failure that isn't a transient retry (capture.ts's "failed" —
 * a genuine capture-loss event with nothing durable left to retry from),
 * which is exactly when reopening the link on the same device to resume
 * from whatever OPFS still holds is the only path forward.
 */
export function deriveGuestCompletionState(status: {
  localRecording: LocalRecordingState;
  pendingUploadParts: number;
}): GuestCompletionState {
  if (status.localRecording === "failed") return "needs_reopen";
  if (status.localRecording === "interrupted") return "reconnecting";
  if (status.pendingUploadParts > 0) return "uploading";
  return "safe";
}

export const GUEST_COMPLETION_MESSAGES: Record<GuestCompletionState, string> = {
  uploading: "Your recording is still uploading. Keep this tab open.",
  reconnecting: "Your upload was interrupted. Reconnecting.",
  safe: "Your recording is safely uploaded. You may close this tab.",
  needs_reopen:
    "Part of your recording hasn't uploaded. Reopen this link on the same device to continue.",
};

export function canGuestSafelyLeave(state: GuestCompletionState): boolean {
  return state === "safe";
}
