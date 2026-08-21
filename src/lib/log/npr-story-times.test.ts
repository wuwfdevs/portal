import { describe, expect, it } from "vitest";
import {
  buildSegmentWindows,
  DEFAULT_STORY_DURATION_SECONDS,
  estimateStoryOffsets,
  selectStoriesForWindow,
  type SegmentSlotLike,
  type StoryTimingInput,
} from "./npr-story-times";

// The real Morning Edition clock's lettered segments (offsets/durations from
// the production seed), interleaved with the network furniture the window
// builder must ignore.
const MORNING_EDITION_SLOTS: SegmentSlotLike[] = [
  { start_offset_seconds: 0, duration_seconds: 60, segment_label: null }, // Billboard
  { start_offset_seconds: 60, duration_seconds: 180, segment_label: null }, // Newscast 1
  { start_offset_seconds: 450, duration_seconds: 690, segment_label: "A" },
  { start_offset_seconds: 1140, duration_seconds: 90, segment_label: null }, // Music Bed
  { start_offset_seconds: 1310, duration_seconds: 430, segment_label: "B" },
  { start_offset_seconds: 2075, duration_seconds: 475, segment_label: "C" },
  { start_offset_seconds: 2734, duration_seconds: 240, segment_label: "D" },
  { start_offset_seconds: 3089, duration_seconds: 450, segment_label: "E" },
];

// The first nine stories of the real 2026-08-21 Morning Edition episode.
const STORIES: StoryTimingInput[] = [
  { npr_item_id: "s1", duration_seconds: 673 },
  { npr_item_id: "s2", duration_seconds: 221 },
  { npr_item_id: "s3", duration_seconds: 301 },
  { npr_item_id: "s4", duration_seconds: 145 },
  { npr_item_id: "s5", duration_seconds: 420 },
  { npr_item_id: "s6", duration_seconds: 219 },
  { npr_item_id: "s7", duration_seconds: 225 },
  { npr_item_id: "s8", duration_seconds: 217 },
  { npr_item_id: "s9", duration_seconds: 154 },
];

describe("buildSegmentWindows", () => {
  it("keeps only lettered segments, in chronological order, tiled per hour", () => {
    const windows = buildSegmentWindows(MORNING_EDITION_SLOTS, 2);
    expect(windows.map((w) => w.segmentLabel)).toEqual(["A", "B", "C", "D", "E", "A", "B", "C", "D", "E"]);
    expect(windows[0]).toEqual({ hourIndex: 0, startOffsetSeconds: 450, capacitySeconds: 690, segmentLabel: "A" });
    expect(windows[5]).toEqual({ hourIndex: 1, startOffsetSeconds: 4050, capacitySeconds: 690, segmentLabel: "A" });
  });

  it("produces no windows for a clock with no lettered segments", () => {
    expect(buildSegmentWindows([{ start_offset_seconds: 0, duration_seconds: 3600, segment_label: null }], 2)).toEqual(
      [],
    );
  });
});

describe("estimateStoryOffsets", () => {
  it("packs the real Morning Edition stories into plausible segments", () => {
    const windows = buildSegmentWindows(MORNING_EDITION_SLOTS, 2);
    const estimates = estimateStoryOffsets(STORIES, windows);

    expect(estimates.map((e) => e.segmentLabel)).toEqual(["A", "B", "B", "C", "C", "D", "E", "E", "A"]);
    // s1 opens Segment A; s3 follows s2 within Segment B; s9 spills into hour 2's Segment A.
    expect(estimates[0]!.offsetSeconds).toBe(450);
    expect(estimates[2]!.offsetSeconds).toBe(1310 + 221);
    expect(estimates[8]).toMatchObject({ offsetSeconds: 4050, hourIndex: 1 });
  });

  it("places a story longer than an empty segment there anyway (it has to air somewhere)", () => {
    const windows = buildSegmentWindows(
      [
        { start_offset_seconds: 0, duration_seconds: 120, segment_label: "A" },
        { start_offset_seconds: 600, duration_seconds: 600, segment_label: "B" },
      ],
      1,
    );
    const estimates = estimateStoryOffsets(
      [
        { npr_item_id: "long", duration_seconds: 300 },
        { npr_item_id: "next", duration_seconds: 100 },
      ],
      windows,
    );
    expect(estimates[0]).toMatchObject({ offsetSeconds: 0, segmentLabel: "A" });
    // A overflowed its capacity, so the next story starts the next segment.
    expect(estimates[1]).toMatchObject({ offsetSeconds: 600, segmentLabel: "B" });
  });

  it("uses the default duration for a story with none, keeping packing stable around it", () => {
    const windows = buildSegmentWindows([{ start_offset_seconds: 0, duration_seconds: 600, segment_label: "A" }], 2);
    const estimates = estimateStoryOffsets(
      [
        { npr_item_id: "known", duration_seconds: 300 },
        { npr_item_id: "unknown", duration_seconds: null },
        { npr_item_id: "after", duration_seconds: 100 },
      ],
      windows,
    );
    // The unknown story occupies DEFAULT_STORY_DURATION_SECONDS, so the
    // story after it starts at 300 + that default, still within the window.
    expect(estimates[1]!.offsetSeconds).toBe(300);
    expect(estimates[2]).toMatchObject({
      offsetSeconds: 300 + DEFAULT_STORY_DURATION_SECONDS,
      hourIndex: 0,
    });
  });

  it("returns null estimates once the windows run out, and for no windows at all", () => {
    const windows = buildSegmentWindows([{ start_offset_seconds: 0, duration_seconds: 300, segment_label: "A" }], 1);
    const estimates = estimateStoryOffsets(STORIES.slice(0, 3), windows);
    expect(estimates[0]!.offsetSeconds).toBe(0);
    expect(estimates[1]).toMatchObject({ offsetSeconds: null, segmentLabel: null, hourIndex: null });
    expect(estimateStoryOffsets(STORIES, []).every((e) => e.offsetSeconds === null)).toBe(true);
  });
});

describe("selectStoriesForWindow", () => {
  const windows = buildSegmentWindows(MORNING_EDITION_SLOTS, 2);
  const estimates = estimateStoryOffsets(STORIES, windows);

  it("returns the stories estimated between two shift offsets, in airing order", () => {
    // The post-Segment-A break (19:00) through Newscast 3 (30:00): Segment B's stories.
    const selected = selectStoriesForWindow(estimates, 1140, 1800);
    expect(selected.map((s) => s.npr_item_id)).toEqual(["s2", "s3"]);
    expect(selected[0]!.offsetSeconds).toBe(1310);
  });

  it("wraps a repeat-hour window back onto the packed hours, shifting offsets into the requested hour", () => {
    // Hour 3 (index 2) repeats hour 1's feed — same window, two hours later.
    const selected = selectStoriesForWindow(estimates, 2 * 3600 + 1140, 2 * 3600 + 1800);
    expect(selected.map((s) => s.npr_item_id)).toEqual(["s2", "s3"]);
    expect(selected[0]!.offsetSeconds).toBe(2 * 3600 + 1310);
  });

  it("returns nothing when no stories were placed at all", () => {
    const unplaced = estimateStoryOffsets(STORIES, []);
    expect(selectStoriesForWindow(unplaced, 0, null)).toEqual([]);
  });
});
