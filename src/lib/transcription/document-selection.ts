// Turning a text selection over the document workspace's reading-order pane
// into an ordered set of page/block/offset locations — the document
// counterpart to selection.ts's time-range resolution (see
// docs/sourcework-design.md §8.5/§8.7). Pure and dependency-free: the
// browser Selection API half (walking DOM nodes to find which block/offset
// a selection starts and ends at) lives in the workspace component: this
// module only reasons about the already-resolved block ids and offsets.

export interface SelectableBlock {
  id: string;
  pageNumber: number;
  readingOrder: number;
  text: string;
}

/** What the DOM half already resolved a raw browser Selection down to. */
export interface DocumentSelectionAnchor {
  blockId: string;
  offset: number;
}

export interface DocumentSelectionLocation {
  pageNumber: number;
  blockId: string;
  startOffset: number;
  endOffset: number;
}

export interface DocumentSelectionRange {
  excerpt: string;
  locations: DocumentSelectionLocation[];
}

/**
 * Resolves a selection anchored at (possibly different) start/end blocks
 * into one location per spanned block, in reading order. A selection
 * confined to one block yields one location; a selection crossing block or
 * page boundaries yields one location per block it touches, with the first
 * and last block's offsets trimmed to the actual selection and every block
 * in between taken in full.
 *
 * Returns null for a degenerate selection (unknown block ids, or a
 * single-block selection with no characters in it) so the caller can just
 * hide the "Create excerpt" affordance rather than reason about empty
 * ranges — same convention as selection.ts's resolveSelection().
 */
export function resolveDocumentSelection(
  blocks: SelectableBlock[],
  start: DocumentSelectionAnchor,
  end: DocumentSelectionAnchor,
): DocumentSelectionRange | null {
  const ordered = [...blocks].sort((a, b) => a.readingOrder - b.readingOrder);
  const startIndex = ordered.findIndex((block) => block.id === start.blockId);
  const endIndex = ordered.findIndex((block) => block.id === end.blockId);
  if (startIndex === -1 || endIndex === -1) return null;

  const [fromIndex, toIndex, fromAnchor, toAnchor] =
    startIndex <= endIndex ? [startIndex, endIndex, start, end] : [endIndex, startIndex, end, start];

  const spanned = ordered.slice(fromIndex, toIndex + 1);
  if (spanned.length === 0) return null;

  const locations: DocumentSelectionLocation[] = spanned.map((block, index) => {
    const isFirst = index === 0;
    const isLast = index === spanned.length - 1;
    const startOffset = isFirst ? fromAnchor.offset : 0;
    const endOffset = isLast ? toAnchor.offset : block.text.length;
    return { pageNumber: block.pageNumber, blockId: block.id, startOffset, endOffset };
  });

  if (locations.length === 1 && locations[0]!.endOffset <= locations[0]!.startOffset) {
    return null;
  }

  const excerpt = spanned
    .map((block, index) => {
      const location = locations[index]!;
      return block.text.slice(location.startOffset, location.endOffset).trim();
    })
    .filter((text) => text.length > 0)
    .join("\n\n");

  if (!excerpt) return null;

  return { excerpt, locations };
}

/** One excerpt's coverage of a single block, in the same character-offset terms `resolveDocumentSelection` produces. */
export interface ExcerptCharRange {
  excerptId: string;
  startOffset: number;
  endOffset: number;
}

/** A run of a block's text and every excerpt (zero or more) that covers it. */
export interface DocumentTextRun {
  text: string;
  excerptIds: string[];
}

/**
 * Splits a block's text into ordered runs at every excerpt-range boundary,
 * so the reading pane can underline "this is already excerpted" the same
 * way the transcript underlines a clipped word (see segment-row.tsx's
 * markClass and the "two channels, not two shades" comment there). A run
 * lists every excerpt covering it, so two overlapping excerpts still draw
 * as one unbroken underline rather than doubling up — the document
 * counterpart to resolveClipCoverage.
 */
export function buildExcerptRuns(text: string, ranges: ExcerptCharRange[]): DocumentTextRun[] {
  if (ranges.length === 0 || text.length === 0) {
    return [{ text, excerptIds: [] }];
  }

  const boundaries = new Set<number>([0, text.length]);
  for (const range of ranges) {
    boundaries.add(Math.max(0, Math.min(range.startOffset, text.length)));
    boundaries.add(Math.max(0, Math.min(range.endOffset, text.length)));
  }
  const sorted = [...boundaries].sort((a, b) => a - b);

  const runs: DocumentTextRun[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i]!;
    const end = sorted[i + 1]!;
    if (start >= end) continue;
    const excerptIds = ranges
      .filter((range) => range.startOffset <= start && range.endOffset >= end)
      .map((range) => range.excerptId);
    runs.push({ text: text.slice(start, end), excerptIds });
  }
  return runs;
}

/**
 * Which excerpt a click at a single character offset means, out of however
 * many cover it — the document counterpart to clipAtToken(). The shortest
 * (most specific) excerpt wins ties, same rationale as clipAtToken.
 */
export function excerptAtOffset(ranges: ExcerptCharRange[], offset: number): string | null {
  let best: ExcerptCharRange | null = null;

  for (const range of ranges) {
    if (offset < range.startOffset || offset >= range.endOffset) continue;
    if (!best || range.endOffset - range.startOffset < best.endOffset - best.startOffset) best = range;
  }

  return best?.excerptId ?? null;
}

/** A block-relative line, in the same shape NormalizedDocumentBlock.lines/DocumentBlockSummary.lines already use. */
export interface DocumentBlockLine {
  startOffset: number;
  endOffset: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/**
 * Unions the bboxes of every line overlapping [startOffset, endOffset) —
 * a tight box around just the selected span, instead of the whole
 * containing block's own aggregate bbox. Returns null when there's no
 * line-level geometry to draw from (an OCR block, or a native block with no
 * recoverable page dimensions), so the caller can fall back to the block's
 * own bbox — see document-workspace.tsx's handleSaveExcerpt.
 */
export function bboxForOffsetRange(
  lines: DocumentBlockLine[],
  startOffset: number,
  endOffset: number,
): { x0: number; y0: number; x1: number; y1: number } | null {
  const overlapping = lines.filter(
    (line) => line.startOffset < endOffset && line.endOffset > startOffset,
  );
  if (overlapping.length === 0) return null;

  return overlapping.reduce(
    (union, line) => ({
      x0: Math.min(union.x0, line.bbox.x0),
      y0: Math.min(union.y0, line.bbox.y0),
      x1: Math.max(union.x1, line.bbox.x1),
      y1: Math.max(union.y1, line.bbox.y1),
    }),
    overlapping[0]!.bbox,
  );
}
