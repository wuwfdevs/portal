// Pure role logic for the Website tool (key `website`): the Portal as identity provider for the public
// site's CMS (apps/site). Invite-only: a tool_access grant is the ticket in, and the grant's stacking roles
// (tool_access.tool_roles, the shape docs/broadcast-roles.md established) are what the site is told about.
// The site maps them to permissions (packages/portal-contracts); the Portal only carries them.
//
//   * editor        — writes and edits stories, reviews listening answers
//   * publisher     — everything an editor does, and publishes
//   * sponsorship   — manages sponsors, underwriting agreements and campaigns
//   * membership    — manages entitlements and member feeds
//   * administrator — everything, including the site's staff and settings

import { SITE_ROLES, type SiteRole } from "@wuwf/portal-contracts";
import { parseRoleSet } from "@/lib/role-keys";

export type WebsiteRole = SiteRole;

/** The roles a grant carries, in a stable order. Anything the site doesn't know is dropped. */
export function parseWebsiteRoles(toolRoles: readonly string[] | null | undefined): WebsiteRole[] {
  return parseRoleSet(toolRoles, SITE_ROLES);
}

/** What each role means, for the admin grant screen's checkboxes. */
export const ROLE_OPTIONS: { value: WebsiteRole; label: string; description: string }[] = [
  { value: "editor", label: "Editor", description: "Writes and edits stories and reviews listening answers on WUWF.org" },
  { value: "publisher", label: "Publisher", description: "Everything an editor does, and publishes to WUWF.org" },
  { value: "sponsorship", label: "Sponsorship", description: "Manages sponsors, underwriting agreements and campaigns" },
  { value: "membership", label: "Membership", description: "Manages member entitlements and private feeds" },
  { value: "administrator", label: "Administrator", description: "Everything on WUWF.org, including its staff accounts and settings" },
];
