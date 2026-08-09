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

export type BreakStatus =
  | "carrying_network"
  | "unresolved_required"
  | "filled"
  | "over"
  | "covered_by_previous";

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
 * Per-break status for a whole rundown, aware of spillover into an
 * immediately-following break: a host doesn't merge or configure anything —
 * they just place a longer piece of content than one break's own window,
 * and if the very next break is empty, optional, and starts exactly where
 * this one's network-rejoin point is (no gap), that next break reads as
 * 'covered_by_previous' instead of independently flagging 'carrying_network'
 * while this one flags 'over'. A required break, one that already has
 * content, or one separated by a gap is never eligible to be covered this
 * way. Only a single hop is absorbed — if the overage doesn't fit even
 * after folding in the next break's own window, both breaks are left with
 * their honest, unabsorbed status rather than silently reaching further.
 */
export function computeBreakStatuses(breaks: SpilloverBreakLike[]): BreakStatusResult[] {
  const sorted = [...breaks].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const results: BreakStatusResult[] = sorted.map((b) => {
    const fit = computeBreakFit(b.available_duration_seconds, b.occupied_duration_seconds);
    return {
      id: b.id,
      fit,
      status: computeBreakStatus({ requirement: b.requirement, item_count: b.item_count, fit }),
      coveredByBreakId: null,
    };
  });

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i]!;
    const currentResult = results[i]!;
    if (currentResult.status !== "over") continue;

    const next = sorted[i + 1]!;
    const nextResult = results[i + 1]!;
    const eligible =
      next.item_count === 0 &&
      next.requirement === "optional" &&
      next.scheduled_at === current.network_rejoin_at &&
      currentResult.fit.overSeconds <= next.available_duration_seconds;
    if (!eligible) continue;

    currentResult.status = "filled";
    nextResult.status = "covered_by_previous";
    nextResult.coveredByBreakId = current.id;
  }

  return results;
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

  for (const result of computeBreakStatuses(breaks)) {
    if (result.status === "filled" || result.status === "over" || result.status === "covered_by_previous") {
      filledBreaks++;
    }
    if (result.status === "carrying_network") carryingNetworkBreaks++;
    if (result.status === "unresolved_required") unresolvedRequiredBreaks++;
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
    ready: unresolvedRequiredBreaks === 0 && overCount === 0,
  };
}
