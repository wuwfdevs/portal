// Pure role logic for Academic Partnerships, factored out of access.ts so
// it's testable without "server-only" / Supabase (mirrors lib/roadmap/roles.ts).
//
// Unlike Roadmap, this tool is invite_only: a tool_access grant is still the
// ticket in. A grant carrying tool_role = 'coordinator' additionally allows
// changing Settings (copy, templates, open/closed, the appointments URL) —
// see private.is_academic_partnerships_coordinator() in the migration, which
// is where this is actually enforced.

import { singleRole } from "@/lib/role-keys";
import type { ToolRoleSpec } from "@/lib/tool-role-spec";

export type AcademicPartnershipsRole = "member" | "coordinator";

export function normalizeToolRole(toolRole: string | null): AcademicPartnershipsRole {
  return singleRole(toolRole, "coordinator", "member");
}

/** What each recognized tool_role value means, for the admin grant UI's dropdown. */
export const ROLE_OPTIONS: {
  value: AcademicPartnershipsRole;
  label: string;
  description: string;
}[] = [
  {
    value: "member",
    label: "Member",
    description: "Views and works submissions through the pipeline",
  },
  {
    value: "coordinator",
    label: "Coordinator",
    description: "Additionally edits the public form, copy, templates, and the appointments URL",
  },
];

/**
 * The admin access screen's view of this tool. A grant is the ticket in, and only the
 * elevation is a role to choose. This was missing from the screen's catalog, so no one could
 * be made a coordinator from it.
 */
export const ROLE_SPEC: ToolRoleSpec = {
  toolKey: "academic-partnerships",
  kind: "stacking",
  baseAccess: "With no role: views and works submissions through the pipeline.",
  roles: ROLE_OPTIONS.filter((option) => option.value !== "member"),
};
