// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Pages } from '@/collections/Pages'
import { resolvePath, resolveShowHome } from '@/utilities/resolvePath'

// A show's home page (`pages.show`, `pages.isShowHome`): a page names its show and one page per show is flagged as the show's home. The show's address renders it; it has no address of its
// own; ticking it on another of the show's pages and publishing moves it; the address it had redirects to the show's; unticking is allowed (the show then keeps its standard page).

const run = Date.now().toString(36)
let payload: Payload
const made: Array<{ collection: 'pages' | 'productions'; id: number | string }> = []
const ctx = { disableRevalidate: true, disableEmbedding: true }
let show: { id: number | string; path: string }
let other: { id: number | string; path: string }
const base = { template: 'sections', pageSet: 'unearthing', sections: [], generateSlug: false, _status: 'published' }
const make = async (key: string, extra: Record<string, unknown> = {}) => {
  const page = await payload.create({ collection: 'pages', draft: false, overrideAccess: true, context: ctx, data: { ...base, title: `Show home ${key} ${run}`, slug: `show-home-${key}-${run}`, ...extra } as never })
  made.push({ collection: 'pages', id: page.id })
  return page
}
const read = (id: number | string) => payload.findByID({ collection: 'pages', id, depth: 0, draft: false, overrideAccess: true })
const setHome = (id: number | string, extra: Record<string, unknown> = {}) =>
  payload.update({ collection: 'pages', id, draft: false, overrideAccess: true, context: ctx, data: { isShowHome: true, ...extra } as never })
const makeShow = async (title: string) => {
  const p = (await payload.create({ collection: 'productions', overrideAccess: true, context: ctx, data: { title, listed: true, kind: 'original' } as never })) as unknown as { id: number | string; path: string }
  made.push({ collection: 'productions', id: p.id })
  return p
}

describe('a show\'s home page', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    show = await makeShow(`Show home show ${run}`)
    other = await makeShow(`Show home other ${run}`)
  }, 60_000)
  afterAll(async () => {
    for (const { collection, id } of [...made].reverse()) await payload.delete({ collection, id, overrideAccess: true, context: ctx }).catch(() => undefined)
    const redirects = await payload.find({ collection: 'redirects', where: { from: { like: 'show-home-' } }, limit: 50, depth: 0, overrideAccess: true })
    for (const r of redirects.docs) await payload.delete({ collection: 'redirects', id: r.id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('is what the show\'s address resolves to, and the page has no address of its own', async () => {
    const a = await make('a', { show: show.id, isShowHome: true })
    expect((await read(a.id)).path ?? null).toBeNull()
    expect((await resolveShowHome(show.path, false))?.id).toBe(a.id)
    // The path catch-all lookup (a story or a page at that path) does not find it: only the show's address does.
    expect(await resolvePath(show.path, false)).toBeNull()
  })

  it('is nothing for a show with no home page, and for a path that is no show\'s', async () => {
    expect(await resolveShowHome(other.path, false)).toBeNull()
    expect(await resolveShowHome(`/shows/nothing-${run}`, false)).toBeNull()
  })

  it('moves to another of the show\'s pages when that one is ticked and published, and never takes another show\'s', async () => {
    const a = await make('a2', { show: show.id, isShowHome: true })
    const b = await make('b2', { show: show.id })
    const c = await make('c2', { show: other.id, isShowHome: true })
    await setHome(b.id)
    expect((await read(a.id)).isShowHome).toBe(false)
    expect((await read(b.id)).isShowHome).toBe(true)
    expect((await read(c.id)).isShowHome).toBe(true)
    expect((await resolveShowHome(show.path, false))?.id).toBe(b.id)
    expect((await resolveShowHome(other.path, false))?.id).toBe(c.id)
  })

  it('lets go of the address a page had and leaves a redirect from it to the show\'s address', async () => {
    const holder = await make('holder', { show: other.id, isShowHome: true })
    const page = await make('about', { show: other.id, path: `/shows/show-home-about-${run}` })
    await setHome(page.id)
    expect((await read(page.id)).path ?? null).toBeNull()
    const redirect = await payload.find({ collection: 'redirects', where: { from: { equals: `/shows/show-home-about-${run}` } }, limit: 1, depth: 0, overrideAccess: true })
    expect(redirect.docs[0]?.to?.url).toBe(other.path)
    expect((await read(holder.id)).isShowHome).toBe(false)
  })

  it('does not move on a draft save', async () => {
    const own = await makeShow(`Show home draft ${run}`)
    const holder = await make('holder4', { show: own.id, isShowHome: true })
    const d = await make('d4', { show: own.id })
    await payload.update({ collection: 'pages', id: d.id, draft: true, overrideAccess: true, context: ctx, data: { isShowHome: true, _status: 'draft' } as never })
    expect((await read(holder.id)).isShowHome).toBe(true)
    expect((await resolveShowHome(own.path, false))?.id).toBe(holder.id)
  })

  it('can be unticked: the show then keeps its standard page', async () => {
    const own = await makeShow(`Show home untick ${run}`)
    const page = await make('e5', { show: own.id, isShowHome: true })
    await payload.update({ collection: 'pages', id: page.id, draft: false, overrideAccess: true, context: ctx, data: { isShowHome: false } as never })
    expect(await resolveShowHome(own.path, false)).toBeNull()
  })

  it('needs a show, a page of sections, and a show with an address', async () => {
    await expect(make('f6', { isShowHome: true })).rejects.toThrow(/Choose the show/)
    await expect(make('g6', { show: show.id, isShowHome: true, template: 'standard' })).rejects.toThrow(/page of sections/)
    const noPath = (await payload.create({ collection: 'productions', overrideAccess: true, context: ctx, data: { title: `Show home pathless ${run}`, kind: 'syndicated' } as never })) as unknown as { id: number | string; path?: string | null }
    made.push({ collection: 'productions', id: noPath.id })
    if (!noPath.path) await expect(make('h6', { show: noPath.id, isShowHome: true })).rejects.toThrow(/no address/)
  })

  it('can be changed only by a publisher (the field\'s own access)', async () => {
    const field = Pages.fields.find((f) => 'name' in f && f.name === 'isShowHome') as { access?: { update?: (a: { req: { user: unknown } }) => boolean } } | undefined
    const as = (role: string) => ({ req: { user: { id: 1, roles: [role] } } })
    expect(field?.access?.update?.(as('publisher'))).toBe(true)
    expect(field?.access?.update?.(as('editor'))).toBe(false)
  })
})
