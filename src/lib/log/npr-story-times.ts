// Estimated air times for an NPR episode's stories, derived by packing them
// into the program's own clock — pure and colocated-tested, no Supabase
// import, per this repo's convention for Log's timing logic.
//
// CDS supplies no per-story air times: a program-episode document carries
// only each story's audio duration and the episode's item order (confirmed
// against live 2026-08-21 responses — the enclosure URLs' own `seg=` param
// is just the story's index, not a clock segment). But WUWF's transcribed
// network clocks *do* say exactly when the lettered programming segments
// (Segment A, B, …) run each hour, and NPR fills those segments with the
// episode's stories in order. So: lay the stories, in order, into the
// clock's segment windows tiled across the shift's hours, and each story
// gets an estimated offset from shift start. These are estimates — digital
// audio durations differ slightly from broadcast cuts, and a station
// cutaway (e.g. WUWF's Marketplace Morning Report window) shifts the tail —
// so every surface labels them "~".
//
// The packing rule is deliberately tolerant rather than strict bin-packing:
// a story joins the current segment unless doing so would overshoot the
// segment's capacity by more than half the story's own duration (a story
// that mostly fits is far more likely to belong here than to leave a large
// hole behind); a story longer than an *empty* segment still lands there,
// since it has to air somewhere. A story with no known duration (web-only
// audio) occupies a default estimate so packing stays stable around it.

export const DEFAULT_STORY_DURATION_SECONDS = 240;

export interface StoryTimingInput {
  npr_item_id: string;
  duration_seconds: number | null;
}

export interface SegmentSlotLike {
  start_offset_seconds: number | null;
  duration_seconds: number;
  segment_label: string | null;
}

export interface SegmentWindow {
  hourIndex: number;
  /** Offset from shift start, in seconds. */
  startOffsetSeconds: number;
  capacitySeconds: number;
  segmentLabel: string;
}

export interface StoryTimeEstimate {
  npr_item_id: string;
  /** Estimated offset from shift start, in seconds — null when the story couldn't be placed (no lettered segments, or more stories than windows). */
  offsetSeconds: number | null;
  segmentLabel: string | null;
  hourIndex: number | null;
}

/**
 * The clock's lettered programming segments (slots carrying a
 * `segment_label`), tiled once per hour across the shift, in chronological
 * order. Clocks with no lettered segments produce no windows — every
 * estimate then comes back null and callers fall back to order-only display.
 */
export function buildSegmentWindows(slots: SegmentSlotLike[], hourCount: number): SegmentWindow[] {
  const segments = slots
    .filter(
      (slot): slot is SegmentSlotLike & { start_offset_seconds: number; segment_label: string } =>
        slot.segment_label !== null && slot.start_offset_seconds !== null && slot.duration_seconds > 0,
    )
    .sort((a, b) => a.start_offset_seconds - b.start_offset_seconds);

  const windows: SegmentWindow[] = [];
  for (let hour = 0; hour < hourCount; hour++) {
    for (const segment of segments) {
      windows.push({
        hourIndex: hour,
        startOffsetSeconds: hour * 3600 + segment.start_offset_seconds,
        capacitySeconds: segment.duration_seconds,
        segmentLabel: segment.segment_label,
      });
    }
  }
  return windows;
}

/** Packs the episode's stories, in order, into the segment windows — see the module comment for the rule. */
export function estimateStoryOffsets(
  stories: StoryTimingInput[],
  windows: SegmentWindow[],
): StoryTimeEstimate[] {
  const estimates: StoryTimeEstimate[] = [];
  let windowIndex = 0;
  let filledSeconds = 0;

  for (const story of stories) {
    const duration = story.duration_seconds ?? DEFAULT_STORY_DURATION_SECONDS;

    while (
      windowIndex < windows.length &&
      filledSeconds > 0 &&
      filledSeconds + duration > windows[windowIndex]!.capacitySeconds + duration / 2
    ) {
      windowIndex++;
      filledSeconds = 0;
    }

    if (windowIndex >= windows.length) {
      estimates.push({ npr_item_id: story.npr_item_id, offsetSeconds: null, segmentLabel: null, hourIndex: null });
      continue;
    }

    const window = windows[windowIndex]!;
    estimates.push({
      npr_item_id: story.npr_item_id,
      offsetSeconds: window.startOffsetSeconds + filledSeconds,
      segmentLabel: window.segmentLabel,
      hourIndex: window.hourIndex,
    });

    filledSeconds += duration;
    if (filledSeconds >= window.capacitySeconds) {
      windowIndex++;
      filledSeconds = 0;
    }
  }

  return estimates;
}

/** How many hours of the shift the packed stories actually occupy — the episode's own span, which can be shorter than the shift when later hours repeat the feed. */
function packedHourCount(estimates: StoryTimeEstimate[]): number {
  let max = -1;
  for (const estimate of estimates) {
    if (estimate.hourIndex !== null && estimate.hourIndex > max) max = estimate.hourIndex;
  }
  return max + 1;
}

/**
 * The stories estimated to air within [fromOffsetSeconds, toOffsetSeconds)
 * of the shift — e.g. between one break's start and the next break's — in
 * airing order. A window in an hour beyond what the episode's stories filled
 * (a repeat hour: Morning Edition's 2-hour episode across a 4-hour shift) is
 * wrapped back onto the corresponding packed hour, and the returned offsets
 * are shifted forward into the requested hour so displayed times stay real
 * wall-clock times for *this* airing.
 */
export function selectStoriesForWindow(
  estimates: StoryTimeEstimate[],
  fromOffsetSeconds: number,
  toOffsetSeconds: number | null,
): StoryTimeEstimate[] {
  const packedHours = packedHourCount(estimates);
  if (packedHours === 0) return [];

  const packedSpanSeconds = packedHours * 3600;
  let from = fromOffsetSeconds;
  let shift = 0;
  if (from >= packedSpanSeconds) {
    const wrapped = from % packedSpanSeconds;
    shift = from - wrapped;
    from = wrapped;
  }
  const to = toOffsetSeconds === null ? null : toOffsetSeconds - shift;

  return estimates
    .filter(
      (estimate) =>
        estimate.offsetSeconds !== null &&
        estimate.offsetSeconds >= from &&
        (to === null || estimate.offsetSeconds < to),
    )
    .map((estimate) => ({ ...estimate, offsetSeconds: estimate.offsetSeconds! + shift }));
}
