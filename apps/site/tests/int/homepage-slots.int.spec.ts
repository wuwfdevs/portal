// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureTestSection } from '../helpers/section'

import { loadHomepageSlots } from '@/lib/homepage/load-slots'

// The home page's feature slots (short videos, podcasts, RadioLive, Unearthing Florida), read the way a visitor's request reads them:
// through access control, from what an editor chose in the Home page global, filled from the newest published work. The test database is
// shared, so everything here is dated later than anything else in it and found by this run's own titles.

const run = Date.now().toString(36)
let payload: Payload
const created: { collection: string; id: string | number }[] = []
const ctx = { disableRevalidate: true }
const VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nEight feet.\n'
const body = { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text: 'Notes.', format: 0, mode: 'normal', style: '', detail: 0 }] }] } }
const mp4 = async () => {
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const data = readFileSync(resolve(__dirname, '../fixtures/one-second.mp4'))
  return { data, mimetype: 'video/mp4', name: `home-clip-${run}.mp4`, size: data.length }
}
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString()

async function make<T extends { id: string | number }>(collection: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<T> {
  const doc = (await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: ctx, ...extra })) as unknown as T
  created.push({ collection, id: doc.id })
  return doc
}
const setHome = (data: Record<string, unknown>) => payload.updateGlobal({ slug: 'homepage', data: data as never, overrideAccess: true, context: ctx })
const RESET = { videoRow: { enabled: true, series: null, count: 6 }, podcasts: { enabled: true, featuredShow: null }, radioLive: { enabled: true }, unearthing: { enabled: true, episode: null } }

describe('the home page feature slots', () => {
  const ids: Record<string, string | number> = {}

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const section = await ensureTestSection(payload)
    const file = await make<{ id: string | number }>('video', { title: `Home clip file ${run}`, durationSeconds: 58 }, { file: await mp4() })
    const storm = await make<{ id: string | number }>('series', { title: `Storm ${run}` })
    const clip = async (key: string, minute: number, extra: Record<string, unknown> = {}) => {
      ids[key] = (await make<{ id: string | number }>('clips', { title: `${key} ${run}`, video: file.id, captionsVtt: VTT, _status: 'published', publishedAt: `2099-02-01T12:${String(minute).padStart(2, '0')}:00.000Z`, ...extra })).id
    }
    await clip('Clip1', 1, { series: storm.id })
    await clip('Clip2', 2)
    await clip('Clip3', 3)
    await clip('Clip4', 4)
    await clip('DraftClip', 5, { _status: 'draft' })
    ids.storm = storm.id

    // Podcasts: two listed shows with episodes, one without, one unlisted.
    const sponsor = await make<{ id: string | number }>('sponsors', { name: `Home Pod Sponsor ${run}` })
    const agreement = await make<{ id: string | number }>('underwriting-agreements', { label: `Home pod ${run}`, sponsor: sponsor.id, kind: 'recognition', text: `Made possible by Home Pod Sponsor ${run}.`, startsOn: '2026-01-01', endsOn: null, active: true })
    const show = async (key: string, extra: Record<string, unknown> = {}) => (ids[key] = (await make<{ id: string | number }>('productions', { title: `${key} ${run}`, ...extra })).id)
    await show('Older show', { agreements: [agreement.id] })
    await show('Newer show')
    await show('Empty show')
    await show('Hidden show', { listed: false })
    const ep = (title: string, production: string | number, at: string, extra: Record<string, unknown> = {}) =>
      make<{ id: string | number }>('posts', { title: `${title} ${run}`, content: body, _status: 'published', section, production, format: 'audio', publishedAt: at, ...extra })
    await ep('Older ep', ids['Older show']!, '2099-02-02T12:00:00.000Z')
    await ep('Newer ep', ids['Newer show']!, '2099-02-03T12:00:00.000Z')
    await ep('Hidden ep', ids['Hidden show']!, '2099-02-04T12:00:00.000Z')
    await ep('Draft ep', ids['Older show']!, '2099-02-05T12:00:00.000Z', { _status: 'draft' })

    // Unearthing Florida: a production on the hub, two episodes, and a story from elsewhere.
    const unearthing = await show('Unearthing')
    ids.ue1 = (await ep('UE first', unearthing, '2099-02-06T12:00:00.000Z')).id
    ids.ue2 = (await ep('UE newest', unearthing, '2099-02-07T12:00:00.000Z')).id
    ids.elsewhere = (await ep('Elsewhere', ids['Newer show']!, '2099-02-01T12:00:00.000Z')).id
    await payload.updateGlobal({ slug: 'unearthing-hub', overrideAccess: true, context: ctx, data: { production: unearthing, featured: null } as never })

    // RadioLive: a past show with a recording and a coming one.
    const artist = await make<{ id: string | number }>('artists', { name: `Home Artist ${run}` })
    await make('performances', { title: `Home past ${run}`, startsAt: day(-1000), lineup: [artist.id], recordingUrl: 'https://youtu.be/hVgWH8kF_RQ', _status: 'published' })
    await make('performances', { title: `Home next ${run}`, startsAt: day(1), lineup: [artist.id], ticketsStatus: 'onSale', ticketsUrl: 'https://tix.example.com/home', _status: 'published' })
    await setHome(RESET)
  }, 120_000)

  afterAll(async () => {
    await setHome(RESET).catch(() => undefined)
    await payload.updateGlobal({ slug: 'unearthing-hub', overrideAccess: true, context: ctx, data: { production: null, featured: null } as never }).catch(() => undefined)
    for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('fills every slot from the newest published work when nothing is chosen, and never shows a draft', async () => {
    const s = await loadHomepageSlots()
    expect(s.video?.clips.slice(0, 4).map((c) => c.title)).toEqual([`Clip4 ${run}`, `Clip3 ${run}`, `Clip2 ${run}`, `Clip1 ${run}`])
    expect(s.video?.clips.map((c) => c.title)).not.toContain(`DraftClip ${run}`)
    // The Unearthing episodes are the newest audio of a listed show, so that show leads the podcasts; the hidden one never appears.
    expect(s.podcasts?.featured.show.title).toBe(`Unearthing ${run}`)
    expect([s.podcasts?.featured, ...(s.podcasts?.others ?? [])].map((r) => r?.show.title)).not.toContain(`Hidden show ${run}`)
    expect(s.unearthing?.episode.title).toBe(`UE newest ${run}`)
    expect(s.radioLive?.next?.title).toBe(`Home next ${run}`)
    expect(s.radioLive?.next?.tickets.href).toBe('https://tix.example.com/home')
    expect(s.radioLive?.latest).not.toBeNull()
  })

  it("puts the chosen series first and keeps the row's size within bounds", async () => {
    await setHome({ videoRow: { enabled: true, series: ids.storm, count: 3 } })
    const s = await loadHomepageSlots()
    expect(s.video?.clips.map((c) => c.title)).toEqual([`Clip1 ${run}`, `Clip4 ${run}`, `Clip3 ${run}`])
  })

  it("features the editor's show with its newest published episode and its funder line", async () => {
    await setHome({ podcasts: { enabled: true, featuredShow: ids['Older show'] } })
    const s = await loadHomepageSlots()
    expect(s.podcasts?.featured.show.title).toBe(`Older show ${run}`)
    expect(s.podcasts?.featured.latest.title).toBe(`Older ep ${run}`)
    expect(s.podcasts?.acknowledgments.map((l) => l.text)).toEqual([`Made possible by Home Pod Sponsor ${run}.`])
    expect(s.podcasts?.others.map((r) => r.show.title)).not.toContain(`Older show ${run}`)
  })

  it("uses the editor's Unearthing episode, and ignores one from another series", async () => {
    await setHome({ unearthing: { enabled: true, episode: ids.ue1 } })
    expect((await loadHomepageSlots()).unearthing?.episode.title).toBe(`UE first ${run}`)
    await setHome({ unearthing: { enabled: true, episode: ids.elsewhere } })
    expect((await loadHomepageSlots()).unearthing?.episode.title).toBe(`UE newest ${run}`)
  })

  it('leaves out a slot an editor switched off', async () => {
    await setHome({ videoRow: { enabled: false }, podcasts: { enabled: false }, radioLive: { enabled: false }, unearthing: { enabled: false } })
    expect(await loadHomepageSlots()).toEqual({ video: null, podcasts: null, radioLive: null, unearthing: null })
  })

  it('leaves out Unearthing Florida while its hub has no production', async () => {
    await setHome(RESET)
    await payload.updateGlobal({ slug: 'unearthing-hub', overrideAccess: true, context: ctx, data: { production: null } as never })
    expect((await loadHomepageSlots()).unearthing).toBeNull()
  })
})
