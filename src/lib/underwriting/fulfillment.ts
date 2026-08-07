// Pure fulfillment derivation (docs/underwriting-design.md §2/§3A, point 31
// of the domain redesign) — replaces uw_placement_obligations.status, which
// staff used to set by hand despite the design doc itself saying
// fulfillment should derive from placements and broadcast events. Never
// stored: computed from expected occurrences (lib/underwriting/schedule-
// lines.ts) against scheduled placements, confirmed airings, and open
// exceptions/makegoods every time a contract or dashboard renders.

export type FulfillmentStatus = "no_target" | "on_track" | "behind" | "fulfilled";

export interface FulfillmentInput {
  /** Total expected occurrences across a contract's schedule lines — null when any line is open-ended (see sumExpectedOccurrences). */
  expectedOccurrences: number | null;
  /** Broadcast events confirmed aired_as_scheduled against this contract's placements. */
  completedCount: number;
  /** Unresolved exceptions (missed/preempted credits nobody has resolved yet). */
  openExceptionCount: number;
  /** Makegoods not yet aired or cancelled. */
  openMakegoodCount: number;
}

export interface FulfillmentResult {
  status: FulfillmentStatus;
  completedCount: number;
  expectedOccurrences: number | null;
  /** How many more confirmed airings are needed to meet the expected total — null when there is no fixed target. */
  remaining: number | null;
}

/**
 * A missed credit is never silently counted as fulfilled: an open exception
 * or an open makegood always keeps status at 'behind', even once
 * completedCount alone would otherwise read as met, because it means a
 * required replacement airing hasn't happened yet.
 */
export function computeFulfillment(input: FulfillmentInput): FulfillmentResult {
  if (input.expectedOccurrences == null) {
    return { status: "no_target", completedCount: input.completedCount, expectedOccurrences: null, remaining: null };
  }

  const remaining = Math.max(0, input.expectedOccurrences - input.completedCount);
  const hasOpenItems = input.openExceptionCount > 0 || input.openMakegoodCount > 0;

  let status: FulfillmentStatus;
  if (input.completedCount >= input.expectedOccurrences && !hasOpenItems) {
    status = "fulfilled";
  } else if (hasOpenItems) {
    status = "behind";
  } else {
    status = "on_track";
  }

  return { status, completedCount: input.completedCount, expectedOccurrences: input.expectedOccurrences, remaining };
}

export const FULFILLMENT_STATUS_LABEL: Record<FulfillmentStatus, string> = {
  no_target: "No fixed target",
  on_track: "On track",
  behind: "Behind — unresolved exception or makegood",
  fulfilled: "Fulfilled",
};
