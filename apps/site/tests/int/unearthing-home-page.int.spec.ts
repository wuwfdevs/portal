// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureTestSection } from '../helpers/section'
import { down, up } from '@/migrations/20261123_013300_unearthing_home_page'
import { resolveShowHome } from '@/utilities/resolvePath'

// The migration that gives Unearthing Florida its home page: written through the Local API from the words the coded hub held, only where the show exists, once.

const SHOW_PATH = '/shows/unearthing-florida'
const run = Date.now().toString(36)
let payload: Payload
const ctx = { disableRevalidate: true, disableEmbedding: true }
const made: Array<{ collection: 'productions' | 'series' | 'posts' | 'pages'; id: number | string }> = []
let show: { id: number | string; title: string; listed?: boolean | null }
let hubBefore: Record<string, unknown>
const body = { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text: 'Notes.', format: 0, mode: 'normal', style: '', detail: 0 }] }] } }
const run_up = () => up({ payload, req: undefined as never, db: undefined as never } as never)
const pagesOf = () => payload.find({ collection: 'pages', where: { slug: { in: ['unearthing-florida-home', 'unearthing-florida-about'] } }, limit: 5, depth: 0, draft: false, overrideAccess: true })

describe('the Unearthing Florida home page migration', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const existing = (await payload.find({ collection: 'productions', where: { path: { equals: SHOW_PATH } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
    show = existing ?? ((await payload.create({ collection: 'productions', overrideAccess: true, context: ctx, data: { title: 'Unearthing Florida', summary: 'Stories of buried history.', kind: 'original', listed: false } as never })) as never)
    if (!existing) made.push({ collection: 'productions', id: show.id })
    hubBefore = (await payload.findGlobal({ slug: 'unearthing-hub', depth: 0, overrideAccess: true })) as never
    await payload.updateGlobal({ slug: 'unearthing-hub', data: { production: show.id, dateline: 'Northwest Florida to the Keys', about: 'About the project, in the hub\'s words.' } as never, overrideAccess: true, context: ctx })
    const series = (await payload.create({ collection: 'series', overrideAccess: true, context: ctx, data: { title: `Forts and frontiers ${run}` } as never })) as { id: number | string }
    made.push({ collection: 'series', id: series.id })
    const section = await ensureTestSection(payload)
    const ep = (await payload.create({ collection: 'posts', draft: false, overrideAccess: true, context: ctx, data: { title: `Ep ${run}`, content: body, _status: 'published', section, production: show.id, series: series.id, format: 'audio', publishedAt: '2090-01-01T12:00:00.000Z' } as never })) as { id: number | string }
    made.push({ collection: 'posts', id: ep.id })
  }, 90_000)
  afterAll(async () => {
    await down({ payload, req: undefined as never, db: undefined as never } as never).catch(() => undefined)
    for (const { collection, id } of [...made].reverse()) await payload.delete({ collection, id, overrideAccess: true, context: ctx }).catch(() => undefined)
    await payload.updateGlobal({ slug: 'unearthing-hub', data: { production: (hubBefore.production as { id?: number } | number | null | undefined) && typeof hubBefore.production === 'object' ? (hubBefore.production as { id: number }).id : (hubBefore.production ?? null), dateline: hubBefore.dateline ?? null, about: hubBefore.about ?? null } as never, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('writes the show\'s home page and an About page, lists the show, and serves the home page at the show\'s address', async () => {
    await run_up()
    const { docs } = await pagesOf()
    const home = docs.find((p) => p.slug === 'unearthing-florida-home')!
    const about = docs.find((p) => p.slug === 'unearthing-florida-about')!
    expect(home).toMatchObject({ pageSet: 'unearthing', isShowHome: true, navHidden: true, template: 'sections', _status: 'published' })
    expect(home.path ?? null).toBeNull()
    expect(about.path).toBe('/shows/unearthing-florida/about')
    expect((await payload.findByID({ collection: 'productions', id: show.id, depth: 0, overrideAccess: true })).listed).toBe(true)
    expect((await resolveShowHome(SHOW_PATH, false))?.id).toBe(home.id)
  })
  it('puts the hub\'s words and the show\'s collections on the page, and no show or episode typed anywhere', async () => {
    const home = (await pagesOf()).docs.find((p) => p.slug === 'unearthing-florida-home')!
    const text = JSON.stringify(home.sections)
    expect(text).toContain('Northwest Florida to the Keys')
    expect(text).toContain(`Forts and frontiers ${run}`)
    expect(text).toContain('/series/forts-and-frontiers-')
    expect(text).not.toMatch(/\[[A-Z ]+\]/)
  })
  it('is idempotent: a second run changes nothing, and a show with a home page of its own is left alone', async () => {
    const before = (await pagesOf()).totalDocs
    await run_up()
    expect((await pagesOf()).totalDocs).toBe(before)
  })
  it('removes the pages it wrote, and only those, when rolled back', async () => {
    await down({ payload, req: undefined as never, db: undefined as never } as never)
    expect((await pagesOf()).totalDocs).toBe(0)
  })
})
