// The live rundown screen's wall-clock position — pure and recomputed on
// every render/poll, not stored, same rule lib/log/timing.ts follows for
// build-time fit. There is no automation-system feed and no live playback
// telemetry (docs/log-design.md's "What's deliberately not in the
// architecture"), so "where are we" is wall-clock time against the plan.
//
// This used to also derive a header timing badge (on time / running long /
// running short / at risk) from whether each break's items had been marked
// aired. Removed 2026-09-24: hosts often mark items only at the end of a
// broadcast, so "running long" lit up after every filled break, and the
// sidebar countdown plus the current-break highlight already say what the
// badge was trying to.
//
// The live timeline's unit is the *break* (docs/log-design.md §4B) — a
// break is what has a scheduled start and a network rejoin point; the items
// placed inside it are what actually air.

export interface ConsoleBreakLike {
  id: string;
  scheduled_at: string;
  network_rejoin_at: string;
}

/**
 * The break airing (or that should be airing) at `nowISO` — the one most
 * recently started — and the one after it. Breaks are expected
 * chronological and non-overlapping, same assumption lib/log/clock-face.ts
 * makes of slots.
 */
export function findCurrentBreak<T extends { scheduled_at: string }>(
  nowISO: string,
  breaks: ReadonlyArray<T>,
): { currentBreak: T | null; nextBreak: T | null } {
  const nowMs = new Date(nowISO).getTime();
  const sorted = [...breaks].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  let currentBreak: T | null = null;
  let nextBreak: T | null = null;
  for (const brk of sorted) {
    if (new Date(brk.scheduled_at).getTime() <= nowMs) {
      currentBreak = brk;
    } else {
      nextBreak = brk;
      break;
    }
  }
  return { currentBreak, nextBreak };
}

/**
 * Every instant at which the live screen's server-rendered state can change
 * for this schedule, given fixed break data: a break becoming current (its
 * start), a break handing back to the network (its rejoin — when the
 * sidebar countdown moves on, see selectRejoinWidgetTarget), and the shift's
 * end. Between two consecutive instants that state is constant, so a live
 * screen only needs to re-render at these moments — not on a short fixed
 * tick. Sorted ascending, deduplicated, ISO strings.
 */
export function liveRefreshInstants(
  breaks: ReadonlyArray<Pick<ConsoleBreakLike, "scheduled_at" | "network_rejoin_at">>,
  shiftEndAtISO: string,
): string[] {
  const instantsMs = new Set<number>();
  for (const brk of breaks) {
    instantsMs.add(new Date(brk.scheduled_at).getTime());
    instantsMs.add(new Date(brk.network_rejoin_at).getTime());
  }
  instantsMs.add(new Date(shiftEndAtISO).getTime());
  return [...instantsMs]
    .filter((ms) => Number.isFinite(ms))
    .sort((a, b) => a - b)
    .map((ms) => new Date(ms).toISOString());
}

/** Minimum delay a poller will ever arm — guards against a tight loop if a clock is skewed. */
export const MIN_REFRESH_DELAY_MS = 1_000;
/** Armed this long *after* an instant so a server rendering on its own clock is safely past it. */
export const REFRESH_GRACE_MS = 1_500;

/**
 * How long a poller should wait before its next refresh: until just after
 * the earliest of `instantsISO` still ahead of `nowMs`, or `fallbackMs` if
 * none is that soon (or none is given at all). Never below
 * MIN_REFRESH_DELAY_MS.
 */
export function nextRefreshDelayMs(
  nowMs: number,
  instantsISO: ReadonlyArray<string>,
  fallbackMs: number,
): number {
  let delay = fallbackMs;
  for (const iso of instantsISO) {
    const targetMs = new Date(iso).getTime() + REFRESH_GRACE_MS;
    if (!Number.isFinite(targetMs) || targetMs <= nowMs) continue;
    delay = Math.min(delay, targetMs - nowMs);
  }
  return Math.max(delay, MIN_REFRESH_DELAY_MS);
}

export interface RejoinWidgetBreak {
  id: string;
  scheduled_at: string;
  network_rejoin_at: string;
  /** The break holds an item of its own or is receiving spillover from the break before it — i.e. something local airs in it. */
  hasLocalContent: boolean;
  /** Spillover from the break before it runs into this one (covered_by_previous / preempted_by_previous in lib/log/timing.ts). */
  receivesSpillover: boolean;
}

export type RejoinWidgetTarget =
  /** Local content is on the air now: count down to the moment the network feed comes back. `finalBreakId` is the last break of a spillover chain, or the airing break itself. */
  | { kind: "rejoin"; airingBreakId: string; finalBreakId: string; targetISO: string }
  /** The network feed is on the air: count down to the next break with local content planned. */
  | { kind: "next_break"; breakId: string; targetISO: string }
  /** Nothing local is left this shift: count down to the shift's end. */
  | { kind: "shift_end"; targetISO: string };

/**
 * What the rundown screen's sidebar countdown should point at, at `nowISO`.
 *
 * A break is only "airing" until its network rejoin — extended through any
 * contiguous breaks its planned content spills into. Past that instant the
 * network feed is back regardless of what was or wasn't confirmed, so a
 * countdown still pegged to it (counting up, in red, until the next break
 * merely *starts*) is never the right thing to show; the next break with
 * local content is. `breaks` must be sorted by `scheduled_at`.
 */
export function selectRejoinWidgetTarget(
  nowISO: string,
  breaks: ReadonlyArray<RejoinWidgetBreak>,
  shiftEndAtISO: string,
): RejoinWidgetTarget {
  const nowMs = new Date(nowISO).getTime();
  // The break most recently started — may already be past its rejoin.
  let startedIndex = -1;
  for (let index = 0; index < breaks.length; index++) {
    if (new Date(breaks[index]!.scheduled_at).getTime() <= nowMs) startedIndex = index;
    else break;
  }

  if (startedIndex !== -1) {
    // Spillover only chains through contiguous breaks (the no-gap rule in
    // lib/log/timing.ts), so walking forward while the next break receives
    // it finds where local content actually hands back to the network.
    let last = startedIndex;
    while (last + 1 < breaks.length && breaks[last + 1]!.receivesSpillover) last += 1;
    const chainEndISO = breaks[last]!.network_rejoin_at;
    if (breaks[startedIndex]!.hasLocalContent && new Date(chainEndISO).getTime() > nowMs) {
      return {
        kind: "rejoin",
        airingBreakId: breaks[startedIndex]!.id,
        finalBreakId: breaks[last]!.id,
        targetISO: chainEndISO,
      };
    }
  }

  const nextFilled = breaks.slice(startedIndex + 1).find((brk) => brk.hasLocalContent);
  if (nextFilled)
    return { kind: "next_break", breakId: nextFilled.id, targetISO: nextFilled.scheduled_at };
  return { kind: "shift_end", targetISO: shiftEndAtISO };
}
