import { describe, expect, it } from "vitest";
import type { TranscribedUtterance, TranscribedWord } from "./asr-provider";
import { splitUtteranceIntoParagraphs } from "./paragraphs";

/** `count` words, one every `stepMs`, each lasting `stepMs - 50`; a word at a sentence index ends in a period. */
function speech(
  count: number,
  stepMs: number,
  sentenceEvery: number,
  startMs = 0,
): TranscribedWord[] {
  return Array.from({ length: count }, (_, i) => ({
    w: (i + 1) % sentenceEvery === 0 ? `word${i}.` : `word${i}`,
    s: startMs + i * stepMs,
    e: startMs + i * stepMs + stepMs - 50,
  }));
}

function utterance(words: TranscribedWord[]): TranscribedUtterance {
  return {
    speakerLabel: "A",
    startMs: words[0]!.s,
    endMs: words[words.length - 1]!.e,
    text: words.map((w) => w.w).join(" "),
    words,
  };
}

describe("splitUtteranceIntoParagraphs", () => {
  it("leaves a short turn alone", () => {
    const u = utterance(speech(20, 500, 5));
    expect(splitUtteranceIntoParagraphs(u)).toEqual([u]);
  });

  it("leaves a turn without word timings alone", () => {
    const u: TranscribedUtterance = {
      speakerLabel: "A",
      startMs: 0,
      endMs: 90_000,
      text: "No timings.",
      words: [],
    };
    expect(splitUtteranceIntoParagraphs(u)).toEqual([u]);
  });

  it("cuts a long monologue at sentence ends about every 30 seconds", () => {
    // Ten minutes: a word every 500 ms, a sentence every 10 words (5 s).
    const u = utterance(speech(1200, 500, 10));
    const pieces = splitUtteranceIntoParagraphs(u);

    expect(pieces.length).toBeGreaterThan(15);
    for (const piece of pieces.slice(0, -1)) {
      expect(piece.words[piece.words.length - 1]!.w).toMatch(/\.$/);
      expect(piece.endMs - piece.startMs).toBeLessThan(40_000);
      expect(piece.endMs - piece.startMs).toBeGreaterThanOrEqual(29_000);
    }
  });

  it("keeps every word, in order, with the turn's start and end", () => {
    const u = utterance(speech(1200, 500, 10));
    const pieces = splitUtteranceIntoParagraphs(u);

    expect(pieces.flatMap((p) => p.words)).toEqual(u.words);
    expect(pieces[0]!.startMs).toBe(u.startMs);
    expect(pieces[pieces.length - 1]!.endMs).toBe(u.endMs);
    expect(new Set(pieces.map((p) => p.speakerLabel))).toEqual(new Set(["A"]));
    for (const piece of pieces) {
      expect(piece.text.split(" ")).toHaveLength(piece.words.length);
      expect(piece.endMs).toBeGreaterThan(piece.startMs);
    }
  });

  it("breaks early at a long pause once the paragraph has some length", () => {
    const first = speech(40, 500, 10); // 20 s, ends on a sentence end
    const second = speech(10, 500, 10, first[39]!.e + 2_000);
    const pieces = splitUtteranceIntoParagraphs(utterance([...first, ...second]));
    expect(pieces).toHaveLength(2);
    expect(pieces[0]!.words).toHaveLength(40);
  });

  it("does not break at a pause before the minimum length", () => {
    const first = speech(10, 500, 10); // 5 s
    const second = speech(10, 500, 10, first[9]!.e + 2_000);
    expect(splitUtteranceIntoParagraphs(utterance([...first, ...second]))).toHaveLength(1);
  });

  it("does not break mid-sentence just because time passed", () => {
    // 60 s with no punctuation and no pauses.
    const words = speech(120, 500, 1000);
    expect(splitUtteranceIntoParagraphs(utterance(words))).toHaveLength(1);
  });

  it("falls back to a short pause for an unpunctuated run past the maximum", () => {
    const first = speech(160, 500, 1000); // 80 s, no punctuation
    const second = speech(20, 500, 1000, first[159]!.e + 500);
    const pieces = splitUtteranceIntoParagraphs(utterance([...first, ...second]));
    expect(pieces).toHaveLength(2);
    expect(pieces[0]!.words).toHaveLength(160);
  });
});
