// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureTestSection } from '../helpers/section'

import { loadThemedShow } from '@/lib/shows/themed-load'

// Seasons and episode numbers (phase 7; boards 21, 23).

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
const refused = (p: Promise<unknown>) => p.then(() => null, (e: { message: string; data?: { errors?: { message: string }[] } }) => [e.message, ...(e.data?.errors ?? []).map((x) => x.message)].join(' | '))

describe('seasons and episode numbers', () => {
  let show: { id: string | number; path: string }
  let other: { id: string | number }
  let s1: { id: string | number }
  let s2: { id: string | number }
  let otherSeason: { id: string | number }
  let section: unknown
  let e2: { id: string | number }

  const ep = (title: string, day: number, extra: Record<string, unknown>) =>
    make<{ id: string | number }>('posts', { title: `${title} ${run}`, content: body, _status: 'published', section, production: show.id, format: 'audio', publishedAt: `2090-05-${String(day).padStart(2, '0')}T12:00:00.000Z`, ...extra })

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    section = await ensureTestSection(payload)
    show = await make('productions', { title: `Seasoned ${run}`, theme: 'barefoot-mary' })
    other = await make('productions', { title: `Other ${run}` })
    s1 = await make('seasons', { production: show.id, number: 1, title: 'Tunnel Vision', summary: 'A descent.', _status: 'published' })
    s2 = await make('seasons', { production: show.id, number: 2, title: 'High Water', _status: 'published' })
    otherSeason = await make('seasons', { production: other.id, number: 1, _status: 'published' })
    await ep('Trailer', 1, { season: s1.id, episodeType: 'trailer' })
    await ep('S1 ep 1', 3, { season: s1.id, episodeNumber: 1 })
    await ep('S1 ep 0', 2, { season: s1.id, episodeNumber: 0 })
    e2 = await ep('S2 ep 1', 6, { season: s2.id, episodeNumber: 1 })
    await ep('Loose', 4, {})
  }, 90_000)

  afterAll(async () => {
    for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('groups the episodes by season, newest season first, in episode order, and names the season now airing', async () => {
    const d = await loadThemedShow(show.path)
    expect(d?.seasonGroups.map((g) => [g.season?.number ?? null, g.episodes.map((e) => e.title)])).toEqual([
      [2, [`S2 ep 1 ${run}`]],
      [1, [`Trailer ${run}`, `S1 ep 0 ${run}`, `S1 ep 1 ${run}`]],
      [null, [`Loose ${run}`]],
    ])
    expect(d?.current?.season.title).toBe('High Water')
  })

  it("refuses another show's season", async () => {
    expect(await refused(ep('Wrong show', 7, { season: otherSeason.id, episodeNumber: 9 }))).toMatch(/belongs to another show/)
  })

  it('refuses a second episode with the same number in a season, but not a bonus episode', async () => {
    expect(await refused(ep('Duplicate', 8, { season: s1.id, episodeNumber: 1 }))).toMatch(/Episode 1 of this season is already/)
    expect(await refused(ep('Bonus', 9, { season: s1.id, episodeNumber: 1, episodeType: 'bonus' }))).toBeNull()
    // Saving an episode again with its own number is fine.
    expect(await refused(payload.update({ collection: 'posts', id: e2.id, data: { title: `S2 ep 1 ${run}` } as never, overrideAccess: true, context: ctx }))).toBeNull()
  })

  it('refuses a second season with the same number on a show', async () => {
    expect(await refused(make('seasons', { production: show.id, number: 2, _status: 'published' }))).toMatch(/already has a season 2/)
    expect(await refused(make('seasons', { production: other.id, number: 2, _status: 'published' }))).toBeNull()
  })
})
