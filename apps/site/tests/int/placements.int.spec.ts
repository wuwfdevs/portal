// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadHomePlacements } from '@/lib/placements/load'

// The sponsor and promo placements: who may edit them, what they refuse, and what a visitor's request reads back (through access control,
// only what is running today, each tile labeled and keyed).

const run = Date.now().toString(36)
let payload: Payload
const made: { collection: 'media'; id: number | string }[] = []
const ctx = { disableRevalidate: true }
const staff = (roles: string[]) => ({ overrideAccess: false as const, user: { id: 1, collection: 'users', email: 'x@wuwf.org', roles } as never, context: ctx })
const update = (data: Record<string, unknown>, who?: ReturnType<typeof staff>) =>
  payload.updateGlobal({ slug: 'placements', data: data as never, ...(who ?? { overrideAccess: true as const, context: ctx }) })

async function picture(name: string) {
  const data = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#336699' } }).png().toBuffer()
  const doc = await payload.create({ collection: 'media', overrideAccess: true, context: ctx, file: { data, mimetype: 'image/png', name: `${name}-${run}.png`, size: data.length }, data: { alt: name } as never })
  made.push({ collection: 'media', id: doc.id })
  return doc
}

describe('sponsor and promo placements', () => {
  let img: { id: number | string }
  let phone: { id: number | string }
  const tile = (over: Record<string, unknown> = {}) => ({ kind: 'sponsor', sponsor: 'Acme', image: img.id, alt: 'Acme: tickets', href: 'https://acme.example/', enabled: true, ...over })

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    img = await picture('tile')
    phone = await picture('phone')
  }, 60_000)

  afterAll(async () => {
    await update({ homeRail: [], homeBand: [] })
    for (const { collection, id } of [...made].reverse()) await payload.delete({ collection, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('lets corporate support, publishers and administrators edit, and no one else', async () => {
    const data = { homeRail: [] }
    await expect(update(data, staff(['sponsorship']))).resolves.toBeDefined()
    await expect(update(data, staff(['publisher']))).resolves.toBeDefined()
    await expect(update(data, staff(['administrator']))).resolves.toBeDefined()
    await expect(update(data, staff(['editor']))).rejects.toThrow()
    await expect(update(data, staff(['membership']))).rejects.toThrow()
    await expect(payload.updateGlobal({ slug: 'placements', data: data as never, overrideAccess: false })).rejects.toThrow()
  })

  it('refuses a sponsor tile with no sponsor named, but not a house promotion', async () => {
    await expect(update({ homeRail: [tile({ sponsor: '' })] })).rejects.toThrow()
    await expect(update({ homeRail: [tile({ kind: 'house', sponsor: '', href: '/weather' })] })).resolves.toBeDefined()
  })

  it.each(['javascript:alert(1)', 'http://insecure.example.org', '//evil.example.org', 'click here', ''])('refuses the address %j', async (href) => {
    await expect(update({ homeRail: [tile({ href })] })).rejects.toThrow()
  })

  it('needs a picture and the words in it, so a tile is never a silent link', async () => {
    await expect(update({ homeRail: [tile({ image: null })] })).rejects.toThrow()
    await expect(update({ homeRail: [tile({ alt: '' })] })).rejects.toThrow()
  })

  it('holds ten tiles in the rail and one banner', async () => {
    await expect(update({ homeRail: Array.from({ length: 10 }, () => tile()) })).resolves.toBeDefined()
    await expect(update({ homeRail: Array.from({ length: 11 }, () => tile()) })).rejects.toThrow()
    await expect(update({ homeBand: [tile(), tile()] })).rejects.toThrow()
  })

  it('reads back, to a visitor, the tiles that run, in order, keyed by place, labeled and linked as they should be', async () => {
    await update({
      homeRail: [
        tile({ sponsor: 'First' }),
        tile({ sponsor: 'Switched off', enabled: false }),
        tile({ kind: 'house', sponsor: null, alt: 'Get the apps', href: '/get-our-apps' }),
        tile({ sponsor: 'Over', runUntil: '2020-01-01T12:00:00.000Z' }),
        tile({ sponsor: 'Not yet', runFrom: '2099-01-01T12:00:00.000Z' }),
        tile({ sponsor: 'Last', href: 'https://last.example/page' }),
      ],
    })
    const { rail } = await loadHomePlacements(new Date('2026-11-18T18:00:00Z'))
    expect(rail.map((t) => [t.key, t.kind, t.label, t.href])).toEqual([
      ['home.rail.1', 'sponsor', 'Sponsor message', 'https://acme.example/'],
      ['home.rail.2', 'house', null, '/get-our-apps'],
      ['home.rail.3', 'sponsor', 'Sponsor message', 'https://last.example/page'],
    ])
    expect(rail.map((t) => t.rel)).toEqual(['sponsored noopener noreferrer', undefined, 'sponsored noopener noreferrer'])
    expect(rail[0]!.name).toBe('Acme: tickets')
    expect(rail[0]!.image.url).toBeTruthy()
  })

  it('reads a banner with its phone picture, and none when no banner is set', async () => {
    await update({ homeRail: [], homeBand: [tile({ phoneImage: phone.id })] })
    const withBand = await loadHomePlacements()
    expect(withBand.band).toMatchObject({ key: 'home.band.1', label: 'Sponsor message' })
    expect(withBand.band?.phoneImage?.url).toBeTruthy()
    await update({ homeBand: [] })
    expect((await loadHomePlacements()).band).toBeNull()
  })

  it('draws nothing, and does not fail, when there is nothing set', async () => {
    await update({ homeRail: [], homeBand: [] })
    expect(await loadHomePlacements()).toEqual({ rail: [], band: null })
  })
})
