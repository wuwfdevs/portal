import { describe, expect, it } from "vitest";
import { findActiveSegmentIndex, speakerDisplayLabel } from "./transcript";

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
