// The words of a piece's actuality, always derived from the transcript for the
// block's range — never typed, never stored on the block (design §4.7).

import { buildTimedTokens, type TimedToken } from "@/lib/transcription/selection";
import type { TranscribedWord } from "@/lib/transcription/asr-provider";

export interface TextSegment {
  startMs: number;
  endMs: number;
  text: string;
  words: TranscribedWord[];
}

export interface ContextToken extends TimedToken {
  /** Inside the clip's current range. */
  inRange: boolean;
}

function allTokens(segments: readonly TextSegment[]): TimedToken[] {
  return segments.flatMap((segment) => buildTimedTokens(segment));
}

/** A word belongs to the clip when its midpoint falls inside the range. */
function inside(token: TimedToken, startMs: number, endMs: number): boolean {
  const mid = (token.startMs + token.endMs) / 2;
  return mid >= startMs && mid < endMs;
}

/** The transcript's words for [startMs, endMs). Empty when no segment covers it. */
export function textForRange(
  segments: readonly TextSegment[],
  startMs: number,
  endMs: number,
): string {
  return allTokens(segments)
    .filter((token) => inside(token, startMs, endMs))
    .map((token) => token.text)
    .join(" ");
}

/** The clip's words plus `context` words either side, for the trim panel. */
export function contextForRange(
  segments: readonly TextSegment[],
  startMs: number,
  endMs: number,
  context = 14,
): ContextToken[] {
  const tokens = allTokens(segments);
  const first = tokens.findIndex((token) => inside(token, startMs, endMs));
  if (first < 0) return [];
  let last = first;
  for (let i = first; i < tokens.length; i++) {
    if (inside(tokens[i]!, startMs, endMs)) last = i;
  }
  return tokens
    .slice(Math.max(0, first - context), Math.min(tokens.length, last + 1 + context))
    .map((token) => ({ ...token, inRange: inside(token, startMs, endMs) }));
}

/**
 * Tapping a word moves the nearer end of the clip to it: a word before the
 * clip's midpoint sets the start, a word after it sets the end.
 */
export function retrimByToken(
  token: TimedToken,
  range: { startMs: number; endMs: number },
): { startMs: number; endMs: number } {
  const mid = (range.startMs + range.endMs) / 2;
  const tokenMid = (token.startMs + token.endMs) / 2;
  return tokenMid < mid
    ? { startMs: token.startMs, endMs: range.endMs }
    : { startMs: range.startMs, endMs: token.endMs };
}
