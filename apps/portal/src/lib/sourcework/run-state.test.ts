import { describe, expect, it } from "vitest";
import {
  canExtract,
  extractionLine,
  extractionState,
  isStaleRun,
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
      text: "12 findings · ",
      strong: "3 to review",
    });
    expect(extractionLine({ kind: "done", total: 9, toReview: 0 }, "audio_video")).toEqual({
      text: "9 findings · all reviewed",
    });
    expect(extractionLine({ kind: "done", total: 1, toReview: 0 }, "audio_video")?.text).toBe(
      "1 finding · all reviewed",
    );
    expect(extractionLine({ kind: "running" }, "document")).toEqual({
      text: "Analyzing…",
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
