// Pure role logic for Resources, factored out of access.ts so it's testable
// without "server-only" / Supabase (mirrors lib/roadmap/roles.ts).
//
// Same arrangement as Roadmap: the registry row is default_access =
// 'approved_staff', so every active user is already a reader, and a grant is
// the elevation. A grant carrying 'editor' makes someone an editor; anything
// else (or no grant) is a reader. Matching mirrors the private.
// is_resources_editor() SQL helper, which is where it is enforced.

import { singleRole } from "@/lib/role-keys";

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
