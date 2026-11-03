import { describe, expect, it } from 'vitest'

import { expand, type Schedule } from './schedule'
import { boundsOfStored, eventFromSubmission, eventPathBase, lexicalFromPlain, reviewConcerns, scheduleFromStored, scheduleToStored, teaserOf } from './stored'
import { validate, type RawForm, type SubmissionValue } from './submission'

const SCHEDULES: Schedule[] = [
  { kind: 'once', date: '2026-11-05', start: '17:00', end: '18:00' },
  { kind: 'once', date: '2026-11-05', start: '17:00', end: null },
  { kind: 'daily', startDate: '2026-11-02', endDate: '2026-11-08', start: '19:30', end: '21:30' },
  { kind: 'weekly', startDate: '2026-11-04', endDate: '2026-12-31', everyWeeks: 2, slots: [{ day: 2, start: '18:00', end: '19:00' }, { day: 0, start: '09:00', end: '10:00' }] },
  { kind: 'monthly', startDate: '2026-11-01', endDate: '2027-06-30', everyMonths: 2, nth: 'last', day: 5, start: '12:00', end: '13:00' },
  { kind: 'monthly', startDate: '2026-11-01', endDate: '2027-06-30', everyMonths: 1, nth: 2, day: 0, start: '12:00', end: '13:00' },
]

describe('stored schedules', () => {
  it.each(SCHEDULES.map((s) => [s.kind + ' ' + JSON.stringify(s).length, s] as const))('%s survives storing and reading back', (_n, s) => {
    expect(scheduleFromStored(scheduleToStored(s))).toEqual(s)
  })
  it('keeps the same occurrences after a round trip', () => {
    for (const s of SCHEDULES) {
      const w = { from: '2026-01-01', to: '2027-12-31' }
      expect(expand(scheduleFromStored(scheduleToStored(s)), w)).toEqual(expand(s, w))
    }
  })
  it('an incomplete or invalid stored schedule reads as listed, never as a guess', () => {
    expect(scheduleFromStored(null)).toEqual({ kind: 'listed' })
    expect(scheduleFromStored({})).toEqual({ kind: 'listed' })
    expect(scheduleFromStored({ kind: 'once', date: '2026-11-05' })).toEqual({ kind: 'listed' })
    expect(scheduleFromStored({ kind: 'once', date: '2026-02-30', start: '10:00' })).toEqual({ kind: 'listed' })
    expect(scheduleFromStored({ kind: 'daily', startDate: '2026-11-08', endDate: '2026-11-02', start: '10:00', end: '11:00' })).toEqual({ kind: 'listed' })
    expect(scheduleFromStored({ kind: 'weekly', startDate: '2026-11-04', endDate: '2026-12-31', everyWeeks: 1, slots: [{ day: '9', start: '10:00', end: '11:00' }] })).toEqual({ kind: 'listed' })
    expect(scheduleFromStored({ kind: 'monthly', startDate: '2026-11-04', endDate: '2026-12-31', everyMonths: 1, nth: '5', weekday: '1', start: '10:00', end: '11:00' })).toEqual({ kind: 'listed' })
  })
  it('gives the bounds the calendar queries by', () => {
    expect(boundsOfStored(scheduleToStored(SCHEDULES[2]!))).toEqual({ first: '2026-11-02', last: '2026-11-08' })
    expect(boundsOfStored({ kind: 'listed' })).toBeNull()
  })
})

describe('plain text to editor JSON', () => {
  it('makes a paragraph per blank-line block and a line break per newline', () => {
    const j = lexicalFromPlain('One\ntwo\n\n\nThree') as unknown as { root: { children: { type: string; children: { type: string; text?: string }[] }[] } }
    expect(j.root.children).toHaveLength(2)
    expect(j.root.children[0]!.children.map((c) => c.type)).toEqual(['text', 'linebreak', 'text'])
    expect(j.root.children[1]!.children[0]!.text).toBe('Three')
  })
  it('empty text is one empty paragraph, not a broken document', () => {
    expect((lexicalFromPlain(null) as unknown as { root: { children: unknown[] } }).root.children).toHaveLength(1)
  })
  it('keeps angle brackets as text (nothing here is HTML)', () => {
    const j = lexicalFromPlain('Ages 5 < 10')
    expect(JSON.stringify(j)).toContain('Ages 5 < 10')
  })
})

describe('teasers and addresses', () => {
  it('takes the first paragraph and cuts at a word', () => {
    expect(teaserOf('Short.\n\nSecond.')).toBe('Short.')
    const t = teaserOf('word '.repeat(100), 40)!
    expect(t.length).toBeLessThanOrEqual(40)
    expect(t.endsWith('…')).toBe(true)
    expect(t).not.toMatch(/wor…$/)
    expect(teaserOf('')).toBeNull()
    expect(teaserOf(undefined)).toBeNull()
  })
  it('makes an event address from the title and first date', () => {
    expect(eventPathBase('Fall Plant Sale & Bake-Off!', '2026-11-14')).toBe('/community-calendar/event/fall-plant-sale-and-bake-off-2026-11-14')
    expect(eventPathBase('!!!', null)).toBe('/community-calendar/event/event')
  })
})

describe('a reviewed submission becomes an event', () => {
  const raw: RawForm = {
    'event-title': 'Fall Plant Sale',
    'venue-name': 'Pensacola Garden Center',
    'venue-street-address': '1850 N 9th Avenue',
    'venue-city': 'Pensacola',
    'event-type': 'one-time-event',
    'once-date': '2026-11-14',
    'once-start': '09:00',
    'event-category': ['community-events', 'outdoors'],
    'event-description': 'Plants.\n\nMore plants.',
    'this-is-a-free-event': 'on',
    'presenting-organization-name': 'Garden Clubs',
    'presenting-organization-designation': 'not-for-profit',
    'your-information-name': 'Pat Submitter',
    'your-information-email': 'pat@example.org',
    'your-information-submitting-as': 'venue',
  }
  const value = (): SubmissionValue => {
    const r = validate(raw, { categories: ['community-events', 'outdoors'], today: '2026-11-03' })
    if (!r.ok) throw new Error(JSON.stringify(r.errors))
    return r.value
  }
  it('maps the fields, resolves categories to ids, and leaves the submitter out', () => {
    const e = eventFromSubmission(value(), new Map([['community-events', 5], ['outdoors', 9]]))
    expect(e.title).toBe('Fall Plant Sale')
    expect(e.categories).toEqual([5, 9])
    expect(e.free).toBe(true)
    expect(e.price).toBeNull()
    expect(e.teaser).toBe('Plants.')
    expect(e.schedule).toMatchObject({ kind: 'once', date: '2026-11-14', start: '09:00' })
    expect(JSON.stringify(e)).not.toContain('pat@example.org')
    expect(JSON.stringify(e)).not.toContain('Pat Submitter')
  })
  it('drops a category that has no record rather than failing', () => {
    expect(eventFromSubmission(value(), new Map([['outdoors', 9]])).categories).toEqual([9])
  })
  it('flags what the guidelines care about, and nothing for an ordinary non-profit event', () => {
    expect(reviewConcerns(value(), { duplicate: false })).toEqual([])
    const fp = value()
    fp.organization.designation = 'for-profit'
    fp.price = { text: '$20', free: false, additional: null }
    const c = reviewConcerns(fp, { duplicate: true }).join('\n')
    expect(c).toMatch(/for-profit/)
    expect(c).toMatch(/lists a price/)
    expect(c).toMatch(/same title/)
    const noOrg = value()
    noOrg.organization = { name: null, email: null, phone: null, website: null, designation: 'n-a' }
    expect(reviewConcerns(noOrg, { duplicate: false }).join()).toMatch(/No presenting organization/)
    const noAddress = value()
    noAddress.venue = { ...noAddress.venue, street: null, city: null, name: 'Somewhere' }
    expect(reviewConcerns(noAddress, { duplicate: false }).join()).toMatch(/no address/)
    const online = value()
    online.venue = { ...online.venue, street: null, city: null, name: 'Online via Zoom' }
    expect(reviewConcerns(online, { duplicate: false })).toEqual([])
  })
})
