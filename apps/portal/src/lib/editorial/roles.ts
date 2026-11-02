// Pure role logic for the Editorial Planning tool, factored out of access.ts
// so it's testable without "server-only" / Supabase (mirrors lib/auth/predicates).
//
// tool_access.tool_role is free text the portal doesn't interpret; this tool
// recognizes three canonical values and treats anything else (including null)
// as the base 'contributor' role. Matching mirrors the ep_role() SQL helper.

import { normalizeRoleKey } from "@/lib/role-keys";
import type { ToolRoleSpec } from "@/lib/tool-role-spec";

export type EditorialRole = "contributor" | "reviewer" | "editor";

const ROLE_RANK: Record<EditorialRole, number> = {
  contributor: 0,
  reviewer: 1,
  editor: 2,
};

export function normalizeToolRole(toolRole: string | null): EditorialRole {
  const lowered = normalizeRoleKey(toolRole);
  return lowered === "editor" || lowered === "reviewer" ? lowered : "contributor";
}

export function roleAtLeast(role: EditorialRole, minimum: EditorialRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/** What each recognized tool_role value means, for the admin grant UI's dropdown. */
export const ROLE_OPTIONS: { value: EditorialRole; label: string; description: string }[] = [
  { value: "contributor", label: "Contributor", description: "Submit and edit their own pitches" },
  { value: "reviewer", label: "Reviewer", description: "Score pitches in weekly meetings" },
  {
    value: "editor",
    label: "Editor",
    description: "Decide pitches, edit the rubric and submission form",
  },
];

/** The admin access screen's view of this tool: one level per person, each including the one before. */
export const ROLE_SPEC: ToolRoleSpec = {
  toolKey: "editorial-planning",
  kind: "ranked",
  baseAccess: "With no level chosen: Contributor.",
  roles: ROLE_OPTIONS,
};
