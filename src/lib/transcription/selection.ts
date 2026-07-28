// Turning a text selection over the transcript into a time range — the
// core promise of the tool ("selecting text is cutting audio", see
// docs/transcription-workspace-design.md §1/§3D). Pure and dependency-free:
// the DOM half (which spans a selection actually touches) lives in the
// workspace component, and everything here is arithmetic over the result.

import type { TranscribedWord } from "./asr-provider";

/** One rendered, clickable word: the text as displayed plus when it is said. */
export interface TimedToken {
  text: string;
  startMs: number;
  endMs: number;
}

/** Which word the user's selection touched, as (line, word) coordinates. */
export interface TokenRef {
  segmentIndex: number;
  tokenIndex: number;
}

export interface SelectionRange {
  startMs: number;
  endMs: number;
  excerpt: string;
}

interface TokenizableSegment {
  startMs: number;
  endMs: number;
  text: string;
  words: TranscribedWord[];
}

/**
 * The displayed words of a segment, each with a time.
 *
 * Text always wins over `words` for what gets rendered: once a reporter
 * corrects a line, `words` still holds the ASR's original wording, and
 * rendering from it would put the uncorrected text back on screen. So the
 * segment's text is tokenized, and `words` is consulted only for timings —
 * and only when it still lines up token-for-token. Otherwise (an edited
 * line, a split that drifted, a transcript from before timings were kept)
 * timings are interpolated evenly across the segment, which is exactly the
 * approximate-anchor behaviour the design already assumes for edited
 * segments.
 */
export function buildTimedTokens(segment: TokenizableSegment): TimedToken[] {
  const texts = segment.text.trim().split(/\s+/).filter(Boolean);
  if (texts.length === 0) return [];

  if (segment.words.length === texts.length) {
    return texts.map((text, index) => {
      const word = segment.words[index]!;
      return { text, startMs: word.s, endMs: word.e };
    });
  }

  const span = segment.endMs - segment.startMs;
  return texts.map((text, index) => ({
    text,
    startMs: segment.startMs + Math.round((span * index) / texts.length),
    endMs: segment.startMs + Math.round((span * (index + 1)) / texts.length),
  }));
}

/**
 * The clip range covered by a set of selected words. Refs may arrive in any
 * order and may span several lines; the range is the earliest start to the
 * latest end, and the excerpt is the selected words in reading order with a
 * space at each line break.
 *
 * Returns null when nothing resolvable was selected, so the caller can just
 * hide the composer rather than reason about empty ranges.
 */
export function resolveSelection(
  tokensBySegment: TimedToken[][],
  refs: TokenRef[],
): SelectionRange | null {
  const tokens = refs
    .map((ref) => tokensBySegment[ref.segmentIndex]?.[ref.tokenIndex])
    .filter((token): token is TimedToken => token !== undefined);
  if (tokens.length === 0) return null;

  const ordered = [...refs]
    .filter((ref) => tokensBySegment[ref.segmentIndex]?.[ref.tokenIndex] !== undefined)
    .sort((a, b) =>
      a.segmentIndex === b.segmentIndex
        ? a.tokenIndex - b.tokenIndex
        : a.segmentIndex - b.segmentIndex,
    );

  const startMs = Math.min(...tokens.map((token) => token.startMs));
  const endMs = Math.max(...tokens.map((token) => token.endMs));
  const excerpt = ordered
    .map((ref) => tokensBySegment[ref.segmentIndex]![ref.tokenIndex]!.text)
    .join(" ");

  return { startMs, endMs, excerpt };
}
