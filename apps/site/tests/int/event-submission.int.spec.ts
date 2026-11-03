// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { clientKey, issueFormToken } from '@/lib/events/abuse'
import { loadCalendar, loadEventByPath } from '@/lib/events/load'
import { processSubmission, type SubmitInput } from '@/lib/events/submit'
import { addDays, stationToday } from '@/lib/events/schedule'
import type { RawForm } from '@/lib/events/submission'

// The public side of the community calendar: what happens between a stranger pressing "Send event" and a listener finding it on
// the calendar. Every guard is tried against the real database; nothing a refused submission sent is left behind.

const run = Date.now().toString(36)
const secrets = { token: 'a-token-secret-0123456789abcdef0123456789', client: 'a-client-secret-0123456789abcdef0123456789' }
// Real time: the database stamps real creation times, and the rate limit and key clean-up compare against them. Events are a month away.
const NOW = new Date()
const EVENT_DATE = addDays(stationToday(NOW), 30)

let payload: Payload
const created: { collection: string; id: string | number }[] = []
const ctx = { disableRevalidate: true }
// Documents read back from the Local API in these tests are inspected field by field.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = { id: string | number; [k: string]: any }
let theater: Doc
let publisher: Doc
let addressN = 0
/** A fresh address per test, so the rate limit of one never touches another. */
const nextAddress = () => `203.0.113.${(++addressN % 250) + 1}`

async function make<T extends Doc>(collection: string, data: Record<string, unknown>): Promise<T> {
  const doc = (await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: ctx })) as unknown as T
  created.push({ collection, id: doc.id })
  return doc
}

const form = (extra: RawForm = {}): RawForm => ({
  'event-title': `Fall Plant Sale ${run}`,
  'venue-name': 'Pensacola Garden Center',
  'venue-street-address': '1850 N 9th Avenue',
  'venue-city': 'Pensacola',
  'venue-state': 'FL',
  'event-type': 'one-time-event',
  'once-date': EVENT_DATE,
  'once-start': '09:00',
  'once-end': '14:00',
  'event-category': [`theater-${run}`],
  'event-description': 'Plants of every kind.\n\nBring a wagon.',
  'this-is-a-free-event': 'on',
  'presenting-organization-name': 'Garden Clubs',
  'presenting-organization-designation': 'not-for-profit',
  'your-information-name': `Pat Submitter ${run}`,
  'your-information-email': `pat-${run}@example.org`,
  'your-information-submitting-as': 'venue',
  ...extra,
})

const input = (over: Partial<SubmitInput> = {}): SubmitInput => ({
  raw: form(),
  token: issueFormToken(new Date(NOW.getTime() - 60_000), secrets.token),
  honeypot: '',
  image: null,
  address: nextAddress(),
  now: NOW,
  ...over,
})

const submissions = async (where: Record<string, unknown> = {}) => (await payload.find({ collection: 'event-submissions', depth: 0, limit: 100, overrideAccess: true, pagination: false, where: { and: [{ title: { like: run } }, where] } as never })).docs as Doc[]
const total = async () => (await submissions()).length
const send = async (over: Partial<SubmitInput> = {}) => {
  const before = await total()
  const outcome = await processSubmission(payload, input(over), secrets)
  return { outcome, saved: (await total()) - before }
}
const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: '#336699' } }).png().toBuffer()

describe('public submissions', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    theater = await make('event-categories', { title: `Theater ${run}`, slug: `theater-${run}` })
    await make('event-categories', { title: `Outdoors ${run}`, slug: `outdoors-${run}` })
    publisher = await make('users', { email: `sub-publisher-${run}@wuwf.org`, password: 'a-long-test-password-3', roles: ['publisher'] })
  }, 90_000)

  afterAll(async () => {
    for (const s of await submissions()) await payload.delete({ collection: 'event-submissions', id: s.id, overrideAccess: true, context: ctx }).catch(() => undefined)
    for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('a good submission waits in the queue, pending, with a hashed client key and nothing public', async () => {
    const address = nextAddress()
    const { outcome, saved } = await send({ address })
    expect(outcome).toEqual({ kind: 'ok' })
    expect(saved).toBe(1)
    const [s] = await submissions()
    expect(s).toMatchObject({ status: 'pending', title: `Fall Plant Sale ${run}`, free: true })
    expect(s!.categories).toEqual([theater.id])
    expect(s!.schedule).toMatchObject({ kind: 'once', date: EVENT_DATE, start: '09:00', end: '14:00' })
    expect(s!.submitter).toMatchObject({ email: `pat-${run}@example.org`, role: 'venue' })
    // The stored key is the keyed hash of the address, never the address.
    const count = (key: string) => payload.count({ collection: 'event-submissions', overrideAccess: true, where: { clientKey: { equals: key } } })
    expect((await count(clientKey(address, secrets.client))).totalDocs).toBe(1)
    expect((await count(address)).totalDocs).toBe(0)
    // Not readable by the public, and no event exists yet.
    await expect(payload.find({ collection: 'event-submissions', overrideAccess: false })).rejects.toThrow()
    expect((await payload.count({ collection: 'events', overrideAccess: true, where: { title: { equals: `Fall Plant Sale ${run}` } } })).totalDocs).toBe(0)
  })

  it('a bot that fills the hidden field is thanked and nothing is saved', async () => {
    const { outcome, saved } = await send({ honeypot: 'http://spam.example', raw: form({ 'event-title': `Bot ${run}` }) })
    expect(outcome).toEqual({ kind: 'ok' })
    expect(saved).toBe(0)
  })

  it('a missing, forged, too-quick or stale form token is refused and saves nothing', async () => {
    const t = (ageMs: number, secret = secrets.token) => issueFormToken(new Date(NOW.getTime() - ageMs), secret)
    expect(await send({ token: undefined })).toEqual({ outcome: { kind: 'form-expired' }, saved: 0 })
    expect(await send({ token: t(60_000, 'another-secret-0123456789abcdef012345') })).toEqual({ outcome: { kind: 'form-expired' }, saved: 0 })
    expect(await send({ token: t(1_000) })).toEqual({ outcome: { kind: 'too-fast' }, saved: 0 })
    expect(await send({ token: t(7 * 3_600_000) })).toEqual({ outcome: { kind: 'form-expired' }, saved: 0 })
  })

  it('invalid answers come back with a message per field and save nothing', async () => {
    const { outcome, saved } = await send({ raw: form({ 'event-title': '', 'once-date': '2090-02-30', 'your-information-email': 'nope', 'ticketing-website': 'javascript:alert(1)', 'event-description': '<script>x</script>' }) })
    expect(saved).toBe(0)
    expect(outcome.kind).toBe('invalid')
    if (outcome.kind === 'invalid') expect(Object.keys(outcome.errors).sort()).toEqual(['event-description', 'event-title', 'once-date', 'ticketing-website', 'your-information-email'])
  })

  it('a category that does not exist is refused', async () => {
    const { outcome } = await send({ raw: form({ 'event-category': ['not-a-category'] }) })
    expect(outcome).toMatchObject({ kind: 'invalid', errors: { 'event-category': expect.stringMatching(/not on the list/) } })
  })

  it('one address may send three in an hour; the fourth is told to wait, and others are unaffected', async () => {
    const address = nextAddress()
    for (let i = 0; i < 3; i += 1) expect((await send({ address, raw: form({ 'event-title': `Rate ${i} ${run}` }) })).outcome).toEqual({ kind: 'ok' })
    expect(await send({ address, raw: form({ 'event-title': `Rate 4 ${run}` }) })).toEqual({ outcome: { kind: 'limited', retryAfter: 'hour' }, saved: 0 })
    expect((await send({ address: nextAddress(), raw: form({ 'event-title': `Other ${run}` }) })).outcome).toEqual({ kind: 'ok' })
  })

  it('client keys older than two days are cleared as new ones arrive, so no address history builds up', async () => {
    const old = await make<Doc>('event-submissions', {
      title: `Old ${run}`,
      categories: [theater.id],
      schedule: { kind: 'once', date: EVENT_DATE, start: '10:00' },
      venue: { name: 'v' },
      submitter: { email: 'old@example.org' },
      clientKey: `old-key-${run}`,
      createdAt: new Date(NOW.getTime() - 3 * 24 * 3_600_000).toISOString(),
    })
    expect((await send()).outcome).toEqual({ kind: 'ok' })
    const after = await payload.count({ collection: 'event-submissions', overrideAccess: true, where: { and: [{ id: { equals: old.id } }, { clientKey: { exists: true } }] } })
    expect(after.totalDocs).toBe(0)
  })

  describe('pictures', () => {
    it('a good picture is stored privately and attached; its name is made here, not the submitter\'s', async () => {
      const bytes = await png(400, 400)
      const { outcome } = await send({ image: { name: '../../etc/passwd.png', bytes: new Uint8Array(bytes) }, raw: form({ 'event-title': `Picture ${run}` }) })
      expect(outcome).toEqual({ kind: 'ok' })
      const [s] = await submissions({ title: { equals: `Picture ${run}` } })
      expect(s!.image).toBeTruthy()
      const img = (await payload.findByID({ collection: 'event-submission-images', id: s!.image, overrideAccess: true })) as Doc
      created.push({ collection: 'event-submission-images', id: img.id })
      expect(img.filename).toMatch(/^submitted-[a-z0-9]+\.png$/)
      expect(img.mimeType).toBe('image/png')
      await expect(payload.findByID({ collection: 'event-submission-images', id: img.id, overrideAccess: false })).rejects.toThrow()
    })

    it('refuses a picture that is too small, not an image, or the wrong kind, and keeps nothing', async () => {
      const imgs = () => payload.count({ collection: 'event-submission-images', overrideAccess: true })
      const before = (await imgs()).totalDocs
      const small = await send({ image: { name: 'a.png', bytes: new Uint8Array(await png(100, 100)) } })
      expect(small.outcome).toMatchObject({ kind: 'invalid', errors: { 'event-image': expect.stringMatching(/at least 300/) } })
      const huge = await send({ image: { name: 'a.png', bytes: new Uint8Array(await png(2400, 400)) } })
      expect(huge.outcome).toMatchObject({ kind: 'invalid', errors: { 'event-image': expect.stringMatching(/no bigger than 2000/) } })
      const lie = await send({ image: { name: 'photo.jpg', bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>') } })
      expect(lie.outcome).toMatchObject({ kind: 'invalid', errors: { 'event-image': expect.stringMatching(/JPEG, PNG, WebP or GIF/) } })
      const big = await send({ image: { name: 'big.png', bytes: new Uint8Array(4 * 1024 * 1024 + 1).fill(0x89) } })
      expect(big.outcome.kind).toBe('invalid')
      expect([small.saved, huge.saved, lie.saved, big.saved]).toEqual([0, 0, 0, 0])
      expect((await imgs()).totalDocs).toBe(before)
    })
  })

  describe('from the form to the calendar', () => {
    it('a stranger submits, a publisher approves, and it is on the calendar and at its own address; before that it is nowhere', async () => {
      const title = `Journey Concert ${run}`
      await send({ raw: form({ 'event-title': title, 'event-category': [`theater-${run}`, `outdoors-${run}`], 'venue-name': `Journey Hall ${run}` }) })
      const [s] = await submissions({ title: { equals: title } })
      const before = await loadCalendar({ q: `Journey ${run}` }, NOW)
      expect(before.result.total).toBe(0)

      const approved = (await payload.update({ collection: 'event-submissions', id: s!.id, data: { status: 'approved' }, user: { id: publisher.id, collection: 'users', email: publisher.email, roles: ['publisher'] } as never, overrideAccess: false, context: ctx })) as Doc
      created.push({ collection: 'events', id: typeof approved.event === 'object' ? approved.event.id : approved.event })

      const calendar = await loadCalendar({ q: `Journey ${run}` }, NOW)
      expect(calendar.result.total).toBe(1)
      const entry = calendar.result.days[0]!.entries[0]!
      expect(entry).toMatchObject({ date: EVENT_DATE, start: '09:00', end: '14:00' })
      expect(entry.event.title).toBe(title)
      expect(entry.event.free).toBe(true)
      expect(entry.event.categories.map((c) => c.slug).sort()).toEqual([`outdoors-${run}`, `theater-${run}`])
      // Filtering by a category it has, and by one it does not.
      expect((await loadCalendar({ category: `outdoors-${run}`, q: `Journey ${run}` }, NOW)).result.total).toBe(1)
      expect((await loadCalendar({ category: `nope-${run}`, q: `Journey ${run}` }, NOW)).result.total).toBe(1) // an unknown category is ignored, not an empty page
      // The page for it.
      const page = await loadEventByPath(entry.event.path)
      expect(page?.event.title).toBe(title)
      expect(page?.upcoming.map((o) => o.date)).toEqual([EVENT_DATE])
      expect(page?.past).toBe(false)
      expect(JSON.stringify(page)).not.toContain(`pat-${run}@example.org`)
    })

    it('an event that has ended falls off the upcoming list but keeps its page', async () => {
      const title = `Ended Concert ${run}`
      const e = await make<Doc>('events', { title, categories: [theater.id], schedule: { kind: 'once', date: '2090-10-02', start: '10:00', end: '11:00' }, venue: { name: 'v' }, _status: 'published' })
      expect((await loadCalendar({ q: `Ended Concert ${run}` }, new Date('2090-10-01T12:00:00Z'))).result.total).toBe(1)
      expect((await loadCalendar({ q: `Ended Concert ${run}` }, new Date('2090-10-02T20:00:00Z'))).result.total).toBe(0)
      const page = await loadEventByPath(e.path)
      expect(page?.event.title).toBe(title)
    })

    it('a draft event is not on the calendar or at an address', async () => {
      const title = `Draft Concert ${run}`
      await make('events', { title, categories: [theater.id], schedule: { kind: 'once', date: addDays(EVENT_DATE, 6), start: '10:00' }, venue: { name: 'v' }, _status: 'draft' })
      expect((await loadCalendar({ q: `Draft Concert ${run}` }, NOW)).result.total).toBe(0)
    })

    it('Grove\'s old filter address (f0=<id>) still filters', async () => {
      const cat = await make<Doc>('event-categories', { title: `Old Filter ${run}`, slug: `old-filter-${run}`, legacy: { groveId: `grove-${run}` } })
      await make('events', { title: `Filtered Concert ${run}`, categories: [cat.id], schedule: { kind: 'once', date: addDays(EVENT_DATE, 7), start: '10:00' }, venue: { name: 'v' }, _status: 'published' })
      const r = await loadCalendar({ f0: `grove-${run}` }, NOW)
      expect(r.query.categories).toEqual([`old-filter-${run}`])
      expect(r.result.days.flatMap((d) => d.entries).map((e) => e.event.title)).toEqual([`Filtered Concert ${run}`])
    })
  })
})
