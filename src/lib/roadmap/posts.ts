// Pure state derivation, validation, and label maps for the Roadmap tool. No
// Supabase, no React — colocated tests cover it directly, per CLAUDE.md's
// testing expectations.

import type { BadgeVariant } from "@/components/ui/badge";
import type { RdPostKind, RdPostStatus } from "@/lib/database.types";
import { RICH_TEXT_MAX_CHARACTERS } from "./rich-text";

export const POST_STATUS_BADGE: Record<RdPostStatus, { label: string; variant: BadgeVariant }> = {
  open: { label: "Open", variant: "muted" },
  under_review: { label: "Under review", variant: "warning" },
  planned: { label: "Planned", variant: "neutral" },
  in_progress: { label: "In progress", variant: "accent" },
  shipped: { label: "Shipped", variant: "success" },
  declined: { label: "Declined", variant: "danger" },
};

export const POST_KIND_LABEL: Record<RdPostKind, string> = {
  feature: "New capability",
  improvement: "Improvement",
  bug: "Something broken",
  new_tool: "A whole new tool",
};

/**
 * The statuses the Roadmap tab groups by, in order. `open` and `under_review`
 * are deliberately absent: the roadmap is what has been decided, and everything
 * else lives on the Requests tab.
 */
export const ROADMAP_STATUSES: RdPostStatus[] = ["planned", "in_progress", "shipped", "declined"];

/** The label on the button that moves a post *to* each status. */
export const STATUS_ACTION_LABEL: Record<RdPostStatus, string> = {
  open: "Reopen",
  under_review: "Mark under review",
  planned: "Mark planned",
  in_progress: "Mark in progress",
  shipped: "Mark shipped",
  declined: "Decline",
};

/**
 * Where a post can go from where it is. A `switch` with no `default` so a new
 * status is a compile error rather than a transition someone forgot to add.
 *
 * Every transition is reversible in at least one direction: a status is a
 * statement about the present, not a ratchet.
 */
export function availableStatusActions(status: RdPostStatus): RdPostStatus[] {
  switch (status) {
    case "open":
      return ["under_review", "planned", "declined"];
    case "under_review":
      return ["planned", "in_progress", "declined", "open"];
    case "planned":
      return ["in_progress", "under_review", "declined"];
    case "in_progress":
      return ["shipped", "planned"];
    case "shipped":
      return ["in_progress"];
    case "declined":
      return ["open"];
  }
}

export const TITLE_MIN_LENGTH = 3;
export const TITLE_MAX_LENGTH = 160;

export interface PostInput {
  title: string;
  /** The plain-text projection of the body, not the document itself. */
  bodyText: string;
  kind: RdPostKind;
  toolId: string | null;
  proposedToolName: string;
}

/**
 * Null when valid; otherwise a sentence for the screen. The first two rules
 * mirror rd_posts' check constraints — the database is the enforcement point,
 * this is so the writer gets a sentence instead of a Postgres error.
 */
export function validatePostInput(input: PostInput): string | null {
  const title = input.title.trim();
  if (title.length < TITLE_MIN_LENGTH) {
    return "Give the request a title of at least three characters.";
  }
  if (title.length > TITLE_MAX_LENGTH) {
    return `Titles are at most ${TITLE_MAX_LENGTH} characters — this one is ${title.length}.`;
  }
  if (input.bodyText.trim() === "") {
    return "Say what you want and why. A title on its own is hard to act on.";
  }
  if (input.bodyText.length > RICH_TEXT_MAX_CHARACTERS) {
    return "That description is too long. Trim it to the essentials and put the detail in a comment.";
  }
  if (input.kind === "new_tool" && !input.toolId && input.proposedToolName.trim() === "") {
    return "For a whole new tool, either pick an existing proposal or say what it should be called.";
  }
  return null;
}

/** Null when valid; a note is required to decline and meaningless otherwise. */
export function validateStatusChange(status: RdPostStatus, note: string): string | null {
  if (status === "declined" && note.trim() === "") {
    return "Say why it is being declined. A decision with no reason is why people stop filing requests.";
  }
  return null;
}

export type PostSort = "top" | "new";

export function normalizeSort(value: string | undefined): PostSort {
  return value === "new" ? "new" : "top";
}

interface SortablePost {
  voteCount: number;
  created_at: string;
}

/** Sorted copy. "Most wanted" falls back to newest-first within a vote count. */
export function sortPosts<T extends SortablePost>(posts: T[], sort: PostSort): T[] {
  return [...posts].sort((a, b) => {
    if (sort === "top" && a.voteCount !== b.voteCount) return b.voteCount - a.voteCount;
    return b.created_at.localeCompare(a.created_at);
  });
}

/** The Roadmap tab's columns, in ROADMAP_STATUSES order, empty ones included. */
export function groupForRoadmap<T extends { status: RdPostStatus }>(
  posts: T[],
): { status: RdPostStatus; posts: T[] }[] {
  return ROADMAP_STATUSES.map((status) => ({
    status,
    posts: posts.filter((post) => post.status === status),
  }));
}
