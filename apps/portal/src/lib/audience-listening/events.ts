// Pure rules for events, their listing on the website, their tables and their seats. No Supabase, no React. The database checks the
// same shapes (al_events, al_tables and al_seats constraints) and enforces the listing rules in al_events_guard_listing(); this is
// for the screens and the tests.

import type { BadgeVariant } from "@/components/ui/badge";
import type {
  AlEventListingState,
  AlEventStatus,
  AlEventVisibility,
  AlOrganizerKind,
  AlTableState,
} from "@/lib/database.types";

export const EVENT_STATUSES: readonly AlEventStatus[] = ["draft", "scheduled", "live", "done", "cancelled"];

export const EVENT_STATUS_BADGE: Record<AlEventStatus, { label: string; variant: BadgeVariant }> = {
  draft: { label: "Draft", variant: "neutral" },
  scheduled: { label: "Scheduled", variant: "accent" },
  live: { label: "Happening now", variant: "success" },
  done: { label: "Done", variant: "muted" },
  cancelled: { label: "Cancelled", variant: "muted" },
};

export const LISTING_BADGE: Record<AlEventListingState, { label: string; variant: BadgeVariant }> = {
  not_listed: { label: "Not listed", variant: "neutral" },
  pending_review: { label: "Waiting for review", variant: "warning" },
  listed: { label: "Listed on the website", variant: "success" },
  declined: { label: "Declined", variant: "danger" },
};

export const VISIBILITY_LABEL: Record<AlEventVisibility, string> = {
  private: "Private, shared by the organizer",
  public: "Public, may be listed on the website",
};

export const ORGANIZER_KIND_LABEL: Record<AlOrganizerKind, string> = {
  wuwf: "The station",
  partner: "A partner organization",
  person: "A person",
};

export const TABLE_STATE_LABEL: Record<AlTableState, string> = {
  waiting: "Waiting",
  agreed: "Agreed to be recorded",
  recording: "Recording",
  paused: "Paused",
  ended: "Ended",
  sent: "Sent",
};

export const SEAT_CHOICES: readonly number[] = [12, 30, 60];
export const MAX_SEATS = 500;
export const MAX_TABLES = 99;

export function isEventStatus(value: string): value is AlEventStatus {
  return (EVENT_STATUSES as readonly string[]).includes(value);
}
export function isOrganizerKind(value: string): value is AlOrganizerKind {
  return value === "wuwf" || value === "partner" || value === "person";
}
export function isVisibility(value: string): value is AlEventVisibility {
  return value === "private" || value === "public";
}

export interface EventInput {
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  placeName: string;
  address: string | null;
  visibility: string;
  seats: number | null;
}

/**
 * The first thing wrong with an event's fields, or null. A public event is found by a stranger, so it needs an address and a seat
 * count; a private one is shared by the organizer and has neither (seats are null for private, per the design).
 */
export function validateEventInput(input: EventInput): string | null {
  if (!input.title.trim()) return "Give the event a title.";
  if (input.title.trim().length > 200) return "The title can be at most 200 characters.";
  if (!input.startsAt || !Number.isFinite(Date.parse(input.startsAt))) return "Choose when the event starts.";
  if (!input.endsAt || !Number.isFinite(Date.parse(input.endsAt))) return "Choose when the event ends.";
  if (Date.parse(input.endsAt) <= Date.parse(input.startsAt)) return "The event has to end after it starts.";
  if (!input.placeName.trim()) return "Name the place.";
  if (input.placeName.trim().length > 200) return "The place name can be at most 200 characters.";
  if ((input.address ?? "").length > 500) return "The address can be at most 500 characters.";
  if (!isVisibility(input.visibility)) return "Choose whether the event is private or public.";
  if (input.visibility === "public") {
    if (!(input.address ?? "").trim()) return "A public event needs an address, so people can find it.";
    if (input.seats == null) return "A public event needs a number of seats.";
  }
  if (input.seats != null && (!Number.isInteger(input.seats) || input.seats < 1 || input.seats > MAX_SEATS)) {
    return `Seats is a whole number from 1 to ${MAX_SEATS}.`;
  }
  return null;
}

/** What the listing checklist asks of a coordinator before an event goes on the website (suite design §11, item 4). */
export const LISTING_CHECKLIST: readonly { key: string; label: string }[] = [
  { key: "public_place", label: "It is in a public place" },
  { key: "organizer", label: "The organizer is identified and their email is verified" },
  { key: "inside_campaign", label: "The date is inside the campaign" },
  { key: "accessibility", label: "The accessibility details are filled in" },
  { key: "not_fundraising", label: "It is not a fundraiser or a campaign event" },
  { key: "consent_reading", label: "The organizer has acknowledged the consent reading" },
];

/** The checklist items not ticked. Approval needs every one. */
export function missingListingChecks(ticked: readonly string[]): string[] {
  const set = new Set(ticked);
  return LISTING_CHECKLIST.filter((item) => !set.has(item.key)).map((item) => item.label);
}

export type ListingAction = "request_review" | "withdraw" | "approve" | "decline" | "unlist";

export const LISTING_ACTION_LABEL: Record<ListingAction, string> = {
  request_review: "Ask for review",
  withdraw: "Withdraw from review",
  approve: "Approve for listing",
  decline: "Decline",
  unlist: "Take off the website",
};

/** Which listing actions a viewer may take. The database enforces the same: only a coordinator lists, declines or unlists. */
export function availableListingActions(
  listingState: AlEventListingState,
  visibility: AlEventVisibility,
  isCoordinator: boolean,
): ListingAction[] {
  if (visibility !== "public") return [];
  switch (listingState) {
    case "not_listed":
    case "declined":
      return ["request_review"];
    case "pending_review":
      return isCoordinator ? ["approve", "decline", "withdraw"] : ["withdraw"];
    case "listed":
      return isCoordinator ? ["unlist"] : [];
  }
}

/** The state each action leads to. */
export const LISTING_ACTION_TARGET: Record<ListingAction, AlEventListingState> = {
  request_review: "pending_review",
  withdraw: "not_listed",
  approve: "listed",
  decline: "declined",
  unlist: "not_listed",
};

/** Seats left, or null when the event has no limit. Never negative. */
export function seatsLeft(seats: number | null, taken: number): number | null {
  return seats == null ? null : Math.max(0, seats - taken);
}

/** The next table number: the lowest unused number from 1, so a deleted table's number is reused. Null at the 99-table limit. */
export function nextTableNumber(existing: readonly number[]): number | null {
  const used = new Set(existing);
  for (let n = 1; n <= MAX_TABLES; n += 1) if (!used.has(n)) return n;
  return null;
}

/** Whether a table may still be deleted from a screen. Anything that has been agreed to or recorded is kept. */
export function tableIsRemovable(state: AlTableState): boolean {
  return state === "waiting";
}

/** An event that can be deleted outright: nothing has happened at it. Otherwise it is cancelled. */
export function eventIsDeletable(status: AlEventStatus): boolean {
  return status === "draft" || status === "cancelled";
}

export type EventAction = "schedule" | "cancel" | "reopen";

export const EVENT_ACTION_LABEL: Record<EventAction, string> = {
  schedule: "Mark as scheduled",
  cancel: "Cancel the event",
  reopen: "Back to draft",
};

export const EVENT_ACTION_TARGET: Record<EventAction, AlEventStatus> = {
  schedule: "scheduled",
  cancel: "cancelled",
  reopen: "draft",
};

/**
 * What staff may do with an event's status. `live` and `done` are set by the room's console during the session (the second half of
 * phase D), not from this list, so a screen never claims an event is happening or over.
 */
export function availableEventActions(status: AlEventStatus): EventAction[] {
  switch (status) {
    case "draft":
      return ["schedule", "cancel"];
    case "scheduled":
      return ["cancel", "reopen"];
    case "cancelled":
      return ["reopen"];
    case "live":
    case "done":
      return [];
  }
}
