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

/** A clip reduced to what highlighting needs: its identity and its audio range. */
export interface ClipTimeRange {
  id: string;
  startMs: number;
  endMs: number;
}

/** The run of words in one segment that a clip covers, ends inclusive. */
export interface ClipSpan {
  clipId: string;
  fromTokenIndex: number;
  toTokenIndex: number;
  /** The clip's whole length, so the tightest of several overlapping clips can win a click. */
  durationMs: number;
}

/**
 * Which words each clip covers — the inverse of resolveSelection(), and the
 * reason a clip can be shown on the transcript at all: clips are stored as
 * time ranges, so their text has to be found again by time.
 *
 * A word counts as covered when it genuinely overlaps the range rather than
 * merely abutting it, for the same reason rangeTouches() rejects a zero-width
 * touch in the workspace — a clip ending exactly where the next word begins
 * shouldn't light that word up.
 *
 * Coverage is only ever as precise as the timings underneath it: on a line
 * that's been edited or split, buildTimedTokens() interpolates, so the
 * highlight marks roughly the right passage rather than exactly the right
 * words. The clip's own in/out points stay the truth about the audio.
 *
 * Returns one entry per segment (empty where nothing is clipped), so the
 * caller can index it alongside the segments it already renders. A clip
 * trimmed into a gap between words covers nothing and simply doesn't appear.
 */
export function resolveClipCoverage(
  tokensBySegment: TimedToken[][],
  clips: ClipTimeRange[],
): ClipSpan[][] {
  return tokensBySegment.map((tokens) => {
    const spans: ClipSpan[] = [];

    for (const clip of clips) {
      let fromTokenIndex = -1;
      let toTokenIndex = -1;

      tokens.forEach((token, tokenIndex) => {
        if (token.startMs >= clip.endMs || token.endMs <= clip.startMs) return;
        if (fromTokenIndex === -1) fromTokenIndex = tokenIndex;
        toTokenIndex = tokenIndex;
      });

      if (fromTokenIndex !== -1) {
        spans.push({
          clipId: clip.id,
          fromTokenIndex,
          toTokenIndex,
          durationMs: clip.endMs - clip.startMs,
        });
      }
    }

    return spans;
  });
}

/**
 * The clip a click on one word means, out of however many cover it.
 *
 * The shortest clip wins: a tight pull-quote taken from inside a longer
 * answer is the more specific thing to have pointed at, and it's also the
 * harder of the two to reach any other way. Ties go to the earlier-created
 * clip, since `clips` arrives oldest-first.
 */
export function clipAtToken(spans: ClipSpan[], tokenIndex: number): string | null {
  let best: ClipSpan | null = null;

  for (const span of spans) {
    if (tokenIndex < span.fromTokenIndex || tokenIndex > span.toTokenIndex) continue;
    if (best === null || span.durationMs < best.durationMs) best = span;
  }

  return best?.clipId ?? null;
}

/** Where a clip starts in the transcript, for scrolling to it. Null if it covers no words. */
export function findClipStart(
  coverage: ClipSpan[][],
  clipId: string,
): { segmentIndex: number; tokenIndex: number } | null {
  for (const [segmentIndex, spans] of coverage.entries()) {
    const span = spans.find((candidate) => candidate.clipId === clipId);
    if (span) return { segmentIndex, tokenIndex: span.fromTokenIndex };
  }
  return null;
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
