import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Sponsorship } from '@/payload-types'
import { SPONSORSHIP_STARTER } from '@/lib/sponsorship/starter'
import { sponsorPagesFromGlobal } from '@/lib/sponsorship/to-sections'

// The sponsor pages as sections (PAGE-BLOCKS.md, phase 3): the six pages built from the starting wording save and publish in the sponsor set,
// the sponsor-only blocks are refused anywhere else, and the settings global keeps the staff-only address from the public.

const run = Date.now().toString(36)
let payload: Payload
const created: (number | string)[] = []
const as = (role: string) => ({ id: 1, collection: 'users', email: `${role}@wuwf.org`, roles: [role] }) as never
const publisher = as('publisher')
const editor = as('editor')
const asUser = (user: unknown) => ({ overrideAccess: false, user: user as never, context: { disableRevalidate: true } })

const starter = {
  ...SPONSORSHIP_STARTER,
  programs: [{ id: 'p1', name: 'RadioLive', kind: 'live-series', status: 'open', description: 'Live music each month. A partnership puts your name alongside it.', levels: [{ name: 'Presenting partner', price: null }] }],
} as unknown as Sponsorship

describe('the sponsorship pages as sections', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  }, 60_000)
  afterAll(async () => {
    for (const id of created.reverse()) await payload.delete({ collection: 'pages', id, overrideAccess: true, context: { disableRevalidate: true } }).catch(() => undefined)
  })

  it('publishes each of the six pages in the sponsor set, as a publisher, with every section valid', async () => {
    for (const page of sponsorPagesFromGlobal(starter)) {
      const doc = await payload.create({
        collection: 'pages',
        draft: false,
        ...asUser(publisher),
        data: { title: `${page.title} ${run}`, slug: `${page.slug}-${run}`, path: `/it-${page.slug}-${run}`, template: 'sections', pageSet: 'sponsor', navLabel: page.navLabel, navOrder: page.navOrder, sections: page.sections, _status: 'published' } as never,
      })
      created.push(doc.id)
      expect(doc._status).toBe('published')
      expect((doc.sections ?? []).length, page.path).toBe(page.sections.length)
    }
  })

  it('keeps an editor from writing in the sponsor set, and a publisher from putting a sponsor-only block on a page in no set', async () => {
    const page = sponsorPagesFromGlobal(starter)[0]!
    await expect(payload.create({ collection: 'pages', draft: true, ...asUser(editor), data: { title: `Ed ${run}`, template: 'sections', pageSet: 'sponsor', sections: page.sections, _status: 'draft' } as never })).rejects.toThrow(/page set/)
    const form = page.sections.find((s) => s.blockType === 'sectionInquiryForm')!
    await expect(
      payload.create({ collection: 'pages', draft: false, ...asUser(publisher), data: { title: `No set ${run}`, slug: `no-set-${run}`, path: `/it-no-set-${run}`, template: 'sections', sections: [form], _status: 'published' } as never }),
    ).rejects.toThrow()
  })

  it('serves the settings to the public without the staff-only address, and shows it to a publisher', async () => {
    await payload.updateGlobal({ slug: 'sponsorship-settings', data: { phone: '850 473-7453', inquiryEmail: `corporate-${run}@example.org` } as never, overrideAccess: true, context: { disableRevalidate: true } })
    const pub = await payload.findGlobal({ slug: 'sponsorship-settings', depth: 0, overrideAccess: false })
    expect(pub.phone).toBe('850 473-7453')
    expect(pub.inquiryEmail).toBeUndefined()
    const staff = await payload.findGlobal({ slug: 'sponsorship-settings', depth: 0, overrideAccess: false, user: publisher })
    expect(staff.inquiryEmail).toBe(`corporate-${run}@example.org`)
  })

  it('lets only a publisher change the settings', async () => {
    await expect(payload.updateGlobal({ slug: 'sponsorship-settings', data: { phone: 'x' } as never, ...asUser(editor) })).rejects.toThrow()
    const ok = await payload.updateGlobal({ slug: 'sponsorship-settings', data: { phone: '850 473-7453' } as never, ...asUser(publisher) })
    expect(ok.phone).toBe('850 473-7453')
  })
})
