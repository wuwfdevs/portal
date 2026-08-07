// The live console's continuous timing state (docs/log-design.md §12.4) —
// pure and recomputed on every render/poll, not stored, same rule
// lib/log/timing.ts follows for build-time fit. This module is scoped by
// what this milestone actually has: wall-clock time versus the plan, plus
// whether every item currently placed in a break has been confirmed (a
// log_broadcast_events row exists for it). There is no automation-system
// feed and no live playback telemetry (docs/log-design.md's "What's
// deliberately not in the architecture" — every outcome is host-confirmed).
//
// The live timeline's unit is now the *break* (docs/log-design.md §4B), not
// a single-slot item — a break is what has a scheduled start and a network
// rejoin point; the items placed inside it are what actually air.

export interface ConsoleBreakLike {
  id: string;
  scheduled_at: string;
  network_rejoin_at: string;
  requirement: "optional" | "required";
  itemCount: number;
  /** Whether every item currently placed in this break has a recorded broadcast outcome. Vacuously true for an empty break. */
  allItemsConfirmed: boolean;
}

export type LiveTimingState = "on_time" | "running_long" | "running_short" | "at_risk_required" | "at_risk_rejoin";

export interface LiveTimingResult {
  state: LiveTimingState;
  currentBreak: ConsoleBreakLike | null;
  nextBreak: ConsoleBreakLike | null;
  /** Seconds left before this break's own network-rejoin point — negative once past it. Null with no current break. */
  secondsRemainingInCurrent: number | null;
  /** Seconds until the shift's overall network rejoin point (shift_end_at) — negative once past it. */
  secondsToRejoin: number;
}

export interface LiveTimingThresholds {
  /** How close to a deadline (rejoin, or a required break's own rejoin) counts as "at risk." Default 60s. */
  riskThresholdSeconds: number;
  /** How much spare time before rejoin counts as "running short" once every item is confirmed. Default 30s. */
  shortThresholdSeconds: number;
}

const DEFAULT_THRESHOLDS: LiveTimingThresholds = { riskThresholdSeconds: 60, shortThresholdSeconds: 30 };

/**
 * The break airing (or that should be airing) at `nowISO`, and the one
 * after it — breaks are expected sorted by scheduled_at, chronological and
 * non-overlapping, same assumption lib/log/clock-face.ts makes of slots.
 */
function findCurrentAndNext<T extends { scheduled_at: string }>(
  items: T[],
  nowMs: number,
): { current: T | null; next: T | null } {
  let current: T | null = null;
  let next: T | null = null;
  for (const item of items) {
    const startMs = new Date(item.scheduled_at).getTime();
    if (startMs <= nowMs) {
      current = item;
    } else {
      next = item;
      break;
    }
  }
  return { current, next };
}

export function computeLiveTimingState(
  nowISO: string,
  breaks: ConsoleBreakLike[],
  shiftEndAtISO: string,
  thresholds: Partial<LiveTimingThresholds> = {},
): LiveTimingResult {
  const { riskThresholdSeconds, shortThresholdSeconds } = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const sorted = [...breaks].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const nowMs = new Date(nowISO).getTime();
  const { current, next } = findCurrentAndNext(sorted, nowMs);
  const secondsToRejoin = (new Date(shiftEndAtISO).getTime() - nowMs) / 1000;

  if (!current) {
    return {
      state: "on_time",
      currentBreak: null,
      nextBreak: next,
      secondsRemainingInCurrent: null,
      secondsToRejoin,
    };
  }

  const currentRejoinMs = new Date(current.network_rejoin_at).getTime();
  const secondsRemainingInCurrent = (currentRejoinMs - nowMs) / 1000;
  const isLastBreak = sorted[sorted.length - 1]?.id === current.id;
  const currentUnresolved = current.itemCount === 0 ? current.requirement === "required" : !current.allItemsConfirmed;

  let state: LiveTimingState = "on_time";
  if (current.itemCount > 0 && !current.allItemsConfirmed && secondsRemainingInCurrent < -riskThresholdSeconds) {
    state = "running_long";
  } else if (current.itemCount > 0 && current.allItemsConfirmed && secondsRemainingInCurrent > shortThresholdSeconds) {
    state = "running_short";
  }

  if (
    current.requirement === "required" &&
    current.itemCount === 0 &&
    secondsRemainingInCurrent <= riskThresholdSeconds
  ) {
    state = "at_risk_required";
  }

  if (isLastBreak && currentUnresolved && secondsToRejoin <= riskThresholdSeconds) {
    state = "at_risk_rejoin";
  }

  return { state, currentBreak: current, nextBreak: next, secondsRemainingInCurrent, secondsToRejoin };
}
