// Decides what a verified Portal sign-in does to the site's staff accounts. Pure.
//
// The one rule that matters: a Portal identity is linked to a CMS account by the Portal's profile id, never
// by email alone. An account that already exists with the same email but no link (the break-glass
// administrator, or anyone created by hand) is NOT taken over; the sign-in is refused and an administrator
// resolves it deliberately.

import type { SiteRole } from '@wuwf/portal-contracts'

export interface Identity {
  portalUserId: string
  email: string
  name: string
  roles: SiteRole[]
}

export interface ExistingUser {
  id: string | number
  portalUserId: string | null
  email: string
}

export type SyncPlan =
  | { action: 'create'; data: { portalUserId: string; email: string; name: string; roles: SiteRole[] } }
  | { action: 'update'; id: string | number; data: { email: string; name: string; roles: SiteRole[] } }
  | { action: 'refuse'; reason: 'email_belongs_to_another_account' }

export const normalizeEmail = (email: string): string => email.trim().toLowerCase()

export function planUserSync(identity: Identity, byPortalId: ExistingUser | null, byEmail: ExistingUser | null): SyncPlan {
  const email = normalizeEmail(identity.email)
  const data = { email, name: identity.name, roles: identity.roles }
  if (byPortalId) {
    // Their email changed in the Portal to one another account already uses: do not merge accounts.
    if (byEmail && String(byEmail.id) !== String(byPortalId.id)) return { action: 'refuse', reason: 'email_belongs_to_another_account' }
    return { action: 'update', id: byPortalId.id, data }
  }
  if (byEmail) return { action: 'refuse', reason: 'email_belongs_to_another_account' }
  return { action: 'create', data: { portalUserId: identity.portalUserId, ...data } }
}
