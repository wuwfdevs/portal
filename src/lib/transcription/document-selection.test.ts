import { describe, expect, it } from "vitest";
import { resolveDocumentSelection, type SelectableBlock } from "./document-selection";

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
