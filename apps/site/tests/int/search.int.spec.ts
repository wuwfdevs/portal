// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { searchWhere } from '@/lib/search/query'

// Search (board 27): stories, episodes, shows, programs and short video are indexed with a kind, an address and a
// description; drafts are not; the filters narrow by kind; every word must match.

const run = Date.now().toString(36)
let payload: Payload
const created: { collection: string; id: string | number }[] = []
const ctx = { disableRevalidate: true }
const VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nEight feet.\n'
const body = { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text: 'Notes.', format: 0, mode: 'normal', style: '', detail: 0 }] }] } }

async function make<T extends { id: string | number }>(collection: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<T> {
  const doc = (await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: ctx, ...extra })) as unknown as T
  created.push({ collection, id: doc.id })
  return doc
}

async function search(q: string, type: 'all' | 'stories' | 'shows' | 'video' = 'all') {
  const where = searchWhere({ q, type })
  if (!where) return []
  const found = await payload.find({ collection: 'search', overrideAccess: false, depth: 0, limit: 50, sort: ['-publishedAt', '-priority'], where })
  return found.docs as unknown as { title: string; kind: string; path: string; publishedAt?: string | null; meta?: { description?: string | null } }[]
}

describe('search', () => {
  let show: { id: string | number; path: string }
  let clip: { slug: string }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const { ensureTestSection } = await import('../helpers/section')
    const section = await ensureTestSection(payload)
    show = await make('productions', { title: `Tidewater ${run}`, summary: `A podcast about marsh ${run}.` })
    await make('productions', { title: `Morning Tidewater ${run}`, kind: 'syndicated', listed: false })
    await make('posts', { title: `Tidewater rising ${run}`, content: body, _status: 'published', section, publishedAt: '2090-01-02T12:00:00.000Z', meta: { description: 'Flood insurance math.' } })
    await make('posts', { title: `Tidewater episode ${run}`, content: body, _status: 'published', section, production: show.id, format: 'audio', publishedAt: '2090-01-03T12:00:00.000Z' })
    await make('posts', { title: `Tidewater draft ${run}`, content: body, _status: 'draft', section })
    const video = await make('video', { title: `Search clip file ${run}`, credit: 'WUWF News', durationSeconds: 58 }, {
      file: await (async () => {
        const { readFileSync } = await import('node:fs')
        const { resolve } = await import('node:path')
        const data = readFileSync(resolve(__dirname, '../fixtures/one-second.mp4'))
        return { data, mimetype: 'video/mp4', name: `search-${run}.mp4`, size: data.length }
      })(),
    })
    clip = await make<{ id: string | number; slug: string }>('clips', { title: `Tidewater in a minute ${run}`, video: video.id, captionsVtt: VTT, description: 'The marsh at high tide.', _status: 'published', publishedAt: '2090-01-04T12:00:00.000Z' })
    await make('clips', { title: `Tidewater unfinished ${run}`, video: video.id, captionsVtt: VTT, _status: 'draft' })
  }, 90_000)

  afterAll(async () => {
    for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('indexes every published kind, with its address, and no drafts', async () => {
    const hits = await search(`tidewater ${run}`)
    const byKind = Object.fromEntries(hits.map((h) => [h.kind, h]))
    expect(Object.keys(byKind).sort()).toEqual(['episode', 'program', 'show', 'story', 'video'])
    expect(hits.some((h) => h.title.includes('draft') || h.title.includes('unfinished'))).toBe(false)
    expect(byKind.show.path).toBe(show.path)
    expect(byKind.show.meta?.description).toBe(`A podcast about marsh ${run}.`)
    expect(byKind.video.path).toBe(`/video/${clip.slug}`)
    expect(byKind.video.meta?.description).toBe('The marsh at high tide.')
    expect(byKind.story.publishedAt).toContain('2090-01-02')
  })

  it('narrows by filter', async () => {
    expect((await search(`tidewater ${run}`, 'stories')).map((h) => h.kind)).toEqual(['story'])
    expect((await search(`tidewater ${run}`, 'shows')).map((h) => h.kind).sort()).toEqual(['episode', 'program', 'show'])
    expect((await search(`tidewater ${run}`, 'video')).map((h) => h.kind)).toEqual(['video'])
  })

  it('needs every word, and matches the description', async () => {
    expect((await search(`tidewater flood ${run}`)).map((h) => h.kind)).toEqual(['story'])
    expect(await search(`tidewater zxqv ${run}`)).toEqual([])
  })
})
