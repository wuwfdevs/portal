import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureTestSection } from '../helpers/section'

import { consolidateShows } from '../../scripts/shows/consolidate-core'

// Moving shows and their episodes from Grove's `/show/<slug>` and `/podcast/<slug>` to `/shows/<slug>`, each old address leaving a
// permanent redirect. Every call is narrowed to this run's shows (`only: run`), because the test database is shared.

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
const pathOf = async (collection: 'posts' | 'productions', id: string | number) => ((await payload.findByID({ collection, id, depth: 0, overrideAccess: true })) as { path?: string | null }).path
const redirectFrom = async (from: string) => (await payload.find({ collection: 'redirects', where: { from: { equals: from } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]?.to?.url ?? null

describe('moving shows to /shows', () => {
  const ids: Record<string, string | number> = {}
  let section: string | number

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    section = await ensureTestSection(payload)
    const show = async (key: string, path: string) => (ids[key] = (await make<{ id: string | number }>('productions', { title: `${key} ${run}`, path })).id)
    const ep = async (key: string, production: string | number, path: string | null, extra: Record<string, unknown> = {}) =>
      (ids[key] = (await make<{ id: string | number }>('posts', { title: `${key} ${run}`, content: body, _status: 'published', section, production, format: 'audio', ...(path ? { path } : {}), publishedAt: '2026-09-09T15:00:00.000Z', ...extra })).id)

    await show('A', `/show/a-${run}`)
    await ep('A1', ids.A!, `/show/a-${run}/2026-09-09/first`)
    await ep('A2', ids.A!, `/show/a-${run}/2026-09-10/second`)
    await ep('Afiled', ids.A!, `/local-news/2026-09-09/filed-${run}`) // the show's, but filed under a section: left alone
    await show('B', `/podcast/b-${run}`)
    await ep('B1', ids.B!, `/podcast/b-${run}/2026-09-09/eco`)
    await show('Cshow', `/show/c-${run}`)
    await show('Cpod', `/podcast/c-${run}`)
    await show('D', `/show/d-${run}`)
    await make('pages', { title: `Squatter ${run}`, slug: `squatter-${run}`, path: `/shows/d-${run}`, _status: 'published' })
    // A link already redirected to show A's old address: it must follow the move, not chain through it.
    await make('redirects', { from: `/old-a-${run}`, to: { type: 'custom', url: `/show/a-${run}` } })
  }, 60_000)

  afterAll(async () => {
    const redirects = await payload.find({ collection: 'redirects', where: { or: [{ from: { contains: run } }, { 'to.url': { contains: run } }] }, limit: 100, depth: 0, overrideAccess: true })
    for (const r of redirects.docs) await payload.delete({ collection: 'redirects', id: r.id, overrideAccess: true, context: ctx }).catch(() => undefined)
    for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('a dry run lists every move and changes nothing', async () => {
    const rows = await consolidateShows(payload, { only: run })
    const mine = (verdict: string) => rows.filter((r) => r.verdict === verdict).map((r) => r.from).sort()
    expect(mine('would-move')).toEqual([`/podcast/b-${run}`, `/podcast/b-${run}/2026-09-09/eco`, `/show/a-${run}`, `/show/a-${run}/2026-09-09/first`, `/show/a-${run}/2026-09-10/second`].sort())
    expect(mine('left-alone')).toEqual([`/local-news/2026-09-09/filed-${run}`])
    expect(mine('skipped-taken')).toEqual([`/show/d-${run}`])
    expect(rows.filter((r) => r.verdict === 'skipped-clash' && r.from.includes(run)).map((r) => r.from).sort()).toEqual([`/podcast/c-${run}`, `/show/c-${run}`])
    expect(await pathOf('productions', ids.A!)).toBe(`/show/a-${run}`)
    expect(await pathOf('posts', ids.A1!)).toBe(`/show/a-${run}/2026-09-09/first`)
    expect(await redirectFrom(`/show/a-${run}`)).toBeNull()
  })

  it('moves the shows and their episodes, leaving a permanent redirect at every old address', async () => {
    const rows = await consolidateShows(payload, { apply: true, only: run })
    expect(rows.filter((r) => r.verdict === 'failed')).toEqual([])
    expect(await pathOf('productions', ids.A!)).toBe(`/shows/a-${run}`)
    expect(await pathOf('posts', ids.A1!)).toBe(`/shows/a-${run}/2026-09-09/first`)
    expect(await pathOf('posts', ids.A2!)).toBe(`/shows/a-${run}/2026-09-10/second`)
    expect(await pathOf('productions', ids.B!)).toBe(`/shows/b-${run}`)
    expect(await pathOf('posts', ids.B1!)).toBe(`/shows/b-${run}/2026-09-09/eco`)
    expect(await redirectFrom(`/show/a-${run}`)).toBe(`/shows/a-${run}`)
    expect(await redirectFrom(`/show/a-${run}/2026-09-09/first`)).toBe(`/shows/a-${run}/2026-09-09/first`)
    expect(await redirectFrom(`/podcast/b-${run}`)).toBe(`/shows/b-${run}`)
    expect(await redirectFrom(`/podcast/b-${run}/2026-09-09/eco`)).toBe(`/shows/b-${run}/2026-09-09/eco`)
    // No chain: the older redirect now points straight at the new address.
    expect(await redirectFrom(`/old-a-${run}`)).toBe(`/shows/a-${run}`)
  })

  it('leaves alone what it must: the filed episode, the clash and the taken address', async () => {
    expect(await pathOf('posts', ids.Afiled!)).toBe(`/local-news/2026-09-09/filed-${run}`)
    expect(await pathOf('productions', ids.Cshow!)).toBe(`/show/c-${run}`)
    expect(await pathOf('productions', ids.Cpod!)).toBe(`/podcast/c-${run}`)
    expect(await pathOf('productions', ids.D!)).toBe(`/show/d-${run}`)
  })

  it('finds nothing more to move on a second run', async () => {
    const rows = await consolidateShows(payload, { apply: true, only: run })
    expect(rows.filter((r) => r.verdict === 'moved' || r.verdict === 'would-move')).toEqual([])
  })

  it('keeps a show where it is until all its episodes can move, and finishes on the next run', async () => {
    const e = await make<{ id: string | number }>('productions', { title: `E ${run}`, path: `/show/e-${run}` })
    const e1 = await make<{ id: string | number }>('posts', { title: `E1 ${run}`, content: body, _status: 'published', section, production: e.id, format: 'audio', path: `/show/e-${run}/2026-09-09/one`, publishedAt: '2026-09-09T15:00:00.000Z' })
    const blocker = await make<{ id: string | number }>('pages', { title: `Blocker ${run}`, slug: `blocker-${run}`, path: `/shows/e-${run}/2026-09-09/one`, _status: 'published' })
    const first = await consolidateShows(payload, { apply: true, only: `e-${run}` })
    expect(first.map((r) => `${r.kind} ${r.verdict}`)).toEqual(['episode skipped-taken', 'show skipped-episodes'])
    expect(await pathOf('productions', e.id)).toBe(`/show/e-${run}`)
    await payload.delete({ collection: 'pages', id: blocker.id, overrideAccess: true, context: ctx })
    await consolidateShows(payload, { apply: true, only: `e-${run}` })
    expect(await pathOf('productions', e.id)).toBe(`/shows/e-${run}`)
    expect(await pathOf('posts', e1.id)).toBe(`/shows/e-${run}/2026-09-09/one`)
  })

  it('gives a new episode of a show at /shows an address under the show; a show still at a Grove address gives an ordinary one', async () => {
    const moved = await make<{ id: string | number; path: string }>('posts', { title: `New ep ${run}`, slug: `new-ep-${run}`, content: body, _status: 'published', section, production: ids.A, format: 'audio', publishedAt: '2026-11-06T15:00:00.000Z' })
    expect(moved.path).toBe(`/shows/a-${run}/2026-11-06/new-ep-${run}`)
    const notMoved = await make<{ id: string | number; path: string }>('posts', { title: `Old-show ep ${run}`, slug: `old-show-ep-${run}`, content: body, _status: 'published', section, production: ids.D, format: 'audio', publishedAt: '2026-11-06T15:00:00.000Z' })
    expect(notMoved.path).toBe(`/tests/2026-11-06/old-show-ep-${run}`)
    const notAudio = await make<{ id: string | number; path: string }>('posts', { title: `Companion ${run}`, slug: `companion-${run}`, content: body, _status: 'published', section, production: ids.A, format: 'web', publishedAt: '2026-11-06T15:00:00.000Z' })
    expect(notAudio.path).toBe(`/tests/2026-11-06/companion-${run}`)
  })

  it('a show whose address an editor changes by hand also leaves a redirect', async () => {
    await payload.update({ collection: 'productions', id: ids.B!, data: { path: `/shows/b-renamed-${run}` } as never, overrideAccess: true, context: ctx })
    expect(await redirectFrom(`/shows/b-${run}`)).toBe(`/shows/b-renamed-${run}`)
    expect(await redirectFrom(`/podcast/b-${run}`)).toBe(`/shows/b-renamed-${run}`)
  })
})
