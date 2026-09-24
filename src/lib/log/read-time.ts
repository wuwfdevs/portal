/**
 * How long a script takes to read aloud, estimated from its word count —
 * the default planned length for a credit or live read a host reads on
 * air. A traffic export prints every credit at its booked length (DAD
 * prints `00:30` for a 33-word script and a 69-word one alike), which says
 * nothing about how much of a break the read actually takes; the words do.
 * A host refines the estimate per airing (the rundown card's duration
 * override) when they've timed it.
 *
 * Every whitespace-separated token counts as one word, so a spelled-out
 * "F P L" counts three — about right, since each letter is read.
 * Parenthesized text is a direction to the host, not read on air ("(they
 * want a lil pause between…)", "(Please read credit first, then play the
 * segment)"), and isn't counted.
 */
export const READ_WORDS_PER_MINUTE = 160;

export function countWords(script: string): number {
  const trimmed = script.replace(/\([^()]*\)/g, " ").trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/** Whole seconds, at least 1; null for an empty or missing script. */
export function estimateReadSeconds(script: string | null | undefined): number | null {
  const words = countWords(script ?? "");
  if (words === 0) return null;
  return Math.max(1, Math.round((words * 60) / READ_WORDS_PER_MINUTE));
}
