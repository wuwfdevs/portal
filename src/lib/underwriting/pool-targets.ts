/**
 * Parsing one inventory-pool target out of a form (docs/underwriting-traffic-
 * redesign.md §3). Shared by the inline "New pool" card, which submits
 * several targets prefixed `target_<key>_`, and the per-pool "Add a target"
 * form, which submits one with no prefix — so both validate a window the
 * same way. Pure: no Supabase, no redirect.
 */

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
