import { describe, expect, it } from "vitest";
import { mapMistralResponseToDocument } from "./mistral-ocr-mapping";
import type { OCRResponse } from "@mistralai/mistralai/models/components";

function response(overrides: Partial<OCRResponse> = {}): OCRResponse {
  return {
    model: "mistral-ocr-latest",
    usageInfo: { pagesProcessed: 1, docSizeBytes: 1024 },
    pages: [],
    ...overrides,
  };
}

describe("mapMistralResponseToDocument", () => {
  it("maps pages 0-based index to 1-based pageNumber, converting pixel dimensions to points", () => {
    const result = mapMistralResponseToDocument(
      response({
        pages: [
          {
            index: 0,
            markdown: "# Hello",
            images: [],
            dimensions: { dpi: 200, width: 1700, height: 2200 },
            blocks: [
              {
                type: "title",
                topLeftX: 100,
                topLeftY: 50,
                bottomRightX: 800,
                bottomRightY: 150,
                content: "Hello",
              },
            ],
          },
        ],
      }),
    );

    expect(result.pages).toEqual([
      { pageNumber: 1, widthPt: (1700 / 200) * 72, heightPt: (2200 / 200) * 72, rotationDegrees: 0 },
    ]);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]!.pageNumber).toBe(1);
    expect(result.blocks[0]!.blockType).toBe("heading");
    expect(result.blocks[0]!.text).toBe("Hello");
    expect(result.blocks[0]!.bbox).toEqual({
      x0: 100 / 1700,
      y0: 50 / 2200,
      x1: 800 / 1700,
      y1: 150 / 2200,
    });
  });

  it("maps every known Mistral block type to a Sourcework block_type", () => {
    const dims = { dpi: 100, width: 1000, height: 1000 };
    const coords = { topLeftX: 0, topLeftY: 0, bottomRightX: 100, bottomRightY: 100 };
    const result = mapMistralResponseToDocument(
      response({
        pages: [
          {
            index: 0,
            markdown: "",
            images: [],
            dimensions: dims,
            blocks: [
              { type: "text", content: "a", ...coords },
              { type: "title", content: "b", ...coords },
              { type: "list", content: "c", ...coords },
              { type: "table", content: "d", ...coords },
              { type: "header", content: "e", ...coords },
              { type: "footer", content: "f", ...coords },
              { type: "caption", content: "g", ...coords },
              { type: "image", content: "h", imageId: "img-1", ...coords },
              { type: "code", content: "i", ...coords },
            ],
          },
        ],
      }),
    );

    expect(result.blocks.map((b) => b.blockType)).toEqual([
      "paragraph",
      "heading",
      "list_item",
      "table",
      "header",
      "footer",
      "caption",
      "figure",
      "other",
    ]);
  });

  it("assigns document-wide reading order across pages", () => {
    const dims = { dpi: 100, width: 1000, height: 1000 };
    const coords = { topLeftX: 0, topLeftY: 0, bottomRightX: 10, bottomRightY: 10 };
    const result = mapMistralResponseToDocument(
      response({
        pages: [
          {
            index: 0,
            markdown: "",
            images: [],
            dimensions: dims,
            blocks: [{ type: "text", content: "p1b1", ...coords }, { type: "text", content: "p1b2", ...coords }],
          },
          {
            index: 1,
            markdown: "",
            images: [],
            dimensions: dims,
            blocks: [{ type: "text", content: "p2b1", ...coords }],
          },
        ],
      }),
    );

    expect(result.blocks.map((b) => [b.pageNumber, b.readingOrder, b.text])).toEqual([
      [1, 0, "p1b1"],
      [1, 1, "p1b2"],
      [2, 2, "p2b1"],
    ]);
  });

  it("falls back to a page-markdown block when no structured blocks were returned", () => {
    const result = mapMistralResponseToDocument(
      response({
        pages: [
          {
            index: 0,
            markdown: "Just some markdown text.",
            images: [],
            dimensions: null,
          },
        ],
      }),
    );

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]!.text).toBe("Just some markdown text.");
    expect(result.blocks[0]!.bbox).toBeNull();
    expect(result.blocks[0]!.extra).toEqual({ mistralFallback: "page-markdown" });
  });

  it("produces no block for a blank page with no structured blocks", () => {
    const result = mapMistralResponseToDocument(
      response({
        pages: [{ index: 0, markdown: "   ", images: [], dimensions: null }],
      }),
    );
    expect(result.blocks).toHaveLength(0);
    expect(result.pages).toHaveLength(1);
  });

  it("applies the page's average confidence score to every block on that page", () => {
    const dims = { dpi: 100, width: 1000, height: 1000 };
    const coords = { topLeftX: 0, topLeftY: 0, bottomRightX: 10, bottomRightY: 10 };
    const result = mapMistralResponseToDocument(
      response({
        pages: [
          {
            index: 0,
            markdown: "",
            images: [],
            dimensions: dims,
            confidenceScores: {
              averagePageConfidenceScore: 0.87,
              minimumPageConfidenceScore: 0.5,
            },
            blocks: [{ type: "text", content: "a", ...coords }],
          },
        ],
      }),
    );
    expect(result.blocks[0]!.confidence).toBe(0.87);
  });

  it("leaves bbox null when the page has no dimensions", () => {
    const coords = { topLeftX: 0, topLeftY: 0, bottomRightX: 10, bottomRightY: 10 };
    const result = mapMistralResponseToDocument(
      response({
        pages: [
          {
            index: 0,
            markdown: "",
            images: [],
            dimensions: null,
            blocks: [{ type: "text", content: "a", ...coords }],
          },
        ],
      }),
    );
    expect(result.blocks[0]!.bbox).toBeNull();
  });

  it("preserves a table block's tableId in extra", () => {
    const dims = { dpi: 100, width: 1000, height: 1000 };
    const coords = { topLeftX: 0, topLeftY: 0, bottomRightX: 10, bottomRightY: 10 };
    const result = mapMistralResponseToDocument(
      response({
        pages: [
          {
            index: 0,
            markdown: "",
            images: [],
            dimensions: dims,
            blocks: [{ type: "table", content: "| a |", tableId: "tbl-1", ...coords }],
          },
        ],
      }),
    );
    expect(result.blocks[0]!.extra).toEqual({ mistralType: "table", tableId: "tbl-1" });
  });
});
