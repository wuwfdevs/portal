// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { down, up } from '@/migrations/20261123_020000_radiolive_page'
import { checkPath, RADIOLIVE_PAGE_PATHS } from '@/lib/paths'
import { resolvePath } from '@/utilities/resolvePath'

// The migration that gives RadioLive its page and its "All artists" page: written through the Local API from the words the coded hub's global held, only where there is a RadioLive, once; the two
// records sit under the reserved first segment `/radiolive` only because they are pages of the radiolive set. The hub's settings are a global shared by every test run, so they are put back.

const run = Date.now().toString(36)
let payload: Payload
const ctx = { disableRevalidate: true, disableEmbedding: true }
const made: Array<{ collection: string; id: number | string }> = []
const run_up = () => up({ payload, req: undefined as never, db: undefined as never } as never)
const pagesOf = () => payload.find({ collection: 'pages', where: { slug: { in: ['radiolive', 'radiolive-artists'] } }, limit: 5, depth: 0, draft: false, overrideAccess: true })
const setHub = (data: Record<string, unknown>) => payload.updateGlobal({ slug: 'radiolive-hub', data: data as never, overrideAccess: true, context: ctx })

describe('the RadioLive page migration', () => {
  let production: { id: number }
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    production = (await payload.create({ collection: 'productions', overrideAccess: true, context: ctx, data: { title: `RadioLive ${run}`, kind: 'original', listed: false } as never })) as never
    made.push({ collection: 'productions', id: production.id })
  }, 90_000)
  afterAll(async () => {
    await down({ payload, req: undefined as never, db: undefined as never } as never).catch(() => undefined)
    await setHub({ production: null, membership: { heading: null, text: null, contactName: null, contactEmail: null, contactPhone: null, href: null } }).catch(() => undefined)
    for (const { collection, id } of [...made].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('writes nothing where there is no RadioLive (no production chosen and no show)', async () => {
    const shows = await payload.count({ collection: 'performances', overrideAccess: true })
    await setHub({ production: null })
    if (shows.totalDocs > 0) return // a database that has shows is not the case under test
    await run_up()
    expect((await pagesOf()).docs).toHaveLength(0)
  })

  it('writes the page and the All artists page from the hub\'s words, naming the production, at the two addresses the reserved segment allows', async () => {
    await setHub({ production: production.id, tagline: `Songwriters live ${run}`, membership: { heading: 'RadioLive 25', text: `Members receive a ticket ${run}.`, contactName: 'the membership office', contactEmail: 'members@example.org' } })
    await run_up()
    const { docs } = await pagesOf()
    const home = docs.find((p) => p.slug === 'radiolive')!
    const artists = docs.find((p) => p.slug === 'radiolive-artists')!
    expect(home).toMatchObject({ pageSet: 'radiolive', path: '/radiolive', template: 'sections', _status: 'published' })
    expect(artists).toMatchObject({ pageSet: 'radiolive', path: '/radiolive/artists', navLabel: 'All artists' })
    expect(typeof home.show === 'object' ? (home.show as { id: number }).id : home.show).toBe(production.id)
    const text = JSON.stringify(home.sections)
    for (const word of [`Songwriters live ${run}`, 'RadioLive 25', `Members receive a ticket ${run}.`, 'members@example.org']) expect(text).toContain(word)
    expect(text).not.toMatch(/\[[A-Z ]+\]/)
    expect(JSON.stringify(artists.sections)).toContain('sectionArtistIndex')
    expect((await resolvePath('/radiolive', false))?.kind).toBe('page')
  })

  it('leaves a page that already exists alone, so a second run changes nothing', async () => {
    const before = (await pagesOf()).docs.map((p) => [p.slug, p.updatedAt])
    await run_up()
    expect((await pagesOf()).docs.map((p) => [p.slug, p.updatedAt])).toEqual(before)
  })

  it('keeps the reserved segment closed to everything else: a story or a page outside the set cannot take /radiolive or a show\'s address', async () => {
    expect(checkPath('/radiolive').ok).toBe(false)
    expect(checkPath('/radiolive/some-show').ok).toBe(false)
    expect(checkPath('/radiolive/some-show', { allowPaths: RADIOLIVE_PAGE_PATHS }).ok).toBe(false)
    await expect(payload.create({ collection: 'pages', overrideAccess: true, context: ctx, data: { title: `Imposter ${run}`, slug: `imposter-${run}`, path: '/radiolive/imposter', template: 'sections', sections: [], _status: 'published' } as never })).rejects.toThrow()
  })
})
