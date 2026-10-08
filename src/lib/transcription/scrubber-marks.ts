/**
 * Where excerpts sit along the scrubber. Up to `maxMarks` excerpts each get
 * their own mark; past that, drawing every one turns the strip into a
 * barcode, so they merge into a density strip (how many excerpts start in
 * each stretch). Positions are percentages of the recording, so the strip is
 * resolution-independent.
 */
export interface RangeLike {
  id: string;
  startMs: number;
  endMs: number;
}

export interface SingleMark {
  id: string;
  left: number;
  width: number;
}

export interface DensityBin {
  left: number;
  width: number;
  count: number;
  /** 0 to 1, relative to the busiest stretch. */
  intensity: number;
  /** The stretch of the recording this bin covers. */
  startMs: number;
  endMs: number;
}

/** A visible stretch of the recording, in ms. Null/absent means all of it. */
export interface ScrubberWindow {
  startMs: number;
  endMs: number;
}

export type ScrubberMarks =
  { mode: "marks"; marks: SingleMark[] } | { mode: "density"; bins: DensityBin[] };

/** A mark never gets thinner than this, so a three-second excerpt in an hour is still clickable. */
const MIN_MARK_WIDTH = 0.7;

export function mergeMarks(
  ranges: RangeLike[],
  durationMs: number,
  options: { maxMarks?: number; bins?: number; window?: ScrubberWindow | null } = {},
): ScrubberMarks {
  const { maxMarks = 30, bins = 48 } = options;
  const windowStart = Math.max(0, options.window?.startMs ?? 0);
  const windowEnd = Math.min(durationMs, options.window?.endMs ?? durationMs);
  const span = windowEnd - windowStart;
  if (durationMs <= 0 || span <= 0) return { mode: "marks", marks: [] };

  // Only the excerpts that overlap the visible stretch are drawn.
  const visible = ranges.filter((range) => range.endMs > windowStart && range.startMs < windowEnd);
  if (visible.length === 0) return { mode: "marks", marks: [] };

  const clamp = (value: number) => Math.min(100, Math.max(0, value));

  if (visible.length <= maxMarks) {
    return {
      mode: "marks",
      marks: visible.map((range) => {
        const from = Math.max(range.startMs, windowStart);
        const to = Math.min(range.endMs, windowEnd);
        const width = Math.max(MIN_MARK_WIDTH, ((to - from) / span) * 100);
        // Slide a mark that would run off the end back in, rather than squash it.
        const left = Math.min(clamp(((from - windowStart) / span) * 100), 100 - width);
        return { id: range.id, left, width };
      }),
    };
  }

  const counts = new Array<number>(bins).fill(0);
  for (const range of visible) {
    const position = (Math.max(range.startMs, windowStart) - windowStart) / span;
    const index = Math.min(bins - 1, Math.max(0, Math.floor(position * bins)));
    counts[index] = (counts[index] ?? 0) + 1;
  }
  const busiest = Math.max(...counts);
  return {
    mode: "density",
    bins: counts.map((count, index) => ({
      left: (index / bins) * 100,
      width: 100 / bins,
      count,
      intensity: busiest === 0 ? 0 : count / busiest,
      startMs: Math.round(windowStart + (index / bins) * span),
      endMs: Math.round(windowStart + ((index + 1) / bins) * span),
    })),
  };
}

/**
 * The stretch to zoom to when a density bin is clicked: a few bins wide,
 * centred on the one clicked and kept inside the stretch currently shown, so
 * each click narrows the view and a stripe of many excerpts resolves into
 * individual marks. Null when it would not narrow the view at all.
 */
export function zoomWindowForBin(
  bin: { startMs: number; endMs: number },
  current: ScrubberWindow,
  options: { spanBins?: number } = {},
): ScrubberWindow | null {
  const { spanBins = 3 } = options;
  const size = bin.endMs - bin.startMs;
  const centre = (bin.startMs + bin.endMs) / 2;
  const half = (size * spanBins) / 2;
  let startMs = centre - half;
  let endMs = centre + half;
  // Slide, don't squash, a window that would overhang an end.
  if (startMs < current.startMs) {
    endMs += current.startMs - startMs;
    startMs = current.startMs;
  }
  if (endMs > current.endMs) {
    startMs -= endMs - current.endMs;
    endMs = current.endMs;
  }
  startMs = Math.max(current.startMs, Math.round(startMs));
  endMs = Math.min(current.endMs, Math.round(endMs));
  if (endMs - startMs >= current.endMs - current.startMs || endMs <= startMs) return null;
  return { startMs, endMs };
}
