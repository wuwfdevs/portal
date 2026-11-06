// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { AudienceAuth, SendLinkResult } from '@/lib/audience/auth'
import { SIGN_IN_RATE } from '@/lib/audience/rules'
import { confirmUrl, recordSignIn, requestSignIn } from '@/lib/audience/sign-in'
import { isReservedPath } from '@/lib/paths'

// Audience sign-in (phase 7b). Supabase is replaced by a fake that records what it was asked; the flow around it is real.

let payload: Payload
const run = Date.now().toString(36)
const secret = `test-secret-${run}`

function fakeAuth(answer: SendLinkResult = { ok: true }) {
  const sent: { email: string; redirectTo: string }[] = []
  const auth: AudienceAuth = {
    sendSignInLink: async (email, redirectTo) => {
      sent.push({ email, redirectTo })
      return answer
    },
    verifyLink: async () => null,
    currentUser: async () => null,
    signOut: async () => undefined,
  }
  return { auth, sent }
}

const ask = (auth: AudienceAuth, over: Partial<Parameters<typeof requestSignIn>[2]> = {}) =>
  requestSignIn(payload, auth, { email: 'Reader@Example.org', honeypot: '', address: `198.51.100.${run.length}-${Math.random()}`, origin: 'https://wuwf.example', now: new Date(), ...over }, secret)

describe('audience sign-in', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })
  afterAll(async () => {
    await payload.delete({ collection: 'audience-profiles', where: { supabaseUserId: { like: `user-${run}` } }, overrideAccess: true })
  })

  it('sends a link to the address, lower-cased, coming back to /account/confirm on this site', async () => {
    const { auth, sent } = fakeAuth()
    expect(await ask(auth)).toEqual({ kind: 'sent' })
    expect(sent).toEqual([{ email: 'reader@example.org', redirectTo: 'https://wuwf.example/account/confirm' }])
    expect(confirmUrl('https://wuwf.example')).toBe('https://wuwf.example/account/confirm')
  })

  it('says "sent" to a bot that fills the hidden field, and sends nothing', async () => {
    const { auth, sent } = fakeAuth()
    expect(await ask(auth, { honeypot: 'http://spam.example' })).toEqual({ kind: 'sent' })
    expect(sent).toEqual([])
  })

  it('refuses something that is not an email address, without sending', async () => {
    const { auth, sent } = fakeAuth()
    expect(await ask(auth, { email: 'not an address' })).toEqual({ kind: 'invalid-email' })
    expect(sent).toEqual([])
  })

  it('limits one client to a few requests an hour, and stores only a hash of its address', async () => {
    const { auth, sent } = fakeAuth()
    const address = `203.0.113.77-${run}`
    for (let i = 0; i < SIGN_IN_RATE.perHour; i++) expect((await ask(auth, { address })).kind).toBe('sent')
    expect(await ask(auth, { address })).toEqual({ kind: 'limited', retryAfter: 'hour' })
    expect(sent).toHaveLength(SIGN_IN_RATE.perHour)
    const rows = await payload.find({ collection: 'submission-rate-limits', overrideAccess: true, limit: 500, pagination: false })
    expect(JSON.stringify(rows.docs)).not.toContain('203.0.113.77')
    expect(rows.docs.some((r) => (r as { key: string }).key.startsWith('signin:'))).toBe(true)
  })

  it('passes on Supabase’s "too soon" as a one-minute wait, and any other failure as unavailable', async () => {
    expect(await ask(fakeAuth({ ok: false, reason: 'too-soon' }).auth)).toEqual({ kind: 'limited', retryAfter: 'minute' })
    expect(await ask(fakeAuth({ ok: false, reason: 'failed' }).auth)).toEqual({ kind: 'unavailable' })
    expect(await ask(fakeAuth({ ok: false, reason: 'not-configured' }).auth)).toEqual({ kind: 'unavailable' })
  })

  it('makes one profile per Supabase user at the first sign-in, and stamps later ones; it holds no email address', async () => {
    const user = { id: `user-${run}`, email: 'reader@example.org' }
    const first = await recordSignIn(payload, user, new Date('2026-11-01T12:00:00Z'))
    const again = await recordSignIn(payload, user, new Date('2026-11-02T12:00:00Z'))
    expect(again.id).toBe(first.id)
    const doc = (await payload.findByID({ collection: 'audience-profiles', id: first.id, overrideAccess: true })) as unknown as Record<string, unknown>
    expect(doc.firstSignInAt).toBe('2026-11-01T12:00:00.000Z')
    expect(doc.lastSignInAt).toBe('2026-11-02T12:00:00.000Z')
    expect(JSON.stringify(doc)).not.toContain('example.org')
  })

  it('keeps profiles away from the public and from editors; membership staff may read them; nobody creates one by hand', async () => {
    const staff = (roles: string[]) => ({ id: 1, collection: 'users', email: 's@wuwf.org', roles }) as never
    const tryFind = (user?: never) => payload.find({ collection: 'audience-profiles', overrideAccess: false, ...(user ? { user } : {}), where: { supabaseUserId: { equals: `user-${run}` } } }).then((r) => r.docs.length, () => 'refused' as const)
    expect(await tryFind()).toBe('refused')
    expect(await tryFind(staff(['editor']))).toBe('refused')
    expect(await tryFind(staff(['membership']))).toBe(1)
    const created = await payload
      .create({ collection: 'audience-profiles', data: { supabaseUserId: `forged-${run}` }, overrideAccess: false, user: staff(['administrator']) })
      .then(() => 'created', () => 'refused')
    expect(created).toBe('refused')
  })

  it('reserves /account so no story or page can take it', () => {
    expect(isReservedPath('/account')).toBe(true)
    expect(isReservedPath('/account/sign-in')).toBe(true)
  })
})
