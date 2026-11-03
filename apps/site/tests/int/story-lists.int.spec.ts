import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadStoryList } from '@/lib/lists/load'
import { listPathsForStory } from '@/lib/lists/revalidate'
import { PAGE_SIZE } from '@/lib/lists/route'

// Section, topic and person lists, read the way a visitor's request reads them: through access control, newest first,
// a page at a time.

const run = Date.now().toString(36)
let payload: Payload
const created: { collection: string; id: string | number }[] = []
const ctx = { disableRevalidate: true }

async function make<T extends { id: string | number }>(collection: string, data: Record<string, unknown>): Promise<T> {
  const doc = (await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: ctx })) as unknown as T
  created.push({ collection, id: doc.id })
  return doc
}
const body = { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text: 'Body.', format: 0, mode: 'normal', style: '', detail: 0 }] }] } }

describe('story lists', () => {
  let section: { id: string | number; slug: string }
  let otherSection: { id: string | number; slug: string }
  let topic: { id: string | number; slug: string }
  let person: { id: string | number; slug: string }
  const TOTAL = PAGE_SIZE + 1 // one more than a page

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    section = await make('sections', { title: `List Section ${run}`, slug: `list-section-${run}`, description: 'The desk.' })
    otherSection = await make('sections', { title: `Other ${run}`, slug: `other-${run}` })
    topic = await make('categories', { title: `Storms ${run}`, slug: `storms-${run}` })
    person = await make('contributors', { name: `Reporter ${run}`, slug: `reporter-${run}`, title: 'Reporter', bio: 'Covers storms.' })
    for (let i = 1; i <= TOTAL; i++) {
      await make('posts', {
        title: `Story ${String(i).padStart(2, '0')} ${run}`,
        content: body,
        _status: 'published',
        section: section.id,
        categories: i % 2 === 0 ? [topic.id] : [],
        contributors: i <= 3 ? [person.id] : [],
        publishedAt: `2090-01-${String(i).padStart(2, '0')}T12:00:00.000Z`,
      })
    }
    await make('posts', { title: `Draft ${run}`, content: body, _status: 'draft', section: section.id, categories: [topic.id], contributors: [person.id], publishedAt: '2090-02-01T12:00:00.000Z' })
    await make('posts', { title: `Elsewhere ${run}`, content: body, _status: 'published', section: otherSection.id, publishedAt: '2090-03-01T12:00:00.000Z' })
  }, 90_000)

  afterAll(async () => {
    for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('lists a section a page at a time, newest first, with its count and description', async () => {
    const p1 = await loadStoryList('section', section.slug, 1)
    expect(p1).toMatchObject({ title: `List Section ${run}`, blurb: 'The desk.', totalDocs: TOTAL, totalPages: 2, page: 1 })
    expect(p1?.stories).toHaveLength(PAGE_SIZE)
    expect(p1?.stories[0]?.title).toBe(`Story ${TOTAL} ${run}`)
    const p2 = await loadStoryList('section', section.slug, 2)
    expect(p2?.stories.map((s) => s.title)).toEqual([`Story 01 ${run}`])
  })

  it('never shows a draft or another section\'s story', async () => {
    const all = [...((await loadStoryList('section', section.slug, 1))?.stories ?? []), ...((await loadStoryList('section', section.slug, 2))?.stories ?? [])].map((s) => s.title)
    expect(all).not.toContain(`Draft ${run}`)
    expect(all).not.toContain(`Elsewhere ${run}`)
  })

  it('is nothing for a section that does not exist, or a page past the last', async () => {
    expect(await loadStoryList('section', `nope-${run}`, 1)).toBeNull()
    expect(await loadStoryList('section', section.slug, 3)).toBeNull()
  })

  it('lists a topic and a person the same way', async () => {
    const t = await loadStoryList('topic', topic.slug, 1)
    expect(t?.title).toBe(`Storms ${run}`)
    expect(t?.totalDocs).toBe(Math.floor(TOTAL / 2)) // the even-numbered stories; the draft is not counted
    const p = await loadStoryList('person', person.slug, 1)
    expect(p).toMatchObject({ title: `Reporter ${run}`, blurb: 'Reporter', bio: 'Covers storms.', totalDocs: 3 })
    expect(p?.stories.map((s) => s.title)).toEqual([`Story 03 ${run}`, `Story 02 ${run}`, `Story 01 ${run}`])
  })

  it('shows an existing list with no stories as an empty list, not a missing page', async () => {
    const empty = await make<{ id: string | number; slug: string }>('categories', { title: `Empty ${run}`, slug: `empty-${run}` })
    expect(await loadStoryList('topic', empty.slug, 1)).toMatchObject({ totalDocs: 0, stories: [], totalPages: 1 })
  })

  it('names the lists a story belongs to, so publishing it can refresh them', async () => {
    const paths = await listPathsForStory(payload, { section: section.id, categories: [topic.id], contributors: [person.id] })
    expect(paths.sort()).toEqual([`/${section.slug}`, `/people/${person.slug}`, `/tags/${topic.slug}`].sort())
    expect(await listPathsForStory(payload, { section: null, categories: [], contributors: null })).toEqual([])
    expect(await listPathsForStory(payload, null)).toEqual([])
  })
})
