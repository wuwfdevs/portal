// Finding pauses to take out of an actuality (a piece's "Remove pauses").
//
// A pause is a gap between two spoken words in the transcript's word timings, so no audio is
// analysed: it is pure arithmetic over what is already stored, and the cut lands in the middle of
// the gap, in the quiet, where a seek is least audible. Timings are the ASR's, so a boundary can
// be off by a few tens of milliseconds, which is why a cut always leaves some of the pause behind
// (`keepMs`) rather than butting up against the neighbouring words.

import { buildTimedTokens, type TimedToken } from "@/lib/transcription/selection";
import { MIN_CUT_MS, type Cut } from "./pieces";
import type { TextSegment } from "./piece-text";

export interface SilenceSetting {
  id: "light" | "standard" | "tight";
  label: string;
  /** A gap at least this long is a pause worth shortening. */
  minGapMs: number;
  /** How much of each pause is left in, split either side of the cut. */
  keepMs: number;
}

export const SILENCE_SETTINGS: readonly SilenceSetting[] = [
  { id: "light", label: "Long pauses only", minGapMs: 1000, keepMs: 400 },
  { id: "standard", label: "Standard", minGapMs: 700, keepMs: 300 },
  { id: "tight", label: "Tight", minGapMs: 500, keepMs: 250 },
];

export const DEFAULT_SILENCE_SETTING = SILENCE_SETTINGS[1]!;

/**
 * The cuts that shorten every pause in [startMs, endMs) to `keepMs`. A pause at the very start or
 * end of the range is trimmed down to half of `keepMs`, since only one side of it is speech.
 * Interpolated word timings (an edited line) have no real gaps, so such a line yields no cuts.
 */
export function findSilenceCuts(
  segments: readonly TextSegment[],
  range: { startMs: number; endMs: number },
  setting: Pick<SilenceSetting, "minGapMs" | "keepMs"> = DEFAULT_SILENCE_SETTING,
): Cut[] {
  const tokens: TimedToken[] = segments
    .flatMap((segment) => buildTimedTokens(segment))
    .filter((token) => {
      const mid = (token.startMs + token.endMs) / 2;
      return mid >= range.startMs && mid < range.endMs;
    })
    .sort((a, b) => a.startMs - b.startMs);
  if (tokens.length === 0) return [];

  const cuts: Cut[] = [];
  // `keepBefore`/`keepAfter` is how much of the gap stays next to the word on that side.
  const consider = (gapStart: number, gapEnd: number, keepBefore: number, keepAfter: number) => {
    if (gapEnd - gapStart < setting.minGapMs) return;
    const start = Math.round(gapStart + keepBefore);
    const end = Math.round(gapEnd - keepAfter);
    if (end - start >= MIN_CUT_MS) cuts.push({ start_ms: start, end_ms: end });
  };
  const half = setting.keepMs / 2;

  // The edges have speech on one side only, so only that side keeps anything.
  consider(range.startMs, tokens[0]!.startMs, 0, half);
  for (let i = 0; i + 1 < tokens.length; i++) {
    // Words touching or overlapping have no gap; a negative span fails the length test.
    consider(tokens[i]!.endMs, tokens[i + 1]!.startMs, half, half);
  }
  consider(tokens[tokens.length - 1]!.endMs, range.endMs, half, 0);

  return cuts;
}

/** Total length the cuts take out, in ms. */
export function totalCutMs(cuts: readonly Cut[]): number {
  return cuts.reduce((total, cut) => total + cut.end_ms - cut.start_ms, 0);
}
