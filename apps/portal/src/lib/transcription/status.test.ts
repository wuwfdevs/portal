import { describe, expect, it } from "vitest";
import { computeProjectStatus, processingLabel } from "./status";

describe("computeProjectStatus", () => {
  it("is uploading when there's no source yet", () => {
    expect(computeProjectStatus(null, null)).toBe("uploading");
  });

  it("is uploading while the source itself is uploading", () => {
    expect(computeProjectStatus({ status: "uploading" }, null)).toBe("uploading");
  });

  it("is failed when the source upload failed, regardless of representation", () => {
    expect(computeProjectStatus({ status: "failed" }, null)).toBe("failed");
    expect(computeProjectStatus({ status: "failed" }, { status: "ready" })).toBe("failed");
  });

  it("is processing when the source is ready but there's no representation yet", () => {
    expect(computeProjectStatus({ status: "ready" }, null)).toBe("processing");
  });

  it("is processing while the representation is pending or processing", () => {
    expect(computeProjectStatus({ status: "ready" }, { status: "pending" })).toBe("processing");
    expect(computeProjectStatus({ status: "ready" }, { status: "processing" })).toBe("processing");
  });

  it("mirrors the representation's ready/failed status once the source is ready", () => {
    expect(computeProjectStatus({ status: "ready" }, { status: "ready" })).toBe("ready");
    expect(computeProjectStatus({ status: "ready" }, { status: "failed" })).toBe("failed");
  });

  it("is kind-agnostic — a document_text representation behaves exactly like a transcript one", () => {
    // computeProjectStatus never inspects source/representation kind; the
    // same status shape applies whether the primary representation is a
    // transcript or a document_text extraction (docs/sourcework-design.md §8.9).
    const source = { status: "ready" as const };
    expect(computeProjectStatus(source, { status: "processing" })).toBe("processing");
    expect(computeProjectStatus(source, { status: "ready" })).toBe("ready");
  });
});

describe("processingLabel", () => {
  it("labels a document source's processing state as text extraction, not transcription", () => {
    expect(processingLabel("document")).toBe("Extracting text");
  });

  it("labels an audio/video source's processing state as transcribing", () => {
    expect(processingLabel("audio_video")).toBe("Transcribing");
  });
});
