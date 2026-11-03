import { describe, expect, it } from 'vitest'

import { expand } from './schedule'
import { parseGroveTime, submittedOn, tidy } from './grove-time'

const SUBMITTED = '2025-02-14'

describe('submittedOn', () => {
  it('reads day-month-year from the end of a Grove address', () => {
    expect(submittedOn('/community-calendar/event/pensacola-symphony-orchestra-celebrate-the-new-year-19-09-2024-12-35-06')).toBe('2024-09-19')
    expect(submittedOn('/community-calendar/event/side-show-14-09-2026-14-21-22')).toBe('2026-09-14')
  })
  it('is null when the address has no such ending or an impossible date', () => {
    expect(submittedOn('/community-calendar/event/something')).toBeNull()
    expect(submittedOn('/community-calendar/event/x-31-02-2025-10-00-00')).toBeNull()
  })
})

describe('tidy', () => {
  it('turns markup into plain text and keeps line breaks', () => {
    expect(tidy('Every 2 weeks<br/>Saturday:&nbsp;09:00 AM - 02:00 PM')).toBe('Every 2 weeks\nSaturday: 09:00 AM - 02:00 PM')
    expect(tidy('  a   b  ')).toBe('a b')
  })
})

describe('one time (real strings)', () => {
  it('reads a start and end', () => {
    const r = parseGroveTime('07:00 PM - 09:00 PM on Tue, 31 Dec 2024', { submitted: '2024-09-19', recurring: false })
    expect(r.understood).toBe(true)
    expect(r.schedule).toEqual({ kind: 'once', date: '2024-12-31', start: '19:00', end: '21:00' })
    expect(r.startEstimated).toBe(false)
    expect(r.notes).toEqual([])
  })
  it('reads the other real samples', () => {
    const cases: [string, string, string, string][] = [
      ['02:00 PM - 04:00 PM on Sun, 19 Oct 2025', '2025-10-19', '14:00', '16:00'],
      ['08:00 AM - 02:00 PM on Fri, 3 Nov 2023', '2023-11-03', '08:00', '14:00'],
      ['12:00 PM - 01:00 PM on Tue, 8 Apr 2025', '2025-04-08', '12:00', '13:00'],
      ['05:30 PM - 11:59 PM on Thu, 17 Mar 2022', '2022-03-17', '17:30', '23:59'],
      ['12:00 AM - 12:30 AM on Thu, 17 Mar 2022', '2022-03-17', '00:00', '00:30'],
    ]
    for (const [text, date, start, end] of cases) {
      const r = parseGroveTime(text, { submitted: null })
      expect(r.schedule, text).toEqual({ kind: 'once', date, start, end })
      expect(r.notes, text).toEqual([])
    }
  })
  it('allows a missing end time', () => {
    const r = parseGroveTime('07:00 PM on Tue, 31 Dec 2024', { submitted: null })
    expect(r.schedule).toEqual({ kind: 'once', date: '2024-12-31', start: '19:00', end: null })
  })
  it('notes, but keeps, a day name that does not match the date', () => {
    const r = parseGroveTime('07:00 PM - 09:00 PM on Wed, 31 Dec 2024', { submitted: null })
    expect(r.understood).toBe(true)
    expect(r.notes.join()).toMatch(/does not match 2024-12-31/)
  })
  it('does not accept an impossible date', () => {
    const r = parseGroveTime('07:00 PM - 09:00 PM on Tue, 31 Feb 2024', { submitted: null })
    expect(r.understood).toBe(false)
    expect(r.schedule).toEqual({ kind: 'listed' })
  })
})

describe('daily (real strings)', () => {
  it('reads the run and uses the submission date as the estimated start', () => {
    const r = parseGroveTime('10:00 AM - 06:00 PM, every day through Jun 05, 2022.', { submitted: '2022-05-25', recurring: true })
    expect(r.understood).toBe(true)
    expect(r.schedule).toEqual({ kind: 'daily', startDate: '2022-05-25', endDate: '2022-06-05', start: '10:00', end: '18:00' })
    expect(r.startEstimated).toBe(true)
    expect(r.notes.join()).toMatch(/start date is not in the text/)
    expect(expand(r.schedule, { from: '2022-01-01', to: '2022-12-31' })).toHaveLength(12)
  })
  it('without a submission date it will not guess', () => {
    const r = parseGroveTime('10:00 AM - 06:00 PM, every day through Jun 05, 2022.', { submitted: null, recurring: true })
    expect(r.understood).toBe(false)
    expect(r.schedule).toEqual({ kind: 'listed' })
  })
  it('a run submitted after its end is taken as the end date only, and says so', () => {
    const r = parseGroveTime('10:00 AM - 06:00 PM, every day through Jun 05, 2022.', { submitted: '2022-07-01', recurring: true })
    expect(r.schedule).toMatchObject({ kind: 'daily', startDate: '2022-06-05', endDate: '2022-06-05' })
    expect(r.notes.join()).toMatch(/after its end date/)
  })
  it('notes when Grove did not flag it recurring', () => {
    const r = parseGroveTime('07:30 PM - 09:30 PM, every day through Nov 08, 2026.', { submitted: '2026-09-14', recurring: false })
    expect(r.notes.join()).toMatch(/does not mark this as recurring/)
  })
})

describe('weekly (real string)', () => {
  const text = 'Every 40 weeks through Jun 28, 2025.\nSaturday: 09:00 AM - 02:00 PM'
  it('reads the interval, the end and each day line', () => {
    const r = parseGroveTime(text, { submitted: SUBMITTED, recurring: true })
    expect(r.understood).toBe(true)
    expect(r.schedule).toEqual({ kind: 'weekly', startDate: SUBMITTED, endDate: '2025-06-28', everyWeeks: 40, slots: [{ day: 6, start: '09:00', end: '14:00' }] })
  })
  it('does not put an expired run on a later calendar (Grove did: Nov 2026)', () => {
    const r = parseGroveTime(text, { submitted: SUBMITTED, recurring: true })
    expect(expand(r.schedule, { from: '2026-11-01', to: '2026-12-31' })).toEqual([])
  })
  it('reads several days and a markup line break', () => {
    const r = parseGroveTime('Every 2 weeks through Dec 31, 2026.<br>Tuesday: 06:00 PM - 07:00 PM<br>Thursday: 10:00 AM - 11:00 AM', { submitted: '2026-11-04', recurring: true })
    expect(r.schedule).toMatchObject({ kind: 'weekly', everyWeeks: 2, slots: [{ day: 2, start: '18:00', end: '19:00' }, { day: 4, start: '10:00', end: '11:00' }] })
  })
  it('"Every week" means every 1', () => {
    const r = parseGroveTime('Every week through Dec 31, 2026.\nMonday: 06:00 PM - 07:00 PM', { submitted: '2026-11-04' })
    expect(r.schedule).toMatchObject({ kind: 'weekly', everyWeeks: 1 })
  })
  it('a day line it cannot read makes the whole thing listed, not partly read', () => {
    const r = parseGroveTime('Every 2 weeks through Dec 31, 2026.\nTuesday: evenings', { submitted: '2026-11-04' })
    expect(r.understood).toBe(false)
    expect(r.notes.join()).toMatch(/not in the usual shape/)
  })
})

describe('anything else is kept, flagged and given no date', () => {
  it.each([
    ['Every month on the second Tuesday through Dec 31, 2026.\n06:00 PM - 07:00 PM'],
    ['Tonight!'],
    ['07:00 PM - 09:00 PM on 31 Dec 2024'],
    ['25:00 PM - 09:00 PM on Tue, 31 Dec 2024'],
  ])('%s', (text) => {
    const r = parseGroveTime(text, { submitted: '2026-11-04', recurring: true })
    expect(r.understood).toBe(false)
    expect(r.schedule).toEqual({ kind: 'listed' })
    expect(r.displayText).toBe(tidy(text))
    expect(r.notes.length).toBeGreaterThan(0)
  })
  it('empty or missing text', () => {
    expect(parseGroveTime('', { submitted: null }).understood).toBe(false)
    expect(parseGroveTime(undefined, { submitted: null }).understood).toBe(false)
  })
})
