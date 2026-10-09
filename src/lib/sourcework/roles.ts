// Pure role logic for Sourcework research (tool key `transcription`), factored
// out of access.ts so it is testable without "server-only" / Supabase.
// See docs/sourcework-analysis-design.md §8.
//
// Everyone with the tool runs steps, reviews, accepts and makes pieces. The
// single elevation is `editor`, which maintains the prompts every project's
// runs use (and, in Phase E, the piece formats). Roles stack like Traffic's
// (tool_access.tool_roles), enforced in the database by
// private.is_sourcework_editor().

import { parseRoleSet } from "@/lib/role-keys";

export type SourceworkRole = "editor";

const KNOWN: readonly SourceworkRole[] = ["editor"];

/** The roles a grant carries, in a stable order. */
export function parseSourceworkRoles(
  toolRoles: readonly string[] | null | undefined,
): SourceworkRole[] {
  return parseRoleSet(toolRoles, KNOWN);
}

/** What each role means, for the admin grant screen's checkboxes. */
export const ROLE_OPTIONS: { value: SourceworkRole; label: string; description: string }[] = [
  {
    value: "editor",
    label: "Editor",
    description:
      "Additionally maintains the research prompts every project's runs use: edits the wording, tries a draft, publishes and rolls back",
  },
];
