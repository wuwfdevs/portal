// The shape every tool's roles.ts exports as `ROLE_SPEC`: what the admin access screen needs to
// offer a tool's roles. A leaf module (it imports nothing), like role-keys.ts, because tool-roles.ts
// imports each tool's roles.ts and they could not import it back.
//
// This is descriptive: the SQL predicates (private.is_log_producer() and the rest) stay the
// boundary, and tool_access.tool_roles stays free text those predicates interpret. A tool with no
// role to grant has no spec at all, and the screen shows it as "access only".

export interface RoleOption {
  value: string;
  label: string;
  description: string;
}

/**
 * How a tool's roles relate to each other:
 *   ranked   - one level per person, each including the ones before it (Editorial Planning).
 *              The first option is the level someone holds when none is chosen.
 *   stacking - any combination, none including another (On Air, Traffic, Bookings, ...). A tool
 *              with one extra role (Roadmap's curator) is stacking with a single option.
 */
export type RoleKind = "ranked" | "stacking";

export interface ToolRoleSpec {
  /** `tools.key`: the authorization identifier, not the route or the name staff read. */
  toolKey: string;
  kind: RoleKind;
  /** What a person can do with the tool and no role, in one sentence. Shown under the tool's name. */
  baseAccess: string;
  /** The roles an administrator can grant, in display order. Base access is not listed here. */
  roles: RoleOption[];
}
