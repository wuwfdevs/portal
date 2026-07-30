import { describe, expect, it } from "vitest";
import {
  canGuestSafelyLeave,
  deriveGuestCompletionState,
  deriveSessionCompletionStatus,
  deriveTrackProvenance,
  trackStatusBadgeVariant,
} from "./track-status";

describe("deriveTrackProvenance", () => {
  it("labels a complete local master", () => {
    expect(deriveTrackProvenance({ source: "local", status: "complete" })).toBe(
      "local_master_complete",
    );
  });

  it("labels a complete local master that had to be resumed", () => {
    expect(
      deriveTrackProvenance({ source: "local", status: "complete" }, { wasResumed: true }),
    ).toBe("local_master_recovered");
  });

  it("labels a complete cloud backup, ignoring wasResumed", () => {
    expect(
      deriveTrackProvenance({ source: "cloud", status: "complete" }, { wasResumed: true }),
    ).toBe("cloud_backup_complete");
  });

  it("labels partial tracks by source", () => {
    expect(deriveTrackProvenance({ source: "local", status: "partial" })).toBe("local_partial");
    expect(deriveTrackProvenance({ source: "cloud", status: "partial" })).toBe(
      "cloud_backup_partial",
    );
  });

  it("collapses missing and failed to missing", () => {
    expect(deriveTrackProvenance({ source: "local", status: "missing" })).toBe("missing");
    expect(deriveTrackProvenance({ source: "local", status: "failed" })).toBe("missing");
  });

  it("reports in-progress states honestly rather than guessing", () => {
    expect(deriveTrackProvenance({ source: "local", status: "recording" })).toBe("in_progress");
    expect(deriveTrackProvenance({ source: "local", status: "uploading" })).toBe("in_progress");
    expect(deriveTrackProvenance({ source: "local", status: "assembling" })).toBe("in_progress");
  });
});

describe("trackStatusBadgeVariant", () => {
  it("colors terminal states by whether they're good news", () => {
    expect(trackStatusBadgeVariant("complete")).toBe("success");
    expect(trackStatusBadgeVariant("partial")).toBe("warning");
    expect(trackStatusBadgeVariant("missing")).toBe("danger");
    expect(trackStatusBadgeVariant("failed")).toBe("danger");
  });

  it("colors in-progress states neutrally", () => {
    expect(trackStatusBadgeVariant("recording")).toBe("neutral");
    expect(trackStatusBadgeVariant("uploading")).toBe("neutral");
    expect(trackStatusBadgeVariant("assembling")).toBe("neutral");
  });
});

describe("deriveSessionCompletionStatus", () => {
  it("stays processing with no tracks yet", () => {
    expect(deriveSessionCompletionStatus([])).toBe("processing");
  });

  it("stays processing while any track is still in flight", () => {
    expect(deriveSessionCompletionStatus(["complete", "uploading"])).toBe("processing");
    expect(deriveSessionCompletionStatus(["assembling"])).toBe("processing");
  });

  it("is ready when every track completed cleanly", () => {
    expect(deriveSessionCompletionStatus(["complete", "complete"])).toBe("ready");
  });

  it("needs recovery when some but not all tracks are usable", () => {
    expect(deriveSessionCompletionStatus(["complete", "partial"])).toBe("needs_recovery");
    expect(deriveSessionCompletionStatus(["complete", "missing"])).toBe("needs_recovery");
  });

  it("is failed when nothing usable came out of the session", () => {
    expect(deriveSessionCompletionStatus(["missing", "failed"])).toBe("failed");
  });
});

describe("deriveGuestCompletionState / canGuestSafelyLeave", () => {
  it("says needs_reopen on an unrecoverable local failure regardless of backlog", () => {
    const state = deriveGuestCompletionState({ localRecording: "failed", pendingUploadParts: 0 });
    expect(state).toBe("needs_reopen");
    expect(canGuestSafelyLeave(state)).toBe(false);
  });

  it("says reconnecting while interrupted", () => {
    const state = deriveGuestCompletionState({
      localRecording: "interrupted",
      pendingUploadParts: 2,
    });
    expect(state).toBe("reconnecting");
    expect(canGuestSafelyLeave(state)).toBe(false);
  });

  it("says uploading while parts are still pending", () => {
    const state = deriveGuestCompletionState({
      localRecording: "recording",
      pendingUploadParts: 3,
    });
    expect(state).toBe("uploading");
    expect(canGuestSafelyLeave(state)).toBe(false);
  });

  it("says safe once nothing is pending and nothing failed", () => {
    const state = deriveGuestCompletionState({ localRecording: "idle", pendingUploadParts: 0 });
    expect(state).toBe("safe");
    expect(canGuestSafelyLeave(state)).toBe(true);
  });
});
