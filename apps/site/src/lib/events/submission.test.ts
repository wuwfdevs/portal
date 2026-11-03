import { describe, expect, it } from 'vitest'

import { HONEYPOT_FIELD, MAX_FORM_AGE_MS, MIN_FILL_MS, RATE, checkFormToken, clientAddress, clientKey, honeypotClean, issueFormToken, rateDecision, sniffImage } from './abuse'
import { expand } from './schedule'
import { plain, validate, webAddress, type RawForm } from './submission'

const CTX = { categories: ['music-classical', 'community-events', 'theater', 'outdoors'], today: '2026-11-03' }
const SECRET = 'a'.repeat(40)

const base = (extra: RawForm = {}): RawForm => ({
  'event-title': 'Fall Plant Sale',
  'venue-name': 'Pensacola Garden Center',
  'event-type': 'one-time-event',
  'once-date': '2026-11-14',
  'once-start': '09:00',
  'once-end': '14:00',
  'event-category': ['community-events'],
  'your-information-email': 'someone@example.org',
  'your-information-submitting-as': 'venue',
  ...extra,
})

const bad = (raw: RawForm) => {
  const r = validate(raw, CTX)
  if (r.ok) throw new Error('expected errors')
  return r.errors
}
const good = (raw: RawForm) => {
  const r = validate(raw, CTX)
  if (!r.ok) throw new Error(`expected ok: ${JSON.stringify(r.errors)}`)
  return r.value
}

describe('a one-time event', () => {
  it('accepts the minimum the form requires and fills the rest with nothing', () => {
    const v = good(base())
    expect(v.title).toBe('Fall Plant Sale')
    expect(v.schedule).toEqual({ kind: 'once', date: '2026-11-14', start: '09:00', end: '14:00' })
    expect(v.venue.street).toBeNull()
    expect(v.description).toBeNull()
    expect(v.organization.designation).toBe('n-a')
    expect(v.submitter).toEqual({ name: null, email: 'someone@example.org', role: 'venue' })
  })
  it('requires a title, a venue, a date, a start time, a category, an email and a role', () => {
    const e = bad({ 'event-type': 'one-time-event' })
    expect(Object.keys(e).sort()).toEqual(['event-category', 'event-title', 'once-date', 'once-start', 'venue-name', 'your-information-email', 'your-information-submitting-as'])
  })
  it('refuses a date that has passed or is more than about 18 months away', () => {
    expect(bad(base({ 'once-date': '2026-11-02' }))['once-date']).toMatch(/already passed/)
    expect(bad(base({ 'once-date': '2028-06-01' }))['once-date']).toMatch(/eighteen months/)
    expect(good(base({ 'once-date': '2026-11-03' })).schedule).toMatchObject({ date: '2026-11-03' })
  })
  it('refuses an impossible date and a bad time', () => {
    expect(bad(base({ 'once-date': '2026-02-30' }))['once-date']).toMatch(/not a valid date/)
    expect(bad(base({ 'once-start': '9am' }))['once-start']).toMatch(/not a valid time/)
  })
})

describe('recurring events', () => {
  it('daily', () => {
    const v = good(base({ 'event-type': 'recurring-event', 'recurring-event-repeats': 'recurring-event-repeats-daily', 'daily-start-date': '2026-11-02', 'daily-end-date': '2026-11-08', 'daily-start': '19:30', 'daily-end': '21:30' }))
    expect(v.schedule).toMatchObject({ kind: 'daily', startDate: '2026-11-02', endDate: '2026-11-08' })
  })
  it('weekly with an interval and two days', () => {
    const v = good(
      base({
        'event-type': 'recurring-event',
        'recurring-event-repeats': 'recurring-event-repeats-weekly',
        'weekly-start-date': '2026-11-04',
        'weekly-end-date': '2026-12-31',
        'weekly-interval': '2',
        'weekly-day-2': 'on',
        'weekly-start-2': '18:00',
        'weekly-end-2': '19:00',
        'weekly-day-4': 'on',
        'weekly-start-4': '10:00',
        'weekly-end-4': '11:00',
      }),
    )
    expect(v.schedule).toMatchObject({ kind: 'weekly', everyWeeks: 2, slots: [{ day: 2 }, { day: 4 }] })
    expect(expand(v.schedule, { from: '2026-11-01', to: '2026-12-06' }).map((o) => o.date)).toEqual(['2026-11-05', '2026-11-17', '2026-11-19', '2026-12-01', '2026-12-03'])
  })
  it('weekly needs a day, and a time for each chosen day', () => {
    const e = bad(base({ 'event-type': 'recurring-event', 'recurring-event-repeats': 'recurring-event-repeats-weekly', 'weekly-start-date': '2026-11-04', 'weekly-end-date': '2026-12-31', 'weekly-interval': '1' }))
    expect(e['weekly-day-0']).toMatch(/at least one day/)
    const e2 = bad(base({ 'event-type': 'recurring-event', 'recurring-event-repeats': 'recurring-event-repeats-weekly', 'weekly-start-date': '2026-11-04', 'weekly-end-date': '2026-12-31', 'weekly-interval': '1', 'weekly-day-2': 'on' }))
    expect(e2['weekly-start-2']).toMatch(/required/)
  })
  it('monthly by weekday', () => {
    const v = good(
      base({ 'event-type': 'recurring-event', 'recurring-event-repeats': 'recurring-event-repeats-monthly', 'monthly-start-date': '2026-11-01', 'monthly-end-date': '2027-02-28', 'monthly-start': '18:00', 'monthly-end': '19:00', 'monthly-frequency': 'second', 'monthly-day-of-week': '2', 'monthly-every': '1' }),
    )
    expect(expand(v.schedule, { from: '2026-11-01', to: '2027-03-01' }).map((o) => o.date)).toEqual(['2026-11-10', '2026-12-08', '2027-01-12', '2027-02-09'])
  })
  it('refuses a run that ends before it starts, or one that has already ended', () => {
    const r = (s: string, e: string) => base({ 'event-type': 'recurring-event', 'recurring-event-repeats': 'recurring-event-repeats-daily', 'daily-start-date': s, 'daily-end-date': e, 'daily-start': '09:00', 'daily-end': '10:00' })
    expect(bad(r('2026-12-01', '2026-11-20'))['daily-end-date']).toMatch(/before the start date/)
    expect(bad(r('2026-10-01', '2026-10-20'))['daily-end-date']).toMatch(/already passed/)
  })
  it('refuses a monthly run in which the day never falls', () => {
    const e = bad(base({ 'event-type': 'recurring-event', 'recurring-event-repeats': 'recurring-event-repeats-monthly', 'monthly-start-date': '2026-11-11', 'monthly-end-date': '2026-11-20', 'monthly-start': '18:00', 'monthly-end': '19:00', 'monthly-frequency': 'first', 'monthly-day-of-week': '1', 'monthly-every': '1' }))
    expect(e['monthly-start-date']).toMatch(/no dates/)
  })
  it('needs a one-time or recurring choice, and a repeat kind', () => {
    expect(bad(base({ 'event-type': '' }))['event-type']).toMatch(/one-time or a recurring/)
    expect(bad(base({ 'event-type': 'recurring-event' }))['recurring-event-repeats']).toMatch(/how the event repeats/)
  })
})

describe('text is plain text', () => {
  it('refuses markup in any text field rather than cleaning it', () => {
    expect(bad(base({ 'event-title': 'Sale <script>alert(1)</script>' }))['event-title']).toMatch(/cannot contain HTML/)
    expect(bad(base({ 'event-description': 'Come <b>see</b> us' }))['event-description']).toMatch(/cannot contain HTML/)
    expect(bad(base({ 'venue-city': '<img src=x onerror=1>' }))['venue-city']).toMatch(/cannot contain HTML/)
  })
  it('allows ordinary punctuation and the less-than sign in prose', () => {
    expect(good(base({ 'event-title': 'Under 5 < 10 & Over 21', 'event-description': 'Ages 5 < 10 welcome.\n\nBring a friend.' })).description).toBe('Ages 5 < 10 welcome.\n\nBring a friend.')
  })
  it('strips control characters and enforces length caps', () => {
    expect(plain('a\u0000b\u0007c\r\nd')).toBe('abc\nd')
    expect(bad(base({ 'event-title': 'x'.repeat(151) }))['event-title']).toMatch(/at most 150/)
    expect(bad(base({ 'event-description': 'x'.repeat(4001) }))['event-description']).toMatch(/at most 4000/)
  })
})

describe('addresses, contacts and choices', () => {
  it('web addresses must be http(s); a bare domain gets https', () => {
    expect(webAddress('example.org')).toBe('https://example.org/')
    expect(webAddress('http://example.org/a?b=1')).toBe('http://example.org/a?b=1')
    expect(webAddress('javascript:alert(1)')).toBeNull()
    expect(webAddress('data:text/html,hi')).toBeNull()
    expect(webAddress('https://user:pw@example.org')).toBeNull()
    expect(webAddress('not a url')).toBeNull()
    expect(webAddress('localhost')).toBeNull()
    expect(bad(base({ 'ticketing-website': 'javascript:alert(1)' }))['ticketing-website']).toMatch(/web address/)
    expect(good(base({ 'ticketing-website': 'tickets.example.org/buy' })).ticketUrl).toBe('https://tickets.example.org/buy')
  })
  it('emails, phones, zip and state', () => {
    expect(bad(base({ 'your-information-email': 'nope' }))['your-information-email']).toMatch(/email/)
    expect(bad(base({ 'venue-phone': 'call me' }))['venue-phone']).toMatch(/phone/)
    expect(good(base({ 'venue-phone': '850-435-2533', 'venue-zip': '32502', 'venue-state': 'FL' })).venue).toMatchObject({ phone: '850-435-2533', zip: '32502', state: 'FL' })
    expect(bad(base({ 'venue-zip': '3250' }))['venue-zip']).toMatch(/zip/)
    expect(bad(base({ 'venue-state': 'ZZ' }))['venue-state']).toMatch(/state/)
  })
  it('categories: one to three, from the list', () => {
    expect(bad(base({ 'event-category': [] }))['event-category']).toMatch(/at least one/)
    expect(bad(base({ 'event-category': ['music-classical', 'theater', 'outdoors', 'community-events'] }))['event-category']).toMatch(/up to 3/)
    expect(bad(base({ 'event-category': ['not-a-category'] }))['event-category']).toMatch(/not on the list/)
    expect(good(base({ 'event-category': ['theater', 'theater'] })).categories).toEqual(['theater'])
  })
  it('a free event has no price', () => {
    expect(good(base({ 'this-is-a-free-event': 'this-is-a-free-event' })).price).toMatchObject({ free: true, text: null })
    expect(bad(base({ 'this-is-a-free-event': 'on', 'price-price-range': '$20' }))['price-price-range']).toMatch(/free event has no price/)
  })
  it('the organization designation and the submitter role are from fixed lists', () => {
    expect(bad(base({ 'presenting-organization-designation': 'whatever' }))['presenting-organization-designation']).toMatch(/designations/)
    expect(good(base({ 'presenting-organization-designation': 'for-profit' })).organization.designation).toBe('for-profit')
    expect(bad(base({ 'your-information-submitting-as': 'robot' }))['your-information-submitting-as']).toMatch(/how you are submitting/)
  })
})

describe('abuse controls', () => {
  const issued = new Date('2026-11-03T12:00:00Z')
  const token = issueFormToken(issued, SECRET)
  const later = (ms: number) => new Date(issued.getTime() + ms)

  it('a token is valid after the minimum fill time and before it expires', () => {
    expect(checkFormToken(token, later(MIN_FILL_MS), SECRET)).toEqual({ ok: true })
    expect(checkFormToken(token, later(60_000), SECRET)).toEqual({ ok: true })
  })
  it('too fast, expired, missing, malformed, wrong secret and edited tokens are refused', () => {
    expect(checkFormToken(token, later(MIN_FILL_MS - 1), SECRET)).toEqual({ ok: false, reason: 'too-fast' })
    expect(checkFormToken(token, later(MAX_FORM_AGE_MS + 1), SECRET)).toEqual({ ok: false, reason: 'expired' })
    expect(checkFormToken(undefined, later(60_000), SECRET)).toEqual({ ok: false, reason: 'missing' })
    expect(checkFormToken('garbage', later(60_000), SECRET)).toEqual({ ok: false, reason: 'missing' })
    expect(checkFormToken(token, later(60_000), 'b'.repeat(40))).toEqual({ ok: false, reason: 'forged' })
    const [stamp, sig] = token.split('.')
    expect(checkFormToken(`${Number(stamp) - 3_600_000}.${sig}`, later(60_000), SECRET)).toEqual({ ok: false, reason: 'forged' })
  })
  it('the honeypot must be empty', () => {
    expect(HONEYPOT_FIELD).toBeTruthy()
    expect(honeypotClean(undefined)).toBe(true)
    expect(honeypotClean('')).toBe(true)
    expect(honeypotClean('  ')).toBe(true)
    expect(honeypotClean('http://spam.example')).toBe(false)
  })
  it('rate limits per hour and per day', () => {
    expect(rateDecision({ lastHour: 0, lastDay: 0 })).toEqual({ allowed: true })
    expect(rateDecision({ lastHour: RATE.perHour - 1, lastDay: 5 })).toEqual({ allowed: true })
    expect(rateDecision({ lastHour: RATE.perHour, lastDay: RATE.perHour })).toEqual({ allowed: false, retryAfter: 'hour' })
    expect(rateDecision({ lastHour: 0, lastDay: RATE.perDay })).toEqual({ allowed: false, retryAfter: 'day' })
  })
  it('a client key is stable, keyed and not the address', () => {
    const k = clientKey('203.0.113.9', SECRET)
    expect(k).toBe(clientKey('203.0.113.9', SECRET))
    expect(k).not.toBe(clientKey('203.0.113.10', SECRET))
    expect(k).not.toBe(clientKey('203.0.113.9', 'c'.repeat(40)))
    expect(k).not.toContain('203')
  })
  it('takes only the first hop of a forwarded header, and only if it is an address', () => {
    expect(clientAddress('203.0.113.9, 10.0.0.1')).toBe('203.0.113.9')
    expect(clientAddress('2001:db8::1')).toBe('2001:db8::1')
    expect(clientAddress('<script>')).toBe('unknown')
    expect(clientAddress(null)).toBe('unknown')
  })
  it('recognises images by their bytes, not their names', () => {
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg')
    expect(sniffImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png')
    expect(sniffImage(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe('image/gif')
    expect(sniffImage(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe('image/webp')
    expect(sniffImage(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull()
    expect(sniffImage(new TextEncoder().encode('%PDF-1.7'))).toBeNull()
    expect(sniffImage(new Uint8Array())).toBeNull()
  })
})
