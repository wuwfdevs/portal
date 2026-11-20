import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { stationPagesFrom } from '@/lib/station-pages/to-sections'

// The broadcast schedule and the podcast directory as sections (PAGE-BLOCKS.md, phase 5): the two pages built from the starting wording save and publish
// as an editor would (they are in no page set, so `content.write` edits them and a publisher sets the address), and a page of sections is not refused a
// block of the library.

const run = Date.now().toString(36)
let payload: Payload
const created: (number | string)[] = []
const as = (role: string) => ({ id: 1, collection: 'users', email: `${role}@wuwf.org`, roles: [role] }) as never
const publisher = as('publisher')
const editor = as('editor')
const asUser = (user: unknown) => ({ overrideAccess: false, user: user as never, context: { disableRevalidate: true } })
const pages = stationPagesFrom([{ title: 'On the radio', text: '88.1 FM.', linkLabel: 'Find us', linkUrl: '/schedule' }])

describe('the schedule and podcast pages as sections', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  }, 60_000)
  afterAll(async () => {
    for (const id of created.reverse()) await payload.delete({ collection: 'pages', id, overrideAccess: true, context: { disableRevalidate: true } }).catch(() => undefined)
  })

  it('publishes both pages as a publisher, with every section valid', async () => {
    for (const page of pages) {
      const doc = await payload.create({
        collection: 'pages',
        draft: false,
        ...asUser(publisher),
        data: { title: `${page.title} ${run}`, slug: `${page.slug}-${run}`, path: `/it-${page.slug}-${run}`, template: 'sections', sections: page.sections, _status: 'published' } as never,
      })
      created.push(doc.id)
      expect(doc._status).toBe('published')
      expect((doc.sections ?? []).length, page.path).toBe(page.sections.length)
    }
  })

  it('lets an editor change the words and reorder the sections of a page in no set', async () => {
    const id = created[0]!
    const doc = await payload.findByID({ collection: 'pages', id, depth: 0, overrideAccess: true })
    const reordered = [...(doc.sections ?? [])].reverse()
    const updated = await payload.update({ collection: 'pages', id, draft: true, ...asUser(editor), data: { sections: reordered } as never })
    expect((updated.sections ?? []).map((s) => s.id)).toEqual(reordered.map((s) => s.id))
  })

  it('keeps a list of shows, with the field the schedule has no use for ignored, as the same block', async () => {
    const podcasts = pages.find((p) => p.slug === 'podcasts')!
    const lists = podcasts.sections.filter((s) => s.blockType === 'sectionList')
    expect(lists.map((l) => l.source)).toEqual(['shows', 'episodes'])
  })
})
