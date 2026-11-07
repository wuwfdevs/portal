// @vitest-environment node
import { NextRequest } from 'next/server'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { ensureTestSection } from '../helpers/section'

// Who is signed in is decided by Supabase; here a stand-in says who.
const signedIn: { user: { id: string; email: string } | null } = { user: null }
vi.mock('@/lib/audience/supabase', () => ({
  supabaseAuthConfig: () => ({ url: 'https://x.supabase.co', key: 'k' }),
  supabaseAudienceAuth: { currentUser: async () => signedIn.user, sendSignInLink: async () => ({ ok: true }), verifyLink: async () => null, signOut: async () => undefined },
}))
vi.mock('next/cache', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/cache')>()), unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn }))

import { GET as fileRoute } from '@/app/(frontend)/account/files/[collection]/[id]/route'
import { setMailerForTests, type Mail } from '@/lib/email/mailer'
import { claimMembership } from '@/lib/members/claim'
import { memberPiece } from '@/lib/members/listen'

// Members' listening, part 2 (phase 7c-2): a connected member opens members-only work and files; nobody else does.

const run = Date.now().toString(36)
let payload: Payload
const created: { collection: string; id: string | number }[] = []
const ctx = { disableRevalidate: true }
const secret = `Members body ${run}`
const body = (text: string) => ({ root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text, format: 0, mode: 'normal', style: '', detail: 0 }] }] } })
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
const member = { id: `unlock-${run}-member`, email: 'listener@example.org' }
const stranger = { id: `unlock-${run}-stranger`, email: 'other@example.org' }
const get = (path: string) => {
  const [, , , collection, id] = path.split('/')
  return fileRoute(new NextRequest(`http://localhost:3000${path}`), { params: Promise.resolve({ collection: collection!, id: id! }) })
}
/** What the member view would do for the signed-in stand-in. */
const open = async (id: string | number) => {
  const r = await memberPiece(payload, signedIn.user, String(id), new Date())
  return r.kind === 'redirect' ? { redirect: r.to } : r.kind === 'not-found' ? { redirect: '404' } : { element: { props: { post: r.post as unknown as Record<string, unknown> } } }
}

describe("members' listening: unlocking members' work", () => {
  let audio: { id: string | number; url: string }
  let freeAudio: { id: string | number; url: string }
  let locked: { id: string | number; path: string }
  let free: { id: string | number; path: string }
  let archiveItem: { id: string | number }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const section = await ensureTestSection(payload)
    const show = await make('productions', { title: `Unlock ${run}` })
    audio = await make('audio', { title: `Members audio ${run}`, membersOnly: true }, { file: wav('members') })
    freeAudio = await make('audio', { title: `Free audio ${run}` }, { file: wav('free') })
    locked = await make('posts', { title: `Members ep ${run}`, content: body(secret), _status: 'published', section, production: show.id, format: 'audio', featuredAudio: audio.id, membersOnly: true, publishedAt: '2090-06-01T12:00:00.000Z' })
    free = await make('posts', { title: `Free ep ${run}`, content: body('Free body'), _status: 'published', section, production: show.id, format: 'audio', featuredAudio: freeAudio.id, publishedAt: '2090-06-02T12:00:00.000Z' })
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\nxref\n0 1\ntrailer<<>>\nstartxref\n0\n%%EOF\n')
    archiveItem = await make('archive-items', { title: `Members doc ${run}`, production: show.id, kind: 'document', membersOnly: true, _status: 'published' }, { file: { data: pdf, mimetype: 'application/pdf', name: `doc-${run}.pdf`, size: pdf.length } })
    // Connect the member the real way: a claim link, opened in their account.
    const outbox: Mail[] = []
    setMailerForTests({ isConfigured: () => true, send: async (m) => (outbox.push(m), { ok: true }) })
    const m = await make('memberships', { name: 'Listener', email: `listener-${run}@example.org`, endsOn: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10), sendClaimEmail: true })
    setMailerForTests(null)
    const token = new URL(/https?:\/\/\S+/.exec(outbox[0]!.text)![0]).searchParams.get('token')
    expect((await claimMembership(payload, token, member, new Date())).kind).toBe('ok')
    expect(m.id).toBeTruthy()
  }, 90_000)

  afterAll(async () => {
    for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
    await payload.delete({ collection: 'audience-profiles', where: { supabaseUserId: { like: `unlock-${run}` } }, overrideAccess: true, context: ctx })
  })

  it('sends a signed-out reader to sign in and back', async () => {
    signedIn.user = null
    expect(await open(locked.id)).toEqual({ redirect: `/account/sign-in?next=${encodeURIComponent(`/account/listen/${locked.id}`)}` })
    const res = await get(`/account/files/audio/${audio.id}`)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/account/sign-in?next=')
  })

  it('sends a signed-in reader without a membership to their account, and gives them nothing', async () => {
    signedIn.user = stranger
    expect(await open(locked.id)).toEqual({ redirect: '/account' })
    const res = await get(`/account/files/audio/${audio.id}`)
    expect(res.headers.get('location')).toBe('http://localhost:3000/account')
  })

  it("gives a member the whole piece, with its audio through the members' file route", async () => {
    signedIn.user = member
    const r = await open(locked.id)
    expect('element' in r).toBe(true)
    const post = (r as { element: { props: { post: Record<string, unknown> } } }).element.props.post
    expect(JSON.stringify(post.content)).toContain(secret)
    expect((post.featuredAudio as { url: string }).url).toBe(`/account/files/audio/${audio.id}`)
  })

  it('serves a member the members-only file privately (from disk here; a signed storage address when hosted)', async () => {
    signedIn.user = member
    const res = await get(`/account/files/audio/${audio.id}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/wav')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(44)
  })

  it('serves a member a members-only archive file too (its file address is kept for the trusted server read)', async () => {
    signedIn.user = member
    const res = await get(`/account/files/archive-items/${archiveItem.id}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    signedIn.user = stranger
    expect((await get(`/account/files/archive-items/${archiveItem.id}`)).headers.get('location')).toBe('http://localhost:3000/account')
  })

  it('sends free work and free files to their ordinary addresses', async () => {
    signedIn.user = member
    expect(await open(free.id)).toEqual({ redirect: free.path })
    const res = await get(`/account/files/audio/${freeAudio.id}`)
    expect(res.headers.get('location')).toContain(freeAudio.url)
  })

  it('refuses anything that is not a members library or a record id', async () => {
    signedIn.user = member
    expect((await get('/account/files/media/1')).status).toBe(404)
    expect((await get('/account/files/audio/..%2F..%2Fetc')).status).toBe(404)
    expect(await open('nope')).toEqual({ redirect: '404' })
  })

  it('stops when the membership has run out', async () => {
    signedIn.user = member
    const m = (await payload.find({ collection: 'memberships', where: { email: { equals: `listener-${run}@example.org` } }, overrideAccess: true })).docs[0]!
    await payload.update({ collection: 'memberships', id: m.id, data: { endsOn: '2020-01-31' } as never, overrideAccess: true, context: ctx })
    expect(await open(locked.id)).toEqual({ redirect: '/account' })
    expect((await get(`/account/files/audio/${audio.id}`)).headers.get('location')).toBe('http://localhost:3000/account')
  })
})
