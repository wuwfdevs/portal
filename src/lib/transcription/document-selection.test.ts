import { describe, expect, it } from "vitest";
import {
  buildExcerptRuns,
  excerptAtOffset,
  resolveDocumentSelection,
  type ExcerptCharRange,
  type SelectableBlock,
} from "./document-selection";

const blocks: SelectableBlock[] = [
  { id: "b1", pageNumber: 1, readingOrder: 0, text: "First paragraph text." },
  { id: "b2", pageNumber: 1, readingOrder: 1, text: "Second paragraph text." },
  { id: "b3", pageNumber: 2, readingOrder: 2, text: "Third paragraph on page two." },
];

describe("resolveDocumentSelection", () => {
  it("resolves a selection within a single block", () => {
    const result = resolveDocumentSelection(blocks, { blockId: "b1", offset: 0 }, { blockId: "b1", offset: 5 });
    expect(result).toEqual({
      excerpt: "First",
      locations: [{ pageNumber: 1, blockId: "b1", startOffset: 0, endOffset: 5 }],
    });
  });

  it("resolves a selection spanning two blocks on the same page", () => {
    const result = resolveDocumentSelection(
      blocks,
      { blockId: "b1", offset: 6 },
      { blockId: "b2", offset: 6 },
    );
    expect(result?.locations).toEqual([
      { pageNumber: 1, blockId: "b1", startOffset: 6, endOffset: blocks[0]!.text.length },
      { pageNumber: 1, blockId: "b2", startOffset: 0, endOffset: 6 },
    ]);
    expect(result?.excerpt).toBe("paragraph text.\n\nSecond");
  });

  it("resolves a selection spanning a page boundary", () => {
    const result = resolveDocumentSelection(
      blocks,
      { blockId: "b2", offset: 0 },
      { blockId: "b3", offset: 5 },
    );
    expect(result?.locations.map((l) => l.pageNumber)).toEqual([1, 2]);
  });

  it("handles the anchors arriving in reverse order (end before start in the DOM)", () => {
    const forward = resolveDocumentSelection(blocks, { blockId: "b1", offset: 0 }, { blockId: "b2", offset: 6 });
    const backward = resolveDocumentSelection(blocks, { blockId: "b2", offset: 6 }, { blockId: "b1", offset: 0 });
    expect(backward).toEqual(forward);
  });

  it("returns null for an unknown block id", () => {
    expect(resolveDocumentSelection(blocks, { blockId: "nope", offset: 0 }, { blockId: "b1", offset: 5 })).toBeNull();
  });

  it("returns null for a zero-width single-block selection", () => {
    expect(resolveDocumentSelection(blocks, { blockId: "b1", offset: 3 }, { blockId: "b1", offset: 3 })).toBeNull();
  });

  it("takes middle blocks in full when a selection spans three or more blocks", () => {
    const result = resolveDocumentSelection(blocks, { blockId: "b1", offset: 0 }, { blockId: "b3", offset: 5 });
    expect(result?.locations[1]).toEqual({
      pageNumber: 1,
      blockId: "b2",
      startOffset: 0,
      endOffset: blocks[1]!.text.length,
    });
  });
});

describe("buildExcerptRuns", () => {
  const text = "First paragraph text.";

  it("returns the whole text as one uncovered run when there are no excerpts", () => {
    expect(buildExcerptRuns(text, [])).toEqual([{ text, excerptIds: [] }]);
  });

  it("returns one covered run when an excerpt spans the whole block", () => {
    const ranges: ExcerptCharRange[] = [{ excerptId: "e1", startOffset: 0, endOffset: text.length }];
    expect(buildExcerptRuns(text, ranges)).toEqual([{ text, excerptIds: ["e1"] }]);
  });

  it("splits before/inside/after a partial excerpt", () => {
    const ranges: ExcerptCharRange[] = [{ excerptId: "e1", startOffset: 6, endOffset: 15 }];
    expect(buildExcerptRuns(text, ranges)).toEqual([
      { text: "First ", excerptIds: [] },
      { text: "paragraph", excerptIds: ["e1"] },
      { text: " text.", excerptIds: [] },
    ]);
  });

  it("lists every excerpt covering an overlapping run, unbroken", () => {
    const ranges: ExcerptCharRange[] = [
      { excerptId: "e1", startOffset: 0, endOffset: 9 },
      { excerptId: "e2", startOffset: 6, endOffset: 15 },
    ];
    const runs = buildExcerptRuns(text, ranges);
    expect(runs.map((r) => r.text)).toEqual(["First ", "par", "agraph", " text."]);
    expect(runs[1]).toEqual({ text: "par", excerptIds: ["e1", "e2"] });
    expect(runs[2]).toEqual({ text: "agraph", excerptIds: ["e2"] });
  });

  it("returns one uncovered run for empty text", () => {
    expect(buildExcerptRuns("", [{ excerptId: "e1", startOffset: 0, endOffset: 0 }])).toEqual([
      { text: "", excerptIds: [] },
    ]);
  });
});

describe("excerptAtOffset", () => {
  const ranges: ExcerptCharRange[] = [
    { excerptId: "wide", startOffset: 0, endOffset: 20 },
    { excerptId: "narrow", startOffset: 5, endOffset: 10 },
  ];

  it("returns null when nothing covers the offset", () => {
    expect(excerptAtOffset(ranges, 25)).toBeNull();
  });

  it("returns the covering excerpt", () => {
    expect(excerptAtOffset(ranges, 12)).toBe("wide");
  });

  it("prefers the shortest (most specific) excerpt on overlap", () => {
    expect(excerptAtOffset(ranges, 7)).toBe("narrow");
  });

  it("treats endOffset as exclusive", () => {
    expect(excerptAtOffset(ranges, 20)).toBeNull();
  });
});
