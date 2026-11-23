// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { down, up } from '@/migrations/20261123_030100_voyager_page'
import { newestInSection } from '@/lib/home-blocks/load'
import { VOYAGER_IDENTITY_SLUG } from '@/lib/voyager/identity'

// The migration that gives The Voyager its hub and About pages: written through the Local API from the words the coded hub's global held, only where the hub is set up, once; and the
// Voyager's pages read only the Voyager's stories. The hub's settings are a global shared by every test run, so they are put back afterwards.

const run = Date.now().toString(36)
let payload: Payload
const ctx = { disableRevalidate: true, disableEmbedding: true }
const made: Array<{ collection: string; id: number | string }> = []
const body = { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text: 'Body.', format: 0, mode: 'normal', style: '', detail: 0 }] }] } }
const make = async <T extends { id: string | number }>(collection: string, data: Record<string, unknown>): Promise<T> => {
  const doc = (await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: ctx, draft: false })) as unknown as T
  made.push({ collection, id: doc.id })
  return doc
}
const setHub = (data: Record<string, unknown>) => payload.updateGlobal({ slug: 'voyager-hub', data: data as never, overrideAccess: true, context: ctx })
const run_up = () => up({ payload, req: undefined as never, db: payload.db.drizzle } as never)
const pagesOf = () => payload.find({ collection: 'pages', where: { slug: { in: ['voyager', 'voyager-about'] } }, limit: 5, depth: 0, draft: false, overrideAccess: true })

describe('the Voyager pages migration', () => {
  let identity: { id: number }
  let wuwf: { id: number }
  let campus: { id: number; slug?: string | null }
  let person: { id: number }
  let hubBefore: Record<string, unknown>

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await clearFootnote() // an earlier run's footnote would be kept, by design
    hubBefore = (await payload.findGlobal({ slug: 'voyager-hub', depth: 0, overrideAccess: true })) as never
    // The identity's slug is what a Voyager page filters on.
    const existing = (await payload.find({ collection: 'publishing-identities', where: { slug: { equals: VOYAGER_IDENTITY_SLUG } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
    identity = (existing as never) ?? (await make<{ id: number }>('publishing-identities', { name: 'The Voyager', kind: 'partner' }))
    wuwf = await make('publishing-identities', { name: `WUWF News ${run}`, kind: 'newsroom' })
    campus = await make('sections', { title: `Campus ${run}` })
    person = await make('contributors', { name: `Marisol Tran ${run}`, title: 'Reporter' })
    const story = (title: string, identityId: number, extra: Record<string, unknown> = {}) =>
      make('posts', { title: `${title} ${run}`, content: body, _status: 'published', section: campus.id, publishingIdentity: identityId, publishedAt: '2090-05-01T12:00:00.000Z', ...extra })
    await story('Library hours', identity.id)
    await story('WUWF story', wuwf.id)
    await story('Draft story', identity.id, { _status: 'draft' })
  }, 90_000)
  afterAll(async () => {
    await clearFootnote()
    await down({ payload, req: undefined as never, db: undefined as never } as never).catch(() => undefined)
    await payload.updateGlobal({ slug: 'voyager-hub', data: { identity: null, featured: null, sections: [], podcast: null, staff: [], join: { heading: null, text: null, href: null } } as never, overrideAccess: true, context: ctx }).catch(() => undefined)
    if (hubBefore.identity) await payload.updateGlobal({ slug: 'voyager-hub', data: { identity: typeof hubBefore.identity === 'object' ? (hubBefore.identity as { id: number }).id : hubBefore.identity } as never, overrideAccess: true, context: ctx }).catch(() => undefined)
    for (const { collection, id } of [...made].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  const clearFootnote = () => payload.updateGlobal({ slug: 'shared-text', data: { voyagerFootnote: null } as never, overrideAccess: true, context: ctx }).catch(() => undefined)

  it('writes nothing while the hub is not set up (no publishing identity chosen)', async () => {
    await setHub({ identity: null })
    await run_up()
    expect((await pagesOf()).docs).toHaveLength(0)
  })

  it('writes the hub and the About page from the hub\'s words, and carries the footnote into Shared text', async () => {
    await setHub({
      identity: identity.id,
      sections: [campus.id],
      staff: [{ person: person.id, role: 'News editor' }],
      join: { heading: 'Write for us', text: 'Any UWF student.', href: 'https://example.org/join' },
      footnote: `Written by students ${run}.`,
    })
    await run_up()
    const { docs } = await pagesOf()
    const home = docs.find((p) => p.slug === 'voyager')!
    const about = docs.find((p) => p.slug === 'voyager-about')!
    expect(home).toMatchObject({ pageSet: 'voyager', path: '/voyager', navHidden: true, template: 'sections', _status: 'published' })
    expect(about).toMatchObject({ pageSet: 'voyager', path: '/voyager/about', navLabel: 'About' })
    const text = JSON.stringify([home.sections, about.sections])
    for (const word of ['News editor', 'Write for us', 'Any UWF student.', 'https://example.org/join', `Written by students ${run}.`, `Marisol Tran ${run}`]) expect(text).toContain(word)
    expect(text).not.toMatch(/\[[A-Z ]+\]/)
    const shared = (await payload.findGlobal({ slug: 'shared-text', depth: 0, overrideAccess: true })) as { voyagerFootnote?: string | null }
    expect(shared.voyagerFootnote).toBe(`Written by students ${run}.`)
  })

  it('leaves a page that already exists alone, so a second run changes nothing', async () => {
    const before = (await pagesOf()).docs.map((p) => [p.slug, p.updatedAt])
    await run_up()
    expect((await pagesOf()).docs.map((p) => [p.slug, p.updatedAt])).toEqual(before)
  })

  it('reads only the Voyager\'s published stories on a Voyager page, never another newsroom\'s or a draft', async () => {
    const found = await newestInSection(campus.id, 10, 'voyager')
    expect(found.map((s) => s.title)).toEqual([`Library hours ${run}`])
    const station = await newestInSection(campus.id, 10, 'station')
    expect(station.map((s) => s.title).sort()).toEqual([`Library hours ${run}`, `WUWF story ${run}`])
  })
})
