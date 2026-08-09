// Pure logic for Workflow H (docs/log-design.md) — "the host reviews
// unresolved items and submits." Two different things count as unresolved
// now that breaks can hold zero or more items (docs/log-design.md §4B):
// a required break nobody placed anything into at all, and a placed item
// whose outcome actually matters that's never been confirmed. An optional
// break left empty was never anyone's obligation — "carrying network" — and
// is never unresolved.
//
// "Whose outcome actually matters" narrowed on 2026-08-09: ordinary
// content's aired/missed outcome became optional (no per-item button, only
// an optional batch wrap-up action) once nothing downstream needed
// per-item confirmation for it. Flagging every unconfirmed ordinary item
// as "unresolved" would make this list — and its badge — noise on every
// rundown, real signal buried in items nobody was ever asked to confirm.
// Underwriting credits are the one kind still checked per item, since
// that's the one outcome the exception/makegood pipeline reacts to.

export interface UnresolvedReviewItemLike {
  id: string;
  /** Only an item whose outcome the review list should actually chase — currently just underwriting credits. */
  requiresConfirmation: boolean;
}

export interface UnresolvedReviewBreakLike {
  id: string;
  requirement: "optional" | "required";
  items: UnresolvedReviewItemLike[];
}

export interface UnresolvedEntry {
  breakId: string;
  /** Null when the unresolved thing is the break itself (required, nothing placed) rather than a specific placed item. */
  itemId: string | null;
}

/** Submission itself is never blocked by this list (except underwriting's own gate, enforced separately in submitRundown) — see docs/log-design.md's "submission is a checkpoint, not a lock." It's a review surface only. */
export function listUnresolvedEntries(
  breaks: UnresolvedReviewBreakLike[],
  confirmedItemIds: ReadonlySet<string>,
): UnresolvedEntry[] {
  const entries: UnresolvedEntry[] = [];
  for (const brk of breaks) {
    if (brk.items.length === 0) {
      if (brk.requirement === "required") entries.push({ breakId: brk.id, itemId: null });
      continue;
    }
    for (const item of brk.items) {
      if (item.requiresConfirmation && !confirmedItemIds.has(item.id)) {
        entries.push({ breakId: brk.id, itemId: item.id });
      }
    }
  }
  return entries;
}
