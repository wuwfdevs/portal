// Pure, dependency-free status-derivation logic for the studio (design doc
// §3D/§4). Kept separate from the Daily/capture browser plumbing so the one
// decision that matters most — "is this participant's data currently safe,
// and what does the host need to do about it" — is testable under Vitest,
// per CLAUDE.md's testing expectations and the same pattern as
// preflight.ts/tokens.ts.
//
// The core rule from §3D, stated in code rather than just prose: recording
// status is not connection status. A flaky network alone never taints data
// safety — only the local recording and cloud backup states do, because
// those are what actually capture audio.

export type ConnectionState = "connected" | "reconnecting" | "disconnected";
export type LocalRecordingState = "idle" | "recording" | "interrupted" | "failed";
export type CloudBackupState = "idle" | "recording" | "failed" | "unavailable";

export interface ParticipantStatus {
  participantId: string;
  displayName: string;
  connection: ConnectionState;
  micMuted: boolean;
  localRecording: LocalRecordingState;
  cloudBackup: CloudBackupState;
  /** Parts written locally but not yet acknowledged by the server. */
  pendingUploadParts: number;
}

export type DataSafety = "safe" | "at_risk" | "unsafe";

export interface ParticipantHealth {
  safety: DataSafety;
  actionRequired: string | null;
}

/** ~30s of unacked audio at the capture module's 5s timeslice (capture.ts). */
export const UPLOAD_BACKLOG_WARNING_THRESHOLD = 6;

/**
 * §3D: "Whether this participant's data is currently safe, and what action
 * is required if it isn't." Order matters — worst case wins, and a failed
 * local master with no working cloud backup is the one truly unsafe state,
 * since it means nothing is capturing this participant at all.
 */
export function deriveParticipantHealth(status: ParticipantStatus): ParticipantHealth {
  if (status.localRecording === "failed") {
    if (status.cloudBackup === "recording") {
      return {
        safety: "at_risk",
        actionRequired:
          "Local recording failed. Only the lower-quality cloud backup is capturing this participant right now.",
      };
    }
    return {
      safety: "unsafe",
      actionRequired:
        "Local recording failed and no cloud backup is running — nothing is capturing this participant.",
    };
  }

  if (status.localRecording === "interrupted") {
    return {
      safety: "at_risk",
      actionRequired: "Local recording was interrupted. Check this participant's device.",
    };
  }

  if (
    status.localRecording === "recording" &&
    status.pendingUploadParts > UPLOAD_BACKLOG_WARNING_THRESHOLD
  ) {
    return {
      safety: "at_risk",
      actionRequired:
        "Upload is falling behind. Nothing is lost yet as long as the tab stays open.",
    };
  }

  return { safety: "safe", actionRequired: null };
}

/** Whether the studio's recording-health banner (design doc §4) should show at all. */
export function anyParticipantNeedsAttention(statuses: ParticipantStatus[]): boolean {
  return statuses.some((status) => deriveParticipantHealth(status).safety !== "safe");
}
