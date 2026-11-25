// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { readPlacementRecords } from '@/lib/placements/load'
import { resolveZone } from '@/lib/placements/resolve'

// Placements are records editors make: who may make which, what is refused, what a zone holds, what the public can read, and what runs on
// which page. Read the way a visitor's request reads them (through access control).

const run = Date.now().toString(36)
let payload: Payload
const made: { collection: 'placement-items' | 'media' | 'sponsors' | 'sections' | 'categories' | 'contributors'; id: number | string }[] = []
const ctx = { disableRevalidate: true }
const staff = (roles: string[]) => ({ overrideAccess: false as const, user: { id: 1, collection: 'users', email: 'x@wuwf.org', roles } as never, context: ctx })
const NOW = new Date('2026-11-18T18:00:00Z')

async function keep<T extends { id: string | number }>(collection: (typeof made)[number]['collection'], data: Record<string, unknown>, file?: unknown): Promise<T> {
  const doc = (await payload.create({ collection, data: data as never, overrideAccess: true, context: ctx, ...(file ? { file: file as never } : {}) })) as unknown as T
  made.push({ collection, id: doc.id })
  return doc
}

describe('placements', () => {
  let img: { id: number | string }
  let phone: { id: number | string }
  let sponsor: { id: number | string }
  let sectionA: { id: number | string }
  let sectionB: { id: number | string }
  let topic: { id: number | string }
  const item = (over: Record<string, unknown> = {}) => ({ name: `Test ${run}`, kind: 'house', zone: 'list.rail', scope: 'all', image: img.id, alt: 'Words', href: '/weather', enabled: true, ...over })
  const make = (over: Record<string, unknown> = {}, who?: ReturnType<typeof staff>) =>
    payload.create({ collection: 'placement-items', data: item(over) as never, ...(who ?? { overrideAccess: true as const, context: ctx }) })
  const createdItem = async (over: Record<string, unknown> = {}) => {
    const doc = await make(over)
    made.push({ collection: 'placement-items', id: doc.id })
    return doc
  }
  const clearZone = async (zone: string) => {
    const found = await payload.find({ collection: 'placement-items', where: { zone: { equals: zone } }, limit: 100, depth: 0, pagination: false, overrideAccess: true })
    for (const d of found.docs) await payload.delete({ collection: 'placement-items', id: d.id, overrideAccess: true, context: ctx })
  }
  const asMedia = async (name: string, file: { data: Buffer; mimetype: string }) =>
    keep<{ id: number | string }>('media', { alt: name }, { ...file, name: `${name}-${run}.${file.mimetype.split('/')[1]}`, size: file.data.length })
  const picture = async (name: string) => {
    const data = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#336699' } }).png().toBuffer()
    return keep<{ id: number | string }>('media', { alt: name }, { data, mimetype: 'image/png', name: `${name}-${run}.png`, size: data.length })
  }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    img = await picture('tile')
    phone = await picture('phone')
    sponsor = await keep('sponsors', { name: `Acme ${run}` })
    sectionA = await keep('sections', { title: `Place A ${run}`, slug: `place-a-${run}` })
    sectionB = await keep('sections', { title: `Place B ${run}`, slug: `place-b-${run}` })
    topic = await keep('categories', { title: `Place topic ${run}`, slug: `place-topic-${run}` })
    for (const z of ['home.rail', 'home.top', 'list.top', 'list.rail']) await clearZone(z)
  }, 60_000)

  afterAll(async () => {
    for (const z of ['home.rail', 'home.top', 'list.top', 'list.rail']) await clearZone(z)
    for (const { collection, id } of [...made].reverse()) await payload.delete({ collection, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  describe('who may make and change them', () => {
    it('lets corporate support and administrators make sponsor placements and house promotions', async () => {
      for (const role of ['sponsorship', 'administrator']) {
        for (const kind of ['sponsor', 'house']) {
          const doc = await make({ kind, ...(kind === 'sponsor' ? { sponsor: sponsor.id } : {}) }, staff([role]))
          await payload.delete({ collection: 'placement-items', id: doc.id, overrideAccess: true, context: ctx })
        }
      }
    })
    it('lets a publisher make a house promotion but not a sponsor placement', async () => {
      const doc = await make({ kind: 'house' }, staff(['publisher']))
      await payload.delete({ collection: 'placement-items', id: doc.id, overrideAccess: true, context: ctx })
      await expect(make({ kind: 'sponsor', sponsor: sponsor.id }, staff(['publisher']))).rejects.toThrow(/corporate support/i)
    })
    it('lets a publisher change a house promotion but not a sponsor placement, nor turn one into a sponsor placement', async () => {
      const house = await createdItem({ kind: 'house', name: `House ${run}` })
      const sold = await createdItem({ kind: 'sponsor', sponsor: sponsor.id, name: `Sold ${run}` })
      const as = staff(['publisher'])
      await expect(payload.update({ collection: 'placement-items', id: house.id, data: { alt: 'Changed' } as never, ...as })).resolves.toBeDefined()
      await expect(payload.update({ collection: 'placement-items', id: sold.id, data: { alt: 'Changed' } as never, ...as })).rejects.toThrow()
      await expect(payload.update({ collection: 'placement-items', id: house.id, data: { kind: 'sponsor', sponsor: sponsor.id } as never, ...as })).rejects.toThrow()
      await expect(payload.delete({ collection: 'placement-items', id: sold.id, ...as })).rejects.toThrow()
    })
    it('lets corporate support add a picture to the library, so a placement can be made end to end, but not change or delete one', async () => {
      const data = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#663399' } }).png().toBuffer()
      const as = staff(['sponsorship'])
      const doc = await payload.create({ collection: 'media', data: { alt: 'Sponsor artwork' } as never, file: { data, mimetype: 'image/png', name: `sponsor-art-${run}.png`, size: data.length }, ...as })
      made.push({ collection: 'media', id: doc.id })
      await expect(payload.update({ collection: 'media', id: doc.id, data: { alt: 'Changed' } as never, ...as })).rejects.toThrow()
      await expect(payload.delete({ collection: 'media', id: doc.id, ...as })).rejects.toThrow()
      const placement = await make({ kind: 'house', image: doc.id }, as)
      await payload.delete({ collection: 'placement-items', id: placement.id, overrideAccess: true, context: ctx })
    })
    it('refuses editors, membership staff and signed-out visitors', async () => {
      for (const roles of [['editor'], ['membership']]) await expect(make({}, staff(roles))).rejects.toThrow()
      await expect(payload.create({ collection: 'placement-items', data: item() as never, overrideAccess: false })).rejects.toThrow()
    })
  })

  describe('what the artwork may be', () => {
    it('refuses a video or an animated picture, in the picture field and the phone-picture field, and takes a still one', async () => {
      const mp4 = await asMedia('clip', { data: fs.readFileSync(path.resolve(__dirname, '../fixtures/one-second.mp4')), mimetype: 'video/mp4' })
      const gif = await asMedia('moving', { data: await sharp({ create: { width: 8, height: 6, channels: 3, background: '#336699' } }).gif().toBuffer(), mimetype: 'image/gif' })
      await expect(make({ image: mp4.id })).rejects.toThrow()
      await expect(make({ image: gif.id })).rejects.toThrow()
      await expect(make({ zone: 'home.top', image: img.id, phoneImage: mp4.id })).rejects.toThrow()
      await expect(createdItem({ image: img.id })).resolves.toBeDefined()
    })
  })

  describe('what is refused', () => {
    it('needs a sponsor named for a sponsor placement, but not for a house promotion', async () => {
      await expect(make({ kind: 'sponsor' })).rejects.toThrow()
      await expect(createdItem({ kind: 'house' })).resolves.toBeDefined()
    })
    it.each(['javascript:alert(1)', 'http://insecure.example.org', '//evil.example.org', 'click here', ''])('refuses the address %j', async (href) => {
      await expect(make({ href })).rejects.toThrow()
    })
    it('needs a picture and the words in it, and keeps those words brief', async () => {
      await expect(make({ image: null })).rejects.toThrow()
      await expect(make({ alt: '' })).rejects.toThrow()
      await expect(make({ alt: 'x'.repeat(161) })).rejects.toThrow()
    })
    it('refuses a zone that does not exist', async () => {
      await expect(make({ zone: 'nonsense' })).rejects.toThrow()
    })
    it('needs a page chosen when a list-page placement is aimed, and never shows everywhere by accident', async () => {
      await expect(make({ scope: 'chosen' })).rejects.toThrow()
      await expect(createdItem({ scope: 'chosen', sections: [sectionA.id] })).resolves.toBeDefined()
      await expect(createdItem({ scope: 'chosen', includeLatest: true })).resolves.toBeDefined()
    })
  })

  describe('a place that belongs to one sponsor at a time (a top unit)', () => {
    const week = (from: string, until: string, extra: Record<string, unknown> = {}) => ({ zone: 'home.top', kind: 'sponsor', sponsor: sponsor.id, runFrom: `${from}T12:00:00.000Z`, runUntil: `${until}T12:00:00.000Z`, ...extra })
    it('lets next week\'s sponsor be booked while this week\'s runs, and refuses one whose dates overlap, naming what holds it', async () => {
      await clearZone('home.top')
      await createdItem(week('2090-01-01', '2090-01-07', { name: `Week one ${run}` }))
      await expect(createdItem(week('2090-01-08', '2090-01-14', { name: `Week two ${run}` }))).resolves.toBeDefined()
      await expect(make(week('2090-01-05', '2090-01-10', { name: `Clash ${run}` }))).rejects.toThrow(/belongs to one sponsor at a time.*Week one/s)
      await clearZone('home.top')
    })
    it('lets a placement be edited without clashing with itself, and refuses moving it onto another\'s dates', async () => {
      await clearZone('home.top')
      const one = await createdItem(week('2090-02-01', '2090-02-07', { name: `One ${run}` }))
      const two = await createdItem(week('2090-02-08', '2090-02-14', { name: `Two ${run}` }))
      await expect(payload.update({ collection: 'placement-items', id: one.id, data: { alt: 'Edited' } as never, overrideAccess: true, context: ctx })).resolves.toBeDefined()
      await expect(payload.update({ collection: 'placement-items', id: two.id, data: { runFrom: '2090-02-05T12:00:00.000Z' } as never, overrideAccess: true, context: ctx })).rejects.toThrow(/one sponsor at a time/)
      await clearZone('home.top')
    })
    it('holds a section\'s presenting sponsor to that section: another section is free, "every page" meets any', async () => {
      await clearZone('list.top')
      await createdItem({ zone: 'list.top', kind: 'sponsor', sponsor: sponsor.id, scope: 'chosen', sections: [sectionA.id], name: `A ${run}` })
      await expect(createdItem({ zone: 'list.top', kind: 'sponsor', sponsor: sponsor.id, scope: 'chosen', sections: [sectionB.id], name: `B ${run}` })).resolves.toBeDefined()
      await expect(make({ zone: 'list.top', kind: 'sponsor', sponsor: sponsor.id, scope: 'chosen', sections: [sectionA.id], name: `A again ${run}` })).rejects.toThrow(/one sponsor at a time/)
      await expect(make({ zone: 'list.top', kind: 'sponsor', sponsor: sponsor.id, scope: 'all', name: `Everywhere ${run}` })).rejects.toThrow(/one sponsor at a time/)
      await clearZone('list.top')
    })
  })

  describe('what a zone holds', () => {
    it('holds nine in the home page rail and refuses a tenth, with what to do about it', async () => {
      await clearZone('home.rail')
      for (let i = 0; i < 9; i++) await createdItem({ zone: 'home.rail', name: `Rail ${i} ${run}` })
      await expect(make({ zone: 'home.rail', name: `Tenth ${run}` })).rejects.toThrow(/holds 9.*already running/s)
      await clearZone('home.rail')
    })
    it('keeps WUWF promotions that fill gaps apart from the rail\'s nine: they take no place from a sponsor and are not counted', async () => {
      await clearZone('home.rail')
      for (let i = 0; i < 9; i++) await createdItem({ zone: 'home.rail', name: `Rail ${i} ${run}`, order: i })
      // The rail is full, yet a promotion marked as able to fill a gap is still accepted, because it is held apart from the nine.
      const filler = await createdItem({ zone: 'home.rail', name: `Filler ${run}`, fillsGaps: true })
      expect(filler.fillsGaps).toBe(true)
      // Editing it, or one of the nine, is not blocked by it, and a tenth ordinary placement is still refused.
      await payload.update({ collection: 'placement-items', id: filler.id, data: { alt: 'Still words' } as never, overrideAccess: true, context: ctx })
      await expect(make({ zone: 'home.rail', name: `Tenth ${run}` })).rejects.toThrow(/holds 9.*already running/s)
      await clearZone('home.rail')
    })
    it('keeps "can fill a gap" for a WUWF promotion in the home page rail only: on anything else it is cleared, so a leftover tick never counts', async () => {
      const sponsorTile = await createdItem({ zone: 'home.rail', kind: 'sponsor', sponsor: sponsor.id, fillsGaps: true })
      expect(sponsorTile.fillsGaps).toBe(false)
      const otherZone = await createdItem({ zone: 'list.rail', fillsGaps: true })
      expect(otherZone.fillsGaps).toBe(false)
      // A promotion marked as a filler that is then made a sponsor placement loses the mark, so it cannot be held back from a full rail.
      const promo = await createdItem({ zone: 'home.rail', fillsGaps: true })
      expect(promo.fillsGaps).toBe(true)
      const changed = await payload.update({ collection: 'placement-items', id: promo.id, data: { kind: 'sponsor', sponsor: sponsor.id } as never, overrideAccess: true, context: ctx })
      expect(changed.fillsGaps).toBe(false)
      await clearZone('home.rail')
    })
    it('does not count what is switched off or has ended, so a full rail can be rotated', async () => {
      await clearZone('home.rail')
      for (let i = 0; i < 7; i++) await createdItem({ zone: 'home.rail', name: `Run ${i} ${run}` })
      await createdItem({ zone: 'home.rail', name: `Off ${run}`, enabled: false })
      await createdItem({ zone: 'home.rail', name: `Ended ${run}`, runUntil: '2020-01-01T12:00:00.000Z' })
      await expect(createdItem({ zone: 'home.rail', name: `Eight ${run}` })).resolves.toBeDefined()
      await expect(createdItem({ zone: 'home.rail', name: `Nine ${run}` })).resolves.toBeDefined()
      await expect(make({ zone: 'home.rail', name: `Too many ${run}` })).rejects.toThrow()
      await clearZone('home.rail')
    })
    it('lets a full rail\'s own placements be edited, and refuses switching a held one back on over capacity', async () => {
      await clearZone('home.rail')
      const docs = []
      for (let i = 0; i < 9; i++) docs.push(await createdItem({ zone: 'home.rail', name: `Full ${i} ${run}` }))
      await expect(payload.update({ collection: 'placement-items', id: docs[0]!.id, data: { alt: 'Edited' } as never, overrideAccess: true, context: ctx })).resolves.toBeDefined()
      await payload.update({ collection: 'placement-items', id: docs[1]!.id, data: { enabled: false } as never, overrideAccess: true, context: ctx })
      const extra = await createdItem({ zone: 'home.rail', name: `Extra ${run}` })
      await expect(payload.update({ collection: 'placement-items', id: docs[1]!.id, data: { enabled: true } as never, overrideAccess: true, context: ctx })).rejects.toThrow(/holds 9/)
      expect(extra.id).toBeTruthy()
      await clearZone('home.rail')
    })
    it('counts a placement whose last day has passed and is then cleared, because it would run again', async () => {
      await clearZone('home.rail')
      for (let i = 0; i < 9; i++) await createdItem({ zone: 'home.rail', name: `Live ${i} ${run}` })
      const ended = await createdItem({ zone: 'home.rail', name: `Ended then cleared ${run}`, runUntil: '2020-01-01T12:00:00.000Z' })
      await expect(payload.update({ collection: 'placement-items', id: ended.id, data: { runUntil: null } as never, overrideAccess: true, context: ctx })).rejects.toThrow(/holds 9/)
      // Leaving the field out keeps what is stored: it stays ended, so it is not counted.
      await expect(payload.update({ collection: 'placement-items', id: ended.id, data: { alt: 'Edited' } as never, overrideAccess: true, context: ctx })).resolves.toBeDefined()
      await clearZone('home.rail')
    })
    it('holds one top unit, not a rotation', async () => {
      await clearZone('home.top')
      await createdItem({ zone: 'home.top', name: `Top ${run}`, phoneImage: phone.id })
      await expect(make({ zone: 'home.top', name: `Second top ${run}` })).rejects.toThrow()
      await clearZone('home.top')
    })
    it('leaves a list-page zone to the resolver, which counts per page (different placements aim at different pages)', async () => {
      await clearZone('list.rail')
      for (let i = 0; i < 6; i++) await createdItem({ zone: 'list.rail', name: `List ${i} ${run}`, scope: 'all' })
      await clearZone('list.rail')
    })
  })

  describe('what the public reads', () => {
    it('reads only what is switched on, and never needs to read the Sponsors list to show a sponsor\'s name', async () => {
      await clearZone('list.rail')
      await createdItem({ zone: 'list.rail', name: `On ${run}`, kind: 'sponsor', sponsor: sponsor.id, scope: 'all', order: 1 })
      await createdItem({ zone: 'list.rail', name: `Held ${run}`, scope: 'all', enabled: false, order: 2 })
      const asVisitor = await payload.find({ collection: 'placement-items', where: { zone: { equals: 'list.rail' } }, overrideAccess: false, depth: 0, limit: 20 })
      expect(asVisitor.docs.map((d) => d.name)).toEqual([`On ${run}`])
      const asStaff = await payload.find({ collection: 'placement-items', where: { zone: { equals: 'list.rail' } }, ...staff(['publisher']), depth: 0, limit: 20 })
      expect(asStaff.docs).toHaveLength(2)
      await expect(payload.find({ collection: 'sponsors', overrideAccess: false, limit: 1 })).rejects.toThrow()
      const records = await readPlacementRecords()
      expect(records.find((r) => r.zone === 'list.rail')?.sponsor).toBe(`Acme ${run}`)
      await clearZone('list.rail')
    })
  })

  describe('what runs on which page', () => {
    it('runs a list-page placement only on the pages it was aimed at, in its order, keyed by place', async () => {
      await clearZone('list.rail')
      await createdItem({ zone: 'list.rail', name: `Local ${run}`, scope: 'chosen', sections: [sectionA.id], order: 20, alt: 'Local only' })
      await createdItem({ zone: 'list.rail', name: `Everywhere ${run}`, scope: 'all', order: 10, alt: 'Everywhere' })
      await createdItem({ zone: 'list.rail', name: `Topic ${run}`, scope: 'chosen', topics: [topic.id], order: 30, alt: 'Topic only' })
      await createdItem({ zone: 'list.rail', name: `Latest ${run}`, scope: 'chosen', includeLatest: true, order: 40, alt: 'Latest only' })
      const records = await readPlacementRecords()
      const on = (kind: 'section' | 'topic' | 'person' | 'latest', id: number | string | null) => resolveZone('list.rail', { page: 'list', kind, id }, records, NOW).map((t) => [t.key, t.name])
      expect(on('section', sectionA.id)).toEqual([['list.rail.1', 'Everywhere'], ['list.rail.2', 'Local only']])
      expect(on('section', sectionB.id)).toEqual([['list.rail.1', 'Everywhere']])
      expect(on('topic', topic.id)).toEqual([['list.rail.1', 'Everywhere'], ['list.rail.2', 'Topic only']])
      expect(on('latest', null)).toEqual([['list.rail.1', 'Everywhere'], ['list.rail.2', 'Latest only']])
      expect(resolveZone('list.rail', { page: 'home' }, records, NOW)).toEqual([])
      await clearZone('list.rail')
    })
    it('runs the home page rail and top unit on the home page, and nowhere else', async () => {
      await clearZone('home.rail')
      await clearZone('home.top')
      await createdItem({ zone: 'home.rail', name: `Home tile ${run}`, order: 5 })
      await createdItem({ zone: 'home.top', name: `Home top unit ${run}`, phoneImage: phone.id })
      const records = await readPlacementRecords()
      expect(resolveZone('home.rail', { page: 'home' }, records, NOW)).toHaveLength(1)
      expect(resolveZone('home.top', { page: 'home' }, records, NOW)[0]?.phoneImage?.url).toBeTruthy()
      expect(resolveZone('home.rail', { page: 'list', kind: 'section', id: sectionA.id }, records, NOW)).toEqual([])
      await clearZone('home.rail')
      await clearZone('home.top')
    })
  })
})
