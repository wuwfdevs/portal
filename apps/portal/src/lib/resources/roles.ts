// Pure role logic for Resources, factored out of access.ts so it's testable
// without "server-only" / Supabase (mirrors lib/roadmap/roles.ts).
//
// Same arrangement as Roadmap: the registry row is default_access =
// 'approved_staff', so every active user is already a reader, and a grant is
// the elevation. A grant carrying 'editor' makes someone an editor; anything
// else (or no grant) is a reader. Matching mirrors the private.
// is_resources_editor() SQL helper, which is where it is enforced.

import { singleRole } from "@/lib/role-keys";
import type { ToolRoleSpec } from "@/lib/tool-role-spec";

export type ResourcesRole = "reader" | "editor";

export function normalizeToolRole(toolRole: string | null): ResourcesRole {
  return singleRole(toolRole, "editor", "reader");
}

/** What each recognized tool_role value means, for the admin grant UI's dropdown. */
export const ROLE_OPTIONS: { value: ResourcesRole; label: string; description: string }[] = [
  {
    value: "reader",
    label: "Reader",
    description: "No grant needed — every active user can read what is addressed to them",
  },
  {
    value: "editor",
    label: "Editor",
    description: "Additionally writes and edits station procedures and tool guides",
  },
];

/**
 * The admin access screen's view of this tool. Everyone is already a reader, so only the
 * elevation is grantable.
 */
export const ROLE_SPEC: ToolRoleSpec = {
  toolKey: "resources",
  kind: "stacking",
  baseAccess: "Every active user can read what is addressed to them.",
  roles: ROLE_OPTIONS.filter((option) => option.value !== "reader"),
};
