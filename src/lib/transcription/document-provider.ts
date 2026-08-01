// Provider-agnostic shape the document-processing pipeline works with. Pure
// types only — no "server-only", no fetch — so the concrete implementation
// (native extraction or Mistral OCR, providers/<name>.ts) stays a swappable,
// contained piece behind this interface. Mirrors asr-provider.ts's role for
// the transcript pipeline. See docs/sourcework-design.md §8.6.

import type { SwDocumentBlockType } from "@/lib/database.types";

export interface NormalizedDocumentPage {
  pageNumber: number; // 1-based
  widthPt: number | null;
  heightPt: number | null;
  rotationDegrees: number;
}

export interface NormalizedDocumentBlock {
  pageNumber: number;
  /** 0-based position within the whole document, spanning pages — see sw_document_blocks.reading_order. */
  readingOrder: number;
  blockType: SwDocumentBlockType;
  text: string;
  /** Fractional {x0,y0,x1,y1} of page width/height, or null when not recoverable. */
  bbox: { x0: number; y0: number; x1: number; y1: number } | null;
  /** 0..1, null when not applicable (native extraction) or not available. */
  confidence: number | null;
  source: "native" | "ocr";
  extra?: Record<string, unknown>;
}

export interface NormalizedDocumentResult {
  pages: NormalizedDocumentPage[];
  blocks: NormalizedDocumentBlock[];
}

export type DocumentProcessingMethod = "native" | "ocr";

export interface DocumentOcrInput {
  /** Signed URL the provider fetches the source PDF from. */
  documentUrl: string;
}

export interface DocumentOcrResult extends NormalizedDocumentResult {
  provider: string;
  model: string;
  /** Provider's raw payload — retained for diagnostics, never the primary model. See sw_document_processing_runs.raw_response. */
  raw: unknown;
}

export interface DocumentOcrProvider {
  process(input: DocumentOcrInput): Promise<DocumentOcrResult>;
}

export class DocumentProcessingError extends Error {}
