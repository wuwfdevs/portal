// Which tools have distinct, meaningful tool_role values, and what they mean.
// tool_access.tool_role stays free text interpreted only by the owning tool
// (see CLAUDE.md) — this is purely descriptive metadata for the admin grant
// UI, not a new enforcement layer. Each tool describes itself: its roles.ts
// exports a ROLE_SPEC (lib/tool-role-spec.ts) and the list below only gathers
// them, so a tool with roles cannot be left off the screen by forgetting a
// second place (tool-role-specs.test.ts fails if it is). A tool with no spec
// has binary access (granted or not).
import { ROLE_SPEC as EDITORIAL_SPEC } from "@/lib/editorial/roles";
import { ROLE_SPEC as ROADMAP_SPEC } from "@/lib/roadmap/roles";
import { ROLE_SPEC as LOG_SPEC } from "@/lib/log/roles";
import { ROLE_SPEC as UNDERWRITING_SPEC } from "@/lib/underwriting/roles";
import { ROLE_SPEC as RESOURCES_SPEC } from "@/lib/resources/roles";
import { ROLE_SPEC as BOOKINGS_SPEC } from "@/lib/bookings/roles";
import { ROLE_SPEC as SOURCEWORK_SPEC } from "@/lib/sourcework/roles";
import { ROLE_SPEC as ACADEMIC_PARTNERSHIPS_SPEC } from "@/lib/academic-partnerships/roles";
// The public site's CMS (apps/site). The Portal only carries these roles to it; the site maps them.
import { ROLE_SPEC as WEBSITE_SPEC } from "@/lib/website/roles";
import type { RoleOption, ToolRoleSpec } from "@/lib/tool-role-spec";

export type { RoleKind, RoleOption, ToolRoleSpec } from "@/lib/tool-role-spec";

export const TOOL_ROLE_SPECS: readonly ToolRoleSpec[] = [
  EDITORIAL_SPEC,
  ROADMAP_SPEC,
  LOG_SPEC,
  UNDERWRITING_SPEC,
  RESOURCES_SPEC,
  BOOKINGS_SPEC,
  SOURCEWORK_SPEC,
  ACADEMIC_PARTNERSHIPS_SPEC,
  WEBSITE_SPEC,
];

const SPEC_BY_KEY = new Map(TOOL_ROLE_SPECS.map((spec) => [spec.toolKey, spec]));

/** A tool's role spec (by `tools.key`), or null for a tool with nothing to grant but access. */
export function getRoleSpec(toolKey: string): ToolRoleSpec | null {
  return SPEC_BY_KEY.get(toolKey) ?? null;
}

/** The role options for a tool (by `tools.key`), or null if it has none. */
export function getRoleCatalog(toolKey: string): RoleOption[] | null {
  return getRoleSpec(toolKey)?.roles ?? null;
}

/** Whether a tool's roles stack (checkboxes) rather than being one choice (radio cards). */
export function rolesStack(toolKey: string): boolean {
  return getRoleSpec(toolKey)?.kind === "stacking";
}

export interface ToolGrantInput {
  toolId: string;
  /** Lowercased, deduplicated and sorted, the same way the tool_access trigger stores them. */
  toolRoles: string[];
}

/**
 * Reads the admin grant form: one `tool_id` per checked tool, its roles from
 * either the checkboxes (`tool_roles_<id>`, tools whose roles stack) or the
 * radio cards (`tool_role_<id>`, a ranked tool).
 *
 * A tool open to every active user (`openToolIds`: Roadmap, Resources) has no
 * access checkbox, since everyone is already in. A grant on it is only an
 * elevation, so it exists exactly when a role is chosen.
 */
export function parseToolGrants(
  form: { getAll(name: string): unknown[] },
  options: { openToolIds?: ReadonlySet<string> } = {},
): ToolGrantInput[] {
  const checked = new Set(form.getAll("tool_id").map(String).filter(Boolean));
  const open = options.openToolIds ?? new Set<string>();
  const toolRolesFor = (toolId: string) => {
    const raw = [...form.getAll(`tool_roles_${toolId}`), ...form.getAll(`tool_role_${toolId}`)];
    return [
      ...new Set(raw.map((value) => String(value).trim().toLowerCase()).filter(Boolean)),
    ].sort();
  };

  const grants: ToolGrantInput[] = [];
  for (const toolId of checked) {
    grants.push({ toolId, toolRoles: toolRolesFor(toolId) });
  }
  for (const toolId of open) {
    if (checked.has(toolId)) continue;
    const toolRoles = toolRolesFor(toolId);
    if (toolRoles.length > 0) grants.push({ toolId, toolRoles });
  }
  return grants;
}

/** Whether two stored role lists say the same thing. */
export function sameRoles(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((role, index) => role === b[index]);
}
