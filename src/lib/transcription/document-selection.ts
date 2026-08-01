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
