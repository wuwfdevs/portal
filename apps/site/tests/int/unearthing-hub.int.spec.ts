import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureTestSection } from '../helpers/section'

import { loadUnearthingHub } from '@/lib/unearthing/load'

// The Unearthing Florida hub reads its production's episodes, the sites they are about and the series they belong to, through
// access control. The hub's settings are a global shared by every test run, so they are put back afterwards.

const run = Date.now().toString(36)
let payload: Payload
const created: { collection: string; id: string | number }[] = []
const ctx = { disableRevalidate: true }
const body = { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text: 'Notes.', format: 0, mode: 'normal', style: '', detail: 0 }] }] } }

async function make<T extends { id: string | number }>(collection: string, data: Record<string, unknown>): Promise<T> {
  const doc = (await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: ctx })) as unknown as T
  created.push({ collection, id: doc.id })
  return doc
}
const setHub = (data: Record<string, unknown>) => payload.updateGlobal({ slug: 'unearthing-hub', data: data as never, overrideAccess: true, context: ctx })

describe('the Unearthing Florida hub', () => {
  let before: Record<string, unknown>
  let production: { id: string | number }
  const ids: Record<string, string | number> = {}

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    before = (await payload.findGlobal({ slug: 'unearthing-hub', depth: 0, overrideAccess: true })) as unknown as Record<string, unknown>
    const section = await ensureTestSection(payload)
    production = await make('productions', { title: `Unearthing ${run}`, summary: 'Short stories of Florida archaeology.' })
    const other = await make<{ id: string | number }>('productions', { title: `Not Unearthing ${run}` })
    const luis = await make<{ id: string | number }>('sites', { name: `Mission San Luis ${run}`, place: 'Tallahassee', era: 'spanish', mapX: 51, mapY: 16 })
    const luna = await make<{ id: string | number }>('sites', { name: `Luna ${run}`, short: 'Luna', place: 'Pensacola', era: 'spanish', mapX: 7, mapY: 21 })
    const missions = await make<{ id: string | number }>('series', { title: `The Spanish missions ${run}` })
    const ep = async (key: string, day: number, extra: Record<string, unknown> = {}) => {
      const p = await make<{ id: string | number }>('posts', { title: `${key} ${run}`, content: body, _status: 'published', section, production: production.id, format: 'audio', publishedAt: `2090-04-${String(day).padStart(2, '0')}T12:00:00.000Z`, ...extra })
      ids[key] = p.id
    }
    await ep('Mission story', 1, { site: luis.id, period: 'first-spanish', series: missions.id })
    await ep('End of missions', 2, { site: luis.id, period: 'first-spanish', series: missions.id })
    await ep('Luna storm', 3, { site: luna.id, period: 'first-spanish' })
    await ep('Draft episode', 4, { _status: 'draft', period: 'civil-war' })
    await ep('Later pick', 7, { period: 'first-spanish' })
    await make('posts', { title: `Elsewhere ${run}`, content: body, _status: 'published', section, production: other.id, format: 'audio', period: 'civil-war', publishedAt: '2090-04-05T12:00:00.000Z' })
    await make('posts', { title: `Today ${run}`, content: body, _status: 'published', section, publishedAt: '2090-04-06T12:00:00.000Z' }).then((p) => (ids.today = (p as { id: string | number }).id))
  }, 90_000)

  afterAll(async () => {
    await payload.updateGlobal({ slug: 'unearthing-hub', data: { production: null, featured: null, dateline: null, about: null, thenNow: { heading: null, blurb: null, pairs: [] } } as never, overrideAccess: true, context: ctx }).catch(() => undefined)
    for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
    void before
  })

  it('is not set up until a production is chosen', async () => {
    await setHub({ production: null })
    expect(await loadUnearthingHub()).toBeNull()
  })

  it('reads only the production\'s published episodes, with the timeline, collections and sites made from them', async () => {
    await setHub({ production: production.id, dateline: 'Northwest Florida to the Keys', about: 'Made since 1998.' })
    const d = await loadUnearthingHub()
    expect(d?.production.title).toBe(`Unearthing ${run}`)
    expect(d?.totalEpisodes).toBe(4)
    expect(d?.dateline).toBe('Northwest Florida to the Keys')
    expect(d?.about).toBe('Made since 1998.')
    expect(d?.periods.find((p) => p.value === 'first-spanish')?.count).toBe(4)
    expect(d?.periods.find((p) => p.value === 'civil-war')?.count).toBe(0) // the draft and the other show's episode do not count
    expect(d?.collections.map((c) => [c.title, c.episodes.length])).toEqual([[`The Spanish missions ${run}`, 2]])
    const luis = d?.sites.find((s) => s.name === `Mission San Luis ${run}`)
    expect(luis).toMatchObject({ count: 2, era: 'spanish', place: 'Tallahassee', short: `Mission San Luis ${run}`, x: 51, y: 16 })
    expect(d?.sites.find((s) => s.short === 'Luna')?.count).toBe(1)
  })

  it('features the newest episode unless an editor picked one, and drops a pick that is not one of its published episodes', async () => {
    await setHub({ production: production.id, featured: null })
    expect((await loadUnearthingHub())?.featured?.title).toBe(`Later pick ${run}`)
    await setHub({ featured: ids['Mission story'] })
    expect((await loadUnearthingHub())?.featured?.title).toBe(`Mission story ${run}`)
    // The admin only offers published stories, and refuses a draft outright.
    await expect(setHub({ featured: ids['Draft episode'] })).rejects.toThrow()
    // A story that is published but not this production's is never shown here.
    await setHub({ featured: ids.today })
    expect((await loadUnearthingHub())?.featured?.title).toBe(`Later pick ${run}`)
    // A pick that is unpublished afterwards falls away.
    await setHub({ featured: ids['Luna storm'] })
    await payload.update({ collection: 'posts', id: ids['Luna storm']!, data: { _status: 'draft' } as never, overrideAccess: true, context: ctx })
    expect((await loadUnearthingHub())?.featured?.title).toBe(`Later pick ${run}`)
    await payload.update({ collection: 'posts', id: ids['Luna storm']!, data: { _status: 'published' } as never, overrideAccess: true, context: ctx })
  })

  it('shows a then-and-now pair only when both stories are published', async () => {
    await setHub({ thenNow: { heading: 'Rebuilt for 500 years', pairs: [{ then: ids['Luna storm'], now: ids.today }, { then: ids['Mission story'], now: ids['End of missions'] }] } })
    await payload.update({ collection: 'posts', id: ids['End of missions']!, data: { _status: 'draft' } as never, overrideAccess: true, context: ctx })
    const d = await loadUnearthingHub()
    expect(d?.thenNow.heading).toBe('Rebuilt for 500 years')
    expect(d?.thenNow.pairs.map((p) => [p.then.title, p.now.title])).toEqual([[`Luna storm ${run}`, `Today ${run}`]])
    await payload.update({ collection: 'posts', id: ids['End of missions']!, data: { _status: 'published' } as never, overrideAccess: true, context: ctx })
  })

  it('refuses a map position outside the map and a site with no place', async () => {
    await expect(make('sites', { name: `Off the map ${run}`, place: 'Nowhere', era: 'native', mapX: 140 })).rejects.toThrow()
    await expect(make('sites', { name: `No place ${run}`, era: 'native' })).rejects.toThrow()
  })
})
