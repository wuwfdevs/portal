import { describe, expect, it } from "vitest";
import {
  UPLOAD_BACKLOG_WARNING_THRESHOLD,
  anyParticipantNeedsAttention,
  cloudBackupBadgeVariant,
  connectionBadgeVariant,
  dataSafetyBadgeVariant,
  deriveParticipantHealth,
  localRecordingBadgeVariant,
  uploadBacklogBadgeVariant,
  type ParticipantStatus,
} from "./call-status";

function status(overrides: Partial<ParticipantStatus> = {}): ParticipantStatus {
  return {
    participantId: "p1",
    displayName: "Dr. Okafor",
    connection: "connected",
    micMuted: false,
    localRecording: "recording",
    cloudBackup: "recording",
    pendingUploadParts: 0,
    ...overrides,
  };
}

describe("deriveParticipantHealth", () => {
  it("is safe when everything is recording normally", () => {
    expect(deriveParticipantHealth(status())).toEqual({ safety: "safe", actionRequired: null });
  });

  it("ignores connection state entirely — recording status is not connection status", () => {
    const flaky = deriveParticipantHealth(status({ connection: "disconnected" }));
    expect(flaky.safety).toBe("safe");
  });

  it("is unsafe when local recording failed and cloud backup isn't running", () => {
    const health = deriveParticipantHealth(
      status({ localRecording: "failed", cloudBackup: "failed" }),
    );
    expect(health.safety).toBe("unsafe");
    expect(health.actionRequired).toMatch(/nothing is capturing/i);
  });

  it("is only at_risk when local recording failed but cloud backup is still running", () => {
    const health = deriveParticipantHealth(
      status({ localRecording: "failed", cloudBackup: "recording" }),
    );
    expect(health.safety).toBe("at_risk");
    expect(health.actionRequired).toMatch(/cloud backup/i);
  });

  it("is at_risk when local recording was interrupted", () => {
    expect(deriveParticipantHealth(status({ localRecording: "interrupted" })).safety).toBe(
      "at_risk",
    );
  });

  it("is at_risk once the upload backlog crosses the threshold while still recording", () => {
    const ok = deriveParticipantHealth(
      status({ pendingUploadParts: UPLOAD_BACKLOG_WARNING_THRESHOLD }),
    );
    expect(ok.safety).toBe("safe");

    const behind = deriveParticipantHealth(
      status({ pendingUploadParts: UPLOAD_BACKLOG_WARNING_THRESHOLD + 1 }),
    );
    expect(behind.safety).toBe("at_risk");
  });

  it("does not flag a large backlog once recording has stopped — that's normal post-stop draining", () => {
    const health = deriveParticipantHealth(
      status({ localRecording: "idle", pendingUploadParts: UPLOAD_BACKLOG_WARNING_THRESHOLD + 10 }),
    );
    expect(health.safety).toBe("safe");
  });
});

describe("anyParticipantNeedsAttention", () => {
  it("is false when every participant is safe", () => {
    expect(anyParticipantNeedsAttention([status(), status({ participantId: "p2" })])).toBe(false);
  });

  it("is true if any one participant is at risk or unsafe", () => {
    expect(
      anyParticipantNeedsAttention([
        status(),
        status({ participantId: "p2", localRecording: "failed", cloudBackup: "failed" }),
      ]),
    ).toBe(true);
  });
});

describe("badge variant helpers", () => {
  it("maps data safety to success/warning/danger", () => {
    expect(dataSafetyBadgeVariant("safe")).toBe("success");
    expect(dataSafetyBadgeVariant("at_risk")).toBe("warning");
    expect(dataSafetyBadgeVariant("unsafe")).toBe("danger");
  });

  it("maps connection state to success/warning/danger", () => {
    expect(connectionBadgeVariant("connected")).toBe("success");
    expect(connectionBadgeVariant("reconnecting")).toBe("warning");
    expect(connectionBadgeVariant("disconnected")).toBe("danger");
  });

  it("maps local recording state", () => {
    expect(localRecordingBadgeVariant("recording")).toBe("success");
    expect(localRecordingBadgeVariant("idle")).toBe("neutral");
    expect(localRecordingBadgeVariant("interrupted")).toBe("warning");
    expect(localRecordingBadgeVariant("failed")).toBe("danger");
  });

  it("maps cloud backup state", () => {
    expect(cloudBackupBadgeVariant("recording")).toBe("success");
    expect(cloudBackupBadgeVariant("idle")).toBe("neutral");
    expect(cloudBackupBadgeVariant("failed")).toBe("danger");
    expect(cloudBackupBadgeVariant("unavailable")).toBe("muted");
  });

  it("only flags the upload backlog once it crosses the same threshold deriveParticipantHealth uses", () => {
    expect(uploadBacklogBadgeVariant(0)).toBe("success");
    expect(uploadBacklogBadgeVariant(UPLOAD_BACKLOG_WARNING_THRESHOLD)).toBe("neutral");
    expect(uploadBacklogBadgeVariant(UPLOAD_BACKLOG_WARNING_THRESHOLD + 1)).toBe("warning");
  });
});
