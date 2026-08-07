// Pure logic for Workflow H (docs/log-design.md) — "the host reviews
// unresolved items and submits." An item is unresolved if it's a
// commitment nobody has resolved yet: filled with content but never
// confirmed aired/missed/moved (no log_broadcast_events row recorded for
// it at all — "moved" clears the source item and leaves the destination
// item filled-but-unconfirmed, so a moved destination is correctly still
// unresolved until it's itself aired or missed), or still empty despite
// being required. An empty optional/suggested slot was never anyone's
// obligation and isn't unresolved just because it's empty.

import type { LogRequirementLevel } from "@/lib/database.types";

export interface UnresolvedReviewItemLike {
  id: string;
  content_item_id: string | null;
  /** Set instead of content_item_id for an underwriting-credit placement — docs/underwriting-design.md §6. Either one counts as filled. */
  underwriting_copy_id?: string | null;
  requirement_level: LogRequirementLevel;
}

/** Submission itself is never blocked by this list — see docs/log-design.md's "submission is a checkpoint, not a lock." It's a review surface only. */
export function listUnresolvedItems<T extends UnresolvedReviewItemLike>(
  items: T[],
  confirmedItemIds: ReadonlySet<string>,
): T[] {
  return items.filter((item) => {
    if (item.content_item_id !== null || item.underwriting_copy_id) return !confirmedItemIds.has(item.id);
    return item.requirement_level === "required";
  });
}
