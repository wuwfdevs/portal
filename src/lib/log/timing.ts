// The timing engine, per docs/log-design.md §12/"Timing is a pure, tested
// module — not stored state": fit calculations derived from rundown breaks
// and their items, never persisted as a computed column.
//
// The core domain fix this module encodes: an *optional* local opportunity
// left empty is a normal, resolved state ("carrying network") — never
// unresolved. A *required* one left empty is a genuine unresolved
// obligation. Those are two different things, and this module is where
// that distinction is actually computed — see computeBreakStatus.
//
// Spillover (2026-08-10 revision, see CLAUDE.md's dated note): when an item
// runs longer than its own break, the overage can spill into one or more
// immediately-following, empty, contiguous breaks — chaining through as
// many as it takes, not just one. Each break it reaches is genuinely,
// partially consumed (never an all-or-nothing "does the whole overage fit
// in the very next break" check) — a break that absorbs only part of an
// overrun still has its remaining capacity available for something else.
// Which requirement a target break carries changes what a host sees, not
// what happens: requirement = 'required' means local content is mandatory
// there, full stop — any local content, including spillover, satisfies
// that, so it's absorbed silently (status 'covered_by_previous'). But
// requirement = 'optional' usually means real network content (a newscast,
// a segment) is sitting underneath that a host may or may not choose to
// preempt — nothing forced it off the air this time, so it's absorbed but
// flagged ('preempted_by_previous'), not silently hidden. A source break's
// own overrun only reads as resolved ('filled' instead of 'over') once the
// chain fully accounts for it; if the chain runs out of eligible neighbors
// first, the source stays honestly 'over' even though whatever it did
// manage to spill into keeps its own partial-consumption status.

export interface BreakFit {
  availableDurationSeconds: number;
  occupiedDurationSeconds: number;
  /** Break time left over after placed items. Negative when over. */
  remainingSeconds: number;
  /** How far placed items run past the break's available time, 0 if it fits. */
  overSeconds: number;
  fits: boolean;
}

export function computeBreakFit(availableDurationSeconds: number, occupiedDurationSeconds: number): BreakFit {
  const occupied = occupiedDurationSeconds ?? 0;
  const remainingSeconds = availableDurationSeconds - occupied;
  return {
    availableDurationSeconds,
    occupiedDurationSeconds: occupied,
    remainingSeconds,
    overSeconds: Math.max(0, -remainingSeconds),
    fits: remainingSeconds >= 0,
  };
}

export type BreakStatus =
  | "carrying_network"
  | "unresolved_required"
  | "filled"
  | "over"
  | "covered_by_previous"
  | "preempted_by_previous";

export interface BreakStatusLike {
  requirement: "optional" | "required";
  item_count: number;
  fit: BreakFit;
}

/**
 * The single-break primitive: "is this break okay as-is," with no
 * awareness of its neighbors. An empty optional break is 'carrying_network'
 * — the network feed continues, and that is not a problem to flag. An empty
 * required break is 'unresolved_required' — a genuine obligation nobody has
 * met yet. Anything with items that runs long is 'over' regardless of
 * requirement; otherwise a filled break is just 'filled'. Most callers want
 * computeBreakStatuses below instead, which also accounts for spillover
 * from a previous break.
 */
export function computeBreakStatus(input: BreakStatusLike): BreakStatus {
  if (input.fit.overSeconds > 0) return "over";
  if (input.item_count === 0) {
    return input.requirement === "required" ? "unresolved_required" : "carrying_network";
  }
  return "filled";
}

export interface SpilloverBreakLike {
  id: string;
  requirement: "optional" | "required";
  item_count: number;
  available_duration_seconds: number;
  occupied_duration_seconds: number;
  scheduled_at: string;
  network_rejoin_at: string;
}

export interface BreakStatusResult {
  id: string;
  fit: BreakFit;
  status: BreakStatus;
  /** Set only when status is 'covered_by_previous' — the break whose overrunning content covers this one. */
  coveredByBreakId: string | null;
}

/**
 * Per-break status for a whole rundown, aware of spillover chaining through
 * as many immediately-following, empty, contiguous breaks as it takes — see
 * this file's header for the full account of the 2026-08-10 revision. For
 * each break whose own items run over its own window, walks forward through
 * breaks that are empty (no items of their own, and not already claimed by
 * an earlier break's own spillover) and start exactly where the previous
 * one in the chain rejoins the network (no gap): each absorbs as much of
 * the remaining overage as its own capacity allows — partially if that's
 * all it has room for — and the walk continues only if there's still
 * overage left and room to keep going. A break already holding its own
 * content, or one separated by a gap, ends the chain there. The source
 * break reads 'filled' (its overrun resolved) only once the chain accounts
 * for the whole overage; otherwise it stays honestly 'over', independent of
 * whatever partial credit a downstream break still gets for what it did
 * absorb. A break that received spillover reads 'covered_by_previous' if
 * its own requirement is 'required' (any local content, spillover
 * included, satisfies "must not be bare network") or 'preempted_by_previous'
 * if 'optional' (real network content got bumped by an accident of timing,
 * not a deliberate choice — worth a host's attention, not hidden).
 */
export function computeBreakStatuses(breaks: SpilloverBreakLike[]): BreakStatusResult[] {
  const sorted = [...breaks].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const ownOccupied = sorted.map((b) => b.occupied_duration_seconds ?? 0);
  const spilloverConsumed = sorted.map(() => 0);
  const coveredBy: (string | null)[] = sorted.map(() => null);
  const resolved = sorted.map(() => false);

  for (let i = 0; i < sorted.length; i++) {
    const overflow0 = ownOccupied[i]! - sorted[i]!.available_duration_seconds;
    if (overflow0 <= 0) continue;

    let remaining = overflow0;
    let sourceId = sorted[i]!.id;
    let rejoinAt = sorted[i]!.network_rejoin_at;
    let j = i + 1;
    while (remaining > 0 && j < sorted.length) {
      const next = sorted[j]!;
      const alreadyClaimed = ownOccupied[j]! > 0 || spilloverConsumed[j]! > 0;
      if (next.scheduled_at !== rejoinAt || alreadyClaimed) break;

      const capacity = next.available_duration_seconds;
      const consume = Math.min(remaining, capacity);
      spilloverConsumed[j] = consume;
      coveredBy[j] = sourceId;
      remaining -= consume;

      if (consume < capacity) break; // this break's own window absorbed the rest — no need to reach further
      sourceId = next.id;
      rejoinAt = next.network_rejoin_at;
      j += 1;
    }

    resolved[i] = remaining <= 0;
  }

  return sorted.map((b, i) => {
    const totalOccupied = ownOccupied[i]! + spilloverConsumed[i]!;
    const fit = computeBreakFit(b.available_duration_seconds, totalOccupied);
    let status: BreakStatus;
    if (spilloverConsumed[i]! > 0) {
      status = b.requirement === "required" ? "covered_by_previous" : "preempted_by_previous";
    } else if (fit.overSeconds > 0) {
      status = resolved[i]! ? "filled" : "over";
    } else if (b.item_count === 0) {
      status = b.requirement === "required" ? "unresolved_required" : "carrying_network";
    } else {
      status = "filled";
    }
    return { id: b.id, fit, status, coveredByBreakId: coveredBy[i]! };
  });
}

export interface ItemTimingLike {
  id: string;
  durationSeconds: number;
}

export interface ItemTiming {
  id: string;
  startAt: string;
  endAt: string;
}

/**
 * Each item's own start/end instant within a break, derived from the
 * break's scheduled_at and each item's planned duration in on-air order —
 * pure and recomputed on every render, the same rule the rest of this
 * module follows, never stored. An item's start is simply the sum of every
 * earlier item's duration within the same break; this says nothing about
 * whether the break is actually running on time — see console-timing.ts for
 * the *live* on-time/running-long state that reacts to the real clock.
 */
export function computeItemTimings(breakScheduledAt: string, items: ItemTimingLike[]): ItemTiming[] {
  let cursorMs = new Date(breakScheduledAt).getTime();
  return items.map((item) => {
    const startAt = new Date(cursorMs).toISOString();
    cursorMs += item.durationSeconds * 1000;
    return { id: item.id, startAt, endAt: new Date(cursorMs).toISOString() };
  });
}

export type RundownSummaryBreakLike = SpilloverBreakLike;

export interface RundownSummary {
  totalBreaks: number;
  filledBreaks: number;
  /** Optional breaks with nothing placed — normal, resolved, network continues. */
  carryingNetworkBreaks: number;
  /** Required breaks with nothing placed — genuinely unresolved. */
  unresolvedRequiredBreaks: number;
  overCount: number;
  totalOverSeconds: number;
  /** Optional breaks preempted by a previous break's overrun — filled, but worth a host's attention since real network content (not just an unused avail) got bumped by an accident of timing, not a deliberate choice. */
  preemptedBreaks: number;
  /** No unresolved required breaks and nothing running over its available time. */
  ready: boolean;
}

/** A rundown-level readiness summary for the builder screen's header — recomputed on every render, not stored. */
export function computeRundownSummary(breaks: RundownSummaryBreakLike[]): RundownSummary {
  let filledBreaks = 0;
  let carryingNetworkBreaks = 0;
  let unresolvedRequiredBreaks = 0;
  let overCount = 0;
  let totalOverSeconds = 0;
  let preemptedBreaks = 0;

  for (const result of computeBreakStatuses(breaks)) {
    if (
      result.status === "filled" ||
      result.status === "over" ||
      result.status === "covered_by_previous" ||
      result.status === "preempted_by_previous"
    ) {
      filledBreaks++;
    }
    if (result.status === "carrying_network") carryingNetworkBreaks++;
    if (result.status === "unresolved_required") unresolvedRequiredBreaks++;
    if (result.status === "preempted_by_previous") preemptedBreaks++;
    if (result.status === "over") {
      overCount++;
      totalOverSeconds += result.fit.overSeconds;
    }
  }

  return {
    totalBreaks: breaks.length,
    filledBreaks,
    carryingNetworkBreaks,
    unresolvedRequiredBreaks,
    overCount,
    totalOverSeconds,
    preemptedBreaks,
    ready: unresolvedRequiredBreaks === 0 && overCount === 0,
  };
}
