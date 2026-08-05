// Pure role logic for Academic Partnerships, factored out of access.ts so
// it's testable without "server-only" / Supabase (mirrors lib/roadmap/roles.ts).
//
// Unlike Roadmap, this tool is invite_only: a tool_access grant is still the
// ticket in. A grant carrying tool_role = 'coordinator' additionally allows
// changing Settings (copy, templates, open/closed, the appointments URL) —
// see private.is_academic_partnerships_coordinator() in the migration, which
// is where this is actually enforced.

export type AcademicPartnershipsRole = "member" | "coordinator";

export function normalizeToolRole(toolRole: string | null): AcademicPartnershipsRole {
  return toolRole?.trim().toLowerCase() === "coordinator" ? "coordinator" : "member";
}

/** What each recognized tool_role value means, for the admin grant UI's dropdown. */
export const ROLE_OPTIONS: { value: AcademicPartnershipsRole; label: string; description: string }[] = [
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
