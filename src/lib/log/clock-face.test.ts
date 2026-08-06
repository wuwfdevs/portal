import { describe, expect, it } from "vitest";
import {
  buildClockFaceSegments,
  categorizeSlot,
  describeRingSegment,
} from "./clock-face";

describe("categorizeSlot", () => {
  it("treats any float slot as a floating local break, regardless of label", () => {
    expect(
      categorizeSlot({
        label: "Whatever",
        segment_label: null,
        fill_mode: "host_fillable",
        timing_mode: "float",
      }),
    ).toBe("float");
  });

  it("treats a fixed optional slot as optional (host discretion)", () => {
    expect(
      categorizeSlot({
        label: "Music / Optional Newscast Cutaway",
        segment_label: null,
        fill_mode: "optional",
        timing_mode: "fixed",
      }),
    ).toBe("optional");
  });

  it("recognizes billboard/promo, newscast/headlines, funding credit, and music bed by label", () => {
    const base = { segment_label: null, fill_mode: "required" as const, timing_mode: "fixed" as const };
    expect(categorizeSlot({ ...base, label: "Billboard" })).toBe("promo");
    expect(categorizeSlot({ ...base, label: "WATC Promo" })).toBe("promo");
    expect(categorizeSlot({ ...base, label: "Newscast 1" })).toBe("newscast");
    expect(categorizeSlot({ ...base, label: "Headlines" })).toBe("newscast");
    expect(categorizeSlot({ ...base, label: "Funding Credit" })).toBe("credit");
    expect(categorizeSlot({ ...base, label: "Music Bed" })).toBe("music");
  });

  it("falls back to segment for program-content slots", () => {
    expect(
      categorizeSlot({
        label: "Segment A",
        segment_label: "A",
        fill_mode: "required",
        timing_mode: "fixed",
      }),
    ).toBe("segment");
  });
});

describe("describeRingSegment", () => {
  it("returns null for a zero or negative sweep", () => {
    expect(describeRingSegment(100, 100, 90, 60, 0, 0)).toBeNull();
    expect(describeRingSegment(100, 100, 90, 60, 0, -5)).toBeNull();
  });

  it("produces a well-formed SVG path for a normal sweep", () => {
    const d = describeRingSegment(100, 100, 90, 60, 0, 90);
    expect(d).toMatch(/^M .* A .* L .* A .* Z$/);
  });

  it("uses the large-arc flag only past a 180 degree sweep", () => {
    const small = describeRingSegment(100, 100, 90, 60, 0, 90)!;
    const large = describeRingSegment(100, 100, 90, 60, 0, 270)!;
    // The outer arc's parameters, as "rx ry x-axis-rotation large-arc-flag sweep-flag x y ...".
    const flagOf = (d: string) => d.split(" A ")[1]!.split(" ")[3];
    expect(flagOf(small)).toBe("0");
    expect(flagOf(large)).toBe("1");
  });
});

describe("buildClockFaceSegments", () => {
  it("places a slot's angles proportional to its offset/duration within the total", () => {
    const slots = [
      { start_offset_seconds: 0, duration_seconds: 900 }, // first quarter
      { start_offset_seconds: 2700, duration_seconds: 900 }, // last quarter
    ];
    const segments = buildClockFaceSegments(slots, 3600, () => "segment", 100, 100, 90, 60);
    expect(segments).toHaveLength(2);
    // A quarter-turn sweep starting at the top should not need the large-arc flag.
    expect(segments[0]!.pathD).toContain(" A 90 90 0 0 1 ");
  });

  it("skips a slot with no positive duration", () => {
    const segments = buildClockFaceSegments(
      [{ start_offset_seconds: 0, duration_seconds: 0 }],
      3600,
      () => "segment",
      100,
      100,
      90,
      60,
    );
    expect(segments).toHaveLength(0);
  });
});
