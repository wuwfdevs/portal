// Pure role logic for Traffic (key `underwriting`), factored out of access.ts
// so it's testable without "server-only" / Supabase. See
// docs/broadcast-roles.md.
//
// Traffic is invite_only: a tool_access grant is the ticket in, and a grant
// with no role is ordinary traffic staff (contracts, copy, placement,
// exception triage). Roles stack — a grant carries a list
// (tool_access.tool_roles):
//   * manager — waives obligations, certifies affidavits, and overrides
//     expired/unapproved copy into a placement
//     (private.is_underwriting_manager(), enforced in the database);
//   * production — records messages into DAD and marks them recorded
//     (private.is_underwriting_production()).

export type UnderwritingRole = "manager" | "production";

const KNOWN: readonly UnderwritingRole[] = ["manager", "production"];

/** The roles a grant carries, in a stable order. */
export function parseUnderwritingRoles(
  toolRoles: readonly string[] | null | undefined,
): UnderwritingRole[] {
  const found = new Set((toolRoles ?? []).map((role) => role.trim().toLowerCase()));
  return KNOWN.filter((role) => found.has(role));
}

/** What each role means, for the admin grant screen's checkboxes. */
export const ROLE_OPTIONS: { value: UnderwritingRole; label: string; description: string }[] = [
  {
    value: "manager",
    label: "Traffic manager",
    description:
      "Waives obligations, certifies affidavits, and overrides expired or unapproved copy into a placement",
  },
  {
    value: "production",
    label: "Production",
    description: "Records messages into DAD and marks them recorded",
  },
];
