import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureTestSection } from '../helpers/section'

import { arrangeFront, newestInSection, storiesByIds, TOP_COUNT } from '@/lib/home-blocks/load'

// What the home page's blocks read (the Front page lead, the News run), through access control, from what an editor chose, filled from the newest published work. These
// are the checks the coded home page's loader had; the page's order ("a story once") is `lib/page-slots`, tested beside it.

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

describe('the home page blocks\' reads', () => {
  const s: Record<string, { id: string | number }> = {}
  let sectionB: { id: string | number }
  const NEWEST = '2099-01-01T12:00:00.000Z' // later than anything else in the shared test database

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const section = await ensureTestSection(payload)
    sectionB = await make('sections', { title: `Home B ${run}`, slug: `home-b-${run}` })
    const story = async (key: string, minute: number, extra: Record<string, unknown> = {}) => {
      s[key] = await make('posts', { title: `${key} ${run}`, content: body, _status: 'published', section, source: 'wuwf', publishedAt: `2099-01-01T12:${String(minute).padStart(2, '0')}:00.000Z`, ...extra })
    }
    await story('A', 10)
    await story('B', 11)
    await story('C', 12)
    await story('D', 13)
    await story('E', 8)
    await story('F', 9)
    await story('Newest', 40)
    s.Draft = await make('posts', { title: `Draft ${run}`, content: body, _status: 'draft', publishedAt: NEWEST })
    s.Wire = await make('posts', { title: `Wire ${run}`, content: body, _status: 'published', section, source: 'npr', publishedAt: '2099-01-01T12:59:00.000Z' })
    // A partner's reporting filed under a section belongs in that section's run (Florida News is featured on purpose).
    for (const [i, minute] of [20, 21, 22].entries()) {
      await make('posts', { title: `Partner${i + 1} ${run}`, content: body, _status: 'published', section: sectionB.id, source: 'wire', publishedAt: `2099-01-01T12:${minute}:00.000Z` })
    }
  }, 60_000)

  afterAll(async () => {
    for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('with nothing chosen, leads with the newest published WUWF story and never shows a draft or a wire story', async () => {
    const { lead, top } = await arrangeFront({})
    expect(lead?.title).toBe(`Newest ${run}`)
    expect([lead, ...top].map((x) => x?.title)).not.toContain(`Draft ${run}`)
    expect([lead, ...top].map((x) => x?.title)).not.toContain(`Wire ${run}`)
    expect(top).toHaveLength(TOP_COUNT)
  })

  it("uses the editor's lead and top stories, in order, fills the rest, and never repeats a story", async () => {
    const { lead, top } = await arrangeFront({ lead: s.B!.id, topStories: [s.D!.id, s.A!.id, s.B!.id] })
    expect(lead?.title).toBe(`B ${run}`)
    expect(top.slice(0, 2).map((x) => x.title)).toEqual([`D ${run}`, `A ${run}`])
    const everything = [lead, ...top].map((x) => String(x?.id))
    expect(new Set(everything).size).toBe(everything.length)
  })

  it('lets a chosen story that is no longer published fall away instead of showing it', async () => {
    expect(await storiesByIds([s.Draft!.id])).toEqual([])
    const { lead, top } = await arrangeFront({ lead: s.Draft!.id, topStories: [s.Draft!.id, s.C!.id] })
    expect([lead, ...top].map((x) => x?.title)).not.toContain(`Draft ${run}`)
    expect(top.map((x) => x.title)).toContain(`C ${run}`)
  })

  it("includes a partner's stories in the section they are filed under, newest first", async () => {
    const found = await newestInSection(sectionB.id, 3)
    expect(found.map((x) => x.title).slice(0, 3)).toEqual([`Partner3 ${run}`, `Partner2 ${run}`, `Partner1 ${run}`])
  })

  it('leaves out a section that has no stories', async () => {
    const empty = await make<{ id: string | number }>('sections', { title: `Home empty ${run}`, slug: `home-empty-${run}` })
    expect(await newestInSection(empty.id, 3)).toEqual([])
  })
})
