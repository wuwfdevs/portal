import { describe, expect, it } from "vitest";
import {
  buildBoundaryLabels,
  buildClockFaceSegments,
  categorizeSlot,
  describeRingSegment,
  formatOffsetLabel,
  slotRenderWindow,
} from "./clock-face";

function fixedWindow(slot: { start_offset_seconds: number | null; duration_seconds: number }) {
  return { start: slot.start_offset_seconds ?? 0, duration: slot.duration_seconds };
}

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

describe("slotRenderWindow", () => {
  it("uses start_offset_seconds/duration_seconds directly for a fixed slot", () => {
    expect(
      slotRenderWindow({
        start_offset_seconds: 600,
        duration_seconds: 30,
        timing_mode: "fixed",
        earliest_start_offset_seconds: null,
        latest_start_offset_seconds: null,
      }),
    ).toEqual({ start: 600, duration: 30 });
  });

  it("spans earliest-start to latest-start-plus-duration for a float slot", () => {
    expect(
      slotRenderWindow({
        start_offset_seconds: 1200,
        duration_seconds: 60,
        timing_mode: "float",
        earliest_start_offset_seconds: 1200,
        latest_start_offset_seconds: 1260,
      }),
    ).toEqual({ start: 1200, duration: 120 });
  });

  it("falls back to the fixed behavior if a float slot has no window bounds", () => {
    expect(
      slotRenderWindow({
        start_offset_seconds: 900,
        duration_seconds: 45,
        timing_mode: "float",
        earliest_start_offset_seconds: null,
        latest_start_offset_seconds: null,
      }),
    ).toEqual({ start: 900, duration: 45 });
  });
});

describe("buildClockFaceSegments", () => {
  it("places a slot's angles proportional to its offset/duration within the total", () => {
    const slots = [
      { start_offset_seconds: 0, duration_seconds: 900 }, // first quarter
      { start_offset_seconds: 2700, duration_seconds: 900 }, // last quarter
    ];
    const segments = buildClockFaceSegments(slots, 3600, () => "segment", fixedWindow, 100, 100, 90, 60);
    expect(segments).toHaveLength(2);
    // A quarter-turn sweep starting at the top should not need the large-arc flag.
    expect(segments[0]!.pathD).toContain(" A 90 90 0 0 1 ");
  });

  it("skips a slot with no positive duration", () => {
    const segments = buildClockFaceSegments(
      [{ start_offset_seconds: 0, duration_seconds: 0 }],
      3600,
      () => "segment",
      fixedWindow,
      100,
      100,
      90,
      60,
    );
    expect(segments).toHaveLength(0);
  });
});

describe("formatOffsetLabel", () => {
  it("formats a whole minute with no seconds", () => {
    expect(formatOffsetLabel(1200, 3600)).toBe("20");
  });

  it("formats a partial minute as minutes:seconds", () => {
    expect(formatOffsetLabel(90, 3600)).toBe("1:30");
  });

  it("wraps an offset past the total back onto the face", () => {
    expect(formatOffsetLabel(3660, 3600)).toBe("1");
  });
});

describe("buildBoundaryLabels", () => {
  it("labels the start and end of every slot, deduped and sorted, including 0", () => {
    const slots = [
      { start_offset_seconds: 600, duration_seconds: 300 }, // 10:00 - 15:00
      { start_offset_seconds: 900, duration_seconds: 300 }, // 15:00 - 20:00 (shares a boundary)
    ];
    const labels = buildBoundaryLabels(slots, 3600, fixedWindow, 100, 100, 90);
    expect(labels.map((label) => label.text)).toEqual(["0", "10", "15", "20"]);
  });
});
