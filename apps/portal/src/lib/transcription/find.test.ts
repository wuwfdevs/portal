import { describe, expect, it } from "vitest";
import { findInTranscript, highlightedTokensBySegment } from "./find";

const segments = [
  { text: "The bridge cost doubled." },
  { text: "Nobody said anything about the Bridge, though." },
  { text: "Costs moved with steel." },
];

describe("findInTranscript", () => {
  it("finds a word case-insensitively and ignores punctuation", () => {
    expect(findInTranscript(segments, "bridge")).toEqual([
      { segmentIndex: 0, fromToken: 1, toToken: 1 },
      { segmentIndex: 1, fromToken: 5, toToken: 5 },
    ]);
  });

  it("finds a phrase as a run of words", () => {
    expect(findInTranscript(segments, "bridge cost")).toEqual([
      { segmentIndex: 0, fromToken: 1, toToken: 2 },
    ]);
  });

  it("matches the last word as a prefix, so results narrow as you type", () => {
    expect(findInTranscript(segments, "cos").map((m) => m.segmentIndex)).toEqual([0, 2]);
    expect(findInTranscript(segments, "the brid")).toHaveLength(2);
  });

  it("finds nothing for a blank or one-character query", () => {
    expect(findInTranscript(segments, "")).toEqual([]);
    expect(findInTranscript(segments, " b ")).toEqual([]);
  });
});

describe("highlightedTokensBySegment", () => {
  it("marks every matched word and singles out the current match", () => {
    const matches = findInTranscript(segments, "bridge");
    const map = highlightedTokensBySegment(matches, 1);
    expect([...map.get(0)!.tokens]).toEqual([1]);
    expect([...map.get(0)!.currentTokens]).toEqual([]);
    expect([...map.get(1)!.currentTokens]).toEqual([5]);
  });
});
