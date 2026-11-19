import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { GIVING_STARTER } from '@/lib/giving/starter'
import { givingPagesFromGlobal } from '@/lib/giving/to-sections'
import type { SupportPage } from '@/payload-types'

// The giving pages as sections (PAGE-BLOCKS.md, phase 4): the four pages built from the starting wording save and publish in the giving set, as
// a publisher would (setting an address is a publisher's), membership staff edit and publish those pages and no others, and the giving-only blocks are
// refused anywhere else.

const run = Date.now().toString(36)
let payload: Payload
const created: (number | string)[] = []
const as = (role: string) => ({ id: 1, collection: 'users', email: `${role}@wuwf.org`, roles: [role] }) as never
const membership = as('membership')
const publisher = as('publisher')
const editor = as('editor')
const asUser = (user: unknown) => ({ overrideAccess: false, user: user as never, context: { disableRevalidate: true } })
const pages = givingPagesFromGlobal(GIVING_STARTER as unknown as SupportPage)

const make = (user: unknown, slug: string, data: Record<string, unknown>) =>
  payload.create({ collection: 'pages', draft: false, ...asUser(user), data: { title: `${slug} ${run}`, slug: `${slug}-${run}`, path: `/it-${slug}-${run}`, template: 'sections', _status: 'published', ...data } as never })

describe('the giving pages as sections', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  }, 60_000)
  afterAll(async () => {
    for (const id of created.reverse()) await payload.delete({ collection: 'pages', id, overrideAccess: true, context: { disableRevalidate: true } }).catch(() => undefined)
  })

  it('publishes each of the four pages in the giving set, as a publisher, with every section valid', async () => {
    for (const page of pages) {
      const doc = await make(publisher, page.slug, {
        title: `${page.title} ${run}`,
        pageSet: 'giving',
        ...(page.navLabel ? { navLabel: page.navLabel } : {}),
        navOrder: page.navOrder,
        ...(page.noindex ? { noindex: true } : {}),
        ...(page.noReferrer ? { noReferrer: true } : {}),
        sections: page.sections,
      })
      created.push(doc.id)
      expect(doc._status).toBe('published')
      expect((doc.sections ?? []).length, page.path).toBe(page.sections.length)
    }
  })

  it('keeps the page-level switches of the thank-you page', async () => {
    const found = await payload.find({ collection: 'pages', where: { and: [{ pageSet: { equals: 'giving' } }, { slug: { like: `support-thanks-${run}` } }] }, limit: 1, depth: 0, overrideAccess: true })
    expect(found.docs[0]?.noindex).toBe(true)
    expect(found.docs[0]?.noReferrer).toBe(true)
  })

  it('lets membership staff edit and publish a giving page, reorder its sections and hide one, and keeps them out of every other page', async () => {
    const give = pages[0]!
    const mine = await make(publisher, 'mem-edit', { pageSet: 'giving', sections: give.sections })
    created.push(mine.id)
    const sections = [...give.sections].reverse().map((s, i) => (i === 0 ? { ...s, hidden: true } : s))
    const edited = await payload.update({ collection: 'pages', id: mine.id, draft: false, ...asUser(membership), data: { sections, _status: 'published' } as never })
    expect(edited._status).toBe('published')
    expect(edited.sections?.map((s) => s.id)).toEqual(sections.map((s) => s.id))
    expect(edited.sections?.[0]?.hidden).toBe(true)

    const other = await make(publisher, 'mem-sponsor', { pageSet: 'sponsor', sections: [] })
    created.push(other.id)
    const plain = await make(publisher, 'mem-none', { sections: [] })
    created.push(plain.id)
    for (const id of [other.id, plain.id]) await expect(payload.update({ collection: 'pages', id, ...asUser(membership), data: { title: 'Changed' } as never })).rejects.toThrow()
    await expect(payload.update({ collection: 'pages', id: mine.id, ...asUser(editor), data: { title: 'Changed' } as never })).rejects.toThrow()
  })

  it('refuses a giving-only block on a page in no set or in another set, and a sponsor-only block on a giving page', async () => {
    const gift = pages[0]!.sections[0]!
    await expect(make(publisher, 'gift-none', { sections: [gift] })).rejects.toThrow()
    await expect(make(publisher, 'gift-sponsor', { pageSet: 'sponsor', sections: [gift] })).rejects.toThrow()
    await expect(make(publisher, 'form-giving', { pageSet: 'giving', sections: [{ blockType: 'sectionInquiryForm', heading: { title: 'Get a proposal' } }] })).rejects.toThrow()
  })

  it('serves the giving settings to the public, with the donation form’s address (a link on the page) and the contact details', async () => {
    await payload.updateGlobal({ slug: 'giving-settings', data: { phone: '850 473-7433', donationForm: { monthlyAddress: 'https://give.example.org/monthly' } } as never, overrideAccess: true, context: { disableRevalidate: true } })
    const pub = await payload.findGlobal({ slug: 'giving-settings', depth: 0, overrideAccess: false })
    expect(pub.phone).toBe('850 473-7433')
    expect(pub.donationForm?.monthlyAddress).toBe('https://give.example.org/monthly')
  })
})
