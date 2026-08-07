// The live console's continuous timing state (docs/log-design.md §12.4) —
// pure and recomputed on every render/poll, not stored, same rule
// lib/log/timing.ts follows for build-time fit. This module is scoped by
// what this milestone actually has: wall-clock time versus the plan, plus
// whether each item has been confirmed (a log_broadcast_events row exists
// for it). There is no automation-system feed and no live playback
// telemetry (docs/log-design.md's "What's deliberately not in the
// architecture" — every outcome is host-confirmed), so "running_short" here
// is a lighter-weight signal than a system with real elapsed-playback data
// could offer: it fires once a confirmed item's planned window still has
// meaningful time left, not from measuring actual audio length.

import type { LogRequirementLevel } from "@/lib/database.types";

export interface ConsoleItemLike {
  id: string;
  scheduled_at: string;
  planned_duration_seconds: number;
  requirement_level: LogRequirementLevel;
  /** Whether a broadcast event has already been recorded for this item (aired or missed). */
  confirmed: boolean;
}

export type LiveTimingState = "on_time" | "running_long" | "running_short" | "at_risk_required" | "at_risk_rejoin";

export interface LiveTimingResult {
  state: LiveTimingState;
  currentItem: ConsoleItemLike | null;
  nextItem: ConsoleItemLike | null;
  /** Seconds left in the current item's planned window — negative once it's run over. Null with no current item. */
  secondsRemainingInCurrent: number | null;
  /** Seconds until the shift's network rejoin point (shift_end_at) — negative once past it. */
  secondsToRejoin: number;
}

export interface LiveTimingThresholds {
  /** How close to a deadline (rejoin, or a required item's start) counts as "at risk." Default 60s. */
  riskThresholdSeconds: number;
  /** How much spare time in a confirmed item's window counts as "running short." Default 30s. */
  shortThresholdSeconds: number;
}

const DEFAULT_THRESHOLDS: LiveTimingThresholds = { riskThresholdSeconds: 60, shortThresholdSeconds: 30 };

/**
 * The item airing (or that should be airing) at `nowISO`, and the one after
 * it — items are expected sorted by scheduled_at, chronological and
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
  items: ConsoleItemLike[],
  shiftEndAtISO: string,
  thresholds: Partial<LiveTimingThresholds> = {},
): LiveTimingResult {
  const { riskThresholdSeconds, shortThresholdSeconds } = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const sorted = [...items].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const nowMs = new Date(nowISO).getTime();
  const { current, next } = findCurrentAndNext(sorted, nowMs);
  const secondsToRejoin = (new Date(shiftEndAtISO).getTime() - nowMs) / 1000;

  if (!current) {
    return { state: "on_time", currentItem: null, nextItem: next, secondsRemainingInCurrent: null, secondsToRejoin };
  }

  const currentEndMs = new Date(current.scheduled_at).getTime() + current.planned_duration_seconds * 1000;
  const secondsRemainingInCurrent = (currentEndMs - nowMs) / 1000;
  const isLastItem = sorted[sorted.length - 1]?.id === current.id;

  let state: LiveTimingState = "on_time";
  if (!current.confirmed && secondsRemainingInCurrent < -riskThresholdSeconds) {
    state = "running_long";
  } else if (current.confirmed && secondsRemainingInCurrent > shortThresholdSeconds) {
    state = "running_short";
  }

  if (
    next &&
    next.requirement_level === "required" &&
    !current.confirmed &&
    (new Date(next.scheduled_at).getTime() - nowMs) / 1000 <= riskThresholdSeconds
  ) {
    state = "at_risk_required";
  }

  if (isLastItem && !current.confirmed && secondsToRejoin <= riskThresholdSeconds) {
    state = "at_risk_rejoin";
  }

  return { state, currentItem: current, nextItem: next, secondsRemainingInCurrent, secondsToRejoin };
}
