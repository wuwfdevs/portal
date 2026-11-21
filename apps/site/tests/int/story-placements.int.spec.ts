// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// The loaders run outside Next, where `unstable_cache` has no cache to use: run it uncached.
vi.mock('next/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/cache')>()),
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))

import { loadStoryPlacements } from '@/lib/placements/load'

// What a story page carries: the placements aimed at its section, topics and reporters, and nothing in a live blog, a members-only story or one an editor ticked.

const run = Date.now().toString(36)
let payload: Payload
const made: { collection: string; id: number | string }[] = []
const ctx = { disableRevalidate: true }
const body = { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text: 'Notes.', format: 0, mode: 'normal', style: '', detail: 0 }] }] } }

async function keep<T extends { id: string | number }>(collection: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<T> {
  const doc = (await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: ctx, ...extra })) as unknown as T
  made.push({ collection, id: doc.id })
  return doc
}

describe('story placements', () => {
  let sectionA: { id: number }
  let sectionB: { id: number }
  const story = (over: Record<string, unknown> = {}) => keep<{ id: number; section: number; format: string; membersOnly?: boolean; noPlacements?: boolean }>('posts', { title: `Story ${run} ${Math.random()}`, content: body, _status: 'published', section: sectionA.id, publishedAt: '2090-01-01T12:00:00.000Z', ...over })

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const data = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#336699' } }).png().toBuffer()
    const img = await keep<{ id: number }>('media', { alt: 'tile' }, { file: { data, mimetype: 'image/png', name: `story-tile-${run}.png`, size: data.length } })
    sectionA = await keep('sections', { title: `Story A ${run}`, slug: `story-a-${run}` })
    sectionB = await keep('sections', { title: `Story B ${run}`, slug: `story-b-${run}` })
    const put = (zone: string, over: Record<string, unknown>) => keep('placement-items', { name: `${zone} ${run}`, kind: 'house', zone, image: img.id, alt: 'Words', href: '/weather', enabled: true, scope: 'chosen', ...over })
    await put('story.inline', { sections: [sectionA.id], order: 1 })
    await put('story.inline', { sections: [sectionA.id], order: 2, name: `second band ${run}` })
  }, 60_000)

  afterAll(async () => {
    for (const { collection, id } of [...made].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  const load = async (doc: { id: number }) => loadStoryPlacements((await payload.findByID({ collection: 'posts', id: doc.id, depth: 1, overrideAccess: true })) as never)

  it('carries the inline bands aimed at the section it is filed under, in run order', async () => {
    const out = await load(await story())
    expect(out.inline.map((t) => t.key)).toEqual(['story.inline.1', 'story.inline.2'])
  })
  it('refuses a placement in the retired story rail', async () => {
    await expect(payload.create({ collection: 'placement-items', data: { name: `rail ${run}`, kind: 'house', zone: 'story.rail', image: 1, alt: 'Words', href: '/weather', enabled: true, scope: 'all' } as never, overrideAccess: true, context: ctx })).rejects.toThrow()
  })
  it('carries nothing for a story in a section nothing was aimed at', async () => {
    const out = await load(await story({ section: sectionB.id }))
    expect(out.inline).toEqual([])
  })
  it('carries nothing in a live blog or a story an editor ticked "no sponsor messages" on', async () => {
    for (const over of [{ format: 'live' }, { noPlacements: true }]) {
      const out = await load(await story(over))
      expect(out.inline).toEqual([])
    }
  })
})
