import { describe, expect, it } from "vitest";
import {
  canExtract,
  extractionLine,
  extractionState,
  isStaleRun,
  projectStanding,
  type ExtractionState,
  type SourceExtractionInput,
} from "./run-state";

const now = new Date("2026-10-12T12:00:00Z");
const base: SourceExtractionInput = {
  sourceStatus: "ready",
  sourceKind: "audio_video",
  latestRun: null,
  counts: { total: 0, toReview: 0 },
};

describe("isStaleRun", () => {
  it("is stale only after the run could not still be alive", () => {
    expect(isStaleRun("2026-10-12T11:55:00Z", now)).toBe(false);
    expect(isStaleRun("2026-10-12T11:30:00Z", now)).toBe(true);
  });
});

describe("extractionState", () => {
  it("waits on a source that is not ready, and reports a failed one", () => {
    expect(extractionState({ ...base, sourceStatus: "processing" }, now)).toEqual({
      kind: "waiting",
      reason: "processing",
    });
    expect(extractionState({ ...base, sourceStatus: "failed" }, now)).toEqual({
      kind: "source_failed",
    });
  });
  it("is idle until a run, running during one, and done after", () => {
    expect(extractionState(base, now)).toEqual({ kind: "idle" });
    const running = { status: "running" as const, startedAt: "2026-10-12T11:59:00Z", error: null };
    expect(extractionState({ ...base, latestRun: running }, now)).toEqual({ kind: "running" });
    const done = { status: "succeeded" as const, startedAt: "2026-10-12T11:00:00Z", error: null };
    expect(
      extractionState({ ...base, latestRun: done, counts: { total: 12, toReview: 3 } }, now),
    ).toEqual({ kind: "done", total: 12, toReview: 3 });
  });
  it("treats a stale running run and a failed one as failed, so a retry is offered", () => {
    expect(
      extractionState(
        {
          ...base,
          latestRun: { status: "running", startedAt: "2026-10-12T10:00:00Z", error: null },
        },
        now,
      ).kind,
    ).toBe("failed");
    expect(
      extractionState(
        {
          ...base,
          latestRun: { status: "failed", startedAt: "2026-10-12T11:59:00Z", error: "boom" },
        },
        now,
      ),
    ).toEqual({ kind: "failed", error: "boom" });
  });
});

describe("extractionLine", () => {
  it("reads like the cards in the design", () => {
    expect(extractionLine({ kind: "done", total: 12, toReview: 3 }, "audio_video")).toEqual({
      text: "12 data points · ",
      strong: "3 to review",
    });
    expect(extractionLine({ kind: "done", total: 9, toReview: 0 }, "audio_video")).toEqual({
      text: "9 data points · all reviewed",
    });
    expect(extractionLine({ kind: "done", total: 1, toReview: 0 }, "audio_video")?.text).toBe(
      "1 data point · all reviewed",
    );
    expect(extractionLine({ kind: "running" }, "document")).toEqual({
      text: "Extracting data points…",
    });
    expect(
      extractionLine({ kind: "waiting", reason: "processing" }, "audio_video")?.text,
    ).toContain("Transcribing");
    expect(extractionLine({ kind: "waiting", reason: "processing" }, "document")?.text).toContain(
      "Reading the document",
    );
    expect(extractionLine({ kind: "source_failed" }, "audio_video")).toBeNull();
  });
  it("lets a finished or failed source be extracted again but not a running or waiting one", () => {
    const yes: ExtractionState[] = [
      { kind: "idle" },
      { kind: "failed", error: null },
      { kind: "done", total: 1, toReview: 0 },
    ];
    const no: ExtractionState[] = [
      { kind: "running" },
      { kind: "waiting", reason: "uploading" },
      { kind: "source_failed" },
    ];
    yes.forEach((state) => expect(canExtract(state)).toBe(true));
    no.forEach((state) => expect(canExtract(state)).toBe(false));
  });
});

describe("projectStanding", () => {
  const done: ExtractionState = { kind: "done", total: 5, toReview: 0 };
  const stepStates = (standing: ReturnType<typeof projectStanding>) =>
    standing.steps.map((step) => step.state);

  it("starts with the questions", () => {
    const standing = projectStanding({ questionCount: 0, sources: [], toReviewTotal: 0 });
    expect(stepStates(standing)).toEqual(["current", "upcoming", "upcoming", "upcoming"]);
    expect(standing.link).toBeNull();
  });
  it("then the sources", () => {
    const standing = projectStanding({ questionCount: 2, sources: [], toReviewTotal: 0 });
    expect(stepStates(standing)).toEqual(["done", "current", "upcoming", "upcoming"]);
    expect(standing.link?.to).toBe("sources");
  });
  it("names the source that is still processing, as the design does", () => {
    const standing = projectStanding({
      questionCount: 3,
      sources: [
        { title: "Tom Reyes, interview", state: done },
        { title: "Marlene Gaskin, interview", state: done },
        { title: "Base newsletter, 1962", state: done },
        { title: "Ruth Ann Delancey, interview", state: { kind: "waiting", reason: "processing" } },
      ],
      toReviewTotal: 0,
    });
    expect(stepStates(standing)).toEqual(["done", "done", "current", "upcoming"]);
    expect(standing.message).toBe(
      "3 of 4 sources are extracted. Ruth Ann Delancey, interview is still processing, so extraction can start for it when it finishes.",
    );
  });
  it("is done when every usable source is extracted, and says what is waiting", () => {
    const standing = projectStanding({
      questionCount: 1,
      sources: [
        { title: "A", state: done },
        { title: "B", state: { kind: "source_failed" } },
      ],
      toReviewTotal: 4,
    });
    expect(stepStates(standing)).toEqual(["done", "done", "done", "current"]);
    expect(standing.message).toContain("4 data points are waiting for review");
  });
  it("finishes with the themes: suggestions first, then unfiled points, then done", () => {
    const sources = [{ title: "A", state: done }];
    const standing = (themes: { accepted: number; decisions: number; unthemed: number }) =>
      projectStanding({ questionCount: 1, sources, toReviewTotal: 0, themes });

    const none = standing({ accepted: 0, decisions: 0, unthemed: 0 });
    expect(stepStates(none)).toEqual(["done", "done", "done", "current"]);
    expect(none.message).toContain("Review themes looks for what they have in common");
    expect(none.link).toEqual({ label: "Go to Themes", to: "themes" });

    const waiting = standing({ accepted: 2, decisions: 2, unthemed: 5 });
    expect(stepStates(waiting)[3]).toBe("current");
    expect(waiting.message).toContain("2 theme suggestions are waiting for a decision");

    const unfiled = standing({ accepted: 2, decisions: 0, unthemed: 1 });
    expect(unfiled.message).toContain("1 accepted data point is not in a theme yet");

    const finished = standing({ accepted: 2, decisions: 0, unthemed: 0 });
    expect(stepStates(finished)).toEqual(["done", "done", "done", "done"]);
    expect(finished.message).toContain("every accepted data point is in a theme");
  });
  it("keeps the theme step upcoming until the sources are extracted", () => {
    const standing = projectStanding({
      questionCount: 1,
      sources: [{ title: "A", state: { kind: "idle" } }],
      toReviewTotal: 0,
      themes: { accepted: 3, decisions: 0, unthemed: 0 },
    });
    expect(stepStates(standing)).toEqual(["done", "done", "current", "upcoming"]);
  });
  it("says when sources are ready to extract", () => {
    const standing = projectStanding({
      questionCount: 1,
      sources: [
        { title: "A", state: { kind: "idle" } },
        { title: "B", state: { kind: "idle" } },
      ],
      toReviewTotal: 0,
    });
    expect(standing.message).toBe("0 of 2 sources are extracted. 2 are ready to extract.");
  });
});
