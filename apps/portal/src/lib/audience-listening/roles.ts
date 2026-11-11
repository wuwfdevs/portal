// Pure role logic for Audience Listening, factored out of access.ts so it is testable without "server-only" / Supabase.
//
// Everyone with the tool works its queries, campaigns, events and inboxes. The one elevation is `coordinator`, who approves a public
// event for listing on the website (suite design §11, item 4): listing puts a stranger's gathering under the station's name, so it is
// a named role and not every grant. Roles stack (tool_access.tool_roles), enforced in the database by
// private.is_audience_listening_coordinator() and the guard trigger on al_events.

import { parseRoleSet } from "@/lib/role-keys";
import type { ToolRoleSpec } from "@/lib/tool-role-spec";

export type AudienceListeningRole = "coordinator";

const KNOWN: readonly AudienceListeningRole[] = ["coordinator"];

/** The roles a grant carries, in a stable order. */
export function parseAudienceListeningRoles(toolRoles: readonly string[] | null | undefined): AudienceListeningRole[] {
  return parseRoleSet(toolRoles, KNOWN);
}

export const ROLE_OPTIONS: { value: AudienceListeningRole; label: string; description: string }[] = [
  {
    value: "coordinator",
    label: "Coordinator",
    description:
      "Additionally approves or declines a public event for listing on the website, and can take a listed event off it. Name the Audience & Engagement lead and one backup",
  },
];

/** The admin access screen's view of this tool. */
export const ROLE_SPEC: ToolRoleSpec = {
  toolKey: "audience-listening",
  kind: "stacking",
  baseAccess: "With no role: works queries, campaigns, events, tables and the inboxes. Cannot list an event on the website.",
  roles: ROLE_OPTIONS,
};
