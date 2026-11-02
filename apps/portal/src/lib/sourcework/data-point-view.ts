// How a source's data points are drawn on the workspace: the adapters between
// a point's spans (time ranges, or page + block ids) and the layers that show
// them — transcript words, the scrubber strip, document blocks. Pure; the
// token mapping itself is lib/transcription/selection.ts's resolveClipCoverage.

import type { ClipTimeRange } from "@/lib/transcription/selection";
import type { DataPoint, DataPointFilter, ReviewCounts } from "./research";

type PointLike = Pick<DataPoint, "id" | "spans" | "status" | "claim">;

/** Every temporal span of every non-rejected point, keyed by the point's id (a point with two spans appears twice). */
export function transcriptRanges(points: readonly PointLike[]): ClipTimeRange[] {
  const ranges: ClipTimeRange[] = [];
  for (const point of points) {
    if (point.status === "rejected") continue;
    for (const span of point.spans) {
      if (span.kind === "temporal") {
        ranges.push({ id: point.id, startMs: span.startMs, endMs: span.endMs });
      }
    }
  }
  return ranges;
}

/** Ids of the points still awaiting review — their marks are drawn dashed. */
export function suggestedIds(points: readonly Pick<DataPoint, "id" | "status">[]): Set<string> {
  return new Set(points.filter((point) => point.status === "suggested").map((point) => point.id));
}

export interface PointMark {
  /** `${pointId}#${n}`: unique per span, so a point with two spans keeps two marks. */
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  dashed: boolean;
}

export function scrubberMarks(points: readonly PointLike[]): PointMark[] {
  const marks: PointMark[] = [];
  for (const point of points) {
    if (point.status === "rejected") continue;
    point.spans.forEach((span, index) => {
      if (span.kind !== "temporal") return;
      marks.push({
        id: `${point.id}#${index}`,
        title: point.claim,
        startMs: span.startMs,
        endMs: span.endMs,
        dashed: point.status === "suggested",
      });
    });
  }
  return marks;
}

export function pointIdFromMarkId(markId: string): string {
  const at = markId.lastIndexOf("#");
  return at === -1 ? markId : markId.slice(0, at);
}

interface BlockLike {
  id: string;
  pageNumber: number;
  readingOrder: number;
}

/**
 * The blocks one document span covers: first through last block id in reading
 * order on its page. Empty when either id no longer resolves — the span then
 * stands for its page only.
 */
export function spanBlockIds(
  span: { pageNumber: number; firstBlockId: string | null; lastBlockId: string | null },
  blocks: readonly BlockLike[],
): string[] {
  if (!span.firstBlockId || !span.lastBlockId) return [];
  const onPage = blocks
    .filter((block) => block.pageNumber === span.pageNumber)
    .sort((a, b) => a.readingOrder - b.readingOrder);
  const a = onPage.findIndex((block) => block.id === span.firstBlockId);
  const b = onPage.findIndex((block) => block.id === span.lastBlockId);
  if (a === -1 || b === -1) return [];
  return onPage.slice(Math.min(a, b), Math.max(a, b) + 1).map((block) => block.id);
}

export function pointBlockIds(
  point: Pick<DataPoint, "spans">,
  blocks: readonly BlockLike[],
): string[] {
  const ids: string[] = [];
  for (const span of point.spans) {
    if (span.kind === "document") ids.push(...spanBlockIds(span, blocks));
  }
  return [...new Set(ids)];
}

/** Which points cover each block, and how many blocks each point covers (the smaller one wins a click). */
export function blockCoverage(
  points: readonly Pick<DataPoint, "id" | "spans" | "status">[],
  blocks: readonly BlockLike[],
): { byBlock: Map<string, string[]>; sizes: Map<string, number> } {
  const byBlock = new Map<string, string[]>();
  const sizes = new Map<string, number>();
  for (const point of points) {
    if (point.status === "rejected") continue;
    const ids = pointBlockIds(point, blocks);
    sizes.set(point.id, ids.length);
    for (const blockId of ids) byBlock.set(blockId, [...(byBlock.get(blockId) ?? []), point.id]);
  }
  return { byBlock, sizes };
}

export function pointAtBlock(
  coverage: { byBlock: Map<string, string[]>; sizes: Map<string, number> },
  blockId: string,
): string | null {
  let best: string | null = null;
  for (const id of coverage.byBlock.get(blockId) ?? []) {
    if (best === null || (coverage.sizes.get(id) ?? 0) < (coverage.sizes.get(best) ?? 0)) best = id;
  }
  return best;
}

/** The page a point's card goes to. */
export function firstPageNumber(point: Pick<DataPoint, "spans">): number | null {
  const pages = point.spans.flatMap((span) => (span.kind === "document" ? [span.pageNumber] : []));
  return pages.length === 0 ? null : Math.min(...pages);
}

/** "8 more accepted · 2 rejected" under a filtered list; empty when nothing is hidden. */
export function hiddenSummary(counts: ReviewCounts, filter: DataPointFilter): string {
  if (filter !== "to_review") return "";
  const parts: string[] = [];
  if (counts.accepted > 0) parts.push(`${counts.accepted} more accepted`);
  if (counts.rejected > 0) parts.push(`${counts.rejected} rejected`);
  return parts.join(" · ");
}
