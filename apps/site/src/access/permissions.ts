import type { Access, FieldAccess, PayloadRequest } from 'payload'

import { can, type SitePermission } from '@wuwf/portal-contracts'

type WithRoles = { roles?: readonly string[] | null } | null | undefined

/** Whether the signed-in staff user holds a permission. Permissions come from roles (@wuwf/portal-contracts). */
export function userCan(user: WithRoles, permission: SitePermission): boolean {
  if (!user) return false
  return can(user.roles ?? [], permission)
}

/** Collection access: allowed for staff holding the permission. */
export const requirePermission =
  (permission: SitePermission): Access =>
  ({ req }) =>
    userCan(req.user as WithRoles, permission)

/** Field access: allowed for staff holding the permission. */
export const fieldRequires =
  (permission: SitePermission): FieldAccess =>
  ({ req }) =>
    userCan(req.user as WithRoles, permission)

/**
 * Read access for editorial documents: the public sees only published ones; staff who can write
 * content see everything, so drafts can be reviewed and previewed.
 */
export const publishedOrContentStaff: Access = ({ req }) => {
  if (userCan(req.user as WithRoles, 'content.write')) return true
  return { _status: { equals: 'published' } }
}

export const isStaff = ({ req }: { req: PayloadRequest }): boolean => Boolean(req.user)
