// Pure mapping from Mistral's OCR response shape into Sourcework's
// normalized document model — the provider boundary docs/sourcework-design.md
// §8.6 requires: Mistral's response format is never Sourcework's canonical
// data model. No network, no SDK import — testable against constructed
// fixtures, mirroring providers/assemblyai-mapping.ts's split from
// assemblyai.ts.
//
// Field names here match the installed @mistralai/mistralai SDK's own
// TypeScript types (src/models/components/ocrresponse.ts,
// ocrpageobject.ts, and the individual ocr*block.ts files) as of this
// writing — see design doc §8.6 on why the SDK's own types, not
// docs.mistral.ai (which returns 403 to automated fetches here), are the
// verification source.

import type { OCRResponse, OCRPageObject } from "@mistralai/mistralai/models/components";
import type {
  NormalizedDocumentBlock,
  NormalizedDocumentResult,
} from "@/lib/transcription/document-provider";
import type { SwDocumentBlockType } from "@/lib/database.types";

type MistralBlock = NonNullable<OCRPageObject["blocks"]>[number];

const BLOCK_TYPE_MAP: Record<string, SwDocumentBlockType> = {
  text: "paragraph",
  title: "heading",
  list: "list_item",
  table: "table",
  header: "header",
  footer: "footer",
  caption: "caption",
  image: "figure",
  code: "other",
  equation: "other",
  signature: "other",
  aside_text: "other",
  references: "other",
};

/** Converts an official OCRResponse into Sourcework's page/block model. Never throws on missing optional fields — a field Mistral doesn't return just becomes null/omitted here, not a processing failure. */
export function mapMistralResponseToDocument(response: OCRResponse): NormalizedDocumentResult {
  const pages: NormalizedDocumentResult["pages"] = [];
  const blocks: NormalizedDocumentBlock[] = [];
  let readingOrder = 0;

  for (const page of response.pages) {
    const pageNumber = page.index + 1; // Mistral's index is 0-based.
    const dims = page.dimensions;
    // Mistral's OCR response doesn't expose the page's own rotation — unlike
    // the native-extraction path, which reads it straight off the PDF (see
    // providers/native-pdf.ts). Recorded as 0 rather than guessed.
    pages.push({
      pageNumber,
      widthPt: dims ? (dims.width / dims.dpi) * 72 : null,
      heightPt: dims ? (dims.height / dims.dpi) * 72 : null,
      rotationDegrees: 0,
    });

    // averagePageConfidenceScore is present whenever confidence scores were
    // requested at all (word or page granularity) — used as every block's
    // confidence on this page, a deliberately coarse per-page figure rather
    // than an invented per-block one (see design doc §8.6).
    const pageConfidence = page.confidenceScores?.averagePageConfidenceScore ?? null;

    const pageBlocks = page.blocks;
    if (pageBlocks && pageBlocks.length > 0) {
      for (const block of pageBlocks) {
        blocks.push(mapBlock(block, pageNumber, readingOrder, dims, pageConfidence));
        readingOrder += 1;
      }
    } else if (page.markdown.trim().length > 0) {
      // Defensive fallback if includeBlocks wasn't honored for some reason —
      // still traceable to a page, just without block-level structure/bbox.
      blocks.push({
        pageNumber,
        readingOrder,
        blockType: "paragraph",
        text: page.markdown,
        bbox: null,
        confidence: pageConfidence,
        source: "ocr",
        extra: { mistralFallback: "page-markdown" },
      });
      readingOrder += 1;
    }
  }

  return { pages, blocks };
}

function mapBlock(
  block: MistralBlock,
  pageNumber: number,
  readingOrder: number,
  dims: OCRPageObject["dimensions"],
  pageConfidence: number | null,
): NormalizedDocumentBlock {
  const mistralType = "type" in block ? String(block.type) : "other";
  const blockType = BLOCK_TYPE_MAP[mistralType] ?? "other";

  const hasCoords =
    "topLeftX" in block &&
    "topLeftY" in block &&
    "bottomRightX" in block &&
    "bottomRightY" in block;

  const bbox =
    hasCoords && dims
      ? {
          x0: (block as { topLeftX: number }).topLeftX / dims.width,
          y0: (block as { topLeftY: number }).topLeftY / dims.height,
          x1: (block as { bottomRightX: number }).bottomRightX / dims.width,
          y1: (block as { bottomRightY: number }).bottomRightY / dims.height,
        }
      : null;

  const text = "content" in block ? String(block.content) : "";
  const extra: Record<string, unknown> = { mistralType };
  if ("tableId" in block && block.tableId) extra.tableId = block.tableId;

  return {
    pageNumber,
    readingOrder,
    blockType,
    text,
    bbox,
    confidence: pageConfidence,
    source: "ocr",
    extra,
  };
}
