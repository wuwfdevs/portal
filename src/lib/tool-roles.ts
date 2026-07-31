// Which tools have distinct, meaningful tool_role values, and what they mean.
// tool_access.tool_role stays free text interpreted only by the owning tool
// (see CLAUDE.md) — this is purely descriptive metadata for the admin grant
// UI's dropdown, not a new enforcement layer. A tool with no entry here has
// binary access (granted or not); the admin UI should show a role dropdown
// only for tools that actually branch on it.
import { ROLE_OPTIONS as EDITORIAL_ROLE_OPTIONS } from "@/lib/editorial/roles";

export interface RoleOption {
  value: string;
  label: string;
  description: string;
}

const ROLE_CATALOG: Record<string, RoleOption[]> = {
  "editorial-planning": EDITORIAL_ROLE_OPTIONS,
};

/** The role options for a tool (by `tools.key`), or null if it has none. */
export function getRoleCatalog(toolKey: string): RoleOption[] | null {
  return ROLE_CATALOG[toolKey] ?? null;
}
