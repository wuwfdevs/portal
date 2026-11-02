// The site's half of the Portal identity contract: verify the token, refuse a reuse, sync the staff account,
// and issue a session. Everything that can be pure is (staff-session.ts, sync.ts); this orchestrates it
// against Payload and is tested against a real database (tests/int/portal-sign-in.int.spec.ts).

import { randomBytes } from 'node:crypto'
import type { Payload } from 'payload'

import { verifyIdentityToken } from '@wuwf/portal-contracts'

import { deriveSessionKey, mintStaffSession, sessionCookie } from './staff-session'
import { normalizeEmail, planUserSync, type ExistingUser } from './sync'

/** How long a used token id is remembered: past the token's own life plus the allowed clock skew. */
const JTI_RETENTION_SECONDS = 10 * 60

export type SignInResult =
  | { ok: true; cookie: string; redirectTo: string; userId: string | number }
  | { ok: false; status: 401 | 403 | 503; message: string; code: string }

const INVALID = 'This sign-in link is not valid or has already been used. Open the Website tool in the Portal again.'

export async function signInFromPortal(args: {
  payload: Payload
  token: string | null
  /** PORTAL_IDENTITY_SECRET. */
  identitySecret: string | undefined
  secureCookie: boolean
  now?: number
}): Promise<SignInResult> {
  const { payload, token, identitySecret, secureCookie } = args
  const now = args.now ?? Math.floor(Date.now() / 1000)

  if (!identitySecret || identitySecret.length < 32) {
    payload.logger.error('Portal sign-in is not configured: PORTAL_IDENTITY_SECRET is missing or shorter than 32 characters')
    return { ok: false, status: 503, code: 'not_configured', message: 'Signing in from the Portal is not set up on this server yet.' }
  }
  if (!token) return { ok: false, status: 401, code: 'missing_token', message: INVALID }

  const verified = await verifyIdentityToken(token, identitySecret, now)
  if (!verified.ok) {
    payload.logger.warn(`Portal sign-in refused: ${verified.reason}`)
    return { ok: false, status: 401, code: verified.reason, message: INVALID }
  }
  const claims = verified.claims

  // One use only. The unique constraint is the guard: if two requests race, exactly one insert succeeds. Any
  // failure to record is treated as a refusal (fail closed), and logged apart from a plain replay.
  try {
    await payload.delete({ collection: 'portal-sign-ins', where: { expiresAt: { less_than: new Date(now * 1000).toISOString() } }, overrideAccess: true })
  } catch (error) {
    payload.logger.warn(`Could not sweep expired sign-in records: ${error instanceof Error ? error.message : String(error)}`)
  }
  try {
    await payload.create({
      collection: 'portal-sign-ins',
      data: { jti: claims.jti, portalUserId: claims.sub, expiresAt: new Date((claims.exp + JTI_RETENTION_SECONDS) * 1000).toISOString() },
      overrideAccess: true,
    })
  } catch (error) {
    payload.logger.warn(`Portal sign-in refused: token ${claims.jti} was already used or could not be recorded (${error instanceof Error ? error.message : String(error)})`)
    return { ok: false, status: 401, code: 'replayed', message: INVALID }
  }

  const email = normalizeEmail(claims.email)
  const [byPortal, byMail] = await Promise.all([
    payload.find({ collection: 'users', where: { portalUserId: { equals: claims.sub } }, limit: 1, depth: 0, overrideAccess: true }),
    payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true }),
  ])
  const lite = (u: (typeof byPortal.docs)[number] | undefined): ExistingUser | null =>
    u ? { id: u.id, portalUserId: u.portalUserId ?? null, email: u.email } : null

  const plan = planUserSync(
    { portalUserId: claims.sub, email: claims.email, name: claims.name, roles: claims.roles },
    lite(byPortal.docs[0]),
    lite(byMail.docs[0]),
  )

  if (plan.action === 'refuse') {
    payload.logger.warn(`Portal sign-in refused for ${email}: ${plan.reason}`)
    return {
      ok: false, status: 403, code: plan.reason,
      message: 'An account with this email already exists on WUWF.org and is not linked to your Portal profile. Ask an administrator to resolve it.',
    }
  }

  let userId: string | number
  if (plan.action === 'create') {
    const created = await payload.create({
      collection: 'users',
      // Nobody ever knows this password: access is through the Portal, or the break-glass account.
      data: { ...plan.data, password: randomBytes(32).toString('hex') },
      overrideAccess: true,
    })
    userId = created.id
  } else {
    await payload.update({ collection: 'users', id: plan.id, data: plan.data, overrideAccess: true })
    userId = plan.id
  }

  const session = await mintStaffSession({ userId, now }, await deriveSessionKey(payload.secret))
  return { ok: true, cookie: sessionCookie(session, { secure: secureCookie }), redirectTo: '/admin', userId }
}
