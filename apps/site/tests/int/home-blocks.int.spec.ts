// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { HOME_BLOCKS_PAGE, homepageToSections } from '@/lib/homepage/to-sections'

// The home page as a page of blocks (PAGE-BLOCKS.md → Home): a publisher can save and publish it in the home set, every block it is made of is accepted, a block
// of the home set is refused on any other page, and an editor cannot write in the set.

const run = Date.now().toString(36)
let payload: Payload
const created: { collection: string; id: number | string }[] = []
const ctx = { disableRevalidate: true, disableEmbedding: true }
const as = (role: string) => ({ id: 1, collection: 'users', email: `${role}@wuwf.org`, roles: [role] }) as never
const asUser = (user: unknown) => ({ overrideAccess: false, user: user as never, context: ctx })
const publisher = as('publisher')
const editor = as('editor')

describe('the home page of blocks', () => {
  let sectionId: number | string
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const sec = await payload.create({ collection: 'sections', data: { title: `Home blocks ${run}`, slug: `home-blocks-${run}` } as never, overrideAccess: true, context: ctx })
    created.push({ collection: 'sections', id: sec.id })
    sectionId = sec.id
  }, 60_000)
  afterAll(async () => {
    for (const { collection, id } of created.reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  const sections = () =>
    homepageToSections({ newsModules: [{ id: 'a', heading: 'Local News', section: sectionId, count: 5 }], videoRow: { enabled: true, count: 6 }, podcasts: { enabled: true }, radioLive: { enabled: true }, unearthing: { enabled: true } }).sections

  it('publishes in the home set, as a publisher, with every block the mapping writes', async () => {
    const page = await payload.create({
      collection: 'pages',
      draft: false,
      ...asUser(publisher),
      data: { title: `${HOME_BLOCKS_PAGE.title} ${run}`, slug: `${HOME_BLOCKS_PAGE.slug}-${run}`, path: `/it-home-blocks-${run}`, template: 'sections', pageSet: 'home', sections: sections(), noindex: true, _status: 'published' } as never,
    })
    created.push({ collection: 'pages', id: page.id })
    const read = await payload.findByID({ collection: 'pages', id: page.id, depth: 0, overrideAccess: true })
    expect(read.pageSet).toBe('home')
    expect((read.sections as Array<{ blockType: string }>).map((s) => s.blockType)).toEqual(['sectionFrontPage', 'sectionList', 'sectionNewsRun', 'sectionShowSpotlight', 'sectionFeaturePanels'])
  })

  it('refuses a block of the home set on a page in no set, and an editor writing in the set', async () => {
    await expect(
      payload.create({ collection: 'pages', draft: false, ...asUser(publisher), data: { title: `No set ${run}`, slug: `no-set-${run}`, path: `/it-no-set-${run}`, template: 'sections', sections: sections(), _status: 'published' } as never }),
    ).rejects.toThrow()
    await expect(
      payload.create({ collection: 'pages', draft: true, ...asUser(editor), data: { title: `Ed ${run}`, template: 'sections', pageSet: 'home', sections: sections(), _status: 'draft' } as never }),
    ).rejects.toThrow(/page set/)
  })
})
