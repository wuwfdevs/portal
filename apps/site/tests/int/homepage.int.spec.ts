import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureTestSection } from '../helpers/section'

import { loadHomepage, TOP_COUNT } from '@/lib/homepage/load'

// The home page, read the way a visitor's request reads it: through access control, from what an editor chose in the Home
// page global, filled from the newest published work.

const run = Date.now().toString(36)
let payload: Payload
const created: { collection: string; id: string | number }[] = []
const ctx = { disableRevalidate: true }

async function make<T extends { id: string | number }>(collection: string, data: Record<string, unknown>): Promise<T> {
  const doc = (await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: ctx })) as unknown as T
  created.push({ collection, id: doc.id })
  return doc
}
const setHome = (data: Record<string, unknown>) => payload.updateGlobal({ slug: 'homepage', data: data as never, overrideAccess: true, context: ctx })
const body = { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text: 'Body.', format: 0, mode: 'normal', style: '', detail: 0 }] }] } }

describe('the home page', () => {
  const s: Record<string, { id: string | number }> = {}
  let sectionA: { id: string | number }
  const NEWEST = '2099-01-01T12:00:00.000Z' // later than anything else in the shared test database

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const section = await ensureTestSection(payload)
    sectionA = await make('sections', { title: `Home A ${run}`, slug: `home-a-${run}` })
    const story = async (key: string, minute: number, extra: Record<string, unknown> = {}) => {
      s[key] = await make('posts', { title: `${key} ${run}`, content: body, _status: 'published', section, source: 'wuwf', publishedAt: `2099-01-01T12:${String(minute).padStart(2, '0')}:00.000Z`, ...extra })
    }
    await story('A', 10)
    await story('B', 11)
    await story('C', 12)
    await story('D', 13)
    await story('Local1', 14, { section: sectionA.id })
    await story('Local2', 15, { section: sectionA.id })
    s.Draft = await make('posts', { title: `Draft ${run}`, content: body, _status: 'draft', publishedAt: NEWEST })
    s.Wire = await make('posts', { title: `Wire ${run}`, content: body, _status: 'published', section, source: 'npr', publishedAt: '2099-01-01T12:59:00.000Z' })
  }, 60_000)

  afterAll(async () => {
    await setHome({ emergency: { active: false, headline: null, body: null, linkLabel: null, linkHref: null }, lead: null, topStories: [], fellowshipFeature: { enabled: false, fellowship: null, story: null }, localNews: { section: null, heading: 'Northwest Florida', count: 6 }, leadKicker: null })
    for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('with nothing chosen, leads with the newest published WUWF story and never shows a draft or a wire story', async () => {
    await setHome({ lead: null, topStories: [] })
    const d = await loadHomepage()
    const titles = [d.lead, ...d.top, ...d.local.stories].map((x) => x?.title)
    expect(d.lead?.title).toBe(`Local2 ${run}`)
    expect(titles).not.toContain(`Draft ${run}`)
    expect(titles).not.toContain(`Wire ${run}`)
    expect(d.top).toHaveLength(TOP_COUNT)
  })

  it("uses the editor's lead and top stories, in order, fills the rest, and never repeats a story", async () => {
    await setHome({ lead: s.B!.id, leadKicker: 'After Isaias', topStories: [s.D!.id, s.A!.id, s.B!.id] })
    const d = await loadHomepage()
    expect(d.lead?.title).toBe(`B ${run}`)
    expect(d.leadKicker).toBe('After Isaias')
    expect(d.top.slice(0, 2).map((x) => x.title)).toEqual([`D ${run}`, `A ${run}`])
    const everything = [d.lead, ...d.top, ...d.local.stories].map((x) => String(x?.id))
    expect(new Set(everything).size).toBe(everything.length)
  })

  it('lets a chosen story that is no longer published fall away instead of showing it', async () => {
    await setHome({ lead: s.Draft!.id, topStories: [s.Draft!.id, s.C!.id] }).catch(() => undefined)
    const d = await loadHomepage()
    expect([d.lead, ...d.top].map((x) => x?.title)).not.toContain(`Draft ${run}`)
  })

  it('shows emergency coverage only while it is switched on and has a headline', async () => {
    await setHome({ emergency: { active: true, label: 'Hurricane warning', headline: 'Shelters open at noon', body: 'Details below.', linkLabel: 'Live updates', linkHref: '/live-updates/storm' } })
    expect((await loadHomepage()).emergency).toEqual({ label: 'Hurricane warning', headline: 'Shelters open at noon', body: 'Details below.', linkLabel: 'Live updates', linkHref: '/live-updates/storm' })
    await setHome({ emergency: { active: false } })
    expect((await loadHomepage()).emergency).toBeNull()
    await expect(setHome({ emergency: { active: true, headline: '  ' } })).rejects.toThrow()
  })

  it('refuses an emergency link that is not a page here, an https address or mailto', async () => {
    await expect(setHome({ emergency: { active: true, headline: 'x', linkHref: 'javascript:alert(1)' } })).rejects.toThrow()
  })

  it('fills the local list from one section, leaving out anything already shown above', async () => {
    await setHome({ lead: null, topStories: [], emergency: { active: false }, localNews: { heading: 'Around the Gulf', section: sectionA.id, count: 3 } })
    const d = await loadHomepage()
    expect(d.local.heading).toBe('Around the Gulf')
    const above = new Set([d.lead, ...d.top].map((x) => String(x?.id)))
    for (const story of d.local.stories) expect(above.has(String(story.id))).toBe(false)
    expect(d.local.stories.every((x) => [`Local1 ${run}`, `Local2 ${run}`].includes(x.title))).toBe(true)
  })
})
