// Pure rules for the two standing inboxes (Ask WUWF and host requests): how each state reads, which filter shows which
// rows, and when a host request has waited too long. No Supabase, no React. The database checks the same shapes
// (al_inbox and al_host_requests constraints); this is for the screen and the tests.

import type { BadgeVariant } from "@/components/ui/badge";
import type {
  AlHostExpected,
  AlHostKind,
  AlHostRequestState,
  AlInboxKind,
  AlInboxState,
} from "@/lib/database.types";

export const INBOX_STATES: readonly AlInboxState[] = ["new", "read", "answered", "declined"];
export const HOST_REQUEST_STATES: readonly AlHostRequestState[] = ["new", "contacted", "scheduled", "declined"];

export const INBOX_STATE_BADGE: Record<AlInboxState, { label: string; variant: BadgeVariant }> = {
  new: { label: "New", variant: "warning" },
  read: { label: "Read", variant: "neutral" },
  answered: { label: "Answered", variant: "success" },
  declined: { label: "Not used", variant: "muted" },
};

export const HOST_REQUEST_STATE_BADGE: Record<AlHostRequestState, { label: string; variant: BadgeVariant }> = {
  new: { label: "New", variant: "warning" },
  contacted: { label: "Contacted", variant: "neutral" },
  scheduled: { label: "Scheduled", variant: "success" },
  declined: { label: "Declined", variant: "muted" },
};

export const INBOX_KIND_LABEL: Record<AlInboxKind, string> = {
  question: "A question",
  story_idea: "A story idea",
};

export const HOST_KIND_LABEL: Record<AlHostKind, string> = {
  invite: "Invitation only",
  public: "Open to the public",
};

export const HOST_EXPECTED_LABEL: Record<AlHostExpected, string> = {
  "6-8": "6 to 8 people",
  "9-12": "9 to 12 people",
  "12+": "More than 12 people",
};

export function isInboxState(value: string): value is AlInboxState {
  return (INBOX_STATES as readonly string[]).includes(value);
}
export function isHostRequestState(value: string): value is AlHostRequestState {
  return (HOST_REQUEST_STATES as readonly string[]).includes(value);
}

/** What the site tells a host: someone will write back within a week. The staff list warns before the week is up. */
export const HOST_REQUEST_WARN_AFTER_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since `createdAt`, never negative. */
export function daysWaiting(createdAt: string, now: Date): number {
  const then = Date.parse(createdAt);
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / DAY_MS));
}

/** A request nobody has answered yet that has waited more than the warning period. Only a `new` request is overdue. */
export function hostRequestIsOverdue(request: { state: AlHostRequestState; created_at: string }, now: Date): boolean {
  return request.state === "new" && daysWaiting(request.created_at, now) >= HOST_REQUEST_WARN_AFTER_DAYS;
}

/** The list's filter, from the `?show=` value: a state, or everything. Anything else reads as the default, `open`. */
export type InboxFilter = AlInboxState | "open" | "all";
export type HostRequestFilter = AlHostRequestState | "open" | "all";

export function parseInboxFilter(value: string | undefined): InboxFilter {
  if (value === "all") return "all";
  return value && isInboxState(value) ? value : "open";
}
export function parseHostRequestFilter(value: string | undefined): HostRequestFilter {
  if (value === "all") return "all";
  return value && isHostRequestState(value) ? value : "open";
}

/** `open` means still needing a person: new, or read but not yet answered. */
export function inboxMatches(state: AlInboxState, filter: InboxFilter): boolean {
  if (filter === "all") return true;
  if (filter === "open") return state === "new" || state === "read";
  return state === filter;
}
/** `open` means not yet settled: new or contacted. */
export function hostRequestMatches(state: AlHostRequestState, filter: HostRequestFilter): boolean {
  if (filter === "all") return true;
  if (filter === "open") return state === "new" || state === "contacted";
  return state === filter;
}

/** Counts per state, for the filter chips. */
export function countStates<S extends string>(rows: readonly { state: S }[]): Record<S, number> {
  const out = {} as Record<S, number>;
  for (const row of rows) out[row.state] = (out[row.state] ?? 0) + 1;
  return out;
}

export const MAX_INTERNAL_NOTES_LENGTH = 4000;
