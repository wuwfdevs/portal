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
    await story('E', 8)
    await story('F', 9)
    await story('Local1', 14, { section: sectionA.id })
    await story('Local2', 15, { section: sectionA.id })
    s.Draft = await make('posts', { title: `Draft ${run}`, content: body, _status: 'draft', publishedAt: NEWEST })
    s.Wire = await make('posts', { title: `Wire ${run}`, content: body, _status: 'published', section, source: 'npr', publishedAt: '2099-01-01T12:59:00.000Z' })
  }, 60_000)

  afterAll(async () => {
    await setHome({ banner: { active: false, headline: null, body: null, linkLabel: null, linkHref: null }, lead: null, topStories: [], fellowshipFeature: { enabled: false, fellowship: null, story: null }, newsModules: [], leadKicker: null })
    for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('with nothing chosen, leads with the newest published WUWF story and never shows a draft or a wire story', async () => {
    await setHome({ lead: null, topStories: [] })
    const d = await loadHomepage()
    const titles = [d.lead, ...d.top, ...d.modules.flatMap((m) => m.stories)].map((x) => x?.title)
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
    const everything = [d.lead, ...d.top, ...d.modules.flatMap((m) => m.stories)].map((x) => String(x?.id))
    expect(new Set(everything).size).toBe(everything.length)
  })

  it('lets a chosen story that is no longer published fall away instead of showing it', async () => {
    await setHome({ lead: s.Draft!.id, topStories: [s.Draft!.id, s.C!.id] }).catch(() => undefined)
    const d = await loadHomepage()
    expect([d.lead, ...d.top].map((x) => x?.title)).not.toContain(`Draft ${run}`)
  })

  it('shows the banner only while it is switched on and has a headline, and keeps where and how', async () => {
    await setHome({ banner: { active: true, scope: 'all', style: 'notice', label: 'Road closure', headline: 'Shelters open at noon', body: 'Details below.', linkLabel: 'Live updates', linkHref: '/live-updates/storm' } })
    expect((await loadHomepage()).banner).toEqual({ scope: 'all', style: 'notice', label: 'Road closure', headline: 'Shelters open at noon', body: 'Details below.', linkLabel: 'Live updates', linkHref: '/live-updates/storm' })
    await setHome({ banner: { active: true, scope: 'home', style: 'emergency', label: null, headline: 'Shelters open at noon' } })
    expect((await loadHomepage()).banner).toMatchObject({ scope: 'home', style: 'emergency', label: 'Emergency coverage' })
    await setHome({ banner: { active: false } })
    expect((await loadHomepage()).banner).toBeNull()
    await expect(setHome({ banner: { active: true, headline: '  ' } })).rejects.toThrow()
  })

  it('refuses a banner link that is not a page here, an https address or mailto', async () => {
    await expect(setHome({ banner: { active: true, headline: 'x', linkHref: 'javascript:alert(1)' } })).rejects.toThrow()
  })

  describe('the news sections', () => {
    let sectionB: { id: string | number }
    let sectionEmpty: { id: string | number }

    beforeAll(async () => {
      sectionB = await make('sections', { title: `Home B ${run}`, slug: `home-b-${run}` })
      sectionEmpty = await make('sections', { title: `Home empty ${run}`, slug: `home-empty-${run}` })
      // A partner's reporting filed under a section belongs in that section's run (Florida News is featured on purpose).
      await make('posts', { title: `Partner1 ${run}`, content: body, _status: 'published', section: sectionB.id, source: 'wire', publishedAt: '2099-01-01T12:20:00.000Z' })
      await make('posts', { title: `Partner2 ${run}`, content: body, _status: 'published', section: sectionB.id, source: 'wire', publishedAt: '2099-01-01T12:21:00.000Z' })
      await make('posts', { title: `Partner3 ${run}`, content: body, _status: 'published', section: sectionB.id, source: 'wire', publishedAt: '2099-01-01T12:22:00.000Z' })
    }, 30_000)

    const row = (heading: string, section: { id: string | number }, extra: Record<string, unknown> = {}) => ({ heading, section: section.id, count: 3, enabled: true, ...extra })
    // The lead and the Briefing take the newest stories first, so these tests pin them to stories outside the sections under test.
    const reset = () => setHome({ lead: s.A!.id, topStories: [s.B!.id, s.C!.id, s.D!.id, s.E!.id, s.F!.id], leadKicker: null, banner: { active: false }, newsModules: [] })

    it('fills each section, in the order the editor chose, linking each to its section page and the band to every story', async () => {
      await reset()
      await setHome({ newsModules: [row('Around the Gulf', sectionA), row('From elsewhere', sectionB)] })
      const d = await loadHomepage()
      expect(d.modules.map((m) => [m.heading, m.href])).toEqual([['Around the Gulf', `/home-a-${run}`], ['From elsewhere', `/home-b-${run}`]])
      expect(d.modules[0]!.stories.map((x) => x.title).sort()).toEqual([`Local1 ${run}`, `Local2 ${run}`])
      expect(d.allStoriesHref).toBe('/latest')
    })

    it('includes a partner\'s stories in the section they are filed under', async () => {
      await reset()
      await setHome({ newsModules: [row('From elsewhere', sectionB, { count: 3 })] })
      const d = await loadHomepage()
      expect(d.modules[0]!.stories.map((x) => x.title)).toEqual([`Partner3 ${run}`, `Partner2 ${run}`, `Partner1 ${run}`])
    })

    it('shows a story once across the whole page, and takes the next one in a section instead', async () => {
      await reset()
      await setHome({ lead: s.Local2!.id, topStories: [s.Local1!.id], newsModules: [row('Around the Gulf', sectionA), row('Again', sectionA)] })
      const d = await loadHomepage()
      const everything = [d.lead, ...d.top, ...d.modules.flatMap((m) => m.stories)].map((x) => String(x?.id))
      expect(new Set(everything).size).toBe(everything.length)
      // Both Local stories sit above, so neither module has anything of its own left and both are left out.
      expect(d.modules.map((m) => m.heading)).not.toContain('Around the Gulf')
    })

    it('leaves out a section that is switched off or has no stories, and keeps the others in order', async () => {
      await reset()
      await setHome({ newsModules: [row('Off', sectionB, { enabled: false }), row('Nothing here', sectionEmpty), row('Around the Gulf', sectionA)] })
      const d = await loadHomepage()
      expect(d.modules.map((m) => m.heading)).toEqual(['Around the Gulf'])
    })

    it('keeps each count within three to eight, whatever is stored', async () => {
      await reset()
      await setHome({ newsModules: [row('From elsewhere', sectionB, { count: 8 })] })
      expect((await loadHomepage()).modules[0]!.stories).toHaveLength(3) // only three exist
      await expect(setHome({ newsModules: [row('Too many', sectionB, { count: 30 })] })).rejects.toThrow()
    })

    it('takes at most six sections', async () => {
      await reset()
      await expect(setHome({ newsModules: Array.from({ length: 7 }, (_, i) => row(`S${i}`, sectionB)) })).rejects.toThrow()
    })

    it('stands in a "Latest stories" run, linked to every story, when no section has anything, so the page is never blank', async () => {
      await reset()
      const d = await loadHomepage()
      expect(d.modules).toHaveLength(1)
      expect(d.modules[0]).toMatchObject({ heading: 'Latest stories', href: '/latest' })
      expect(d.modules[0]!.stories.length).toBeGreaterThan(0)
      const above = new Set([d.lead, ...d.top].map((x) => String(x?.id)))
      for (const story of d.modules[0]!.stories) expect(above.has(String(story.id))).toBe(false)
    })
  })
})
