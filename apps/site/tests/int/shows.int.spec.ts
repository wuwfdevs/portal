import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureTestSection } from '../helpers/section'

import { loadDirectory, loadShowByPath } from '@/lib/shows/load'

// A show is an original production at an address; an episode is a published audio story that belongs to it.

const run = Date.now().toString(36)
let payload: Payload
const created: { collection: string; id: string | number }[] = []
const ctx = { disableRevalidate: true }
const editor = { id: 1, collection: 'users', email: 'e@wuwf.org', roles: ['editor'] }
const body = { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text: 'Notes.', format: 0, mode: 'normal', style: '', detail: 0 }] }] } }

async function make<T extends { id: string | number }>(collection: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<T> {
  const doc = (await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: ctx, ...extra })) as unknown as T
  created.push({ collection, id: doc.id })
  return doc
}

/** Payload's ValidationError says "The following field is invalid: path"; the reason is in its errors list. */
async function rejectsWith(promise: Promise<unknown>, reason: RegExp): Promise<void> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e as { message: string; data?: { errors?: { message: string }[] } },
  )
  expect(err, 'expected the call to be refused').not.toBeNull()
  expect([err!.message, ...(err!.data?.errors ?? []).map((e) => e.message)].join(' | ')).toMatch(reason)
}

describe('shows and episodes', () => {
  let show: { id: string | number; slug: string; path: string }
  let unlisted: { id: string | number; path: string }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const sponsor = await make('sponsors', { name: `Show Sponsor ${run}` })
    const agreement = await make('underwriting-agreements', { label: `Show ${run}`, sponsor: sponsor.id, kind: 'recognition', text: `Made possible in part by Show Sponsor ${run}.`, startsOn: '2026-01-01', endsOn: null, active: true })
    const host = await make('contributors', { name: `Show Host ${run}` })
    show = await make('productions', { title: `High Ground ${run}`, tagline: 'A Coastal Futures podcast', summary: 'What it costs to stay.', schedule: 'Every other Friday', hosts: [host.id], agreements: [agreement.id] })
    unlisted = await make('productions', { title: `Hidden ${run}`, listed: false })
    const section = await ensureTestSection(payload)
    const ep = (title: string, day: number, extra: Record<string, unknown> = {}) =>
      make('posts', { title: `${title} ${run}`, content: body, _status: 'published', section, production: show.id, format: 'audio', publishedAt: `2090-01-${String(day).padStart(2, '0')}T12:00:00.000Z`, ...extra })
    await ep('Ep 1', 1)
    await ep('Ep 2', 2)
    await ep('Ep 3', 3)
    await ep('Draft episode', 4, { _status: 'draft' })
    await ep('A companion story', 5, { format: 'web' }) // attached to the show but not an episode
    const other = await make<{ id: string | number }>('productions', { title: `Other ${run}` })
    await make('posts', { title: `Elsewhere ${run}`, content: body, _status: 'published', section, production: other.id, format: 'audio', publishedAt: '2090-01-06T12:00:00.000Z' })
  }, 90_000)

  afterAll(async () => {
    for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('gets /shows/<slug> as its address when it is created, and keeps it', async () => {
    const fresh = (await payload.findByID({ collection: 'productions', id: show.id, overrideAccess: true })) as { path: string; slug: string }
    expect(fresh.path).toBe(`/shows/${fresh.slug}`)
  })

  it('loads the show with its hosts, the line under its name, and only its published episodes, newest first', async () => {
    const path = ((await payload.findByID({ collection: 'productions', id: show.id, overrideAccess: true })) as { path: string }).path
    const d = await loadShowByPath(path)
    expect(d?.show.title).toBe(`High Ground ${run}`)
    expect(d?.hosts.map((h) => h.name)).toEqual([`Show Host ${run}`])
    expect(d?.episodes.map((e) => e.title)).toEqual([`Ep 3 ${run}`, `Ep 2 ${run}`, `Ep 1 ${run}`])
    expect(d?.totalEpisodes).toBe(3)
    expect(d?.line).toBe(`Hosted by Show Host ${run} · Every other Friday · 3 episodes`)
  })

  it('carries the funder line from the agreement, read on the server', async () => {
    const path = ((await payload.findByID({ collection: 'productions', id: show.id, overrideAccess: true })) as { path: string }).path
    expect((await loadShowByPath(path))?.acknowledgments.map((l) => l.text)).toEqual([`Made possible in part by Show Sponsor ${run}.`])
  })

  it('is nothing for an address no show has', async () => {
    expect(await loadShowByPath(`/shows/nope-${run}`)).toBeNull()
  })

  it('lets a migrated show keep Grove\'s exact address, and refuses an address a story, page or show already uses', async () => {
    const s = await make<{ id: string | number; path: string }>('productions', { title: `Classical ${run}`, path: `/show/classical-${run}`, legacy: { legacyPath: `/show/classical-${run}`, groveId: `00000177-${run}` } })
    expect(s.path).toBe(`/show/classical-${run}`)
    await rejectsWith(make('productions', { title: `Clash ${run}`, path: `/show/classical-${run}` }), /already used/)
    const page = await make<{ id: string | number; path: string }>('pages', { title: `Page ${run}`, path: `/page-${run}`, _status: 'published', body })
    await rejectsWith(make('productions', { title: `Clash 2 ${run}`, path: page.path }), /already used/)
  })

  it('lets only a publisher change a show\'s address', async () => {
    await expect(payload.update({ collection: 'productions', id: show.id, data: { path: `/shows/moved-${run}` } as never, user: editor as never, overrideAccess: false, context: ctx })).rejects.toThrow(/publisher|not allowed/i)
  })

  it('lists in the directory only shows that are listed and have an address, with their episode counts', async () => {
    const d = await loadDirectory()
    const mine = d.shows.find((r) => r.show.id === show.id)
    expect(mine?.episodes).toBe(3)
    expect(d.shows.some((r) => r.show.id === unlisted.id)).toBe(false)
    expect(d.latestEpisodes.every((e) => e.showTitle !== null)).toBe(true)
  })
})
