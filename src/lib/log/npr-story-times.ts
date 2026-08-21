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

// Calibrated against the official NPR Rundowns App document for Morning
// Edition 2026-08-21 (supplied by WUWF): with the block-length rollup item
// excluded (see excludeBlockLengthRollups) and the shift's hours mapped to
// the feed's alternation (see episodeHourOffset), this packing reproduces
// that rundown's segment assignments exactly, story for story, and its
// times within seconds.

export const DEFAULT_STORY_DURATION_SECONDS = 240;

export interface StoryTimingInput {
  npr_item_id: string;
  duration_seconds: number | null;
}

export interface SegmentSlotLike {
  start_offset_seconds: number | null;
  duration_seconds: number;
  segment_label: string | null;
  /** log_clock_slots.timing_mode — only 'fixed' slots are story windows; see buildSegmentWindows. */
  timing_mode: string;
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
  /** The duration packing used — the story's own, or DEFAULT_STORY_DURATION_SECONDS when unknown. */
  durationSeconds: number;
}

/**
 * The clock's lettered programming segments (slots carrying a
 * `segment_label`), tiled once per hour across the shift, in chronological
 * order. Only fixed-timing slots count: the seeded clocks also put segment
 * labels on *floating* slots — Fresh Air/Hidden Brain/World Cafe's
 * between-segment floating breaks are labeled "A/B"/"B/C", and 1A's two
 * 120-second fundraising cutaways are labeled with the segment they sit
 * inside — and packing stories into those would corrupt every estimate.
 * `timing_mode = 'fixed'` vs `'float'` is the structural distinction
 * (verified across all seeded clocks), not the label's spelling. Clocks
 * with no lettered fixed segments produce no windows — every estimate then
 * comes back null and callers fall back to order-only display.
 */
export function buildSegmentWindows(slots: SegmentSlotLike[], hourCount: number): SegmentWindow[] {
  const segments = slots
    .filter(
      (slot): slot is SegmentSlotLike & { start_offset_seconds: number; segment_label: string } =>
        slot.segment_label !== null &&
        slot.start_offset_seconds !== null &&
        slot.duration_seconds > 0 &&
        slot.timing_mode === "fixed",
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

/**
 * Drops a block-length digital rollup from the story list before packing.
 * NPR's episode feed for Morning Edition leads with a "Morning news brief"
 * item — the digital-only rollup of the A-block's stories, which never airs
 * as its own rundown story (confirmed against the official Rundowns App
 * document for 2026-08-21: its 11:13 audio is the sum of the three real
 * A-block stories that follow it, and it appears nowhere in the rundown).
 * Left in, it consumes a whole segment in packing and pushes every real
 * story one slot late. Identified structurally, not by title: an item whose
 * audio spans ≥90% of the largest segment window can't be a single rundown
 * story *unless* it essentially is the show (Fresh Air's one long
 * interview) — so the exclusion only applies when the remaining stories
 * still carry at least half an hour-cycle of content on their own.
 */
export function excludeBlockLengthRollups(
  stories: StoryTimingInput[],
  windows: SegmentWindow[],
): StoryTimingInput[] {
  const firstHour = windows.filter((window) => window.hourIndex === 0);
  if (firstHour.length === 0) return stories;
  const maxCapacity = Math.max(...firstHour.map((window) => window.capacitySeconds));
  const hourCycleCapacity = firstHour.reduce((sum, window) => sum + window.capacitySeconds, 0);

  const isRollup = (story: StoryTimingInput) =>
    story.duration_seconds !== null && story.duration_seconds >= maxCapacity * 0.9;
  if (!stories.some(isRollup)) return stories;

  const remaining = stories.filter((story) => !isRollup(story));
  const remainingKnownSeconds = remaining.reduce(
    (sum, story) => sum + (story.duration_seconds ?? 0),
    0,
  );
  if (remainingKnownSeconds < hourCycleCapacity * 0.5) return stories;
  return remaining;
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
      estimates.push({
        npr_item_id: story.npr_item_id,
        offsetSeconds: null,
        segmentLabel: null,
        hourIndex: null,
        durationSeconds: duration,
      });
      continue;
    }

    const window = windows[windowIndex]!;
    estimates.push({
      npr_item_id: story.npr_item_id,
      offsetSeconds: window.startOffsetSeconds + filledSeconds,
      segmentLabel: window.segmentLabel,
      hourIndex: window.hourIndex,
      durationSeconds: duration,
    });

    // A story longer than the whole segment it opens (Fresh Air's one
    // interview spanning A through D, resuming across the breaks) genuinely
    // consumes the following segments too, so its overflow walks forward
    // through them and the next story starts wherever it actually left off.
    // This applies only to a story placed at the start of a window it can't
    // fit — a mid-window estimate overshooting its segment by a little is
    // duration noise, and the network pads to the post there (see the
    // half-fit rule above), so small overflow never leaks into the next
    // segment's start time.
    if (filledSeconds === 0 && duration > window.capacitySeconds) {
      let remainder = duration - window.capacitySeconds;
      windowIndex++;
      while (windowIndex < windows.length && remainder >= windows[windowIndex]!.capacitySeconds) {
        remainder -= windows[windowIndex]!.capacitySeconds;
        windowIndex++;
      }
      filledSeconds = windowIndex < windows.length ? remainder : 0;
      continue;
    }

    filledSeconds += duration;
    if (filledSeconds >= window.capacitySeconds) {
      windowIndex++;
      filledSeconds = 0;
    }
  }

  return estimates;
}

/** How many hours the packed stories actually occupy — the episode's own span, which can be shorter than the shift when other hours re-air the feed. */
export function packedHourCount(estimates: StoryTimeEstimate[]): number {
  let max = -1;
  for (const estimate of estimates) {
    if (estimate.hourIndex !== null && estimate.hourIndex > max) max = estimate.hourIndex;
  }
  return max + 1;
}

/** The hour of an instant on NPR's own feed clock (Eastern time), 0–23. */
function hourInEastern(iso: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hourCycle: "h23",
      hour: "2-digit",
    }).format(new Date(iso)),
  );
}

/**
 * Which of the episode's hours WUWF's *first* shift hour carries. NPR's
 * multi-hour magazines alternate their episode hours on the live network
 * feed, anchored to the feed's Eastern-time start — the official Rundowns
 * App labels Morning Edition's 7:00 AM ET hour "HR1" and 8:00 AM ET "HR2"
 * (odd ET hours carry hour 1, for a 5:00 AM ET feed start), so a Central
 * station joining at 5:00 AM CT (6:00 AM ET) starts on HR2, not HR1.
 * `feedStartHourEt` is the program's `npr_feed_start_hour_et`; null (no
 * confirmed anchor) means assume the shift starts on episode hour 1 — the
 * pre-anchor behavior.
 */
export function episodeHourOffset(
  shiftStartISO: string,
  feedStartHourEt: number | null,
  packedHours: number,
): number {
  if (feedStartHourEt === null || packedHours <= 0) return 0;
  const diff = hourInEastern(shiftStartISO) - feedStartHourEt;
  return ((diff % packedHours) + packedHours) % packedHours;
}

/** One airing of one story within the shift — a story in a multi-hour shift over a shorter episode airs more than once. */
export interface ShiftStoryAiring {
  npr_item_id: string;
  /** Offset from shift start, in seconds. */
  offsetSeconds: number;
  segmentLabel: string | null;
  /** Which shift hour this airing falls in. */
  shiftHourIndex: number;
  /** The duration packing used — see StoryTimeEstimate. */
  durationSeconds: number;
}

/**
 * Projects the episode-relative estimates onto the shift's actual hours:
 * shift hour `h` carries episode hour `(h + episodeHourOffset) % packed`,
 * so each story appears once per shift hour that re-airs its episode hour,
 * at its within-hour position. Sorted by shift offset. Callers filter this
 * to a break's window ([from, to) in shift seconds) or reduce it to each
 * story's first airing for whole-episode displays.
 */
export function projectStoriesOntoShift(
  estimates: StoryTimeEstimate[],
  shiftHourCount: number,
  offset: number,
): ShiftStoryAiring[] {
  const packed = packedHourCount(estimates);
  if (packed === 0) return [];

  const airings: ShiftStoryAiring[] = [];
  for (let shiftHour = 0; shiftHour < shiftHourCount; shiftHour++) {
    const episodeHour = (((shiftHour + offset) % packed) + packed) % packed;
    for (const estimate of estimates) {
      if (estimate.hourIndex !== episodeHour || estimate.offsetSeconds === null) continue;
      airings.push({
        npr_item_id: estimate.npr_item_id,
        offsetSeconds: shiftHour * 3600 + (estimate.offsetSeconds - episodeHour * 3600),
        segmentLabel: estimate.segmentLabel,
        shiftHourIndex: shiftHour,
        durationSeconds: estimate.durationSeconds,
      });
    }
  }
  return airings.sort((a, b) => a.offsetSeconds - b.offsetSeconds);
}

/** Each story's first airing within the shift, keyed by npr_item_id — for whole-episode displays (/log/npr's table, the full look-ahead fallback). */
export function firstAiringByStory(airings: ShiftStoryAiring[]): Map<string, ShiftStoryAiring> {
  const first = new Map<string, ShiftStoryAiring>();
  for (const airing of airings) {
    if (!first.has(airing.npr_item_id)) first.set(airing.npr_item_id, airing);
  }
  return first;
}

/** The airings estimated to fall within [fromOffsetSeconds, toOffsetSeconds) of the shift — e.g. between one break's start and the next break's — in airing order. */
export function selectAiringsInWindow(
  airings: ShiftStoryAiring[],
  fromOffsetSeconds: number,
  toOffsetSeconds: number | null,
): ShiftStoryAiring[] {
  return airings.filter(
    (airing) =>
      airing.offsetSeconds >= fromOffsetSeconds &&
      (toOffsetSeconds === null || airing.offsetSeconds < toOffsetSeconds),
  );
}

/** A floating slot's allowed placement window, in shift offsets — earliest/latest are the slot's own bounds for when the break may START, nominal its default placement. */
export interface FloatWindowOffsets {
  earliestOffsetSeconds: number;
  latestOffsetSeconds: number;
  nominalOffsetSeconds: number;
}

export interface FloatLandingEstimate {
  /** Estimated shift offset at which the break actually starts. */
  offsetSeconds: number;
  /** 'story_boundary': a story ends inside the window, and the break lands there. 'nominal': no boundary found — the slot's own nominal placement stands. */
  basis: "story_boundary" | "nominal";
  /** The story estimated to end right where the break lands, when basis is 'story_boundary'. */
  boundaryStoryId: string | null;
  /** The story estimated to run through the entire window (the break will interrupt it, or run late), when no boundary falls inside. */
  spanningStoryId: string | null;
}

/**
 * Where a floating break actually lands on a given day. A float's position
 * within its earliest/latest window is decided by where the surrounding
 * program content breaks — so with per-story durations in hand, the
 * estimate is the first story boundary (a story's end) falling inside the
 * window. When no boundary falls inside — one long story runs through the
 * whole window, the Fresh Air interview case — the nominal placement
 * stands, and the spanning story is reported so the screen can say the
 * break will interrupt it rather than implying a clean junction.
 */
export function estimateFloatLanding(
  window: FloatWindowOffsets,
  airings: ShiftStoryAiring[],
): FloatLandingEstimate {
  let boundary: { end: number; id: string } | null = null;
  let spanningStoryId: string | null = null;
  for (const airing of airings) {
    const end = airing.offsetSeconds + airing.durationSeconds;
    if (
      end >= window.earliestOffsetSeconds &&
      end <= window.latestOffsetSeconds &&
      (boundary === null || end < boundary.end)
    ) {
      boundary = { end, id: airing.npr_item_id };
    }
    if (airing.offsetSeconds < window.earliestOffsetSeconds && end > window.latestOffsetSeconds) {
      spanningStoryId = airing.npr_item_id;
    }
  }

  if (boundary) {
    return {
      offsetSeconds: boundary.end,
      basis: "story_boundary",
      boundaryStoryId: boundary.id,
      spanningStoryId: null,
    };
  }
  return {
    offsetSeconds: window.nominalOffsetSeconds,
    basis: "nominal",
    boundaryStoryId: null,
    spanningStoryId,
  };
}
