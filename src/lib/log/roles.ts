// Pure role logic for On Air (key `log`), factored out of access.ts so it's
// testable without "server-only" / Supabase. See docs/broadcast-roles.md.
//
// On Air is invite_only: a tool_access grant is the ticket in, and a grant
// with no role is on-air staff (fill breaks, run the rundown). Roles stack —
// a grant carries a list (tool_access.tool_roles):
//   * program_director — clocks, local opportunities, the program schedule,
//     programs, and automated hours (private.is_log_producer());
//   * traffic — station ID pins and the DAD log release
//     (private.is_log_traffic()).
// The SQL predicates are the boundary; this only shapes the screens.

export type LogRole = "program_director" | "traffic";

const KNOWN: readonly LogRole[] = ["program_director", "traffic"];

/**
 * The roles a grant carries. `producer`, the role before the split, held both
 * jobs and still reads as both.
 */
export function parseLogRoles(toolRoles: readonly string[] | null | undefined): LogRole[] {
  const found = new Set<LogRole>();
  for (const raw of toolRoles ?? []) {
    const role = raw.trim().toLowerCase();
    if (role === "producer") {
      found.add("program_director");
      found.add("traffic");
    } else if ((KNOWN as readonly string[]).includes(role)) {
      found.add(role as LogRole);
    }
  }
  return KNOWN.filter((role) => found.has(role));
}

/** What each role means, for the admin grant screen's checkboxes. */
export const ROLE_OPTIONS: { value: LogRole; label: string; description: string }[] = [
  {
    value: "program_director",
    label: "Program director",
    description: "Edits clocks, the program schedule, programs, and automated hours",
  },
  {
    value: "traffic",
    label: "Traffic",
    description: "Pins station IDs and other required content, and releases the DAD log",
  },
];
