// Pure, dependency-free half of credit-script-splitter.ts — no fetch, no
// OpenAI SDK, no "server-only" — so it's directly unit-testable (see
// credit-script-boundaries.test.ts), the same split npr-response.ts already
// keeps from providers/npr.ts's actual fetch call.
//
// This is what actually guarantees a split credit segment is byte-for-byte
// what DAD printed, never a model paraphrase: the model only ever supplies
// *where* to cut (a short opening phrase copied from the source text), and
// this function is the code that turns that into real substrings — and the
// code that refuses to trust anything it can't verify.

/**
 * Turns proposed credit boundaries (each a short opening phrase, one per
 * credit after the first) into verbatim segments of `script`, or null if
 * anything about them can't be trusted: an opening phrase that isn't found
 * as a literal, in-order substring of the source text (allowing for the
 * model normalizing curly vs. straight quotes, which this parser's own
 * decodeEntities never introduces but a model's own output sometimes does),
 * a phrase landing right at the very start (leaving nothing for "the first
 * credit" before it), or fewer than two resulting segments.
 */
export function applyCreditScriptBoundaries(script: string, openingWordsList: string[]): string[] | null {
  if (openingWordsList.length === 0) return null;

  const normalizedScript = normalizeQuotes(script);
  const boundaries: number[] = [];
  let searchFrom = 0;
  for (const raw of openingWordsList) {
    const openingWords = normalizeQuotes(raw.trim());
    if (openingWords === "") return null;
    const index = normalizedScript.indexOf(openingWords, searchFrom);
    if (index < searchFrom || index === 0) return null;
    boundaries.push(index);
    searchFrom = index + openingWords.length;
  }

  const cuts = [0, ...boundaries, script.length];
  const segments: string[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const segment = script.slice(cuts[i]!, cuts[i + 1]!).trim();
    if (segment === "") return null;
    segments.push(segment);
  }
  return segments.length >= 2 ? segments : null;
}

/** Curly quotes/apostrophes → straight, so a model-typed boundary phrase can still locate itself in DAD's own printed text either way. */
function normalizeQuotes(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}
