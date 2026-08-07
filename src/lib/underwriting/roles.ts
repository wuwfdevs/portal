// Pure role logic for Underwriting & Traffic, factored out of access.ts so
// it's testable without "server-only" / Supabase (mirrors lib/log/roles.ts).
//
// Underwriting is invite_only: a tool_access grant is still the ticket in. A
// grant carrying tool_role = 'manager' additionally allows waiving an
// obligation, certifying an affidavit, and overriding expired/unapproved
// copy into a placement — docs/underwriting-design.md §6. The override
// check itself lives in private.is_underwriting_manager(), enforced inside
// log_place_underwriting_credit() (the boundary), not here.

export type UnderwritingRole = "member" | "manager";

export function normalizeToolRole(toolRole: string | null): UnderwritingRole {
  return toolRole?.trim().toLowerCase() === "manager" ? "manager" : "member";
}

/** What each recognized tool_role value means, for the admin grant UI's dropdown. */
export const ROLE_OPTIONS: { value: UnderwritingRole; label: string; description: string }[] = [
  {
    value: "member",
    label: "Member",
    description: "Contracts, copy, placement, and exception triage up to but not including a waive/certify decision",
  },
  {
    value: "manager",
    label: "Manager",
    description: "Additionally waives obligations, certifies affidavits, and overrides expired/unapproved copy into a placement",
  },
];
