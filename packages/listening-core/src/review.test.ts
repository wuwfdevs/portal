import { describe, expect, it } from "vitest";
import {
  QUERY_STATUS_BADGE,
  REVIEW_ACTION_LABEL,
  REVIEW_STATE_BADGE,
  TRANSCRIPTION_BADGE,
  reviewActionsFor,
  summarizeSubmissionTranscription,
  transcriptionActionFor,
} from "./review";

describe("transcriptionActionFor", () => {
  it("offers nothing for an answer with no completed audio", () => {
    expect(
      transcriptionActionFor({
        status: "pending",
        transcription_state: "none",
        transcription_project_id: null,
      }),
    ).toBe("unavailable");
  });

  it("offers sending for an untouched answer", () => {
    expect(
      transcriptionActionFor({
        status: "uploaded",
        transcription_state: "none",
        transcription_project_id: null,
      }),
    ).toBe("send");
  });

  it("offers sending for a queued answer, so it can be pushed individually", () => {
    expect(
      transcriptionActionFor({
        status: "uploaded",
        transcription_state: "queued",
        transcription_project_id: null,
      }),
    ).toBe("send");
  });

  it("says retry after a failure rather than pretending nothing happened", () => {
    expect(
      transcriptionActionFor({
        status: "uploaded",
        transcription_state: "failed",
        transcription_project_id: "p1",
      }),
    ).toBe("retry");
  });

  it("links out once there is a project", () => {
    expect(
      transcriptionActionFor({
        status: "uploaded",
        transcription_state: "sent",
        transcription_project_id: "p1",
      }),
    ).toBe("open");
  });

  it("offers sending again if the state says sent but no project was recorded", () => {
    expect(
      transcriptionActionFor({
        status: "uploaded",
        transcription_state: "sent",
        transcription_project_id: null,
      }),
    ).toBe("send");
  });
});

describe("summarizeSubmissionTranscription", () => {
  it("says nothing for a submission with no completed audio", () => {
    expect(
      summarizeSubmissionTranscription([{ status: "pending", transcription_state: "none" }]),
    ).toMatchObject({ label: "—" });
  });

  it("reports a failure ahead of anything else", () => {
    expect(
      summarizeSubmissionTranscription([
        { status: "uploaded", transcription_state: "sent" },
        { status: "uploaded", transcription_state: "failed" },
      ]),
    ).toMatchObject({ label: "1 failed", variant: "danger" });
  });

  it("only says all sent when every eligible answer really was", () => {
    expect(
      summarizeSubmissionTranscription([
        { status: "uploaded", transcription_state: "sent" },
        { status: "uploaded", transcription_state: "sent" },
      ]),
    ).toMatchObject({ label: "All sent" });
  });

  it("counts rather than rounding up to a tick", () => {
    expect(
      summarizeSubmissionTranscription([
        { status: "uploaded", transcription_state: "sent" },
        { status: "uploaded", transcription_state: "none" },
      ]),
    ).toMatchObject({ label: "1 of 2 sent" });
  });

  it("ignores answers that never uploaded when counting", () => {
    expect(
      summarizeSubmissionTranscription([
        { status: "uploaded", transcription_state: "sent" },
        { status: "pending", transcription_state: "none" },
      ]),
    ).toMatchObject({ label: "All sent" });
  });

  it("reports a pending queue", () => {
    expect(
      summarizeSubmissionTranscription([{ status: "uploaded", transcription_state: "queued" }]),
    ).toMatchObject({ label: "1 queued" });
  });
});

describe("reviewActionsFor", () => {
  it("never offers the state something is already in", () => {
    expect(reviewActionsFor("reviewed")).not.toContain("reviewed");
    expect(reviewActionsFor("new")).toEqual(["reviewed", "flagged", "rejected"]);
  });

  it("has a label for every action it can return", () => {
    for (const state of reviewActionsFor("new")) {
      expect(REVIEW_ACTION_LABEL[state]).toBeTruthy();
    }
  });
});

describe("badge maps", () => {
  it("cover every enum value, so no state renders blank", () => {
    expect(Object.keys(QUERY_STATUS_BADGE)).toEqual(["draft", "open", "closed", "archived"]);
    expect(Object.keys(REVIEW_STATE_BADGE)).toEqual(["new", "reviewed", "flagged", "rejected"]);
    expect(Object.keys(TRANSCRIPTION_BADGE)).toEqual(["none", "queued", "sent", "failed"]);
  });

  it("marks an unreviewed submission as needing attention, not as neutral", () => {
    expect(REVIEW_STATE_BADGE.new.variant).toBe("warning");
  });
});
