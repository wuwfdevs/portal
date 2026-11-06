// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { setMailerForTests, type Mail } from '@/lib/email/mailer'
import { checkClaim, claimMembership, hasMembersListening, membershipStatus } from '@/lib/members/claim'

// Members' listening (phase 7c-1): Member Services records a qualifying membership, a claim link is emailed to the address on it,
// and opening that link while signed in connects the reader's account. Never an email match.

const run = Date.now().toString(36)
let payload: Payload
let outbox: Mail[] = []
let mailUp = true
const ctx = { disableRevalidate: true }
const staff = (roles: string[]) => ({ id: 1, collection: 'users', email: 's@wuwf.org', roles }) as never
const tokenOf = (mail: Mail) => new URL(/https?:\/\/\S+/.exec(mail.text)![0]).searchParams.get('token')!
const reader = (n: string) => ({ id: `reader-${run}-${n}`, email: `someone-else-${n}@example.org` })
const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

const add = (n: string, extra: Record<string, unknown> = {}) =>
  payload.create({ collection: 'memberships', data: { name: `Member ${n}`, email: `Member-${n}-${run}@Example.org`, endsOn: days(30), ...extra } as never, overrideAccess: false, user: staff(['membership']), context: ctx })

describe("members' listening: memberships and claims", () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    setMailerForTests({ isConfigured: () => mailUp, send: async (m) => (mailUp ? (outbox.push(m), { ok: true }) : { ok: false, reason: 'failed' }) })
  })
  beforeEach(() => {
    outbox = []
    mailUp = true
  })
  afterAll(async () => {
    setMailerForTests(null)
    await payload.delete({ collection: 'memberships', where: { email: { like: run } }, overrideAccess: true, context: ctx })
    await payload.delete({ collection: 'audience-profiles', where: { supabaseUserId: { like: `reader-${run}` } }, overrideAccess: true, context: ctx })
  })

  it('lets membership staff record a membership; editors and the public cannot see one', async () => {
    const m = await add('a')
    expect(m.email).toBe(`member-a-${run}@example.org`)
    const look = (user?: never) => payload.findByID({ collection: 'memberships', id: m.id, overrideAccess: false, ...(user ? { user } : {}) }).then(() => 'seen', () => 'refused')
    expect(await look(staff(['membership']))).toBe('seen')
    expect(await look(staff(['editor']))).toBe('refused')
    expect(await look()).toBe('refused')
  })

  it('emails a single-use claim link to the address on the membership, and keeps only its hash', async () => {
    const m = await add('b', { sendClaimEmail: true })
    expect(outbox).toHaveLength(1)
    expect(outbox[0]!.to).toBe(`member-b-${run}@example.org`)
    expect(outbox[0]!.subject).toBe('Connect your WUWF membership to wuwf.org')
    const token = tokenOf(outbox[0]!)
    const stored = (await payload.findByID({ collection: 'memberships', id: m.id, overrideAccess: true })) as unknown as Record<string, unknown>
    expect(JSON.stringify(stored)).not.toContain(token)
    expect(stored.sendClaimEmail).toBe(false)
    const asStaff = (await payload.findByID({ collection: 'memberships', id: m.id, overrideAccess: false, user: staff(['membership']) })) as unknown as { claim: Record<string, unknown> }
    expect(asStaff.claim.tokenHash).toBeUndefined()
    expect(asStaff.claim.sentAt).toBeTruthy()
  })

  it('connects the account the link is opened in, whatever address it signed in with, and spends the link', async () => {
    await add('c', { sendClaimEmail: true })
    const token = tokenOf(outbox[0]!)
    const who = reader('c')
    expect(await hasMembersListening(payload, who.id, new Date())).toBe(false)
    expect((await claimMembership(payload, token, who, new Date())).kind).toBe('ok')
    expect(await hasMembersListening(payload, who.id, new Date())).toBe(true)
    expect((await checkClaim(payload, token, new Date())).kind).toBe('invalid')
    expect((await claimMembership(payload, token, reader('thief'), new Date())).kind).toBe('invalid')
    expect(await hasMembersListening(payload, reader('thief').id, new Date())).toBe(false)
  })

  it('never connects an account by matching its email to the membership', async () => {
    await add('d')
    const sameAddress = { id: `reader-${run}-d`, email: `member-d-${run}@example.org` }
    expect(await membershipStatus(payload, sameAddress.id, new Date())).toEqual({ state: 'none' })
  })

  it('refuses an expired link and a forged one', async () => {
    await add('e', { sendClaimEmail: true })
    const token = tokenOf(outbox[0]!)
    expect((await checkClaim(payload, token, new Date(Date.now() + 15 * 86_400_000))).kind).toBe('expired')
    expect((await checkClaim(payload, 'A'.repeat(43), new Date())).kind).toBe('invalid')
    expect((await checkClaim(payload, 'not a token', new Date())).kind).toBe('invalid')
  })

  it('keeps the link working when staff edit the membership later', async () => {
    const m = await add('f', { sendClaimEmail: true })
    const token = tokenOf(outbox[0]!)
    await payload.update({ collection: 'memberships', id: m.id, data: { note: 'Renewed by phone', endsOn: days(60) } as never, overrideAccess: false, user: staff(['membership']), context: ctx })
    expect((await checkClaim(payload, token, new Date())).kind).toBe('ok')
  })

  it('saves nothing and says why when the email cannot be sent, or is not set up', async () => {
    mailUp = false
    const err = await add('g', { sendClaimEmail: true }).then(() => null, (e: { data?: { errors?: { message: string }[] } }) => (e.data?.errors ?? []).map((x) => x.message).join(' '))
    expect(err).toMatch(/Email is not set up/)
    expect((await payload.find({ collection: 'memberships', where: { name: { equals: 'Member g' } }, overrideAccess: true })).totalDocs).toBe(0)
  })

  it('stops access 14 days after the end date, and says so', async () => {
    const m = await add('h', { sendClaimEmail: true, endsOn: '2026-01-31' })
    const who = reader('h')
    await claimMembership(payload, tokenOf(outbox[0]!), who, new Date('2026-01-15T12:00:00Z'))
    expect(await membershipStatus(payload, who.id, new Date('2026-02-10T12:00:00Z'))).toEqual({ state: 'active', endsOn: expect.stringMatching(/^2026-01-31/), inGrace: true })
    expect((await membershipStatus(payload, who.id, new Date('2026-02-20T12:00:00Z'))).state).toBe('ended')
    expect(m.id).toBeTruthy()
  })

  it('will not send a new claim link for a membership that is already connected', async () => {
    await add('i', { sendClaimEmail: true })
    const who = reader('i')
    await claimMembership(payload, tokenOf(outbox[0]!), who, new Date())
    const row = (await payload.find({ collection: 'memberships', where: { name: { equals: 'Member i' } }, overrideAccess: true })).docs[0]!
    const err = await payload
      .update({ collection: 'memberships', id: row.id, data: { sendClaimEmail: true } as never, overrideAccess: false, user: staff(['membership']), context: ctx })
      .then(() => null, (e: { data?: { errors?: { message: string }[] } }) => (e.data?.errors ?? []).map((x) => x.message).join(' '))
    expect(err).toMatch(/already connected/)
  })
})
