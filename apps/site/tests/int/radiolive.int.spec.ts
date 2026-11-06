// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Run outside Next, where `unstable_cache` has no cache to use: run it uncached.
vi.mock('next/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/cache')>()),
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))

import { GET as captions } from '@/app/(frontend)/radiolive/[slug]/captions.vtt/route'
import { GET as sitemapChild } from '@/app/(frontend)/(sitemaps)/sitemaps/[name]/route'
import { loadArtist, loadRadioLive, loadShow } from '@/lib/radiolive/load'

// RadioLive: shows (upcoming and past), artists derived from lineups, recordings that need captions, and the funder line.

const run = Date.now().toString(36)
let payload: Payload
const created: { collection: string; id: string | number }[] = []
const ctx = { disableRevalidate: true }
const VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello.\n'
const mp4 = async () => {
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const data = readFileSync(resolve(__dirname, '../fixtures/one-second.mp4'))
  return { data, mimetype: 'video/mp4', name: `rl-${run}.mp4`, size: data.length }
}
async function make<T extends { id: string | number }>(collection: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<T> {
  const doc = (await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: ctx, ...extra })) as unknown as T
  created.push({ collection, id: doc.id })
  return doc
}
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString()

describe('RadioLive', () => {
  let artistA: { id: string | number; slug: string }
  let artistB: { id: string | number; slug: string }
  let pastShow: { id: string | number; slug: string }
  let futureShow: { id: string | number; slug: string }
  let original: unknown

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    original = await payload.findGlobal({ slug: 'radiolive-hub', depth: 0, overrideAccess: true })
    const sponsor = await make('sponsors', { name: `RL Sponsor ${run}` })
    const agreement = await make('underwriting-agreements', { label: `RL ${run}`, sponsor: sponsor.id, kind: 'recognition', text: `RadioLive is made possible by RL Sponsor ${run}.`, startsOn: '2026-01-01', endsOn: null, active: true })
    const production = await make<{ id: string | number }>('productions', { title: `RadioLive ${run}`, agreements: [agreement.id] })
    await payload.updateGlobal({ slug: 'radiolive-hub', overrideAccess: true, context: ctx, data: { production: production.id } as never })
    artistA = await make('artists', { name: `Angel ${run}`, bio: 'Singer-songwriter.', link: 'https://angel.example.com' })
    artistB = await make('artists', { name: `Joe ${run}` })
    const file = await make<{ id: string | number }>('video', { title: `Set ${run}` }, { file: await mp4() })
    pastShow = await make('performances', { title: `Past night ${run}`, startsAt: day(-30), lineup: [artistA.id, artistB.id], video: file.id, captionsVtt: VTT, _status: 'published' })
    futureShow = await make('performances', { title: `Coming night ${run}`, startsAt: day(20), lineup: [artistA.id], ticketsStatus: 'onSale', ticketsUrl: 'https://tix.example.com/x', _status: 'published' })
    await make('performances', { title: `Draft night ${run}`, startsAt: day(40), _status: 'draft' })
  }, 90_000)

  afterAll(async () => {
    await payload.updateGlobal({ slug: 'radiolive-hub', overrideAccess: true, context: ctx, data: { production: null } as never }).catch(() => undefined)
    for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
    void original
  })

  it('puts a coming show in "upcoming" with a ticket button, and a past one with a recording in "watch"', async () => {
    const data = await loadRadioLive()
    const coming = data.upcoming.find((s) => s.slug === futureShow.slug)
    expect(coming?.tickets).toEqual({ label: 'Get tickets', href: 'https://tix.example.com/x' })
    expect(data.upcoming.some((s) => s.title.startsWith('Draft night'))).toBe(false)
    expect(data.watch.some((s) => s.slug === pastShow.slug)).toBe(true)
    expect(data.upcoming.some((s) => s.slug === pastShow.slug)).toBe(false)
  })

  it('lists only artists of a show that is over, with their appearance counts, and carries the production\'s funder line', async () => {
    const data = await loadRadioLive()
    expect(data.artists.map((a) => a.slug)).toEqual(expect.arrayContaining([artistA.slug, artistB.slug]))
    expect(data.acknowledgments.map((l) => l.text)).toContain(`RadioLive is made possible by RL Sponsor ${run}.`)
  })

  it('loads a show with its lineup and recording, and an artist with their shows', async () => {
    const s = await loadShow(pastShow.slug)
    expect(s?.show.lineup.map((a) => a.slug)).toEqual([artistA.slug, artistB.slug])
    expect(s?.show.recording?.captionsHref).toBe(`/radiolive/${pastShow.slug}/captions.vtt`)
    const a = await loadArtist(artistA.slug)
    expect(a?.shows.map((x) => x.slug).sort()).toEqual([pastShow.slug, futureShow.slug].sort())
    expect(a?.artist.link).toBe('https://angel.example.com')
    expect(await loadShow('nope-' + run)).toBeNull()
    expect(await loadArtist('nope-' + run)).toBeNull()
  })

  it('cannot publish a recording without captions, or a show at the word "artists"', async () => {
    const file = (await payload.find({ collection: 'video', where: { title: { equals: `Set ${run}` } }, overrideAccess: true, limit: 1 })).docs[0]!
    await expect(payload.create({ collection: 'performances', overrideAccess: true, context: ctx, data: { title: `No captions ${run}`, startsAt: day(-5), video: file.id, _status: 'published' } as never })).rejects.toThrow()
    await expect(payload.create({ collection: 'performances', overrideAccess: true, context: ctx, data: { title: 'x', slug: 'artists', startsAt: day(5), _status: 'published' } as never })).rejects.toThrow()
  })

  it('serves captions for a published recording and 404s a show with none', async () => {
    const ok = await captions(new Request('http://localhost/x'), { params: Promise.resolve({ slug: pastShow.slug }) })
    expect(ok.status).toBe(200)
    expect(await ok.text()).toContain('WEBVTT')
    expect((await captions(new Request('http://localhost/x'), { params: Promise.resolve({ slug: futureShow.slug }) })).status).toBe(404)
  })

  it('lists the page, the shows and the artists in the RadioLive sitemap, never a draft', async () => {
    const xml = await (await sitemapChild(new Request('http://localhost/x'), { params: Promise.resolve({ name: 'radiolive.xml' }) })).text()
    expect(xml).toContain('/radiolive</loc>')
    expect(xml).toContain(`/radiolive/${pastShow.slug}</loc>`)
    expect(xml).toContain(`/radiolive/artists/${artistA.slug}</loc>`)
    expect(xml).not.toContain('draft-night')
  })
})
