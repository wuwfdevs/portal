import { describe, expect, it } from "vitest";
import {
  MAX_QUOTE_MS,
  MIN_QUOTE_MS,
  checkQuoteRange,
  formatClipLength,
  formatClipRange,
  formatClipTime,
  nudgeEdge,
  sameStretch,
  wordsInRange,
} from "./quotes";

describe("formatting", () => {
  it("writes a length in seconds, then minutes", () => {
    expect(formatClipLength(0, 9_000)).toBe("9s long");
    expect(formatClipLength(0, 65_000)).toBe("1:05 long");
  });
  it("writes a range the way the excerpt cards do", () => {
    expect(formatClipRange(769_000, 778_000)).toBe("12:49–12:58 · 9s long");
  });
});

describe("nudgeEdge", () => {
  const range = { startMs: 10_000, endMs: 20_000 };
  it("moves one edge by the step", () => {
    expect(nudgeEdge(range, "in", 250, null)).toEqual({ startMs: 10_250, endMs: 20_000 });
    expect(nudgeEdge(range, "out", -50, null)).toEqual({ startMs: 10_000, endMs: 19_950 });
  });
  it("never lets the clip get shorter than the shortest quote", () => {
    const tight = { startMs: 10_000, endMs: 10_000 + MIN_QUOTE_MS + 100 };
    expect(
      nudgeEdge(tight, "in", 250, null).endMs - nudgeEdge(tight, "in", 250, null).startMs,
    ).toBe(MIN_QUOTE_MS);
    expect(nudgeEdge(tight, "out", -250, null).endMs - 10_000).toBe(MIN_QUOTE_MS);
  });
  it("keeps the start inside the recording and the end inside its length", () => {
    expect(nudgeEdge({ startMs: 100, endMs: 9_000 }, "in", -250, null).startMs).toBe(0);
    expect(nudgeEdge({ startMs: 0, endMs: 9_900 }, "out", 250, 10_000).endMs).toBe(10_000);
  });
  it("never lets the clip grow past the longest quote", () => {
    const long = { startMs: 0, endMs: MAX_QUOTE_MS };
    expect(nudgeEdge(long, "out", 250, null).endMs).toBe(MAX_QUOTE_MS);
    expect(
      nudgeEdge({ startMs: 1_000, endMs: 1_000 + MAX_QUOTE_MS }, "in", -250, null).startMs,
    ).toBe(1_000);
  });
});

describe("checkQuoteRange", () => {
  it("accepts an ordinary clip", () => {
    expect(checkQuoteRange({ startMs: 1_000, endMs: 9_000 }, 60_000)).toEqual({ ok: true });
  });
  it("refuses a clip that is too short, too long, negative or past the end", () => {
    expect(checkQuoteRange({ startMs: 1_000, endMs: 1_500 }, null).ok).toBe(false);
    expect(checkQuoteRange({ startMs: 0, endMs: MAX_QUOTE_MS + 1 }, null).ok).toBe(false);
    expect(checkQuoteRange({ startMs: -5, endMs: 9_000 }, null).ok).toBe(false);
    expect(checkQuoteRange({ startMs: 50_000, endMs: 70_000 }, 60_000).ok).toBe(false);
    expect(checkQuoteRange({ startMs: Number.NaN, endMs: 70_000 }, null).ok).toBe(false);
  });
});

describe("wordsInRange", () => {
  const tokens = [
    [
      { text: "Oh,", startMs: 0, endMs: 400 },
      { text: "no.", startMs: 400, endMs: 800 },
    ],
    [
      { text: "It", startMs: 1000, endMs: 1200 },
      { text: "was", startMs: 1200, endMs: 1500 },
      { text: "dark.", startMs: 1500, endMs: 2000 },
    ],
  ];
  it("returns the words whose middle falls inside the range, across lines", () => {
    expect(wordsInRange(tokens, { startMs: 900, endMs: 2100 })).toBe("It was dark.");
    expect(wordsInRange(tokens, { startMs: 0, endMs: 2100 })).toBe("Oh, no. It was dark.");
  });
  it("keeps or drops a half-cut word whole, by where most of it lies", () => {
    expect(wordsInRange(tokens, { startMs: 500, endMs: 2100 })).toBe("no. It was dark.");
    expect(wordsInRange(tokens, { startMs: 700, endMs: 2100 })).toBe("It was dark.");
  });
});

describe("sameStretch", () => {
  it("is true when half of the shorter clip is shared", () => {
    expect(sameStretch({ startMs: 0, endMs: 10_000 }, { startMs: 5_000, endMs: 20_000 })).toBe(
      true,
    );
    expect(sameStretch({ startMs: 0, endMs: 10_000 }, { startMs: 9_000, endMs: 20_000 })).toBe(
      false,
    );
    expect(sameStretch({ startMs: 0, endMs: 10_000 }, { startMs: 12_000, endMs: 20_000 })).toBe(
      false,
    );
  });
});

describe("formatClipTime", () => {
  it("shows a clip edge to the tenth", () => {
    expect(formatClipTime(769_000)).toBe("12:49.0");
    expect(formatClipTime(769_250)).toBe("12:49.2");
    expect(formatClipTime(-5)).toBe("0:00.0");
  });
});
