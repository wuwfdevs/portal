import { describe, expect, it } from "vitest";
import {
  MAX_QUOTE_MS,
  MIN_QUOTE_MS,
  checkQuoteRange,
  compareQuotes,
  emptyQuotesMessage,
  formatClipLength,
  formatClipRange,
  formatClipTime,
  guideBlocks,
  nudgeEdge,
  quoteAvailability,
  quoteStance,
  quoteCounts,
  sameStretch,
  wordsInRange,
} from "./quotes";

describe("compareQuotes", () => {
  const base = { sourceTitle: "Tom", startMs: 0, id: "a" };
  it("puts the strongest first, then the source, then the order spoken", () => {
    const quotes = [
      { ...base, id: "1", tier: "usable" as const, startMs: 5 },
      { ...base, id: "2", tier: "strong" as const, startMs: 90 },
      { ...base, id: "3", tier: "strong" as const, startMs: 10 },
      { ...base, id: "4", tier: "good" as const, sourceTitle: "Anna" },
    ];
    expect(quotes.sort(compareQuotes).map((quote) => quote.id)).toEqual(["3", "2", "4", "1"]);
  });
});

describe("quoteCounts", () => {
  it("counts each status", () => {
    expect(
      quoteCounts([
        { status: "suggested" },
        { status: "accepted" },
        { status: "accepted" },
        { status: "rejected" },
      ]),
    ).toEqual({ waiting: 1, accepted: 2, rejected: 1 });
  });
});

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

describe("emptyQuotesMessage", () => {
  it("says nothing while suggestions wait", () => {
    expect(emptyQuotesMessage({ waiting: 2, accepted: 0, rejected: 0 }, true)).toBe("");
  });
  it("tells the three empty states apart", () => {
    expect(emptyQuotesMessage({ waiting: 0, accepted: 0, rejected: 0 }, false)).toContain("yet");
    expect(emptyQuotesMessage({ waiting: 0, accepted: 1, rejected: 0 }, true)).toContain("decided");
    expect(emptyQuotesMessage({ waiting: 0, accepted: 0, rejected: 0 }, true)).toContain(
      "didn't find",
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

describe("guideBlocks", () => {
  it("splits plain text into paragraphs and lists", () => {
    expect(
      guideBlocks(
        "A good clip works on air.\nSecond line.\n\n- It sings.\n- It stands alone.\n\nPrefer showing.",
      ),
    ).toEqual([
      { kind: "paragraph", text: "A good clip works on air. Second line." },
      { kind: "list", items: ["It sings.", "It stands alone."] },
      { kind: "paragraph", text: "Prefer showing." },
    ]);
  });
  it("keeps a list that follows a sentence in the same block", () => {
    expect(guideBlocks("Aim for:\n- one\n- two")).toEqual([
      { kind: "paragraph", text: "Aim for:" },
      { kind: "list", items: ["one", "two"] },
    ]);
  });
  it("returns nothing for blank text", () => {
    expect(guideBlocks("  \n\n ")).toEqual([]);
  });
});

describe("quoteStance", () => {
  it("complicates only when every data point behind it does", () => {
    expect(quoteStance(["complicates"])).toBe("complicates");
    expect(quoteStance(["complicates", "complicates"])).toBe("complicates");
    expect(quoteStance(["complicates", "supports"])).toBe("supports");
    expect(quoteStance([])).toBe("supports");
  });
});

describe("quoteAvailability", () => {
  it("offers quotes for an accepted theme with evidence from a recording", () => {
    expect(
      quoteAvailability({ themeStatus: "accepted", evidence: [{ hasRecordingSpan: true }] }),
    ).toEqual({ canSuggest: true, reason: null });
  });
  it("says why when it can't", () => {
    expect(quoteAvailability({ themeStatus: "suggested", evidence: [] }).reason).toContain(
      "Accept",
    );
    expect(quoteAvailability({ themeStatus: "accepted", evidence: [] }).reason).toContain(
      "no accepted data points",
    );
    expect(
      quoteAvailability({ themeStatus: "accepted", evidence: [{ hasRecordingSpan: false }] })
        .reason,
    ).toContain("documents");
  });
});
