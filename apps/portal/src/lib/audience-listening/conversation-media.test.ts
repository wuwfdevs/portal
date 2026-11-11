import { describe, expect, it } from "vitest";
import { concatListFile, orderSegments, segmentExtension, sourceDescription, type SegmentRow } from "./conversation-media";

const seg = (seq: number, status = "uploaded"): SegmentRow => ({ seq, status, storage_path: `e/t/${seq}`, content_type: "audio/webm" });

describe("orderSegments", () => {
  it("puts uploaded segments in order, whatever order they came in", () => {
    const result = orderSegments([seg(2), seg(0), seg(1)], 2);
    expect(result.ok && result.segments.map((s) => s.seq)).toEqual([0, 1, 2]);
  });
  it("names a gap rather than dropping minutes without saying so", () => {
    const result = orderSegments([seg(0), seg(2)], 2);
    expect(result).toEqual({ ok: false, error: "Segment 1 has not uploaded, so the recording is not whole yet." });
    expect(orderSegments([seg(0), seg(3)], 3)).toMatchObject({ ok: false, error: expect.stringContaining("Segments 1, 2 have not uploaded") });
  });
  it("does not count a segment that is only reserved", () => {
    expect(orderSegments([seg(0), seg(1, "pending")], 1).ok).toBe(false);
  });
  it("refuses a table that has not ended", () => {
    expect(orderSegments([seg(0)], null).ok).toBe(false);
    expect(orderSegments([], -1).ok).toBe(false);
  });
});

describe("concat list", () => {
  it("lists one file per line and escapes a quote in a path", () => {
    expect(concatListFile(["/tmp/a/0.webm", "/tmp/it's/1.webm"])).toBe("file '/tmp/a/0.webm'\nfile '/tmp/it'\\''s/1.webm'\n");
  });
});

describe("segmentExtension", () => {
  it("matches the types the bucket takes", () => {
    expect(segmentExtension("audio/webm")).toBe("webm");
    expect(segmentExtension("audio/mp4")).toBe("m4a");
    expect(segmentExtension("video/x")).toBe("bin");
  });
});

describe("sourceDescription", () => {
  it("says where the tape came from and nothing a person said", () => {
    const text = sourceDescription({ campaignTitle: "Housing", question: "How is rent?", eventTitle: "Night", placeName: "Library", tableNumber: 3, startsAt: "2026-12-05T18:00:00Z" });
    expect(text).toContain("table 3");
    expect(text).toContain("2026-12-05");
    expect(text).not.toMatch(/@/);
  });
});
