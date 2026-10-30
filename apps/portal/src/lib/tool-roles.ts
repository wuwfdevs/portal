// Which tools have distinct, meaningful tool_role values, and what they mean.
// tool_access.tool_role stays free text interpreted only by the owning tool
// (see CLAUDE.md) — this is purely descriptive metadata for the admin grant
// UI's dropdown, not a new enforcement layer. A tool with no entry here has
// binary access (granted or not); the admin UI should show a role dropdown
// only for tools that actually branch on it.
import { ROLE_OPTIONS as EDITORIAL_ROLE_OPTIONS } from "@/lib/editorial/roles";
import { ROLE_OPTIONS as ROADMAP_ROLE_OPTIONS } from "@/lib/roadmap/roles";
import { ROLE_OPTIONS as LOG_ROLE_OPTIONS } from "@/lib/log/roles";
import { ROLE_OPTIONS as UNDERWRITING_ROLE_OPTIONS } from "@/lib/underwriting/roles";
import { ROLE_OPTIONS as RESOURCES_ROLE_OPTIONS } from "@/lib/resources/roles";
import { ROLE_OPTIONS as BOOKINGS_ROLE_OPTIONS } from "@/lib/bookings/roles";
import { ROLE_OPTIONS as SOURCEWORK_ROLE_OPTIONS } from "@/lib/sourcework/roles";

export interface RoleOption {
  value: string;
  label: string;
  description: string;
}

const ROLE_CATALOG: Record<string, RoleOption[]> = {
  "editorial-planning": EDITORIAL_ROLE_OPTIONS,
  // Roadmap is open to every active staff member without a grant, so a grant
  // here only ever means "curator" — see lib/roadmap/roles.ts.
  roadmap: ROADMAP_ROLE_OPTIONS,
  log: LOG_ROLE_OPTIONS,
  underwriting: UNDERWRITING_ROLE_OPTIONS,
  // Open to every active user like Roadmap; a grant only ever means "editor".
  resources: RESOURCES_ROLE_OPTIONS,
  bookings: BOOKINGS_ROLE_OPTIONS,
  // Sourcework's registry key is still `transcription`. Everyone with access runs
  // research; a grant only ever adds "editor" (the prompts) — lib/sourcework/roles.ts.
  transcription: SOURCEWORK_ROLE_OPTIONS,
};

// Tools whose roles stack: a grant may carry any combination
// (tool_access.tool_roles), and the admin screen shows a checkbox per role
// instead of one dropdown. See docs/broadcast-roles.md; Bookings follows the
// same shape (docs/bookings-design.md §3).
const STACKING_TOOLS = new Set(["log", "underwriting", "bookings", "transcription"]);

/** The role options for a tool (by `tools.key`), or null if it has none. */
export function getRoleCatalog(toolKey: string): RoleOption[] | null {
  return ROLE_CATALOG[toolKey] ?? null;
}

/** Whether a tool's roles stack (checkboxes) rather than being one choice (a dropdown). */
export function rolesStack(toolKey: string): boolean {
  return STACKING_TOOLS.has(toolKey);
}

export interface ToolGrantInput {
  toolId: string;
  /** Lowercased, deduplicated and sorted, the same way the tool_access trigger stores them. */
  toolRoles: string[];
}

/**
 * Reads the admin grant form: one `tool_id` per checked tool, its roles from
 * either the checkboxes (`tool_roles_<id>`, tools whose roles stack) or the
 * dropdown (`tool_role_<id>`, everything else).
 */
export function parseToolGrants(form: { getAll(name: string): unknown[] }): ToolGrantInput[] {
  const toolIds = [...new Set(form.getAll("tool_id").map(String).filter(Boolean))];
  return toolIds.map((toolId) => {
    const raw = [...form.getAll(`tool_roles_${toolId}`), ...form.getAll(`tool_role_${toolId}`)];
    const toolRoles = [
      ...new Set(raw.map((value) => String(value).trim().toLowerCase()).filter(Boolean)),
    ].sort();
    return { toolId, toolRoles };
  });
}

/** Whether two stored role lists say the same thing. */
export function sameRoles(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((role, index) => role === b[index]);
}
