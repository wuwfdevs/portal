import { describe, expect, it } from "vitest";
import {
  buildDocumentUnits,
  buildTranscriptUnits,
  dropOverlapping,
  endsSentence,
  mergeRanges,
  overlapRatio,
  renderUnits,
  resolveSpans,
  splitSentences,
  unitIdsForSpan,
  windowUnits,
  type ExtractionUnit,
} from "./extraction-units";

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

function segment(startMs: number, text: string, speakerLabel = "Tom Reyes") {
  const texts = text.split(/\s+/);
  const words = texts.map((w, i) => ({ w, s: startMs + i * 400, e: startMs + i * 400 + 350 }));
  return { startMs, endMs: startMs + texts.length * 400, text, words, speakerLabel };
}

describe("endsSentence", () => {
  it("ends on terminal punctuation, with a closing quote allowed", () => {
    expect(endsSentence("black.")).toBe(true);
    expect(endsSentence("kid?")).toBe(true);
    expect(endsSentence('said."')).toBe(true);
  });
  it("does not end on an abbreviation or an initial", () => {
    expect(endsSentence("Mr.")).toBe(false);
    expect(endsSentence("St.")).toBe(false);
    expect(endsSentence("J.")).toBe(false);
    expect(endsSentence("U.S.")).toBe(false);
  });
  it("does not end mid-sentence", () => {
    expect(endsSentence("flashlight,")).toBe(false);
    expect(endsSentence("the")).toBe(false);
  });
});

describe("splitSentences", () => {
  it("splits at sentence ends and keeps a trailing fragment", () => {
    const tokens = "It was dark. We went in and then".split(" ").map((text) => ({ text }));
    expect(splitSentences(tokens)).toEqual([
      [0, 2],
      [3, 7],
    ]);
  });
  it("breaks a run with no punctuation at the word cap", () => {
    const tokens = Array.from({ length: 150 }, () => ({ text: "word" }));
    const ranges = splitSentences(tokens);
    expect(ranges.length).toBe(3);
    expect(ranges[0]).toEqual([0, 69]);
  });
});

describe("buildTranscriptUnits", () => {
  it("numbers sentences across segments and times them from the words", () => {
    const { units, groups } = buildTranscriptUnits(
      [
        segment(36_000, "What do you remember about the fort?", "Interviewer"),
        segment(41_000, "We were nine. There was a gap in the fence."),
      ],
      fmt,
    );
    expect(units.map((unit) => unit.id)).toEqual([1, 2, 3]);
    expect(units[1]).toMatchObject({ segmentIndex: 1, startMs: 41_000, text: "We were nine." });
    expect(units[2]!.startMs).toBe(41_000 + 3 * 400);
    expect(groups.map((group) => group.label)).toEqual(["0:36 · Interviewer", "0:41 · Tom Reyes"]);
  });

  it("renders a header per line and a numbered sentence under it", () => {
    const { units, groups } = buildTranscriptUnits([segment(0, "Hello there. Goodbye.")], fmt);
    expect(renderUnits(units, groups)).toBe("## 0:00 · Tom Reyes\n[1] Hello there.\n[2] Goodbye.");
  });
});

describe("buildDocumentUnits", () => {
  it("skips page furniture and empty blocks and groups by page", () => {
    const { units, groups } = buildDocumentUnits([
      { id: "h", pageNumber: 1, blockType: "header", text: "BASE NEWS" },
      { id: "a", pageNumber: 1, blockType: "paragraph", text: "  The   gate closed. " },
      { id: "b", pageNumber: 1, blockType: "paragraph", text: "   " },
      { id: "c", pageNumber: 2, blockType: "paragraph", text: "Later." },
    ]);
    expect(units).toEqual([
      { id: 1, groupIndex: 1, text: "The gate closed.", blockId: "a", pageNumber: 1 },
      { id: 2, groupIndex: 2, text: "Later.", blockId: "c", pageNumber: 2 },
    ]);
    expect(groups.map((group) => group.label)).toEqual(["Page 1", "Page 2"]);
  });
});

describe("windowUnits", () => {
  const make = (count: number, words = 10): ExtractionUnit[] =>
    Array.from({ length: count }, (_, index) => ({
      id: index + 1,
      groupIndex: 0,
      text: Array.from({ length: words }, () => "w").join(" "),
    }));

  it("keeps a short source whole", () => {
    expect(windowUnits(make(5))).toHaveLength(1);
  });

  it("overlaps windows by about the overlap and covers every unit", () => {
    const units = make(100); // 1000 words
    const windows = windowUnits(units, { maxWords: 300, overlapWords: 50 });
    expect(windows.length).toBeGreaterThan(3);
    const covered = new Set(windows.flat().map((unit) => unit.id));
    expect(covered.size).toBe(100);
    const firstEnd = windows[0]!.at(-1)!.id;
    const secondStart = windows[1]![0]!.id;
    expect(secondStart).toBeLessThanOrEqual(firstEnd);
    expect(firstEnd - secondStart + 1).toBeLessThanOrEqual(5);
    for (const window of windows) expect(window.length * 10).toBeLessThanOrEqual(300);
  });

  it("always advances, even past one oversize unit", () => {
    const windows = windowUnits(make(3, 500), { maxWords: 100, overlapWords: 50 });
    expect(windows.map((window) => window.length)).toEqual([1, 1, 1]);
  });
});

describe("mergeRanges / resolveSpans", () => {
  it("merges overlapping and touching ranges", () => {
    expect(
      mergeRanges([
        { from: 5, to: 6 },
        { from: 1, to: 2 },
        { from: 3, to: 3 },
        { from: 6, to: 8 },
      ]),
    ).toEqual([
      { from: 1, to: 3 },
      { from: 5, to: 8 },
    ]);
  });

  it("makes one time span per run of transcript units", () => {
    const { units } = buildTranscriptUnits([segment(0, "One. Two. Three. Four.")], fmt);
    const byId = new Map(units.map((unit) => [unit.id, unit]));
    const spans = resolveSpans([{ from: 1, to: 2 }, { from: 4, to: 4 }], byId);
    expect(spans).toEqual([
      { kind: "temporal", startMs: 0, endMs: units[1]!.endMs },
      { kind: "temporal", startMs: units[3]!.startMs, endMs: units[3]!.endMs },
    ]);
  });

  it("splits a document run at a page break", () => {
    const { units } = buildDocumentUnits([
      { id: "a", pageNumber: 1, blockType: "paragraph", text: "A." },
      { id: "b", pageNumber: 1, blockType: "paragraph", text: "B." },
      { id: "c", pageNumber: 2, blockType: "paragraph", text: "C." },
    ]);
    const byId = new Map(units.map((unit) => [unit.id, unit]));
    expect(resolveSpans([{ from: 1, to: 3 }], byId)).toEqual([
      { kind: "document", pageNumber: 1, firstBlockId: "a", lastBlockId: "b" },
      { kind: "document", pageNumber: 2, firstBlockId: "c", lastBlockId: "c" },
    ]);
  });
});

describe("unitIdsForSpan", () => {
  it("finds the transcript units a time span overlaps", () => {
    const { units } = buildTranscriptUnits([segment(0, "One. Two. Three.")], fmt);
    const ids = unitIdsForSpan({ kind: "temporal", startMs: units[1]!.startMs!, endMs: units[2]!.endMs! }, units);
    expect([...ids]).toEqual([2, 3]);
  });

  it("finds a document span's blocks on its page, and falls back to the page when blocks are gone", () => {
    const { units } = buildDocumentUnits([
      { id: "a", pageNumber: 1, blockType: "paragraph", text: "A." },
      { id: "b", pageNumber: 1, blockType: "paragraph", text: "B." },
      { id: "c", pageNumber: 1, blockType: "paragraph", text: "C." },
    ]);
    expect([...unitIdsForSpan({ kind: "document", pageNumber: 1, firstBlockId: "b", lastBlockId: "c" }, units)]).toEqual([2, 3]);
    expect([...unitIdsForSpan({ kind: "document", pageNumber: 1, firstBlockId: null, lastBlockId: null }, units)]).toEqual([1, 2, 3]);
  });
});

describe("overlap", () => {
  it("measures against the smaller set", () => {
    expect(overlapRatio(new Set([1, 2]), new Set([2, 3, 4, 5]))).toBe(0.5);
    expect(overlapRatio(new Set([2]), new Set([1, 2, 3]))).toBe(1);
    expect(overlapRatio(new Set(), new Set([1]))).toBe(0);
  });

  it("drops the later of two candidates on the same passage and bearing, not a different bearing", () => {
    const point = (ids: number[], relevance: string, questionKey: string | null) => ({
      unitIds: new Set(ids),
      relevance,
      questionKey,
    });
    const { kept, dropped } = dropOverlapping([
      point([1, 2, 3], "question", "q1"),
      point([2, 3], "question", "q1"),
      point([2, 3], "question", "q2"),
      point([2, 3], "story", null),
      point([9], "question", "q1"),
    ]);
    expect(dropped).toBe(1);
    expect(kept).toHaveLength(4);
  });
});
