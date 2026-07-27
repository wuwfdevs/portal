// Pure transcript-display logic shared between server data access and the
// client-side TranscriptPlayer — no "server-only", testable without mocks.

import type { TranscribedWord } from "./asr-provider";

export function speakerDisplayLabel(diarizationLabel: string, displayName: string | null): string {
  return displayName?.trim() || `Speaker ${diarizationLabel}`;
}

/**
 * Index of the segment that should be highlighted for a given playhead
 * position. Segments are assumed sorted ascending by startMs (their natural
 * `position` order). Returns the most recently started segment rather than
 * requiring an exact [start, end) match, so the highlight holds steady
 * through gaps between utterances instead of flickering off. Returns -1
 * before the first segment starts.
 *
 * Binary search rather than a scan: this runs on every `timeupdate` (~4×
 * per second, and again per seek), and a linear walk over an hour-long
 * interview's segments is real work to repeat that often.
 */
export function findActiveSegmentIndex(
  segments: { startMs: number }[],
  currentTimeMs: number,
): number {
  let low = 0;
  let high = segments.length - 1;
  let active = -1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (segments[mid]!.startMs <= currentTimeMs) {
      active = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return active;
}

/** First segment (by array order, i.e. position order) attributed to a speaker — used for the speaker-naming panel's "hear an example" snippet. Returns -1 if the speaker has no segments. */
export function findFirstSegmentIndexForSpeaker(
  segments: { speakerId: string | null }[],
  speakerId: string,
): number {
  return segments.findIndex((s) => s.speakerId === speakerId);
}

const MIN_SEGMENT_DURATION_MS = 2;

/**
 * Proportional time split for cutting one segment's [startMs, endMs] into
 * two, based on where in the text (by character count) the split falls.
 * This is an approximation, not a re-alignment against the original word
 * timings — consistent with how the design treats all edited-segment timing
 * as approximate (clip boundaries are always audition-and-nudge regardless,
 * see docs/transcription-workspace-design.md §5). Both halves are clamped to
 * at least MIN_SEGMENT_DURATION_MS so the tw_segments end_ms > start_ms
 * check constraint always holds; returns null if the segment is too short
 * to split at all.
 */
export function splitTiming(
  startMs: number,
  endMs: number,
  firstPartLength: number,
  totalLength: number,
): { firstEndMs: number; secondStartMs: number } | null {
  if (endMs - startMs < MIN_SEGMENT_DURATION_MS * 2) return null;

  const ratio = totalLength > 0 ? firstPartLength / totalLength : 0.5;
  const raw = Math.round(startMs + (endMs - startMs) * ratio);
  const boundary = Math.min(
    Math.max(raw, startMs + MIN_SEGMENT_DURATION_MS),
    endMs - MIN_SEGMENT_DURATION_MS,
  );

  return { firstEndMs: boundary, secondStartMs: boundary };
}

/**
 * tw_segments.words is jsonb, so it arrives typed as Json — anything could
 * be in there (an older row, a provider change, a hand-edited value). Coerce
 * to the word shape and drop whatever doesn't fit, rather than trusting a
 * cast that would blow up at read time.
 */
export function parseWords(value: unknown): TranscribedWord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is TranscribedWord =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as TranscribedWord).w === "string" &&
      typeof (item as TranscribedWord).s === "number" &&
      typeof (item as TranscribedWord).e === "number",
  );
}

/**
 * Splits a segment's word timings to match a text split at `splitAtChar`,
 * so splitting a line no longer throws its word-level timings away. The
 * boundary is the number of whitespace-delimited tokens before the split
 * point; a split landing mid-word keeps that word with the first half.
 *
 * Like splitTiming, this is an approximation rather than a re-alignment —
 * the ASR's word array and the (possibly already corrected) text can drift
 * apart. That is fine: word timings are anchors for clip selection, and clip
 * boundaries are always audition-and-nudge. See
 * docs/transcription-workspace-design.md §5.
 */
export function partitionWords(
  words: TranscribedWord[],
  splitAtChar: number,
  text: string,
): { first: TranscribedWord[]; second: TranscribedWord[] } {
  if (words.length === 0) return { first: [], second: [] };

  const boundary = Math.min(countWords(text.slice(0, splitAtChar)), words.length);
  return { first: words.slice(0, boundary), second: words.slice(boundary) };
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * The exact boundary for a split, taken from the preserved word timings:
 * the first half ends when its last word ends, the second begins when its
 * first word begins. Preferred over splitTiming's character-ratio estimate
 * whenever both halves still carry words, because it puts the cut in real
 * silence between utterances instead of somewhere in the middle of a word.
 *
 * Returns null when the words can't produce a usable boundary (either half
 * empty, or timings that would violate the tw_segments end_ms > start_ms
 * check) — callers fall back to splitTiming.
 */
export function splitTimingFromWords(
  first: TranscribedWord[],
  second: TranscribedWord[],
  startMs: number,
  endMs: number,
): { firstEndMs: number; secondStartMs: number } | null {
  if (endMs - startMs < MIN_SEGMENT_DURATION_MS * 2) return null;

  const lastOfFirst = first[first.length - 1];
  const firstOfSecond = second[0];
  if (!lastOfFirst || !firstOfSecond) return null;

  const upperBound = endMs - MIN_SEGMENT_DURATION_MS;
  const firstEndMs = Math.min(
    Math.max(lastOfFirst.e, startMs + MIN_SEGMENT_DURATION_MS),
    upperBound,
  );
  const secondStartMs = Math.min(Math.max(firstOfSecond.s, firstEndMs), upperBound);

  return { firstEndMs, secondStartMs };
}
