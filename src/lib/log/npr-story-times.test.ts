import { describe, expect, it } from "vitest";
import {
  buildSegmentWindows,
  DEFAULT_STORY_DURATION_SECONDS,
  episodeHourOffset,
  estimateStoryOffsets,
  excludeBlockLengthRollups,
  firstAiringByStory,
  packedHourCount,
  projectStoriesOntoShift,
  selectAiringsInWindow,
  type SegmentSlotLike,
  type StoryTimingInput,
} from "./npr-story-times";

// The real Morning Edition clock's lettered segments (offsets/durations from
// the production seed), interleaved with the network furniture the window
// builder must ignore. These match the official NPR Rundowns App document
// for 2026-08-21 to the second (A 07:30/11:29, B 21:50/07:09, C 34:35/07:54,
// D 45:35/03:59, E 51:30/07:29).
const MORNING_EDITION_SLOTS: SegmentSlotLike[] = [
  { start_offset_seconds: 0, duration_seconds: 60, segment_label: null, timing_mode: "fixed" }, // Billboard
  { start_offset_seconds: 60, duration_seconds: 180, segment_label: null, timing_mode: "fixed" }, // Newscast 1
  { start_offset_seconds: 450, duration_seconds: 690, segment_label: "A", timing_mode: "fixed" },
  { start_offset_seconds: 1140, duration_seconds: 90, segment_label: null, timing_mode: "fixed" }, // Music Bed
  { start_offset_seconds: 1310, duration_seconds: 430, segment_label: "B", timing_mode: "fixed" },
  { start_offset_seconds: 2075, duration_seconds: 475, segment_label: "C", timing_mode: "fixed" },
  { start_offset_seconds: 2734, duration_seconds: 240, segment_label: "D", timing_mode: "fixed" },
  { start_offset_seconds: 3089, duration_seconds: 450, segment_label: "E", timing_mode: "fixed" },
];

// The real 2026-08-21 Morning Edition episode, in CDS item order. s1 is the
// digital-only "Morning news brief" rollup (673s ≈ the sum of the three real
// A-block stories that follow it) — it never airs as its own rundown story.
// s13/s15 are the two stories whose CDS audio asset carries no duration.
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
  { npr_item_id: "s10", duration_seconds: 279 },
  { npr_item_id: "s11", duration_seconds: 227 },
  { npr_item_id: "s12", duration_seconds: 287 },
  { npr_item_id: "s13", duration_seconds: null },
  { npr_item_id: "s14", duration_seconds: 172 },
  { npr_item_id: "s15", duration_seconds: null },
  { npr_item_id: "s16", duration_seconds: 203 },
  { npr_item_id: "s17", duration_seconds: 266 },
  { npr_item_id: "s18", duration_seconds: 229 },
];

const WINDOWS = buildSegmentWindows(MORNING_EDITION_SLOTS, 4);

describe("buildSegmentWindows", () => {
  it("keeps only lettered segments, in chronological order, tiled per hour", () => {
    const windows = buildSegmentWindows(MORNING_EDITION_SLOTS, 2);
    expect(windows.map((w) => w.segmentLabel)).toEqual(["A", "B", "C", "D", "E", "A", "B", "C", "D", "E"]);
    expect(windows[0]).toEqual({ hourIndex: 0, startOffsetSeconds: 450, capacitySeconds: 690, segmentLabel: "A" });
    expect(windows[5]).toEqual({ hourIndex: 1, startOffsetSeconds: 4050, capacitySeconds: 690, segmentLabel: "A" });
  });

  it("produces no windows for a clock with no lettered segments", () => {
    expect(buildSegmentWindows([{ start_offset_seconds: 0, duration_seconds: 3600, segment_label: null, timing_mode: "fixed" }], 2)).toEqual(
      [],
    );
  });

  it("excludes floating slots even when they carry a segment label", () => {
    // Real shapes from the seeded clocks: 1A labels its two 120s fundraising
    // cutaways "B"/"C" (the segment they sit inside), and Fresh Air labels
    // its floating breaks "A/B"-style. Neither is a story window.
    const oneASlots: SegmentSlotLike[] = [
      { start_offset_seconds: 390, duration_seconds: 720, segment_label: "A", timing_mode: "fixed" },
      { start_offset_seconds: 1235, duration_seconds: 1075, segment_label: "B", timing_mode: "fixed" },
      { start_offset_seconds: 1890, duration_seconds: 120, segment_label: "B", timing_mode: "float" },
      { start_offset_seconds: 2435, duration_seconds: 1040, segment_label: "C", timing_mode: "fixed" },
      { start_offset_seconds: 3060, duration_seconds: 120, segment_label: "C", timing_mode: "float" },
      { start_offset_seconds: 900, duration_seconds: 30, segment_label: "A/B", timing_mode: "float" },
    ];
    const windows = buildSegmentWindows(oneASlots, 1);
    expect(windows.map((w) => [w.segmentLabel, w.capacitySeconds])).toEqual([
      ["A", 720],
      ["B", 1075],
      ["C", 1040],
    ]);
  });
});

describe("excludeBlockLengthRollups", () => {
  it("drops the Morning Edition digital news-brief rollup", () => {
    const kept = excludeBlockLengthRollups(STORIES, WINDOWS);
    expect(kept.map((s) => s.npr_item_id)).toEqual(STORIES.slice(1).map((s) => s.npr_item_id));
  });

  it("keeps a block-length item that essentially is the show (the Fresh Air case)", () => {
    const freshAirWindows = buildSegmentWindows(
      [{ start_offset_seconds: 300, duration_seconds: 2100, segment_label: "B", timing_mode: "fixed" }],
      1,
    );
    const stories: StoryTimingInput[] = [
      { npr_item_id: "interview", duration_seconds: 2000 },
      { npr_item_id: "review", duration_seconds: 480 },
    ];
    expect(excludeBlockLengthRollups(stories, freshAirWindows)).toEqual(stories);
  });

  it("is a no-op with no windows or no oversized items", () => {
    expect(excludeBlockLengthRollups(STORIES, [])).toEqual(STORIES);
    expect(excludeBlockLengthRollups(STORIES.slice(1), WINDOWS)).toEqual(STORIES.slice(1));
  });
});

describe("estimateStoryOffsets — calibrated against the official 2026-08-21 rundown", () => {
  const estimates = estimateStoryOffsets(excludeBlockLengthRollups(STORIES, WINDOWS), WINDOWS);

  it("reproduces the official rundown's segment assignments exactly", () => {
    // Official: A1 #1-#3, B1 #4, C1 #5-#6, D1 #7, E1 #8-#9;
    //           A2 #10-#12, B2 #13-#14, C2 #15-#16, D2 #17.
    expect(estimates.map((e) => `${e.segmentLabel}${(e.hourIndex ?? 0) + 1}`)).toEqual([
      "A1", "A1", "A1", "B1", "C1", "C1", "D1", "E1", "E1",
      "A2", "A2", "A2", "B2", "B2", "C2", "C2", "D2",
    ]);
  });

  it("opens each segment at the clock's own offset (official #1 airs at 07:30 into the hour)", () => {
    expect(estimates[0]!.offsetSeconds).toBe(450);
    expect(estimates[9]!.offsetSeconds).toBe(4050);
  });

  it("uses the default duration for a story with none, keeping packing stable around it", () => {
    // s13 (no duration) occupies the default inside A2 after s11+s12.
    expect(estimates[11]!.offsetSeconds).toBe(4050 + 227 + 287);
    expect(DEFAULT_STORY_DURATION_SECONDS).toBeGreaterThan(0);
  });

  it("returns null estimates once the windows run out, and for no windows at all", () => {
    const tiny = buildSegmentWindows([{ start_offset_seconds: 0, duration_seconds: 300, segment_label: "A", timing_mode: "fixed" }], 1);
    const overfull = estimateStoryOffsets(STORIES.slice(1, 4), tiny);
    expect(overfull[0]!.offsetSeconds).toBe(0);
    expect(overfull[2]).toMatchObject({ offsetSeconds: null, segmentLabel: null, hourIndex: null });
    expect(estimateStoryOffsets(STORIES, []).every((e) => e.offsetSeconds === null)).toBe(true);
  });

  it("places a story longer than an empty segment there anyway (it has to air somewhere)", () => {
    const windows = buildSegmentWindows(
      [
        { start_offset_seconds: 0, duration_seconds: 120, segment_label: "A", timing_mode: "fixed" },
        { start_offset_seconds: 600, duration_seconds: 600, segment_label: "B", timing_mode: "fixed" },
      ],
      1,
    );
    const result = estimateStoryOffsets(
      [
        { npr_item_id: "long", duration_seconds: 300 },
        { npr_item_id: "next", duration_seconds: 100 },
      ],
      windows,
    );
    expect(result[0]).toMatchObject({ offsetSeconds: 0, segmentLabel: "A" });
    expect(result[1]).toMatchObject({ offsetSeconds: 600, segmentLabel: "B" });
  });
});

describe("episodeHourOffset", () => {
  it("derives HR2 for a Central station joining Morning Edition an hour into the 5am-ET feed", () => {
    // 2026-08-21 10:00 UTC = 5:00 AM CDT = 6:00 AM EDT — one hour after the
    // 5 AM ET feed start, so the first shift hour carries episode hour 2.
    expect(episodeHourOffset("2026-08-21T10:00:00Z", 5, 2)).toBe(1);
  });

  it("handles standard time (winter) the same way", () => {
    // 2027-01-28 11:00 UTC = 5:00 AM CST = 6:00 AM EST.
    expect(episodeHourOffset("2027-01-28T11:00:00Z", 5, 2)).toBe(1);
  });

  it("is zero for a shift aligned with the feed start, or with no anchor", () => {
    // 09:00 UTC = 5:00 AM EDT.
    expect(episodeHourOffset("2026-08-21T09:00:00Z", 5, 2)).toBe(0);
    expect(episodeHourOffset("2026-08-21T10:00:00Z", null, 2)).toBe(0);
    expect(episodeHourOffset("2026-08-21T10:00:00Z", 5, 0)).toBe(0);
  });
});

describe("projectStoriesOntoShift", () => {
  const estimates = estimateStoryOffsets(excludeBlockLengthRollups(STORIES, WINDOWS), WINDOWS);
  // Morning Edition at WUWF: 4-hour shift starting on HR2 (offset 1) —
  // hours run HR2, HR1, HR2, HR1.
  const airings = projectStoriesOntoShift(estimates, 4, 1);

  it("puts episode hour 2's stories in the first shift hour and hour 1's in the second", () => {
    const first = firstAiringByStory(airings);
    // s11 (official #10, A2's opener) first airs in shift hour 0 at 07:30 in.
    expect(first.get("s11")).toMatchObject({ offsetSeconds: 450, shiftHourIndex: 0 });
    // s2 (official #1, A1's opener) first airs in shift hour 1 at 07:30 in.
    expect(first.get("s2")).toMatchObject({ offsetSeconds: 4050, shiftHourIndex: 1 });
  });

  it("re-airs each episode hour in the later shift hours", () => {
    const s2Airings = airings.filter((a) => a.npr_item_id === "s2");
    expect(s2Airings.map((a) => a.shiftHourIndex)).toEqual([1, 3]);
    expect(s2Airings[1]!.offsetSeconds).toBe(3 * 3600 + 450);
  });

  it("selects the airings inside a break's window", () => {
    // Shift hour 0 carries episode hour 2 — the window between the 19:00
    // music-bed break and Newscast 3 (30:00) holds B2's two stories.
    const selected = selectAiringsInWindow(airings, 1140, 1800);
    expect(selected.map((a) => a.npr_item_id)).toEqual(["s14", "s15"]);
    expect(selected[0]!.offsetSeconds).toBe(1310);
  });

  it("returns nothing when no stories were placed at all", () => {
    expect(projectStoriesOntoShift(estimateStoryOffsets(STORIES, []), 4, 1)).toEqual([]);
    expect(packedHourCount([])).toBe(0);
  });
});
