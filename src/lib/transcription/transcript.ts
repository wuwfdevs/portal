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
