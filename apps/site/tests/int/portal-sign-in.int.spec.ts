import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { mintIdentityToken } from '@wuwf/portal-contracts'

import { GET } from '@/app/api/portal/sso/route'
import { signInFromPortal } from '@/lib/portal/sign-in'
import { STAFF_SESSION_COOKIE } from '@/lib/portal/staff-session'
import { Users } from '@/collections/Users'

const SECRET = 'identity-secret-'.padEnd(48, 'x')
const run = Date.now().toString(36)
let payload: Payload
const createdUsers: (string | number)[] = []

const nowSeconds = () => Math.floor(Date.now() / 1000)
const email = (tag: string) => `${tag}-${run}@wuwf.org`

async function token(over: { portalUserId?: string; email?: string; roles?: string[]; now?: number; jti?: string; lifetimeSeconds?: number } = {}) {
  return mintIdentityToken(
    { userId: over.portalUserId ?? randomUUID(), email: over.email ?? email(`staff-${randomUUID().slice(0, 8)}`), name: 'Test Staff', roles: over.roles ?? ['editor'], now: over.now, jti: over.jti, lifetimeSeconds: over.lifetimeSeconds },
    SECRET,
  )
}
const signIn = (t: string | null, over: { identitySecret?: string | undefined } = {}) =>
  signInFromPortal({ payload, token: t, identitySecret: 'identitySecret' in over ? over.identitySecret : SECRET, secureCookie: false })

const cookieOf = (setCookie: string) => setCookie.split(';')[0]!
async function whoIs(cookie: string) {
  const { user } = await payload.auth({ headers: new Headers({ cookie }) })
  return user as { id: string | number; roles?: string[]; email: string } | null
}

describe('signing in from the Portal', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    // The test database is its own and local (vitest.setup.ts enforces it). Start with no staff so the
    // "first user" rule is genuinely exercised.
    await payload.delete({ collection: 'users', where: { id: { exists: true } }, overrideAccess: true })
  }, 60_000)

  afterAll(async () => {
    for (const id of createdUsers) await payload.delete({ collection: 'users', id, overrideAccess: true }).catch(() => undefined)
    await payload.delete({ collection: 'portal-sign-ins', where: { id: { exists: true } }, overrideAccess: true }).catch(() => undefined)
  })

  it('a valid token creates the account with exactly the Portal roles, and the cookie then authenticates', async () => {
    const r = await signIn(await token({ roles: ['editor'] }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    createdUsers.push(r.userId)
    expect(r.redirectTo).toBe('/admin')
    expect(r.cookie).toContain(`${STAFF_SESSION_COOKIE}=`)
    expect(r.cookie).toContain('HttpOnly')

    const user = await whoIs(cookieOf(r.cookie))
    expect(user?.id).toBe(r.userId)
    // The very first account in an empty database must NOT be handed every role just for being first.
    expect(user?.roles).toEqual(['editor'])
  })

  it('a token works once: the second use is refused', async () => {
    const t = await token()
    const first = await signIn(t)
    expect(first.ok).toBe(true)
    if (first.ok) createdUsers.push(first.userId)
    const second = await signIn(t)
    expect(second).toMatchObject({ ok: false, status: 401, code: 'replayed' })
  })

  it('two simultaneous uses of one token let exactly one through', async () => {
    const t = await token()
    const results = await Promise.all([signIn(t), signIn(t), signIn(t)])
    for (const r of results) if (r.ok) createdUsers.push(r.userId)
    expect(results.filter((r) => r.ok)).toHaveLength(1)
  })

  it('refuses an expired token, a token for another secret, a missing token, and an unconfigured server', async () => {
    expect(await signIn(await token({ now: nowSeconds() - 1000 }))).toMatchObject({ ok: false, status: 401, code: 'expired' })
    const other = await mintIdentityToken({ userId: randomUUID(), email: email('x'), name: 'X', roles: ['administrator'] }, 'different-secret-'.padEnd(48, 'y'))
    expect(await signIn(other)).toMatchObject({ ok: false, status: 401, code: 'bad_signature' })
    expect(await signIn(null)).toMatchObject({ ok: false, status: 401, code: 'missing_token' })
    expect(await signIn(await token(), { identitySecret: undefined })).toMatchObject({ ok: false, status: 503, code: 'not_configured' })
    expect(await signIn(await token(), { identitySecret: 'too-short' })).toMatchObject({ ok: false, status: 503 })
  })

  it('an edit to the roles inside the token is refused', async () => {
    const t = await token({ roles: ['editor'] })
    const [h, p, s] = t.split('.') as [string, string, string]
    const body = JSON.parse(Buffer.from(p, 'base64url').toString())
    body.roles = ['administrator']
    const forged = `${h}.${Buffer.from(JSON.stringify(body)).toString('base64url')}.${s}`
    expect(await signIn(forged)).toMatchObject({ ok: false, code: 'bad_signature' })
  })

  it('roles follow the Portal: a second sign-in replaces them, so a revoked role disappears', async () => {
    const portalUserId = randomUUID()
    const addr = email('roles')
    const a = await signIn(await token({ portalUserId, email: addr, roles: ['editor', 'publisher'] }))
    expect(a.ok).toBe(true)
    if (a.ok) createdUsers.push(a.userId)
    const b = await signIn(await token({ portalUserId, email: addr, roles: ['editor'] }))
    expect(b.ok).toBe(true)
    if (!b.ok || !a.ok) return
    expect(b.userId).toBe(a.userId)
    expect((await whoIs(cookieOf(b.cookie)))?.roles).toEqual(['editor'])
  })

  it('never takes over an existing account just because the email matches', async () => {
    const addr = email('local-admin')
    const local = await payload.create({ collection: 'users', data: { email: addr, password: randomUUID(), name: 'Local', roles: ['administrator'] }, overrideAccess: true })
    createdUsers.push(local.id)
    const r = await signIn(await token({ email: addr, roles: ['editor'] }))
    expect(r).toMatchObject({ ok: false, status: 403, code: 'email_belongs_to_another_account' })
    const after = await payload.findByID({ collection: 'users', id: local.id, overrideAccess: true })
    expect(after.roles).toEqual(['administrator']) // untouched
    expect(after.portalUserId ?? null).toBeNull()
  })

  it('a session dies when the user\'s sessionsValidAfter passes it (logout, or "sign out everywhere")', async () => {
    const r = await signIn(await token())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    createdUsers.push(r.userId)
    const cookie = cookieOf(r.cookie)
    expect(await whoIs(cookie)).not.toBeNull()
    await payload.update({ collection: 'users', id: r.userId, data: { sessionsValidAfter: new Date(Date.now() + 5000).toISOString() }, overrideAccess: true })
    expect(await whoIs(cookie)).toBeNull()
  })

  it('a tampered or foreign cookie is simply "not signed in"', async () => {
    const r = await signIn(await token())
    if (r.ok) createdUsers.push(r.userId)
    if (!r.ok) throw new Error('setup')
    const c = cookieOf(r.cookie)
    expect(await whoIs(c.slice(0, -3) + 'abc')).toBeNull()
    expect(await whoIs(`${STAFF_SESSION_COOKIE}=garbage`)).toBeNull()
  })

  it('an account holding no roles cannot enter the admin', () => {
    const adminAccess = Users.access!.admin!
    expect(adminAccess({ req: { user: { roles: [] } } } as never)).toBe(false)
    expect(adminAccess({ req: { user: { roles: ['editor'] } } } as never)).toBe(true)
    expect(adminAccess({ req: { user: null } } as never)).toBe(false)
  })
})

describe('the route', () => {
  it('redirects a good token to the admin with the session cookie, and answers a bad one with a plain refusal', async () => {
    process.env.PORTAL_IDENTITY_SECRET = SECRET
    const good = await GET(new Request(`http://localhost:3000/api/portal/sso?token=${encodeURIComponent(await token())}`))
    expect(good.status).toBe(303)
    expect(good.headers.get('location')).toBe('http://localhost:3000/admin')
    expect(good.headers.get('set-cookie')).toContain(STAFF_SESSION_COOKIE)
    expect(good.headers.get('cache-control')).toBe('no-store')
    expect(good.headers.get('referrer-policy')).toBe('no-referrer')

    const bad = await GET(new Request('http://localhost:3000/api/portal/sso?token=nope'))
    expect(bad.status).toBe(401)
    expect(bad.headers.get('set-cookie')).toBeNull()
    expect(await bad.text()).toMatch(/not valid or has already been used/)
  })
})
