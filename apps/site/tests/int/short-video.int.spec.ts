// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// The route handlers and loaders run outside Next, where `unstable_cache` has no cache to use: run it uncached.
vi.mock('next/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/cache')>()),
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))

import { GET as captions } from '@/app/(frontend)/video/[slug]/captions.vtt/route'
import { GET as sitemapChild } from '@/app/(frontend)/(sitemaps)/sitemaps/[name]/route'
import { loadClipPage } from '@/lib/video/load'

// Short video: a clip needs captions to publish; the public sees published clips only; a clip carries its series' running funder line and
// points to its story.

const run = Date.now().toString(36)
let payload: Payload
const created: { collection: string; id: string | number }[] = []
const ctx = { disableRevalidate: true }
const VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nEight feet.\n'
const body = { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text: 'Notes.', format: 0, mode: 'normal', style: '', detail: 0 }] }] } }
const mp4 = async () => {
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const data = readFileSync(resolve(__dirname, '../fixtures/one-second.mp4'))
  return { data, mimetype: 'video/mp4', name: `clip-${run}.mp4`, size: data.length }
}

async function make<T extends { id: string | number }>(collection: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<T> {
  const doc = (await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: ctx, ...extra })) as unknown as T
  created.push({ collection, id: doc.id })
  return doc
}

describe('short video', () => {
  let video: { id: string | number }
  let series: { id: string | number; slug: string }
  let story: { id: string | number; path: string }
  let clip: { id: string | number; slug: string }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    video = await make('video', { title: `Clip file ${run}`, credit: 'WUWF News', durationSeconds: 58 }, { file: await mp4() })
    const sponsor = await make('sponsors', { name: `Clip Sponsor ${run}` })
    const agreement = await make('underwriting-agreements', { label: `Clip ${run}`, sponsor: sponsor.id, kind: 'recognition', text: `Made possible by Clip Sponsor ${run}.`, startsOn: '2026-01-01', endsOn: null, active: true })
    series = await make('series', { title: `After Storm ${run}`, agreements: [agreement.id] })
    const { ensureTestSection } = await import('../helpers/section')
    story = await make('posts', { title: `Full story ${run}`, content: body, _status: 'published', section: await ensureTestSection(payload), publishedAt: '2090-01-01T12:00:00.000Z' })
    clip = await make('clips', { title: `Elevating ${run}`, video: video.id, captionsVtt: VTT, series: series.id, story: story.id, ctaLabel: 'Read the full story', _status: 'published', publishedAt: '2090-03-01T12:00:00.000Z' })
    await make('clips', { title: `Not yet ${run}`, video: video.id, captionsVtt: VTT, _status: 'draft' })
  }, 90_000)

  afterAll(async () => {
    for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('gets a slug and a publish date, and keeps tidy captions', async () => {
    const doc = (await payload.findByID({ collection: 'clips', id: clip.id, overrideAccess: true })) as { slug: string; captionsVtt: string }
    expect(doc.slug).toBe(`elevating-${run}`)
    expect(doc.captionsVtt.endsWith('\n')).toBe(true)
  })

  it('cannot be published without captions, or with captions that are not WebVTT', async () => {
    await expect(payload.create({ collection: 'clips', overrideAccess: true, context: ctx, data: { title: `No captions ${run}`, video: video.id, _status: 'published' } as never })).rejects.toThrow()
    await expect(payload.create({ collection: 'clips', overrideAccess: true, context: ctx, data: { title: `SRT ${run}`, video: video.id, captionsVtt: '1\n00:00:01,000 --> 00:00:02,000\nx', _status: 'published' } as never })).rejects.toThrow()
  })

  it('shows the public only published clips, with the story button, the credit and the series\' funder line', async () => {
    const page = await loadClipPage(clip.slug)
    expect(page?.clip.title).toBe(`Elevating ${run}`)
    expect(page?.clip.by).toBe('WUWF News')
    expect(page?.clip.story).toEqual({ href: story.path, label: 'Read the full story' })
    expect(page?.clip.series?.title).toBe(`After Storm ${run}`)
    expect(page?.acknowledgments.map((l) => l.text)).toEqual([`Made possible by Clip Sponsor ${run}.`])
    expect(await loadClipPage(`not-yet-${run}`)).toBeNull()
    expect(page?.rows.some((r) => r.items.some((c) => c.slug === clip.slug))).toBe(true)
  })

  it('serves captions as WebVTT for a published clip and 404s a draft or unknown one', async () => {
    const ok = await captions(new Request('http://localhost/x'), { params: Promise.resolve({ slug: clip.slug }) })
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toMatch(/text\/vtt/)
    expect(await ok.text()).toContain('WEBVTT')
    expect((await captions(new Request('http://localhost/x'), { params: Promise.resolve({ slug: `not-yet-${run}` }) })).status).toBe(404)
  })

  it('lists the page and the clip in the video sitemap', async () => {
    const xml = await (await sitemapChild(new Request('http://localhost/x'), { params: Promise.resolve({ name: 'video.xml' }) })).text()
    expect(xml).toContain('/video</loc>')
    expect(xml).toContain(`/video/${clip.slug}</loc>`)
    expect(xml).not.toContain(`not-yet-${run}`)
  })
})
