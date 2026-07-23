// Pure role logic for the Editorial Planning tool, factored out of access.ts
// so it's testable without "server-only" / Supabase (mirrors lib/auth/predicates).
//
// tool_access.tool_role is free text the portal doesn't interpret; this tool
// recognizes three canonical values and treats anything else (including null)
// as the base 'contributor' role. Matching mirrors the ep_role() SQL helper.

export type EditorialRole = "contributor" | "reviewer" | "editor";

const ROLE_RANK: Record<EditorialRole, number> = {
  contributor: 0,
  reviewer: 1,
  editor: 2,
};

export function normalizeToolRole(toolRole: string | null): EditorialRole {
  const lowered = toolRole?.trim().toLowerCase();
  return lowered === "editor" || lowered === "reviewer" ? lowered : "contributor";
}

export function roleAtLeast(role: EditorialRole, minimum: EditorialRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}
