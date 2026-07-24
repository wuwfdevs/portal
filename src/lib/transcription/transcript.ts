// Pure transcript-display logic shared between server data access and the
// client-side TranscriptPlayer — no "server-only", testable without mocks.

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
 */
export function findActiveSegmentIndex(
  segments: { startMs: number }[],
  currentTimeMs: number,
): number {
  let active = -1;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    if (segment && segment.startMs <= currentTimeMs) {
      active = i;
    } else {
      break;
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
