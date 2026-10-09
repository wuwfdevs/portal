// Role-value helpers every tool's roles.ts shares. A leaf module (it imports nothing), because
// tool-roles.ts imports each tool's roles.ts and they could not import it back.

/** A stored role value as the tools compare it: trimmed and lowercased. */
export function normalizeRoleKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * The roles of a stacking grant that this tool knows, in the tool's own
 * order. Anything unrecognised is ignored, so a typo in the database never
 * grants a role.
 */
export function parseRoleSet<R extends string>(
  raw: readonly string[] | null | undefined,
  known: readonly R[],
): R[] {
  const present = new Set((raw ?? []).map(normalizeRoleKey));
  return known.filter((role) => present.has(role));
}

/**
 * A single-role tool's role: `elevated` when the grant carries exactly that
 * role, otherwise the tool's ordinary `base` role.
 */
export function singleRole<E extends string, B extends string>(
  raw: string | null | undefined,
  elevated: E,
  base: B,
): E | B {
  return normalizeRoleKey(raw) === elevated ? elevated : base;
}
