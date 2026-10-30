import type { AuthStrategy } from 'payload'

import { STAFF_SESSION_COOKIE, deriveSessionKey, isSessionRevoked, readCookie, verifyStaffSession } from './staff-session'

/**
 * Accepts the signed cookie issued after a verified Portal sign-in. Runs alongside Payload's own login, which
 * stays for the local break-glass administrator. Anything wrong with the cookie means "not signed in", never
 * an error: a stale cookie must not break public pages.
 */
export const portalSessionStrategy: AuthStrategy = {
  name: 'portal-session',
  authenticate: async ({ headers, payload }) => {
    const token = readCookie(headers.get('cookie'), STAFF_SESSION_COOKIE)
    if (!token) return { user: null }

    const session = await verifyStaffSession(token, await deriveSessionKey(payload.secret))
    if (!session.ok) return { user: null }

    let user
    try {
      user = await payload.findByID({ collection: 'users', id: session.claims.sub, depth: 0, overrideAccess: true })
    } catch {
      return { user: null } // the account was deleted
    }
    if (isSessionRevoked(session.claims.iat, user.sessionsValidAfter)) return { user: null }

    return { user: { ...user, collection: 'users', _strategy: 'portal-session' } }
  },
}
