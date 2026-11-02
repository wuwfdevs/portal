import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import type { SwDocumentBlockType } from "@/lib/database.types";

// A document_text representation's normalized content — pages + blocks, in
// reading order. The document-workspace counterpart to
// getTranscriptForRepresentation. See docs/sourcework-design.md §8.4/§8.5.

export interface DocumentPageSummary {
  id: string;
  pageNumber: number;
  widthPt: number | null;
  heightPt: number | null;
  rotationDegrees: number;
}

export interface DocumentBlockLineSummary {
  startOffset: number;
  endOffset: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface DocumentBlockSummary {
  id: string;
  pageNumber: number;
  readingOrder: number;
  blockType: SwDocumentBlockType;
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Native extraction only: per-line offset ranges + bbox, finer than this block's own bbox. Empty for OCR blocks — see NormalizedDocumentBlock.lines. */
  lines: DocumentBlockLineSummary[];
  confidence: number | null;
}

export interface DocumentContent {
  pages: DocumentPageSummary[];
  blocks: DocumentBlockSummary[];
}

export async function getDocumentContentForRepresentation(
  representationId: string,
): Promise<DocumentContent> {
  const supabase = await createClient();
  const [pageResult, blockResult] = await Promise.all([
    supabase
      .from("sw_document_pages")
      .select("id, page_number, width_pt, height_pt, rotation_degrees")
      .eq("representation_id", representationId)
      .order("page_number"),
    supabase
      .from("sw_document_blocks")
      .select("id, page_number, reading_order, block_type, text, bbox, lines, confidence")
      .eq("representation_id", representationId)
      .order("reading_order"),
  ]);

  const pages = unwrapRead(pageResult, "this document's pages") ?? [];
  const blocks = unwrapRead(blockResult, "this document's text") ?? [];

  return {
    pages: pages.map((row) => ({
      id: row.id,
      pageNumber: row.page_number,
      widthPt: row.width_pt,
      heightPt: row.height_pt,
      rotationDegrees: row.rotation_degrees,
    })),
    blocks: blocks.map((row) => ({
      id: row.id,
      pageNumber: row.page_number,
      readingOrder: row.reading_order,
      blockType: row.block_type,
      text: row.text,
      bbox: row.bbox,
      lines: row.lines,
      confidence: row.confidence,
    })),
  };
}
