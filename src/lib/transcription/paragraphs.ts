// Cuts one speaker turn into paragraph-sized pieces, so a long monologue gets
// a timestamp every half minute or so instead of one for the whole turn.
// Pure and client-safe; used when a transcript is ingested (the webhook), so
// the cuts come from the ASR's own word timings and real pauses, before any
// line has been edited.

import type { TranscribedUtterance } from "./asr-provider";

/** A paragraph never ends before this much speech, even at a sentence end. */
export const PARAGRAPH_TARGET_MS = 30_000;
/** A pause this long after a sentence end breaks a paragraph earlier... */
export const PARAGRAPH_PAUSE_MS = 1_500;
/** ...but only once the paragraph is at least this long. */
export const PARAGRAPH_MIN_MS = 10_000;
/** Past this, even a shorter pause between words will do for a break. */
export const PARAGRAPH_MAX_MS = 75_000;
const LONG_RUN_PAUSE_MS = 400;

const SENTENCE_END = /[.!?]["'”’)\]]*$/;

function breaksAfter(
  words: TranscribedUtterance["words"],
  index: number,
  paragraphStartMs: number,
): boolean {
  const word = words[index]!;
  const next = words[index + 1];
  if (!next) return false;

  const elapsed = word.e - paragraphStartMs;
  const gap = next.s - word.e;
  const sentenceEnd = SENTENCE_END.test(word.w);

  if (elapsed >= PARAGRAPH_MAX_MS && (sentenceEnd || gap >= LONG_RUN_PAUSE_MS)) return true;
  if (!sentenceEnd) return false;
  if (elapsed >= PARAGRAPH_TARGET_MS) return true;
  return elapsed >= PARAGRAPH_MIN_MS && gap >= PARAGRAPH_PAUSE_MS;
}

/**
 * The utterance as one or more paragraphs, each a valid utterance of its own
 * (same speaker, its own words, text and start/end). A turn with no word
 * timings, or one that never reaches a break, comes back unchanged. The first
 * piece keeps the utterance's start and the last keeps its end, so the pieces
 * still cover exactly what the turn did.
 */
export function splitUtteranceIntoParagraphs(
  utterance: TranscribedUtterance,
): TranscribedUtterance[] {
  const { words } = utterance;
  if (words.length < 2) return [utterance];

  const groups: TranscribedUtterance["words"][] = [];
  let current: TranscribedUtterance["words"] = [];
  let paragraphStartMs = utterance.startMs;

  words.forEach((word, index) => {
    current.push(word);
    if (breaksAfter(words, index, paragraphStartMs)) {
      groups.push(current);
      current = [];
      paragraphStartMs = words[index + 1]!.s;
    }
  });
  if (current.length > 0) groups.push(current);
  if (groups.length < 2) return [utterance];

  const pieces = groups.map((group, index): TranscribedUtterance => {
    const first = group[0]!;
    const last = group[group.length - 1]!;
    return {
      speakerLabel: utterance.speakerLabel,
      startMs: index === 0 ? utterance.startMs : first.s,
      endMs: index === groups.length - 1 ? utterance.endMs : last.e,
      text: group.map((word) => word.w).join(" "),
      words: group,
    };
  });

  // A piece must have a positive length (tw_segments requires end > start);
  // if the timings can't give every piece one, leave the turn whole.
  return pieces.every((piece) => piece.endMs > piece.startMs) ? pieces : [utterance];
}
