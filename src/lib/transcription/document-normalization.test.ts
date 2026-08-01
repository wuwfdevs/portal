import { describe, expect, it } from "vitest";
import {
  isNativeTextAdequate,
  buildNativeBlocksForPage,
  isStaleProcessingRun,
  type NativeTextItem,
  type NativeTextPage,
} from "./document-normalization";

function item(overrides: Partial<NativeTextItem> = {}): NativeTextItem {
  return {
    str: "word",
    x: 0,
    y: 0,
    width: 20,
    height: 12,
    fontSize: 12,
    hasEOL: false,
    ...overrides,
  };
}

describe("isNativeTextAdequate", () => {
  it("is false for an empty page list", () => {
    expect(isNativeTextAdequate([])).toBe(false);
  });

  it("is true for pages with normal prose", () => {
    const prose =
      "This is a normal paragraph of extracted text with plenty of readable content on it.";
    expect(
      isNativeTextAdequate([
        { pageNumber: 1, text: prose },
        { pageNumber: 2, text: prose },
      ]),
    ).toBe(true);
  });

  it("is false when pages are mostly empty (a scan with no text layer)", () => {
    expect(
      isNativeTextAdequate([
        { pageNumber: 1, text: "" },
        { pageNumber: 2, text: "  " },
        { pageNumber: 3, text: "x" },
      ]),
    ).toBe(false);
  });

  it("is false when text is present but mostly non-alphanumeric (garbled encoding)", () => {
    const garbled = "%%%///###@@@***&&&^^^!!!~~~```||||////%%%###@@@***&&&^^^!!!~~~```||||";
    expect(isNativeTextAdequate([{ pageNumber: 1, text: garbled.repeat(3) }])).toBe(false);
  });

  it("tolerates a minority of empty pages", () => {
    const prose = "Plenty of readable prose content spans this particular page just fine.";
    expect(
      isNativeTextAdequate([
        { pageNumber: 1, text: prose },
        { pageNumber: 2, text: prose },
        { pageNumber: 3, text: prose },
        { pageNumber: 4, text: "" },
      ]),
    ).toBe(true);
  });
});

describe("buildNativeBlocksForPage", () => {
  const basePage: NativeTextPage = {
    pageNumber: 3,
    widthPt: 612,
    heightPt: 792,
    items: [],
  };

  it("returns nothing for a page with no text", () => {
    expect(buildNativeBlocksForPage(basePage, 0)).toEqual([]);
  });

  it("groups consecutive lines into one paragraph block", () => {
    const page: NativeTextPage = {
      ...basePage,
      items: [
        item({ str: "First line", x: 72, y: 700, width: 100, hasEOL: true }),
        item({ str: "second line", x: 72, y: 688, width: 100, hasEOL: true }),
      ],
    };
    const blocks = buildNativeBlocksForPage(page, 5);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.pageNumber).toBe(3);
    expect(blocks[0]!.readingOrder).toBe(5);
    expect(blocks[0]!.blockType).toBe("paragraph");
    expect(blocks[0]!.text).toBe("First line\nsecond line");
    expect(blocks[0]!.source).toBe("native");
  });

  it("splits into separate blocks across a large vertical gap", () => {
    const page: NativeTextPage = {
      ...basePage,
      items: [
        item({ str: "Paragraph one", x: 72, y: 700, width: 100, hasEOL: true }),
        // A large gap (well beyond ordinary line spacing) signals a new block.
        item({ str: "Paragraph two", x: 72, y: 600, width: 100, hasEOL: true }),
      ],
    };
    const blocks = buildNativeBlocksForPage(page, 0);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.readingOrder).toBe(0);
    expect(blocks[1]!.readingOrder).toBe(1);
  });

  it("classifies a much-larger-font line as a heading", () => {
    const page: NativeTextPage = {
      ...basePage,
      items: [
        item({ str: "Big Title", x: 72, y: 740, width: 150, fontSize: 24, height: 24, hasEOL: true }),
        item({ str: "Body text follows here", x: 72, y: 700, width: 150, fontSize: 12, height: 12, hasEOL: true }),
        item({ str: "and continues", x: 72, y: 688, width: 150, fontSize: 12, height: 12, hasEOL: true }),
      ],
    };
    const blocks = buildNativeBlocksForPage(page, 0);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.blockType).toBe("heading");
    expect(blocks[0]!.text).toBe("Big Title");
    expect(blocks[1]!.blockType).toBe("paragraph");
  });

  it("computes a fractional top-left-origin bbox from PDF (bottom-left-origin) coordinates", () => {
    const page: NativeTextPage = {
      ...basePage,
      items: [item({ str: "hi", x: 61.2, y: 693, width: 61.2, height: 12, hasEOL: true })],
    };
    const [block] = buildNativeBlocksForPage(page, 0);
    expect(block!.bbox).not.toBeNull();
    expect(block!.bbox!.x0).toBeCloseTo(61.2 / 612, 4);
    expect(block!.bbox!.x1).toBeCloseTo((61.2 + 61.2) / 612, 4);
    // Top of the glyph (y + height) is higher up the page than its baseline,
    // so it maps to a *smaller* fractional-from-top y than the bottom edge.
    expect(block!.bbox!.y0).toBeLessThan(block!.bbox!.y1);
  });

  it("skips whitespace-only items", () => {
    const page: NativeTextPage = {
      ...basePage,
      items: [item({ str: "   ", hasEOL: true }), item({ str: "real text", y: 700, hasEOL: true })],
    };
    const blocks = buildNativeBlocksForPage(page, 0);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.text).toBe("real text");
  });
});

describe("isStaleProcessingRun", () => {
  const now = new Date("2026-07-31T12:00:00Z");

  it("is false for a run that started moments ago", () => {
    expect(isStaleProcessingRun("2026-07-31T11:59:00Z", now)).toBe(false);
  });

  it("is false right at the threshold", () => {
    expect(isStaleProcessingRun("2026-07-31T11:40:00Z", now, 20 * 60 * 1000)).toBe(false);
  });

  it("is true once a run has run past the threshold", () => {
    expect(isStaleProcessingRun("2026-07-31T11:30:00Z", now, 20 * 60 * 1000)).toBe(true);
  });

  it("accepts a Date as well as a string", () => {
    expect(isStaleProcessingRun(new Date("2026-07-31T11:30:00Z"), now, 20 * 60 * 1000)).toBe(true);
  });
});
