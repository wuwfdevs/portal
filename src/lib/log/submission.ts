// Pure logic for Workflow H (docs/log-design.md) — "the host reviews
// unresolved items and submits." Two different things count as unresolved
// now that breaks can hold zero or more items (docs/log-design.md §4B):
// a required break nobody placed anything into at all, and a placed item
// that's never had its outcome confirmed (aired/missed/moved). An optional
// break left empty was never anyone's obligation — "carrying network" — and
// is never unresolved.

export interface UnresolvedReviewBreakLike {
  id: string;
  requirement: "optional" | "required";
  itemIds: string[];
}

export interface UnresolvedEntry {
  breakId: string;
  /** Null when the unresolved thing is the break itself (required, nothing placed) rather than a specific placed item. */
  itemId: string | null;
}

/** Submission itself is never blocked by this list — see docs/log-design.md's "submission is a checkpoint, not a lock." It's a review surface only. */
export function listUnresolvedEntries(
  breaks: UnresolvedReviewBreakLike[],
  confirmedItemIds: ReadonlySet<string>,
): UnresolvedEntry[] {
  const entries: UnresolvedEntry[] = [];
  for (const brk of breaks) {
    if (brk.itemIds.length === 0) {
      if (brk.requirement === "required") entries.push({ breakId: brk.id, itemId: null });
      continue;
    }
    for (const itemId of brk.itemIds) {
      if (!confirmedItemIds.has(itemId)) entries.push({ breakId: brk.id, itemId });
    }
  }
  return entries;
}
