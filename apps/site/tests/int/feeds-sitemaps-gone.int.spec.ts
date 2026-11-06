// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { ensureTestSection } from '../helpers/section'

// The route handlers are called directly, outside Next, where `unstable_cache` has no cache to use: run it uncached.
vi.mock('next/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/cache')>()),
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))

import { GET as gone } from '@/app/api/gone-check/route'
import { GET as feed } from '@/app/(frontend)/podcast/[slug]/rss.xml/route'
import { GET as sitemapIndex } from '@/app/(frontend)/(sitemaps)/sitemap.xml/route'
import { GET as sitemapChild } from '@/app/(frontend)/(sitemaps)/sitemaps/[name]/route'

const run = Date.now().toString(36)
let payload: Payload
const created: { collection: string; id: string | number }[] = []
const ctx = { disableRevalidate: true }
const body = { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text: 'Notes.', format: 0, mode: 'normal', style: '', detail: 0 }] }] } }
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
const get = (path: string) => new Request(`http://localhost:3000${path}`)

describe('podcast feeds, sitemaps and the 410 check', () => {
  let show: { id: string | number; slug: string }
  const wirePath = `/2090-02-03/wire-${run}`

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const section = await ensureTestSection(payload)
    show = await make('productions', { title: `Feed Show ${run}`, summary: 'A & B.' })
    const audio = await payload.create({ collection: 'audio', overrideAccess: true, file: wav('feed'), data: { title: `Ep audio ${run}` } as never })
    created.push({ collection: 'audio', id: audio.id })
    const ep = (title: string, day: number, extra: Record<string, unknown> = {}) =>
      make('posts', { title: `${title} ${run}`, content: body, _status: 'published', section, production: show.id, format: 'audio', publishedAt: `2090-01-${String(day).padStart(2, '0')}T12:00:00.000Z`, ...extra })
    await ep('Feed ep 1', 1, { featuredAudio: audio.id, legacy: { groveId: `00000172-${run}` } })
    await ep('Feed ep 2', 2, { featuredAudio: audio.id })
    await ep('No audio', 3)
    await ep('Draft ep', 4, { featuredAudio: audio.id, _status: 'draft' })
    await make('productions', { title: `Aired ${run}`, kind: 'syndicated', listed: false })
    await make('posts', { title: `Wire ${run}`, content: body, _status: 'published', section, source: 'wire', path: wirePath, publishedAt: '2090-02-03T12:00:00.000Z' })
  }, 90_000)

  afterAll(async () => {
    for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('serves a feed of the published episodes that have audio, newest first, with Grove\'s guid kept', async () => {
    const res = await feed(get(`/podcast/${show.slug}/rss.xml`), { params: Promise.resolve({ slug: show.slug }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/rss\+xml/)
    const xml = await res.text()
    expect(xml).toContain(`<title>Feed Show ${run}</title>`)
    expect(xml).toContain('<description>A &amp; B.</description>')
    expect(xml).toContain(`<guid isPermaLink="false">00000172-${run}</guid>`)
    expect(xml.match(/<item>/g)).toHaveLength(2)
    expect(xml.indexOf(`Feed ep 2 ${run}`)).toBeLessThan(xml.indexOf(`Feed ep 1 ${run}`))
    expect(xml).not.toContain('No audio')
    expect(xml).not.toContain('Draft ep')
    expect(xml).toMatch(/<enclosure url="http[^"]+" length="\d+" type="audio\/[a-z-]+"\/>/)
  })

  it('has no feed for an unknown show or a syndicated program', async () => {
    const res = await feed(get('/podcast/nope/rss.xml'), { params: Promise.resolve({ slug: `nope-${run}` }) })
    expect(res.status).toBe(404)
    const aired = (await payload.find({ collection: 'productions', where: { title: { equals: `Aired ${run}` } }, overrideAccess: true, limit: 1 })).docs[0]!
    expect((await feed(get('/x'), { params: Promise.resolve({ slug: aired.slug }) })).status).toBe(404)
  })

  it('says whether anything owns an address, so a published wire story is never "gone"', async () => {
    const q = async (p: string) => (await (await gone(get(`/api/gone-check?path=${encodeURIComponent(p)}`))).json()) as { exists: boolean }
    expect((await q(wirePath)).exists).toBe(true)
    expect((await q(`${wirePath}/`)).exists).toBe(true)
    expect((await q(`/2090-02-04/nothing-${run}`)).exists).toBe(false)
    expect((await gone(get('/api/gone-check?path=nope'))).status).toBe(400)
  })

  it('lists the story files in the index and serves them, and 404s a file past the last', async () => {
    const index = await (await sitemapIndex()).text()
    expect(index).toContain('/sitemaps/posts-1.xml')
    expect(index).toContain('/sitemaps/pages.xml')
    const posts = await (await sitemapChild(get('/'), { params: Promise.resolve({ name: 'posts-1.xml' }) })).text()
    expect(posts).toContain('<urlset')
    expect((await sitemapChild(get('/'), { params: Promise.resolve({ name: 'posts-9999.xml' }) })).status).toBe(404)
    expect((await sitemapChild(get('/'), { params: Promise.resolve({ name: 'bogus.xml' }) })).status).toBe(404)
    const shows = await (await sitemapChild(get('/'), { params: Promise.resolve({ name: 'shows.xml' }) })).text()
    expect(shows).toContain('/podcasts')
  })
})
