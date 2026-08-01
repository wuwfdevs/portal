import type { Database } from "@/lib/database.types";

// Two rules about a registry row that more than one place has to agree on, kept
// pure and here rather than repeated inline. Both were introduced by the
// Roadmap tool (docs/roadmap-design.md §6); neither changes how any existing
// tool behaves, because every other row is invite_only and none is proposed.

type ToolRow = Pick<Database["public"]["Tables"]["tools"]["Row"], "status" | "default_access">;

/**
 * Whether opening this tool requires an explicit `tool_access` row.
 *
 * `tools.default_access` has carried 'approved_staff' since the platform
 * schema was written, with its own column comment describing it as "any active
 * user may open it" — and nothing enforcing it. Roadmap is the first tool that
 * wants it, so this is where it starts meaning something. Reading the column
 * (rather than special-casing a tool key) means an administrator can tighten a
 * tool to invite_only from the registry screen and the gate follows, with no
 * code change; `private.has_roadmap_access` reads the same column in SQL.
 *
 * 'open' is deliberately not included: the schema still describes it as
 * "informational only in phase 1, not yet enforced", and no row uses it.
 */
export function grantRequiredForTool(tool: ToolRow): boolean {
  return tool.default_access !== "approved_staff";
}

/**
 * Whether this tool belongs on the dashboard at all. A 'proposed' tool is an
 * idea somebody filed on the Roadmap, not software — it exists so a roadmap
 * post has something to point at, and showing it as a card would promise a
 * product that does not exist.
 */
export function isListedOnDashboard(tool: ToolRow): boolean {
  return tool.status !== "proposed";
}
