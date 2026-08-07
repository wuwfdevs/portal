// The timing engine, per docs/log-design.md §12/"Timing is a pure, tested
// module — not stored state": fit calculations derived from rundown breaks
// and their items, never persisted as a computed column.
//
// The core domain fix this module encodes: an *optional* local opportunity
// left empty is a normal, resolved state ("carrying network") — never
// unresolved. A *required* one left empty is a genuine unresolved
// obligation. Those are two different things, and this module is where
// that distinction is actually computed — see computeBreakStatus.

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

export type BreakStatus = "carrying_network" | "unresolved_required" | "filled" | "over";

export interface BreakStatusLike {
  requirement: "optional" | "required";
  item_count: number;
  fit: BreakFit;
}

/**
 * The single place "is this break okay as-is" gets decided. An empty
 * optional break is 'carrying_network' — the network feed continues, and
 * that is not a problem to flag. An empty required break is
 * 'unresolved_required' — a genuine obligation nobody has met yet. Anything
 * with items that runs long is 'over' regardless of requirement; otherwise
 * a filled break is just 'filled'.
 */
export function computeBreakStatus(input: BreakStatusLike): BreakStatus {
  if (input.fit.overSeconds > 0) return "over";
  if (input.item_count === 0) {
    return input.requirement === "required" ? "unresolved_required" : "carrying_network";
  }
  return "filled";
}

export interface RundownSummaryBreakLike {
  requirement: "optional" | "required";
  available_duration_seconds: number;
  occupied_duration_seconds: number;
  item_count: number;
}

export interface RundownSummary {
  totalBreaks: number;
  filledBreaks: number;
  /** Optional breaks with nothing placed — normal, resolved, network continues. */
  carryingNetworkBreaks: number;
  /** Required breaks with nothing placed — genuinely unresolved. */
  unresolvedRequiredBreaks: number;
  overCount: number;
  totalOverSeconds: number;
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

  for (const b of breaks) {
    const fit = computeBreakFit(b.available_duration_seconds, b.occupied_duration_seconds);
    const status = computeBreakStatus({ requirement: b.requirement, item_count: b.item_count, fit });

    if (status === "filled" || status === "over") filledBreaks++;
    if (status === "carrying_network") carryingNetworkBreaks++;
    if (status === "unresolved_required") unresolvedRequiredBreaks++;
    if (fit.overSeconds > 0) {
      overCount++;
      totalOverSeconds += fit.overSeconds;
    }
  }

  return {
    totalBreaks: breaks.length,
    filledBreaks,
    carryingNetworkBreaks,
    unresolvedRequiredBreaks,
    overCount,
    totalOverSeconds,
    ready: unresolvedRequiredBreaks === 0 && overCount === 0,
  };
}
