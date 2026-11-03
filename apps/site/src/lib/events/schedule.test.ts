import { describe, expect, it } from 'vitest'

import {
  MAX_OCCURRENCES,
  addDays,
  clock,
  daysBetween,
  describeSchedule,
  expand,
  isDate,
  isUpcoming,
  nthWeekdayOfMonth,
  occurrenceEnd,
  parseDate,
  scheduleBounds,
  scheduleProblems,
  stationToday,
  weekdayOf,
  zonedInstant,
  type Schedule,
} from './schedule'

const dates = (s: Schedule, from: string, to: string) => expand(s, { from, to }).map((o) => o.date)

describe('dates', () => {
  it('accepts only real calendar dates', () => {
    expect(isDate('2026-02-28')).toBe(true)
    expect(isDate('2028-02-29')).toBe(true)
    expect(isDate('2026-02-29')).toBe(false)
    expect(isDate('2026-13-01')).toBe(false)
    expect(isDate('2026-1-1')).toBe(false)
    expect(isDate(20261101)).toBe(false)
    expect(parseDate('2026-11-03')).toEqual({ y: 2026, m: 11, d: 3 })
  })
  it('does date arithmetic without time-zone drift', () => {
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(daysBetween('2026-03-01', '2026-03-15')).toBe(14)
    expect(weekdayOf('2026-11-01')).toBe(0) // a Sunday
    expect(weekdayOf('2026-11-02')).toBe(1)
  })
  it('finds the nth and last weekday of a month, and none that does not exist', () => {
    expect(nthWeekdayOfMonth(2026, 11, 4, 1)).toBe('2026-11-23')
    expect(nthWeekdayOfMonth(2026, 11, 'last', 1)).toBe('2026-11-30')
    expect(nthWeekdayOfMonth(2026, 11, 1, 0)).toBe('2026-11-01')
    expect(nthWeekdayOfMonth(2026, 2, 'last', 6)).toBe('2026-02-28')
  })
})

describe('expand', () => {
  it('a one-time event has one occurrence, and only inside the window', () => {
    const s: Schedule = { kind: 'once', date: '2026-11-05', start: '17:00', end: '18:00' }
    expect(expand(s, { from: '2026-11-01', to: '2026-11-30' })).toEqual([{ date: '2026-11-05', start: '17:00', end: '18:00' }])
    expect(dates(s, '2026-11-06', '2026-11-30')).toEqual([])
    expect(dates(s, '2026-11-05', '2026-11-05')).toEqual(['2026-11-05'])
  })

  it('a one-time event may have no end time', () => {
    const [o] = expand({ kind: 'once', date: '2026-11-05', start: '17:00' }, { from: '2026-11-05', to: '2026-11-05' })
    expect(o!.end).toBeNull()
  })

  it('a daily event covers every day of its run, clipped to the window', () => {
    const s: Schedule = { kind: 'daily', startDate: '2026-11-02', endDate: '2026-11-08', start: '19:30', end: '21:30' }
    expect(dates(s, '2026-11-01', '2026-12-01')).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])
    expect(dates(s, '2026-11-06', '2026-11-07')).toEqual(['2026-11-06', '2026-11-07'])
  })

  it('a weekly event honours its interval and its several days, counted from the start date\'s week', () => {
    const s: Schedule = {
      kind: 'weekly',
      startDate: '2026-11-04',
      endDate: '2026-12-31',
      everyWeeks: 2,
      slots: [
        { day: 2, start: '18:00', end: '19:00' },
        { day: 4, start: '10:00', end: '11:00' },
      ],
    }
    // The start date's week is Nov 1-7 (Tuesday the 3rd is before the start); every second week after it.
    expect(dates(s, '2026-11-01', '2026-12-06')).toEqual(['2026-11-05', '2026-11-17', '2026-11-19', '2026-12-01', '2026-12-03'])
    const first = expand(s, { from: '2026-11-17', to: '2026-11-17' })[0]!
    expect(first.start).toBe('18:00')
    expect(expand(s, { from: '2026-11-19', to: '2026-11-19' })[0]!.start).toBe('10:00')
  })

  it('a monthly event falls on the nth weekday', () => {
    const s: Schedule = { kind: 'monthly', startDate: '2026-11-01', endDate: '2027-02-28', everyMonths: 1, nth: 2, day: 2, start: '18:00', end: '19:00' }
    expect(dates(s, '2026-01-01', '2027-12-31')).toEqual(['2026-11-10', '2026-12-08', '2027-01-12', '2027-02-09'])
  })

  it('a monthly event on the last weekday every other month', () => {
    const s: Schedule = { kind: 'monthly', startDate: '2026-11-01', endDate: '2027-06-30', everyMonths: 2, nth: 'last', day: 5, start: '12:00', end: '13:00' }
    expect(dates(s, '2026-01-01', '2027-12-31')).toEqual(['2026-11-27', '2027-01-29', '2027-03-26', '2027-05-28'])
  })

  it('a monthly occurrence before the start date or after the end date is not produced', () => {
    const s: Schedule = { kind: 'monthly', startDate: '2026-11-15', endDate: '2026-12-09', everyMonths: 1, nth: 2, day: 2, start: '18:00', end: '19:00' }
    // Nov's second Tuesday is the 10th (before the 15th); Dec's is the 8th (inside).
    expect(dates(s, '2026-01-01', '2027-12-31')).toEqual(['2026-12-08'])
  })

  it('returns occurrences oldest first and never more than the cap', () => {
    const s: Schedule = { kind: 'daily', startDate: '2026-01-01', endDate: '2027-12-31', start: '09:00', end: '10:00' }
    const all = expand(s, { from: '2020-01-01', to: '2030-01-01' })
    expect(all).toHaveLength(MAX_OCCURRENCES)
    expect(all[0]!.date).toBe('2026-01-01')
    expect([...all].sort((a, b) => a.date.localeCompare(b.date))).toEqual(all)
  })

  it('an unreadable (listed) or invalid schedule has no occurrences', () => {
    expect(expand({ kind: 'listed' }, { from: '2000-01-01', to: '2100-01-01' })).toEqual([])
    const bad: Schedule = { kind: 'daily', startDate: '2026-11-08', endDate: '2026-11-02', start: '09:00', end: '10:00' }
    expect(expand(bad, { from: '2026-01-01', to: '2027-01-01' })).toEqual([])
  })
})

describe('scheduleProblems', () => {
  it('names what is wrong, in plain words', () => {
    expect(scheduleProblems({ kind: 'once', date: '2026-11-05', start: '17:00' })).toEqual([])
    expect(scheduleProblems({ kind: 'once', date: '2026-02-30', start: '17:00' })).toContain('A date is required.')
    expect(scheduleProblems({ kind: 'once', date: '2026-11-05', start: '25:00' }).join()).toMatch(/not a time/)
    expect(scheduleProblems({ kind: 'daily', startDate: '2026-11-08', endDate: '2026-11-02', start: '09:00', end: '10:00' })).toContain('The end date is before the start date.')
    expect(scheduleProblems({ kind: 'daily', startDate: '2026-01-01', endDate: '2028-12-31', start: '09:00', end: '10:00' }).join()).toMatch(/at most 731 days/)
    expect(scheduleProblems({ kind: 'weekly', startDate: '2026-01-01', endDate: '2026-02-01', everyWeeks: 0, slots: [] }).join()).toMatch(/1 to 52/)
    expect(scheduleProblems({ kind: 'weekly', startDate: '2026-01-01', endDate: '2026-02-01', everyWeeks: 1, slots: [] })).toContain('Choose at least one day of the week.')
    expect(scheduleProblems({ kind: 'monthly', startDate: '2026-01-01', endDate: '2026-12-01', everyMonths: 13, nth: 1, day: 1, start: '09:00', end: '10:00' }).join()).toMatch(/1 to 12/)
  })
})

describe('time zone', () => {
  it('converts station time to an instant, in standard and daylight time', () => {
    expect(zonedInstant('2026-11-03', '19:30').toISOString()).toBe('2026-11-04T01:30:00.000Z') // CST, UTC-6
    expect(zonedInstant('2026-07-04', '12:00').toISOString()).toBe('2026-07-04T17:00:00.000Z') // CDT, UTC-5
  })
  it('an occurrence with no end runs three hours; one ending before its start ends after midnight', () => {
    expect(occurrenceEnd({ date: '2026-11-03', start: '19:30', end: null }).toISOString()).toBe('2026-11-04T04:30:00.000Z')
    expect(occurrenceEnd({ date: '2026-11-03', start: '22:00', end: '01:00' }).toISOString()).toBe('2026-11-04T07:00:00.000Z')
    expect(occurrenceEnd({ date: '2026-11-03', start: '19:30', end: '21:30' }).toISOString()).toBe('2026-11-04T03:30:00.000Z')
  })
  it('an occurrence is upcoming until it ends', () => {
    const o = { date: '2026-11-03', start: '19:30', end: '21:30' }
    expect(isUpcoming(o, new Date('2026-11-04T03:00:00Z'))).toBe(true)
    expect(isUpcoming(o, new Date('2026-11-04T03:30:00Z'))).toBe(false)
  })
  it('today is the station\'s date, not UTC\'s', () => {
    expect(stationToday(new Date('2026-11-04T03:00:00Z'))).toBe('2026-11-03')
    expect(stationToday(new Date('2026-11-04T07:00:00Z'))).toBe('2026-11-04')
  })
})

describe('words', () => {
  it('writes clock times the way listeners read them', () => {
    expect(clock('00:05')).toBe('12:05 AM')
    expect(clock('12:00')).toBe('12:00 PM')
    expect(clock('19:30')).toBe('7:30 PM')
  })
  it('describes each kind in a sentence, and says nothing for a listed one', () => {
    expect(describeSchedule({ kind: 'once', date: '2026-11-05', start: '17:00', end: '18:00' })).toBe('Nov 5, 2026, 5:00 PM – 6:00 PM')
    expect(describeSchedule({ kind: 'once', date: '2026-11-05', start: '17:00' })).toBe('Nov 5, 2026, 5:00 PM')
    expect(describeSchedule({ kind: 'daily', startDate: '2026-11-02', endDate: '2026-11-08', start: '19:30', end: '21:30' })).toBe('Every day, 7:30 PM – 9:30 PM, Nov 2, 2026 through Nov 8, 2026')
    expect(describeSchedule({ kind: 'monthly', startDate: '2026-11-01', endDate: '2027-02-28', everyMonths: 1, nth: 'last', day: 5, start: '12:00', end: '13:00' })).toBe(
      'Every month on the last Friday, 12:00 PM – 1:00 PM, Nov 1, 2026 through Feb 28, 2027',
    )
    expect(describeSchedule({ kind: 'weekly', startDate: '2026-11-04', endDate: '2026-12-31', everyWeeks: 2, slots: [{ day: 2, start: '18:00', end: '19:00' }] })).toBe(
      'Every 2 weeks on Tuesday 6:00 PM – 7:00 PM, Nov 4, 2026 through Dec 31, 2026',
    )
    expect(describeSchedule({ kind: 'listed' })).toBeNull()
  })
  it('gives the first and last date a schedule touches', () => {
    expect(scheduleBounds({ kind: 'once', date: '2026-11-05', start: '17:00' })).toEqual({ first: '2026-11-05', last: '2026-11-05' })
    expect(scheduleBounds({ kind: 'daily', startDate: '2026-11-02', endDate: '2026-11-08', start: '19:30', end: '21:30' })).toEqual({ first: '2026-11-02', last: '2026-11-08' })
    expect(scheduleBounds({ kind: 'listed' })).toBeNull()
  })
})
