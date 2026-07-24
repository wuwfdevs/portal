import { describe, expect, it } from "vitest";
import {
  findActiveSegmentIndex,
  findFirstSegmentIndexForSpeaker,
  speakerDisplayLabel,
  splitTiming,
} from "./transcript";

describe("speakerDisplayLabel", () => {
  it("prefers the human display name when set", () => {
    expect(speakerDisplayLabel("A", "Mayor Reeves")).toBe("Mayor Reeves");
  });

  it("falls back to a formatted diarization label", () => {
    expect(speakerDisplayLabel("A", null)).toBe("Speaker A");
    expect(speakerDisplayLabel("B", "   ")).toBe("Speaker B");
  });
});

describe("findActiveSegmentIndex", () => {
  const segments = [{ startMs: 0 }, { startMs: 5000 }, { startMs: 12000 }];

  it("returns -1 before the first segment starts", () => {
    expect(findActiveSegmentIndex(segments, -1)).toBe(-1);
  });

  it("returns the current segment during its span", () => {
    expect(findActiveSegmentIndex(segments, 0)).toBe(0);
    expect(findActiveSegmentIndex(segments, 3000)).toBe(0);
    expect(findActiveSegmentIndex(segments, 5000)).toBe(1);
  });

  it("holds the most recent segment through a gap between utterances", () => {
    expect(findActiveSegmentIndex(segments, 9000)).toBe(1);
  });

  it("returns the last segment once playback passes its start", () => {
    expect(findActiveSegmentIndex(segments, 999_999)).toBe(2);
  });

  it("returns -1 for an empty transcript", () => {
    expect(findActiveSegmentIndex([], 1000)).toBe(-1);
  });
});

describe("findFirstSegmentIndexForSpeaker", () => {
  const segments = [{ speakerId: "a" }, { speakerId: "b" }, { speakerId: "a" }];

  it("returns the first segment attributed to a speaker", () => {
    expect(findFirstSegmentIndexForSpeaker(segments, "a")).toBe(0);
    expect(findFirstSegmentIndexForSpeaker(segments, "b")).toBe(1);
  });

  it("returns -1 when the speaker has no segments", () => {
    expect(findFirstSegmentIndexForSpeaker(segments, "c")).toBe(-1);
  });
});

describe("splitTiming", () => {
  it("splits proportionally by character-length ratio", () => {
    // 10s segment, split at the 25% mark of a 40-char text.
    const result = splitTiming(0, 10_000, 10, 40);
    expect(result).toEqual({ firstEndMs: 2500, secondStartMs: 2500 });
  });

  it("clamps the boundary so both halves stay at least the minimum duration", () => {
    // Splitting right at the very start or end would otherwise produce a
    // zero-length half, violating the end_ms > start_ms check constraint.
    const nearStart = splitTiming(0, 1000, 0, 100);
    expect(nearStart).not.toBeNull();
    expect(nearStart!.firstEndMs).toBeGreaterThan(0);

    const nearEnd = splitTiming(0, 1000, 100, 100);
    expect(nearEnd).not.toBeNull();
    expect(nearEnd!.secondStartMs).toBeLessThan(1000);
  });

  it("returns null when the segment is too short to split", () => {
    expect(splitTiming(0, 3, 1, 2)).toBeNull();
  });
});
