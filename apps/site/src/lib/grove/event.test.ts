import { describe, expect, it } from 'vitest'

import { expand } from '../events/schedule'
import { scheduleFromStored } from '../events/stored'
import { convertEventPage } from './event'

const page = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  _template: '/event/EventPage.hbs',
  contentId: '00000192-06c2-d712-affb-16caa39f0000',
  canonicalLink: 'https://www.wuwf.org/community-calendar/event/fall-plant-sale-19-09-2026-12-35-06',
  eventName: 'Fall Plant Sale',
  time: '09:00 AM - 02:00 PM on Sat, 14 Nov 2026',
  recurring: false,
  categories: [{ body: 'Art &amp; Museum Exhibits', contentId: 'cat-1' }, { body: 'Outdoors', contentId: 'cat-2' }],
  eventDescription: [{ items: ['<p>Plants of every kind. <a href="https://example.org/plants">More here</a>.</p><p>Second paragraph.</p>'] }],
  venueInformation: [{ name: 'Pensacola Garden Center', streetAddress: '1850 N 9th Avenue', city: 'Pensacola', state: 'Florida', zip: '32503', website: 'garden.example.org' }],
  presentingOrganization: [{ name: 'Garden Clubs', email: 'info@garden.example.org', phone: '850-555-0100', website: 'https://garden.example.org' }],
  price: '$5',
  ticketingWebsite: 'https://tickets.example.org/plants',
  eventImage: [{ alt: 'Plants on tables', image: { src: 'https://npr.brightspotcdn.com/aa/bb/plants.jpg' } }],
  ...over,
})

const ok = (raw: unknown) => {
  const r = convertEventPage(raw)
  if (r.status !== 'converted') throw new Error('skipped')
  return r
}

describe('convertEventPage', () => {
  it('converts a typical page without losing anything a visitor sees', () => {
    const { event, report } = ok(page())
    expect(report.status).toBe('clean')
    expect(event.legacy).toEqual({ groveId: '00000192-06c2-d712-affb-16caa39f0000', legacyPath: '/community-calendar/event/fall-plant-sale-19-09-2026-12-35-06', needsAttention: false, notes: null })
    expect(event.path).toBe(event.legacy.legacyPath)
    expect(event.title).toBe('Fall Plant Sale')
    expect(event.categories).toEqual([{ groveId: 'cat-1', title: 'Art & Museum Exhibits' }, { groveId: 'cat-2', title: 'Outdoors' }])
    expect(event.venue).toEqual({ name: 'Pensacola Garden Center', street: '1850 N 9th Avenue', city: 'Pensacola', state: 'FL', zip: '32503', website: 'https://garden.example.org/' })
    expect(event.organization).toEqual({ name: 'Garden Clubs', email: 'info@garden.example.org', phone: '850-555-0100', website: 'https://garden.example.org/' })
    expect(event.price).toBe('$5')
    expect(event.free).toBe(false)
    expect(event.ticketUrl).toBe('https://tickets.example.org/plants')
    expect(event.teaser).toBe('Plants of every kind. More here.')
    const body = JSON.stringify(event.description)
    expect(body).toContain('Plants of every kind.')
    expect(body).toContain('https://example.org/plants')
    expect(body).toContain('Second paragraph.')
    expect(event.image).toEqual({ $asset: 'https://npr.brightspotcdn.com/aa/bb/plants.jpg' })
    expect(event.assets).toEqual([{ kind: 'image', sourceUrl: 'https://npr.brightspotcdn.com/aa/bb/plants.jpg', alt: 'Plants on tables' }])
  })

  it('reads the date into a schedule that expands to the right day', () => {
    const { event } = ok(page())
    expect(expand(scheduleFromStored(event.schedule), { from: '2026-01-01', to: '2026-12-31' })).toEqual([{ date: '2026-11-14', start: '09:00', end: '14:00' }])
    expect(event.schedule.displayText).toBe('09:00 AM - 02:00 PM on Sat, 14 Nov 2026')
  })

  it('a recurring run whose start is not in the text is estimated, said so, and keeps Grove\'s wording', () => {
    const { event, report } = ok(page({ time: '07:30 PM - 09:30 PM, every day through Nov 08, 2026.', recurring: true, canonicalLink: 'https://www.wuwf.org/community-calendar/event/side-show-14-09-2026-14-21-22' }))
    expect(event.schedule).toMatchObject({ kind: 'daily', startDate: '2026-09-14', endDate: '2026-11-08', startEstimated: true })
    expect(report.entries.some((e) => e.code === 'event.date' && /submitted/.test(e.detail ?? ''))).toBe(true)
    expect(report.status).toBe('clean')
    expect(event.legacy.notes).toMatch(/start date is not in the text/)
  })

  it('a date it cannot read is kept as Grove\'s words, flagged for a person, and given no date', () => {
    const { event, report } = ok(page({ time: 'Every first Tuesday of the month, 6 PM' }))
    expect(report.status).toBe('review')
    expect(event.schedule).toMatchObject({ kind: 'listed', displayText: 'Every first Tuesday of the month, 6 PM' })
    expect(event.legacy.needsAttention).toBe(true)
    expect(event.legacy.notes).toMatch(/event\.date-not-read/)
    expect(scheduleFromStored(event.schedule)).toEqual({ kind: 'listed' })
  })

  it('weekly: the real Palafox Market shape reads, and is not on a 2026 calendar', () => {
    const { event } = ok(page({ time: 'Every 40 weeks through Jun 28, 2025.\nSaturday: 09:00 AM - 02:00 PM', recurring: true, canonicalLink: 'https://www.wuwf.org/community-calendar/event/pensacola-palafox-market-14-02-2025-07-34-51' }))
    expect(event.schedule).toMatchObject({ kind: 'weekly', everyWeeks: 40, endDate: '2025-06-28' })
    expect(expand(scheduleFromStored(event.schedule), { from: '2026-11-01', to: '2026-12-31' })).toEqual([])
  })

  it('drops an address or email that cannot be used, and says so, instead of failing the import', () => {
    const { event, report } = ok(page({ ticketingWebsite: 'javascript:alert(1)', presentingOrganization: [{ name: 'Org', email: 'not-an-email', website: 'data:text/html,x' }] }))
    expect(event.ticketUrl).toBeNull()
    expect(event.organization.email).toBeNull()
    expect(event.organization.website).toBeNull()
    expect(report.status).toBe('review')
    expect(report.entries.filter((e) => e.code === 'event.link-dropped' || e.code === 'event.email-dropped')).toHaveLength(3)
  })

  it('"Free" is the free flag, not a price', () => {
    const { event } = ok(page({ price: 'Free' }))
    expect(event.free).toBe(true)
    expect(event.price).toBeNull()
  })

  it('a page with no venue or categories is converted and noted, never given invented ones', () => {
    const { event, report } = ok(page({ venueInformation: [{ _template: 'x' }], venueName: '', categories: [] }))
    expect(event.venue.name).toBeNull()
    expect(event.categories).toEqual([])
    expect(report.entries.map((e) => e.code)).toEqual(expect.arrayContaining(['event.no-venue', 'event.no-category']))
    expect(report.status).toBe('clean')
  })

  it('never imports a script from the description', () => {
    const { event } = ok(page({ eventDescription: [{ items: ['<p>Hello</p><script>alert(1)</script><img src="x" onerror="alert(2)">'] }] }))
    const body = JSON.stringify(event.description)
    expect(body).toContain('Hello')
    expect(body).not.toMatch(/alert\(/)
    expect(body).not.toMatch(/<script/i)
  })

  it('is deterministic', () => {
    expect(JSON.stringify(convertEventPage(page()))).toBe(JSON.stringify(convertEventPage(page())))
  })

  it('skips a page that is not an event, and fails one with no identity', () => {
    expect(convertEventPage(page({ _template: '/core/article/ArticlePage.hbs' })).status).toBe('skipped')
    expect(convertEventPage(null).status).toBe('skipped')
    const r = ok(page({ contentId: undefined }))
    expect(r.report.status).toBe('exception')
    expect(ok(page({ canonicalLink: 'https://www.wuwf.org/elsewhere/thing' })).report.status).toBe('exception')
  })
})
