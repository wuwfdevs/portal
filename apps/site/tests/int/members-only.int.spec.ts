// @vitest-environment node
import { getPayload, handleEndpoints, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { ensureTestSection } from '../helpers/section'

vi.mock('next/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/cache')>()),
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))

import { GET as feed } from '@/app/(frontend)/podcast/[slug]/rss.xml/route'
import { loadShowByPath } from '@/lib/shows/load'

// Members-only work (phase 7a): its title and teaser are public, its body and audio never reach the public by any route.

const run = Date.now().toString(36)
let payload: Payload
const created: { collection: string; id: string | number }[] = []
const ctx = { disableRevalidate: true }
const secret = `The members-only words ${run}`
const body = (text: string) => ({ root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text, format: 0, mode: 'normal', style: '', detail: 0 }] }] } })
const wav = (name: string) => {
  const samples = 800
  const data = Buffer.alloc(44 + samples, 0x80)
  data.write('RIFF', 0); data.writeUInt32LE(36 + samples, 4); data.write('WAVE', 8)
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22)
  data.writeUInt32LE(8000, 24); data.writeUInt32LE(8000, 28); data.writeUInt16LE(1, 32); data.writeUInt16LE(8, 34)
  data.write('data', 36); data.writeUInt32LE(samples, 40)
  return { data, mimetype: 'audio/wav', name: `${name}-${run}.wav`, size: data.length }
}

async function make<T extends { id: string | number }>(collection: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<T> {
  const doc = (await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: ctx, ...extra })) as unknown as T
  created.push({ collection, id: doc.id })
  return doc
}

const fileResponse = (filename: string) =>
  handleEndpoints({ config, request: new Request(`http://localhost:3000/api/audio/file/${encodeURIComponent(filename)}`) })

describe('members-only stories and audio', () => {
  let show: { id: string | number; slug: string; path: string }
  let publicAudio: { id: string | number; filename: string }
  let membersAudio: { id: string | number; filename: string }
  let free: { id: string | number }
  let locked: { id: string | number }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const section = await ensureTestSection(payload)
    show = await make('productions', { title: `Members Show ${run}` })
    publicAudio = await make('audio', { title: `Free audio ${run}` }, { file: wav('free') })
    membersAudio = await make('audio', { title: `Members audio ${run}`, membersOnly: true }, { file: wav('members') })
    const ep = (title: string, day: number, extra: Record<string, unknown>) =>
      make<{ id: string | number }>('posts', { title: `${title} ${run}`, dek: `Teaser of ${title}`, content: body(`Body of ${title}`), _status: 'published', section, production: show.id, format: 'audio', publishedAt: `2090-03-0${day}T12:00:00.000Z`, ...extra })
    free = await ep('Free ep', 1, { featuredAudio: publicAudio.id })
    locked = await ep('Members ep', 2, { featuredAudio: membersAudio.id, membersOnly: true, content: body(secret) })
  }, 90_000)

  afterAll(async () => {
    for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('is free unless someone marks it', async () => {
    const doc = (await payload.findByID({ collection: 'posts', id: free.id, overrideAccess: true })) as { membersOnly: boolean }
    expect(doc.membersOnly).toBe(false)
  })

  it('gives the public the title and teaser of a members-only story, but not its body or audio', async () => {
    const doc = (await payload.findByID({ collection: 'posts', id: locked.id, overrideAccess: false, depth: 1 })) as unknown as Record<string, unknown>
    expect(doc.title).toBe(`Members ep ${run}`)
    expect(doc.dek).toBe('Teaser of Members ep')
    expect(doc.membersOnly).toBe(true)
    expect(doc.content).toBeUndefined()
    expect(doc.featuredAudio).toBeUndefined()
    expect(JSON.stringify(doc)).not.toContain(secret)
  })

  it('keeps the body hidden even when a query selects only the body', async () => {
    const res = await payload.find({ collection: 'posts', overrideAccess: false, select: { content: true }, where: { id: { equals: locked.id } } })
    expect(res.docs[0]).toBeDefined()
    expect(JSON.stringify(res.docs)).not.toContain(secret)
    const open = await payload.find({ collection: 'posts', overrideAccess: false, select: { content: true }, where: { id: { equals: free.id } } })
    expect(JSON.stringify(open.docs)).toContain('Body of Free ep')
  })

  it('shows staff who write content everything', async () => {
    const editor = { id: 1, collection: 'users', email: 'e@wuwf.org', roles: ['editor'] }
    const doc = (await payload.findByID({ collection: 'posts', id: locked.id, overrideAccess: false, user: editor as never, depth: 1 })) as unknown as Record<string, unknown>
    expect(JSON.stringify(doc.content)).toContain(secret)
    expect((doc.featuredAudio as { id: unknown }).id).toBe(membersAudio.id)
  })

  it('hides a members-only audio record from the public, and refuses its file at its address', async () => {
    const found = await payload.find({ collection: 'audio', overrideAccess: false, where: { id: { in: [publicAudio.id, membersAudio.id] } } })
    expect(found.docs.map((d) => d.id)).toEqual([publicAudio.id])
    const refused = await fileResponse(membersAudio.filename)
    expect(refused.status).toBe(403)
    const served = await fileResponse(publicAudio.filename)
    expect(served.status).toBe(200)
    expect(served.headers.get('Cache-Control')).toBe('private')
  })

  it('refuses a members-only story whose featured audio is a public file', async () => {
    const err = await payload
      .update({ collection: 'posts', id: locked.id, data: { featuredAudio: publicAudio.id } as never, overrideAccess: true, context: ctx })
      .then(() => null, (e: { message: string; data?: { errors?: { message: string }[] } }) => e)
    expect(err).not.toBeNull()
    expect([err!.message, ...(err!.data?.errors ?? []).map((e) => e.message)].join(' | ')).toMatch(/public file anyone can play/)
    const err2 = await payload
      .update({ collection: 'posts', id: free.id, data: { membersOnly: true } as never, overrideAccess: true, context: ctx })
      .then(() => null, (e: unknown) => e)
    expect(err2).not.toBeNull()
  })

  it('lists the members episode on the show with its flag, playable only when free', async () => {
    const d = await loadShowByPath(show.path)
    const byTitle = new Map(d!.episodes.map((e) => [e.title, e]))
    expect(byTitle.get(`Members ep ${run}`)?.membersOnly).toBe(true)
    expect(byTitle.get(`Members ep ${run}`)?.featuredAudio).toBeUndefined()
    expect(byTitle.get(`Free ep ${run}`)?.featuredAudio).toBeTruthy()
  })

  it('leaves the members episode out of the public podcast feed', async () => {
    const res = await feed(new Request(`http://localhost:3000/podcast/${show.slug}/rss.xml`), { params: Promise.resolve({ slug: show.slug }) })
    const xml = await res.text()
    expect(xml).toContain(`Free ep ${run}`)
    expect(xml).not.toContain(`Members ep ${run}`)
  })
})
