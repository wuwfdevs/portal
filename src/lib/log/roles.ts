// Pure role logic for Log, factored out of access.ts so it's testable
// without "server-only" / Supabase (mirrors lib/academic-partnerships/roles.ts).
//
// Log is invite_only: a tool_access grant is still the ticket in. A grant
// carrying tool_role = 'producer' additionally allows editing clock
// templates/versions and the program schedule — see
// private.is_log_producer() in the migration, which is where this is
// actually enforced.

export type LogRole = "member" | "producer";

export function normalizeToolRole(toolRole: string | null): LogRole {
  return toolRole?.trim().toLowerCase() === "producer" ? "producer" : "member";
}

/** What each recognized tool_role value means, for the admin grant UI's dropdown. */
export const ROLE_OPTIONS: { value: LogRole; label: string; description: string }[] = [
  {
    value: "member",
    label: "Member",
    description: "Builds and executes rundowns, manages the content library, runs the console",
  },
  {
    value: "producer",
    label: "Producer",
    description: "Additionally edits clock templates/versions and the program schedule",
  },
];
