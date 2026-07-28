import { describe, expect, it } from "vitest";
import { buildTimedTokens, resolveSelection, type TimedToken } from "./selection";

describe("buildTimedTokens", () => {
  it("uses the ASR word timings when they line up with the text", () => {
    const tokens = buildTimedTokens({
      startMs: 1000,
      endMs: 2000,
      text: "hello there friend",
      words: [
        { w: "hello", s: 1000, e: 1300 },
        { w: "there", s: 1400, e: 1700 },
        { w: "friend", s: 1750, e: 2000 },
      ],
    });

    expect(tokens).toEqual([
      { text: "hello", startMs: 1000, endMs: 1300 },
      { text: "there", startMs: 1400, endMs: 1700 },
      { text: "friend", startMs: 1750, endMs: 2000 },
    ]);
  });

  it("renders the corrected text, not the stale ASR wording", () => {
    // The reporter fixed a mishear; `words` still says what the ASR heard.
    const tokens = buildTimedTokens({
      startMs: 0,
      endMs: 900,
      text: "Mayor Reeves spoke",
      words: [
        { w: "Mayor", s: 0, e: 300 },
        { w: "Reeds", s: 300, e: 600 },
        { w: "spoke", s: 600, e: 900 },
      ],
    });

    expect(tokens.map((token) => token.text)).toEqual(["Mayor", "Reeves", "spoke"]);
  });

  it("interpolates evenly when the word timings no longer line up", () => {
    const tokens = buildTimedTokens({
      startMs: 0,
      endMs: 1000,
      text: "one two three four",
      words: [{ w: "one", s: 0, e: 250 }],
    });

    expect(tokens).toEqual([
      { text: "one", startMs: 0, endMs: 250 },
      { text: "two", startMs: 250, endMs: 500 },
      { text: "three", startMs: 500, endMs: 750 },
      { text: "four", startMs: 750, endMs: 1000 },
    ]);
  });

  it("interpolates across the segment when there are no timings at all", () => {
    const tokens = buildTimedTokens({
      startMs: 2000,
      endMs: 2400,
      text: "a b",
      words: [],
    });

    expect(tokens).toEqual([
      { text: "a", startMs: 2000, endMs: 2200 },
      { text: "b", startMs: 2200, endMs: 2400 },
    ]);
  });

  it("returns nothing for an empty line", () => {
    expect(buildTimedTokens({ startMs: 0, endMs: 100, text: "   ", words: [] })).toEqual([]);
  });
});

describe("resolveSelection", () => {
  const tokensBySegment: TimedToken[][] = [
    [
      { text: "The", startMs: 0, endMs: 200 },
      { text: "stale", startMs: 200, endMs: 500 },
      { text: "smell", startMs: 500, endMs: 800 },
    ],
    [
      { text: "A", startMs: 1200, endMs: 1300 },
      { text: "cold", startMs: 1300, endMs: 1600 },
      { text: "dip", startMs: 1600, endMs: 1900 },
    ],
  ];

  it("snaps to the first and last selected word", () => {
    const result = resolveSelection(tokensBySegment, [
      { segmentIndex: 0, tokenIndex: 1 },
      { segmentIndex: 0, tokenIndex: 2 },
    ]);

    expect(result).toEqual({ startMs: 200, endMs: 800, excerpt: "stale smell" });
  });

  it("spans line boundaries", () => {
    const result = resolveSelection(tokensBySegment, [
      { segmentIndex: 0, tokenIndex: 2 },
      { segmentIndex: 1, tokenIndex: 0 },
      { segmentIndex: 1, tokenIndex: 1 },
    ]);

    expect(result).toEqual({ startMs: 500, endMs: 1600, excerpt: "smell A cold" });
  });

  it("puts the excerpt in reading order regardless of ref order", () => {
    // A backwards drag hands back its words end-first.
    const result = resolveSelection(tokensBySegment, [
      { segmentIndex: 1, tokenIndex: 1 },
      { segmentIndex: 1, tokenIndex: 0 },
      { segmentIndex: 0, tokenIndex: 2 },
    ]);

    expect(result?.excerpt).toBe("smell A cold");
    expect(result?.startMs).toBe(500);
  });

  it("handles a single word", () => {
    const result = resolveSelection(tokensBySegment, [{ segmentIndex: 1, tokenIndex: 2 }]);
    expect(result).toEqual({ startMs: 1600, endMs: 1900, excerpt: "dip" });
  });

  it("returns null when nothing resolvable was selected", () => {
    expect(resolveSelection(tokensBySegment, [])).toBeNull();
    expect(resolveSelection(tokensBySegment, [{ segmentIndex: 9, tokenIndex: 0 }])).toBeNull();
  });

  it("ignores refs that point past the end of a line", () => {
    const result = resolveSelection(tokensBySegment, [
      { segmentIndex: 0, tokenIndex: 0 },
      { segmentIndex: 0, tokenIndex: 99 },
    ]);

    expect(result).toEqual({ startMs: 0, endMs: 200, excerpt: "The" });
  });
});
