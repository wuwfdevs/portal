/**
 * Parsing one inventory-pool target out of a form (docs/underwriting-traffic-
 * redesign.md §3). Shared by the inline "New pool" card, which submits
 * several targets prefixed `target_<key>_`, and the per-pool "Add a target"
 * form, which submits one with no prefix — so both validate a window the
 * same way. Pure: no Supabase, no redirect.
 */

import type { UwTimeMode } from "@/lib/database.types";

export interface PoolTargetInput {
  program_id: string | null;
  window_start: string | null;
  window_end: string | null;
  days_of_week: number[] | null;
  notes: string | null;
}

export type ParsedPoolTarget =
  | { kind: "blank" }
  | { kind: "error"; message: string }
  | { kind: "target"; target: PoolTargetInput };

function optional(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value === "" ? null : value;
}

/**
 * Reads the target fields under `prefix` (e.g. `target_3_`). A row with no
 * program, no window, no days, and no notes is `blank` — the create card
 * starts with an empty row a user may simply leave alone — and is skipped
 * rather than saved as an "any program, any time" target by accident.
 */
export function parseTarget(formData: FormData, prefix: string): ParsedPoolTarget {
  const programId = optional(formData, `${prefix}program_id`);
  const windowStart = optional(formData, `${prefix}window_start`);
  const windowEnd = optional(formData, `${prefix}window_end`);
  const notes = optional(formData, `${prefix}notes`);
  const days = [
    ...new Set(
      formData
        .getAll(`${prefix}days_of_week`)
        .map((value) => Number.parseInt(String(value), 10))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    ),
  ].sort((a, b) => a - b);

  if (
    programId === null &&
    windowStart === null &&
    windowEnd === null &&
    notes === null &&
    days.length === 0
  ) {
    return { kind: "blank" };
  }
  if ((windowStart === null) !== (windowEnd === null)) {
    return { kind: "error", message: "Give both ends of the window, or neither." };
  }
  if (windowStart !== null && windowEnd !== null && windowEnd <= windowStart) {
    return { kind: "error", message: "The window must end after it starts." };
  }
  return {
    kind: "target",
    target: {
      program_id: programId,
      window_start: windowStart,
      window_end: windowEnd,
      days_of_week: days.length === 0 ? null : days,
      notes,
    },
  };
}

export type ParsedPoolTargets =
  { ok: true; targets: PoolTargetInput[] } | { ok: false; message: string };

/**
 * Every target row the create card submitted, in row order, blank rows
 * dropped. The card lists its rows in `target_keys` (one hidden input per
 * row) rather than parallel `getAll` arrays, because a row's day checkboxes
 * contribute zero-to-seven values and would throw the arrays out of step.
 */
export function parseTargetRows(formData: FormData): ParsedPoolTargets {
  const keys = formData.getAll("target_keys").map((key) => String(key));
  const targets: PoolTargetInput[] = [];
  keys.forEach((key, index) => {
    const parsed = parseTarget(formData, `target_${key}_`);
    if (parsed.kind === "blank") return;
    if (parsed.kind === "error") {
      throw new TargetRowError(`Target ${index + 1}: ${parsed.message}`);
    }
    targets.push(parsed.target);
  });
  return { ok: true, targets };
}

class TargetRowError extends Error {}

/** `parseTargetRows`, with a row's error returned rather than thrown. */
export function collectTargetRows(formData: FormData): ParsedPoolTargets {
  try {
    return parseTargetRows(formData);
  } catch (error) {
    if (error instanceof TargetRowError) return { ok: false, message: error.message };
    throw error;
  }
}

/**
 * The programs a pool's targets can ever place into, for narrowing a
 * schedule line's program pick (2026-09-27): a line naming both a pool and
 * a program is the intersection, so a program the pool never covers can
 * never find a break. Returns null when the pool is unrestricted — a target
 * with no program means "any program in this window" — or when it has no
 * targets yet (nothing to narrow by; the editor already flags an unmapped
 * pool).
 */
export function programsPermittedByPool(targets: { program_id: string | null }[]): string[] | null {
  if (targets.length === 0 || targets.some((target) => target.program_id === null)) return null;
  return [...new Set(targets.map((target) => target.program_id as string))];
}

/** Whether a line may name `programId` alongside this pool — see programsPermittedByPool(). */
export function poolPermitsProgram(
  targets: { program_id: string | null }[],
  programId: string,
): boolean {
  const permitted = programsPermittedByPool(targets);
  return permitted === null || permitted.includes(programId);
}

// ---------------------------------------------------------------------------
// Can the pool reach the line at all? (2026-09-27)
//
// A line names *where* a credit may air (pool and/or program, days, a time
// rule); a pool's targets name *what the pool reaches* (a program, a window,
// days). A line asking for a day or a time none of the pool's targets
// serves can never find a break — or, for a `preferred` line, whose time
// only ranks and never excludes, finds one quietly in the wrong daypart: a
// 4:48 pm line on a pool whose one target was Morning Edition 6–9 am seated
// every credit at 8:59 am, and nothing said so. Same class of contradiction
// as a program the pool never targets (programsPermittedByPool above), so
// the same treatment: refused at save, named on the dashboard and by
// auto-fill. Coverage is judged against the targets alone — a target with
// no window is taken to reach any time, since its program's own air hours
// live in Log, which this tool's session can't read. That is the known gap
// (docs/underwriting-traffic-redesign.md §11.6), not an oversight.

const EXACT_REACH_TOLERANCE_MINUTES = 3;

export interface PoolTargetReach {
  program_id: string | null;
  /** "HH:MM" or "HH:MM:SS", station-local; null means any time. */
  window_start: string | null;
  window_end: string | null;
  /** 0=Sunday..6=Saturday; null means any day. */
  days_of_week: number[] | null;
}

export interface LineReachLike {
  program_id: string | null;
  /** Empty means any day. */
  days_of_week: number[];
  time_mode: UwTimeMode;
  preferred_time: string | null;
  window_start: string | null;
  window_end: string | null;
}

export type PoolReachability =
  | { kind: "reachable" }
  /** The pool has no targets yet — unfinished, not wrong; warn, never refuse. */
  | { kind: "no_targets" }
  /** Targets exist and none serves the line's program, days, or time — a contradiction to refuse. */
  | { kind: "unreachable"; why: "program" | "days" | "time" };

function minutes(time: string): number {
  const [hour, minute] = time.split(":");
  return Number(hour) * 60 + Number(minute);
}

/** Does this target's window (null = any time) admit a break the line's time rule could use? */
function targetReachesTime(target: PoolTargetReach, line: LineReachLike): boolean {
  if (target.window_start === null || target.window_end === null) return true;
  const start = minutes(target.window_start);
  const end = minutes(target.window_end);
  switch (line.time_mode) {
    case "preferred": {
      if (line.preferred_time === null) return true;
      const at = minutes(line.preferred_time);
      return at >= start && at < end;
    }
    case "exact": {
      // A break up to the guard's tolerance either side satisfies the line,
      // so the window only has to touch that band.
      if (line.preferred_time === null) return true;
      const at = minutes(line.preferred_time);
      return (
        at + EXACT_REACH_TOLERANCE_MINUTES >= start && at - EXACT_REACH_TOLERANCE_MINUTES < end
      );
    }
    case "window": {
      if (line.window_start === null || line.window_end === null) return true;
      return minutes(line.window_start) < end && minutes(line.window_end) > start;
    }
    case "any":
    case "opening":
    case "closing":
      return true;
  }
}

function targetReachesDays(target: PoolTargetReach, line: LineReachLike): boolean {
  if (target.days_of_week === null || line.days_of_week.length === 0) return true;
  return line.days_of_week.some((day) => target.days_of_week!.includes(day));
}

/**
 * Whether any of the pool's targets serves the line — its program (when it
 * names one), at least one of its days, and its time rule. Checked in that
 * order so `why` names the first axis nothing reaches.
 */
export function poolReachability(
  targets: PoolTargetReach[],
  line: LineReachLike,
): PoolReachability {
  if (targets.length === 0) return { kind: "no_targets" };
  const onProgram = targets.filter(
    (target) =>
      line.program_id === null ||
      target.program_id === null ||
      target.program_id === line.program_id,
  );
  if (onProgram.length === 0) return { kind: "unreachable", why: "program" };
  const onDays = onProgram.filter((target) => targetReachesDays(target, line));
  if (onDays.length === 0) return { kind: "unreachable", why: "days" };
  if (!onDays.some((target) => targetReachesTime(target, line)))
    return { kind: "unreachable", why: "time" };
  return { kind: "reachable" };
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "16:48:00" → "4:48 PM". */
export function formatWallClock(time: string): string {
  const total = minutes(time);
  const hour24 = Math.floor(total / 60);
  const minute = total % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${hour24 < 12 ? "AM" : "PM"}`;
}

/** The line's own time rule in words, for a message about it. */
function describeLineTime(line: LineReachLike): string {
  if ((line.time_mode === "preferred" || line.time_mode === "exact") && line.preferred_time)
    return formatWallClock(line.preferred_time);
  if (line.time_mode === "window" && line.window_start && line.window_end)
    return `${formatWallClock(line.window_start)}–${formatWallClock(line.window_end)}`;
  return "that time";
}

/**
 * One sentence saying why the pool can't serve the line, with the two ways
 * out — shared by the save refusal, auto-fill's skip reason and the
 * dashboard so they never drift. Null when the pool reaches the line.
 */
export function describePoolReachability(
  reach: PoolReachability,
  poolName: string,
  line: LineReachLike,
): string | null {
  switch (reach.kind) {
    case "reachable":
      return null;
    case "no_targets":
      return `The ${poolName} pool has no targets yet, so nothing can be placed through it. Map it to programs on the Pools screen.`;
    case "unreachable": {
      const fix = "Add a target to the pool that does, or change the pool on the line.";
      switch (reach.why) {
        case "program":
          return `The ${poolName} pool never places into that program, so the line could never find a break. Pick a program the pool covers, or leave the program blank.`;
        case "days": {
          const days =
            line.days_of_week.length === 1
              ? DAY_NAMES[line.days_of_week[0]!]
              : line.days_of_week.map((day) => DAY_NAMES[day]).join(", ");
          return `The ${poolName} pool never airs on ${days}: none of its targets covers that day. ${fix}`;
        }
        case "time":
          return `The ${poolName} pool never reaches ${describeLineTime(line)}: none of its targets' windows includes that time. ${fix}`;
      }
    }
  }
}
