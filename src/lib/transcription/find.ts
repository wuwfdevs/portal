/**
 * "Find in this transcript": every place a typed phrase occurs, as runs of
 * words, over the segment text (not the DOM, so it works the same for a line
 * that is not currently drawn). A transcript line is rendered as the
 * whitespace-split words of its text, so a match is a range of those word
 * indexes, which is exactly what the row needs to highlight it.
 */
export interface TranscriptMatch {
  segmentIndex: number;
  fromToken: number;
  toToken: number;
}

/** Fewer characters than this matches too much to be a search. */
export const MIN_FIND_LENGTH = 2;

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

export function findInTranscript(segments: { text: string }[], query: string): TranscriptMatch[] {
  const wanted = query.trim().split(/\s+/).map(normalizeWord).filter(Boolean);
  if (wanted.length === 0 || query.trim().length < MIN_FIND_LENGTH) return [];

  const matches: TranscriptMatch[] = [];
  segments.forEach((segment, segmentIndex) => {
    const words = segment.text.trim().split(/\s+/).filter(Boolean).map(normalizeWord);
    for (let start = 0; start + wanted.length <= words.length; start++) {
      const hit = wanted.every((word, offset) => {
        const candidate = words[start + offset]!;
        // The last word matches as a prefix, so results narrow while typing.
        return offset === wanted.length - 1 ? candidate.startsWith(word) : candidate === word;
      });
      if (hit) {
        matches.push({ segmentIndex, fromToken: start, toToken: start + wanted.length - 1 });
        start += wanted.length - 1;
      }
    }
  });
  return matches;
}

/** Matches regrouped by line, as the sets of word indexes each line should highlight. */
export function highlightedTokensBySegment(
  matches: TranscriptMatch[],
  currentIndex: number,
): Map<number, { tokens: Set<number>; currentTokens: Set<number> }> {
  const bySegment = new Map<number, { tokens: Set<number>; currentTokens: Set<number> }>();
  matches.forEach((match, index) => {
    const entry = bySegment.get(match.segmentIndex) ?? {
      tokens: new Set<number>(),
      currentTokens: new Set<number>(),
    };
    for (let token = match.fromToken; token <= match.toToken; token++) {
      entry.tokens.add(token);
      if (index === currentIndex) entry.currentTokens.add(token);
    }
    bySegment.set(match.segmentIndex, entry);
  });
  return bySegment;
}
