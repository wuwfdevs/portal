// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureTestSection } from '../helpers/section'

import { setMailerForTests, type Mail } from '@/lib/email/mailer'
import { claimMembership } from '@/lib/members/claim'
import { memberFeedAudioResponse, memberFeedResponse, memberFeedsFor, resetMemberFeed } from '@/lib/members/feed-service'
import { isReservedPath } from '@/lib/paths'

// Private member feeds (phase 7d): one address per member per show, every episode in it, members-only audio checked on every play.

const run = Date.now().toString(36)
const secret = `feed-secret-${run}`
const origin = 'https://wuwf.example'
let payload: Payload
const created: { collection: string; id: string | number }[] = []
const ctx = { disableRevalidate: true }
const body = { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text: 'x', format: 0, mode: 'normal', style: '', detail: 0 }] }] } }
const wav = (name: string) => {
  const n = 800
  const d = Buffer.alloc(44 + n, 0x80)
  d.write('RIFF', 0); d.writeUInt32LE(36 + n, 4); d.write('WAVE', 8); d.write('fmt ', 12); d.writeUInt32LE(16, 16); d.writeUInt16LE(1, 20); d.writeUInt16LE(1, 22)
  d.writeUInt32LE(8000, 24); d.writeUInt32LE(8000, 28); d.writeUInt16LE(1, 32); d.writeUInt16LE(8, 34); d.write('data', 36); d.writeUInt32LE(n, 40)
  return { data: d, mimetype: 'audio/wav', name: `${name}-${run}.wav`, size: d.length }
}
async function make<T extends { id: string | number }>(collection: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<T> {
  const doc = (await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: ctx, ...extra })) as unknown as T
  created.push({ collection, id: doc.id })
  return doc
}
const member = { id: `feeds-${run}-member`, email: 'listener@example.org' }
const tokenOfUrl = (url: string) => new URL(url).pathname.split('/')[3]!.replace(/\.xml$/, '')

describe('private member feeds', () => {
  let show: { id: number; slug: string }
  let plain: { id: number; slug: string }
  let membersAudio: { id: number }
  let freeAudio: { id: number; url: string }
  let otherShowMembersAudio: { id: number }
  let profileId: number
  let membershipId: number | string

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const section = await ensureTestSection(payload)
    show = await make('productions', { title: `Feeds ${run}` })
    plain = await make('productions', { title: `No members ${run}` })
    membersAudio = await make('audio', { title: 'm', membersOnly: true }, { file: wav('m') })
    freeAudio = await make('audio', { title: 'f' }, { file: wav('f') })
    otherShowMembersAudio = await make('audio', { title: 'o', membersOnly: true }, { file: wav('o') })
    const ep = (title: string, day: number, extra: Record<string, unknown>) => make('posts', { title: `${title} ${run}`, content: body, _status: 'published', section, format: 'audio', publishedAt: `2090-07-0${day}T12:00:00.000Z`, ...extra })
    await ep('Members ep', 2, { production: show.id, featuredAudio: membersAudio.id, membersOnly: true })
    await ep('Free ep', 1, { production: show.id, featuredAudio: freeAudio.id })
    await ep('Plain ep', 1, { production: plain.id, featuredAudio: freeAudio.id })
    const other = await make<{ id: number }>('productions', { title: `Other ${run}` })
    await ep('Other members ep', 3, { production: other.id, featuredAudio: otherShowMembersAudio.id, membersOnly: true })

    const outbox: Mail[] = []
    setMailerForTests({ isConfigured: () => true, send: async (m) => (outbox.push(m), { ok: true }) })
    const m = await make<{ id: number }>('memberships', { name: 'Listener', email: `feeds-${run}@example.org`, endsOn: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10), sendClaimEmail: true })
    setMailerForTests(null)
    membershipId = m.id
    await claimMembership(payload, new URL(/https?:\/\/\S+/.exec(outbox[0]!.text)![0]).searchParams.get('token'), member, new Date())
    profileId = (await payload.find({ collection: 'audience-profiles', where: { supabaseUserId: { equals: member.id } }, overrideAccess: true })).docs[0]!.id as number
  }, 90_000)

  afterAll(async () => {
    await payload.delete({ collection: 'member-feeds', where: { account: { equals: profileId } }, overrideAccess: true, context: ctx })
    for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
    await payload.delete({ collection: 'audience-profiles', where: { supabaseUserId: { like: `feeds-${run}` } }, overrideAccess: true, context: ctx })
  })

  const feedFor = async (s: { id: number }) => (await memberFeedsFor(payload, profileId, origin, secret)).find((f) => f.show.id === s.id)

  it('offers a feed only for shows with members-only episodes', async () => {
    const f = await feedFor(show)
    expect(f?.url).toMatch(new RegExp(`^${origin}/feeds/${show.slug}/${profileId}-1-[A-Za-z0-9_-]{32}\\.xml$`))
    expect(await feedFor(plain)).toBeUndefined()
  })

  it('carries every episode, the members-only audio through the member’s own checked address, and is never cached or indexed', async () => {
    const token = tokenOfUrl((await feedFor(show))!.url)
    const res = await memberFeedResponse(payload, show.slug, token, origin, secret, new Date())
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    const xml = await res.text()
    expect(xml).toContain(`Members ep ${run}`)
    expect(xml).toContain(`Free ep ${run}`)
    expect(xml).toContain(`${origin}/feeds/${show.slug}/${token}/audio/${membersAudio.id}`)
    expect(xml).toContain(freeAudio.url)
    expect(xml).not.toContain(`Other members ep ${run}`)
  })

  it('plays members-only audio of this show for the member, and nothing else through the same address', async () => {
    const token = tokenOfUrl((await feedFor(show))!.url)
    const ok = await memberFeedAudioResponse(payload, show.slug, token, String(membersAudio.id), secret, new Date())
    expect(ok.status).toBe(200)
    expect(ok.headers.get('cache-control')).toBe('private, no-store')
    expect((await memberFeedAudioResponse(payload, show.slug, token, String(otherShowMembersAudio.id), secret, new Date())).status).toBe(404)
    expect((await memberFeedAudioResponse(payload, show.slug, token, String(freeAudio.id), secret, new Date())).status).toBe(404)
  })

  it('answers 410 to a tampered or replaced address, and 404 to an unknown show', async () => {
    const token = tokenOfUrl((await feedFor(show))!.url)
    expect((await memberFeedResponse(payload, show.slug, token.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), origin, secret, new Date())).status).toBe(410)
    expect((await memberFeedResponse(payload, plain.slug, token, origin, secret, new Date())).status).toBe(410)
    expect((await memberFeedResponse(payload, `nope-${run}`, token, origin, secret, new Date())).status).toBe(404)
  })

  it('stops the old address when the member resets the feed, and the new one works', async () => {
    const old = tokenOfUrl((await feedFor(show))!.url)
    expect(await resetMemberFeed(payload, profileId, show.id)).toBe(2)
    const fresh = tokenOfUrl((await feedFor(show))!.url)
    expect(fresh).not.toBe(old)
    expect((await memberFeedResponse(payload, show.slug, old, origin, secret, new Date())).status).toBe(410)
    expect((await memberFeedAudioResponse(payload, show.slug, old, String(membersAudio.id), secret, new Date())).status).toBe(410)
    expect((await memberFeedResponse(payload, show.slug, fresh, origin, secret, new Date())).status).toBe(200)
  })

  it('keeps a lapsed member’s feed working with the free episodes only, and refuses its members-only audio', async () => {
    const token = tokenOfUrl((await feedFor(show))!.url)
    await payload.update({ collection: 'memberships', id: membershipId, data: { endsOn: '2020-01-31' } as never, overrideAccess: true, context: ctx })
    const xml = await (await memberFeedResponse(payload, show.slug, token, origin, secret, new Date())).text()
    expect(xml).toContain(`Free ep ${run}`)
    expect(xml).not.toContain(`Members ep ${run}`)
    expect(xml).toContain('membership has ended')
    expect((await memberFeedAudioResponse(payload, show.slug, token, String(membersAudio.id), secret, new Date())).status).toBe(403)
  })

  it('reserves /feeds so no story or page can take it', () => {
    expect(isReservedPath('/feeds/barefoot-mary/x.xml')).toBe(true)
  })
})
