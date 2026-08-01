// Pure role logic for the Roadmap tool, factored out of access.ts so it's
// testable without "server-only" / Supabase (mirrors lib/editorial/roles.ts).
//
// Roadmap inverts the portal's usual arrangement. Everywhere else a
// tool_access grant is the ticket in; here the registry row is
// default_access = 'approved_staff', so every active staff member is already a
// member and a grant is the *elevation*. A grant carrying 'curator' makes
// someone a curator; a grant carrying anything else (or no grant at all) is an
// ordinary member. Matching mirrors the private.is_roadmap_curator() SQL
// helper, which is where it is actually enforced.

export type RoadmapRole = "member" | "curator";

export function normalizeToolRole(toolRole: string | null): RoadmapRole {
  return toolRole?.trim().toLowerCase() === "curator" ? "curator" : "member";
}

/** What each recognized tool_role value means, for the admin grant UI's dropdown. */
export const ROLE_OPTIONS: { value: RoadmapRole; label: string; description: string }[] = [
  {
    value: "member",
    label: "Member",
    description: "No grant needed — every active staff member can post, vote, and comment",
  },
  {
    value: "curator",
    label: "Curator",
    description: "Additionally moves posts through the roadmap statuses and writes decision notes",
  },
];
