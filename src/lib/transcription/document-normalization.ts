// Pure, dependency-free document-processing logic: deciding whether a PDF's
// own embedded text is usable, and grouping raw text-extraction items into
// paragraph-level blocks. No "server-only", no pdfjs-dist import — testable
// under Vitest without mocking a PDF parser, per this repo's testing
// conventions. See docs/sourcework-design.md §8.6.

import type { NormalizedDocumentBlock } from "./document-provider";

export interface NativeExtractionPageSummary {
  pageNumber: number;
  text: string;
}

// Heuristic thresholds, not exhaustive detection — see design doc §8.6.
// "Adequate" means "usable prose", not "typeset-perfect".
const MIN_AVG_CHARS_PER_PAGE = 40;
const MAX_EMPTY_PAGE_FRACTION = 0.3;
const MIN_ALPHANUMERIC_RATIO = 0.4;
const EMPTY_PAGE_CHAR_THRESHOLD = 10;

/**
 * Whether a PDF's own embedded text layer is usable prose, or near-empty/
 * garbled the way a scanned page with no text layer produces. Reporters
 * never see this decision directly — it just picks native extraction vs.
 * Mistral OCR for one "Process document" operation (see document-ingest.ts).
 */
export function isNativeTextAdequate(pages: NativeExtractionPageSummary[]): boolean {
  if (pages.length === 0) return false;

  const totalChars = pages.reduce((sum, page) => sum + page.text.trim().length, 0);
  const avgCharsPerPage = totalChars / pages.length;
  if (avgCharsPerPage < MIN_AVG_CHARS_PER_PAGE) return false;

  const emptyPages = pages.filter(
    (page) => page.text.trim().length < EMPTY_PAGE_CHAR_THRESHOLD,
  ).length;
  if (emptyPages / pages.length > MAX_EMPTY_PAGE_FRACTION) return false;

  const allText = pages.map((page) => page.text).join("");
  const nonWhitespace = allText.replace(/\s/g, "");
  if (nonWhitespace.length > 0) {
    const alphanumeric = nonWhitespace.match(/[a-zA-Z0-9]/g)?.length ?? 0;
    if (alphanumeric / nonWhitespace.length < MIN_ALPHANUMERIC_RATIO) return false;
  }

  return true;
}

/** One text run as pdfjs-dist's getTextContent() reports it, in PDF user-space (origin bottom-left, y up). */
export interface NativeTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  /** pdfjs already computes this — whether a line break follows this run. */
  hasEOL: boolean;
}

export interface NativeTextPage {
  pageNumber: number;
  widthPt: number;
  heightPt: number;
  items: NativeTextItem[];
}

// A new paragraph starts when the gap between consecutive lines' baselines
// exceeds this multiple of the shorter line's own height — ordinary line
// spacing within a paragraph is close to 1x; a blank line or section break
// opens up noticeably more.
const PARAGRAPH_GAP_MULTIPLIER = 1.6;
// A line is classified as a heading when its font size is at least this many
// times the page's median — a modest, deliberately non-exhaustive heuristic
// (see design doc §8.6: no attempt at finer structural detection on the
// native path).
const HEADING_FONT_SIZE_MULTIPLIER = 1.3;

/**
 * Groups a page's raw text items into paragraph-level blocks by vertical
 * gap, with a font-size heading heuristic. Reading order within the page
 * follows item order, which is pdfjs-dist's own content-stream order — a
 * reasonable proxy for reading order on simple single-column layouts, and
 * an acknowledged approximation on multi-column ones (see design doc §8.6's
 * scope: this is "good enough," not typeset-perfect structure recovery).
 *
 * `startReadingOrder` lets the caller assign document-wide (not
 * page-local) reading_order values across a multi-page document.
 */
export function buildNativeBlocksForPage(
  page: NativeTextPage,
  startReadingOrder: number,
): NormalizedDocumentBlock[] {
  const items = page.items.filter((item) => item.str.trim().length > 0);
  if (items.length === 0) return [];

  const fontSizes = [...items.map((item) => item.fontSize)].sort((a, b) => a - b);
  const medianFontSize = fontSizes[Math.floor(fontSizes.length / 2)] ?? 0;

  type Line = { items: NativeTextItem[]; y: number; fontSize: number };
  const lines: Line[] = [];
  let current: NativeTextItem[] = [];
  for (const item of items) {
    current.push(item);
    if (item.hasEOL) {
      lines.push(lineFromItems(current));
      current = [];
    }
  }
  if (current.length > 0) lines.push(lineFromItems(current));

  const blocks: NormalizedDocumentBlock[] = [];
  let paragraphLines: Line[] = [];
  let readingOrder = startReadingOrder;

  const flush = () => {
    if (paragraphLines.length === 0) return;
    blocks.push(
      buildBlockFromLines(paragraphLines, page, readingOrder, medianFontSize),
    );
    readingOrder += 1;
    paragraphLines = [];
  };

  for (const line of lines) {
    if (paragraphLines.length > 0) {
      const previous = paragraphLines[paragraphLines.length - 1]!;
      const gap = Math.abs(previous.y - line.y);
      const lineHeight = Math.min(previous.fontSize, line.fontSize) || 1;
      const fontSizeChanged =
        Math.max(previous.fontSize, line.fontSize) /
          (Math.min(previous.fontSize, line.fontSize) || 1) >
        HEADING_FONT_SIZE_MULTIPLIER;
      if (gap > lineHeight * PARAGRAPH_GAP_MULTIPLIER || fontSizeChanged) {
        flush();
      }
    }
    paragraphLines.push(line);
  }
  flush();

  return blocks;
}

function lineFromItems(items: NativeTextItem[]) {
  const y = items.reduce((sum, item) => sum + item.y, 0) / items.length;
  const fontSize = items.reduce((sum, item) => sum + item.fontSize, 0) / items.length;
  return { items, y, fontSize };
}

function buildBlockFromLines(
  lines: { items: NativeTextItem[]; y: number; fontSize: number }[],
  page: NativeTextPage,
  readingOrder: number,
  medianFontSize: number,
): NormalizedDocumentBlock {
  const allItems = lines.flatMap((line) => line.items);
  const text = lines.map((line) => line.items.map((item) => item.str).join("")).join("\n");

  const left = Math.min(...allItems.map((item) => item.x));
  const right = Math.max(...allItems.map((item) => item.x + item.width));
  const bottom = Math.min(...allItems.map((item) => item.y));
  const top = Math.max(...allItems.map((item) => item.y + item.height));

  const avgFontSize = lines.reduce((sum, line) => sum + line.fontSize, 0) / lines.length;
  const isHeading = medianFontSize > 0 && avgFontSize / medianFontSize >= HEADING_FONT_SIZE_MULTIPLIER;

  return {
    pageNumber: page.pageNumber,
    readingOrder,
    blockType: isHeading ? "heading" : "paragraph",
    text,
    bbox:
      page.widthPt > 0 && page.heightPt > 0
        ? {
            x0: left / page.widthPt,
            y0: (page.heightPt - top) / page.heightPt,
            x1: right / page.widthPt,
            y1: (page.heightPt - bottom) / page.heightPt,
          }
        : null,
    confidence: null,
    source: "native",
  };
}

// A processing run can be left "processing" forever if the serverless
// invocation running it is killed outright rather than failing cleanly (see
// design doc §8.6's stated risk around the after()-based execution model).
// Minutes, not seconds — a large scanned document's OCR pass is not fast,
// and this threshold exists to recover from a genuinely stuck run, not to
// second-guess a normal one still in flight.
export const STALE_PROCESSING_RUN_THRESHOLD_MS = 20 * 60 * 1000;

/** Whether an in-flight processing run has been running long enough to treat as stuck rather than legitimately slow. */
export function isStaleProcessingRun(
  startedAt: string | Date,
  now: Date = new Date(),
  thresholdMs: number = STALE_PROCESSING_RUN_THRESHOLD_MS,
): boolean {
  const started = typeof startedAt === "string" ? new Date(startedAt) : startedAt;
  return now.getTime() - started.getTime() > thresholdMs;
}
