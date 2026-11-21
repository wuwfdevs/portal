// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Pages } from '@/collections/Pages'
import { resolveHome } from '@/utilities/resolvePath'

// "Use as the home page" (`pages.isHome`): which page is served at "/" is a box on the page. One page holds it; ticking it on another page and publishing moves it, the old page gets
// an address from its slug, an old address of the new home page redirects to "/", the home page cannot be unticked directly, and only a page in the home set can have it.

const run = Date.now().toString(36)
let payload: Payload
const made: (number | string)[] = []
let originalHome: { id: number | string } | undefined
const ctx = { disableRevalidate: true, disableEmbedding: true }
const base = { template: 'sections', pageSet: 'home', sections: [], generateSlug: false, _status: 'published' }
const make = async (key: string, extra: Record<string, unknown> = {}) => {
  const page = await payload.create({ collection: 'pages', draft: false, overrideAccess: true, context: ctx, data: { ...base, title: `Home flag ${key} ${run}`, slug: `home-flag-${key}-${run}`, ...extra } as never })
  made.push(page.id)
  return page
}
const read = (id: number | string) => payload.findByID({ collection: 'pages', id, depth: 0, draft: false, overrideAccess: true })
const setHome = (id: number | string, extra: Record<string, unknown> = {}) =>
  payload.update({ collection: 'pages', id, draft: false, overrideAccess: true, context: ctx, data: { isHome: true, ...extra } as never })

describe('the home page checkbox', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    originalHome = (await payload.find({ collection: 'pages', where: { isHome: { equals: true } }, limit: 1, depth: 0, draft: true, overrideAccess: true })).docs[0]
  }, 60_000)
  afterAll(async () => {
    // Give the site its home page back, then remove the test pages (the redirects they left go with them).
    if (originalHome) await setHome(originalHome.id).catch(() => undefined)
    for (const id of made.reverse()) await payload.delete({ collection: 'pages', id, overrideAccess: true, context: ctx }).catch(() => undefined)
    const redirects = await payload.find({ collection: 'redirects', where: { from: { like: `home-flag-` } }, limit: 50, depth: 0, overrideAccess: true })
    for (const r of redirects.docs) await payload.delete({ collection: 'redirects', id: r.id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('serves the ticked page at "/" and gives it no address of its own', async () => {
    const a = await make('a', { isHome: true })
    expect((await read(a.id)).path ?? null).toBeNull()
    expect((await resolveHome(false))?.id).toBe(a.id)
  })

  it('moves to another page when that one is ticked and published, and the old home page gets an address from its slug', async () => {
    const a = await make('a2', { isHome: true })
    const b = await make('b2')
    await setHome(b.id)
    const [oldHome, newHome] = [await read(a.id), await read(b.id)]
    expect(oldHome.isHome).toBe(false)
    expect(oldHome.path).toBe(`/home-flag-a2-${run}`)
    expect(newHome.isHome).toBe(true)
    expect(newHome.path ?? null).toBeNull()
    expect((await resolveHome(false))?.id).toBe(b.id)
    const holders = await payload.find({ collection: 'pages', where: { isHome: { equals: true } }, limit: 5, depth: 0, draft: false, overrideAccess: true })
    expect(holders.docs.map((p) => p.id)).toEqual([b.id])
  })

  it('lets go of the address a page had when it becomes the home page, and leaves a redirect from it to "/"', async () => {
    const holder = await make('holder', { isHome: true })
    const c = await make('c3', { path: `/home-flag-c3-${run}` })
    await setHome(c.id)
    expect((await read(c.id)).path ?? null).toBeNull()
    const redirect = await payload.find({ collection: 'redirects', where: { from: { equals: `/home-flag-c3-${run}` } }, limit: 1, depth: 0, overrideAccess: true })
    expect(redirect.docs[0]?.to?.url).toBe('/')
    expect((await read(holder.id)).isHome).toBe(false)
  })

  it('does not move on a draft save: only a published save changes what the public sees', async () => {
    const holder = await make('holder4', { isHome: true })
    const d = await make('d4')
    await payload.update({ collection: 'pages', id: d.id, draft: true, overrideAccess: true, context: ctx, data: { isHome: true, _status: 'draft' } as never })
    expect((await read(holder.id)).isHome).toBe(true)
    expect((await resolveHome(false))?.id).toBe(holder.id)
  })

  it('refuses to untick the home page directly: the site always has one', async () => {
    const e = await make('e5', { isHome: true })
    await expect(payload.update({ collection: 'pages', id: e.id, draft: false, overrideAccess: true, context: ctx, data: { isHome: false } as never })).rejects.toThrow(/needs a home page/)
    expect((await read(e.id)).isHome).toBe(true)
  })

  it('is only for a page in the home set', async () => {
    await expect(make('f6', { isHome: true, pageSet: 'sponsor' })).rejects.toThrow()
    await expect(make('g6', { isHome: true, pageSet: null })).rejects.toThrow()
  })

  it('can be changed only by a publisher (the field\'s own access)', async () => {
    const field = Pages.fields.find((f) => 'name' in f && f.name === 'isHome') as { access?: { update?: (a: { req: { user: unknown } }) => boolean } } | undefined
    const as = (role: string) => ({ req: { user: { id: 1, roles: [role] } } })
    expect(field?.access?.update?.(as('publisher'))).toBe(true)
    expect(field?.access?.update?.(as('editor'))).toBe(false)
  })
})
