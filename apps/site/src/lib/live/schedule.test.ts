import { describe, expect, it } from 'vitest'

import {
  currentPrograms,
  dayNames,
  formatClock,
  formatSpan,
  isCadenceChannelId,
  nextChange,
  parseCadenceWeek,
  parseCadenceWidget,
  programsOn,
  stationDate,
  stationWeek,
} from './schedule'

// The shape Cadence's "now" widget returned for WUWF 88.1 on 2026-11-07 (trimmed).
const sample = {
  onNow: {
    programName: 'Echoes',
    program: { name: 'Echoes', programName: 'Echoes', format: 'New Age' },
    programLink: 'http://wuwf.org/programs/echoes',
    start: { utc: '2026-11-07T04:00:00Z', local: '2026-11-06T22:00:00-06:00', timezone: 'America/Chicago' },
    end: { utc: '2026-11-07T05:59:00Z', local: '2026-11-06T23:59:00-06:00', timezone: 'America/Chicago' },
  },
  upNext: {
    programName: 'BBC World',
    program: { programName: 'BBC World' },
    programLink: 'https://www.bbc.co.uk/worldserviceradio',
    start: { utc: '2026-11-07T06:00:00Z' },
    end: { utc: '2026-11-07T11:00:00Z' },
  },
}
const at = (iso: string) => Date.parse(iso)

describe('parseCadenceWidget', () => {
  it('reads the program, its times and its link (upgraded to https)', () => {
    expect(parseCadenceWidget(sample)).toEqual({
      onNow: { name: 'Echoes', start: '2026-11-07T04:00:00.000Z', end: '2026-11-07T05:59:00.000Z', link: 'https://wuwf.org/programs/echoes' },
      upNext: { name: 'BBC World', start: '2026-11-07T06:00:00.000Z', end: '2026-11-07T11:00:00.000Z', link: 'https://www.bbc.co.uk/worldserviceradio' },
    })
  })

  it('leaves out anything malformed instead of guessing', () => {
    expect(parseCadenceWidget(null)).toEqual({ onNow: null, upNext: null })
    expect(parseCadenceWidget({ onNow: { programName: 'No times' } }).onNow).toBeNull()
    expect(parseCadenceWidget({ onNow: { ...sample.onNow, end: { utc: '2026-11-07T03:00:00Z' } } }).onNow).toBeNull()
    expect(parseCadenceWidget({ onNow: { ...sample.onNow, programLink: 'javascript:alert(1)' } }).onNow?.link).toBeNull()
  })
})

describe('currentPrograms', () => {
  const data = parseCadenceWidget(sample)

  it('shows on now and up next during the program', () => {
    const r = currentPrograms(data, at('2026-11-07T05:00:00Z'))
    expect([r.onNow?.name, r.upNext?.name]).toEqual(['Echoes', 'BBC World'])
  })

  it('never shows a program after it ends', () => {
    const r = currentPrograms(data, at('2026-11-07T05:59:30Z'))
    expect([r.onNow, r.upNext?.name]).toEqual([null, 'BBC World'])
  })

  it('moves up next up once it starts', () => {
    const r = currentPrograms(data, at('2026-11-07T06:30:00Z'))
    expect([r.onNow?.name, r.upNext]).toEqual(['BBC World', null])
  })

  it('leaves out up next when the same program simply continues', () => {
    const allDay = parseCadenceWidget({
      onNow: { programName: 'Classical 24', start: { utc: '2026-11-06T06:00:00Z' }, end: { utc: '2026-11-07T05:59:59Z' } },
      upNext: { programName: 'Classical 24', start: { utc: '2026-11-07T06:00:00Z' }, end: { utc: '2026-11-08T05:59:59Z' } },
    })
    const r = currentPrograms(allDay, at('2026-11-07T05:00:00Z'))
    expect([r.onNow?.name, r.upNext]).toEqual(['Classical 24', null])
  })

  it('shows nothing once everything cached has ended', () => {
    expect(currentPrograms(data, at('2026-11-07T12:00:00Z'))).toEqual({ onNow: null, upNext: null })
  })

  it('knows when the answer next changes', () => {
    expect(nextChange(data, at('2026-11-07T05:00:00Z'))).toBe(at('2026-11-07T05:59:00Z'))
    expect(nextChange(data, at('2026-11-07T12:00:00Z'))).toBeNull()
  })
})

describe('formatting in station time', () => {
  it('uses AP style in Central time', () => {
    expect(formatClock('2026-11-07T04:00:00Z')).toBe('10:00 p.m.')
    expect(formatClock('2026-11-07T15:30:00Z')).toBe('9:30 a.m.')
  })

  it('joins a span, naming a.m./p.m. once when both ends share it', () => {
    expect(formatSpan({ start: '2026-11-07T04:00:00Z', end: '2026-11-07T05:59:00Z' })).toBe('10:00 – 11:59 p.m.')
    expect(formatSpan({ start: '2026-11-07T05:00:00Z', end: '2026-11-07T11:00:00Z' })).toBe('11:00 p.m. – 5:00 a.m.')
  })
})

describe('isCadenceChannelId', () => {
  it('takes a UUID only', () => {
    expect(isCadenceChannelId('eed45825-935f-4185-8b47-059fcc96a6a6')).toBe(true)
    expect(isCadenceChannelId('../../admin')).toBe(false)
    expect(isCadenceChannelId(undefined)).toBe(false)
  })
})


const ep = (name: string, start: string, end: string, extra: Record<string, unknown> = {}) => ({
  episode: { programName: name, priority: 0, songs: [], start: { utc: start }, end: { utc: end }, ...extra },
  programLink: `https://wuwf.org/programs/${name.toLowerCase().replace(/\W+/g, '-')}`,
})

describe('the week', () => {
  it('reads and sorts Cadence’s week, with descriptions', () => {
    const week = parseCadenceWeek({
      total: 2,
      episodes: [
        { ...ep('1A', '2026-11-02T15:00:00Z', '2026-11-02T17:00:00Z'), programDescription: ' A conversation. ' },
        ep('Morning Edition', '2026-11-02T11:00:00Z', '2026-11-02T15:00:00Z'),
      ],
    })
    expect(week.map((p) => [p.name, p.description])).toEqual([
      ['Morning Edition', null],
      ['1A', 'A conversation.'],
    ])
  })

  it('lets a higher priority win an overlap, and drops the other', () => {
    const week = parseCadenceWeek({
      episodes: [ep('Regular', '2026-11-02T20:00:00Z', '2026-11-02T22:00:00Z'), ep('Special', '2026-11-02T20:00:00Z', '2026-11-02T21:00:00Z', { priority: 4 })],
    })
    expect(week.map((p) => p.name)).toEqual(['Special'])
  })

  it('never throws on junk', () => {
    expect(parseCadenceWeek({ episodes: [null, 3, { episode: {} }] })).toEqual([])
    expect(parseCadenceWeek('x')).toEqual([])
  })

  it('works in station time: days, the week, and which day a program starts', () => {
    // 11:30 p.m. Friday in Pensacola is already Saturday in UTC.
    expect(stationDate('2026-11-07T05:30:00Z')).toEqual({ date: '2026-11-06', weekday: 4 })
    expect(stationWeek(Date.parse('2026-11-07T05:30:00Z'))).toMatchObject({ startDate: '2026-11-02', endDate: '2026-11-08' })
    // Sunday night still belongs to the week that began on Monday.
    expect(stationWeek(Date.parse('2026-11-09T05:00:00Z')).startDate).toBe('2026-11-02')
    const week = parseCadenceWeek({ episodes: [ep('Echoes', '2026-11-07T04:00:00Z', '2026-11-07T05:59:00Z'), ep('BBC World', '2026-11-07T06:00:00Z', '2026-11-07T11:00:00Z')] })
    expect(programsOn(week, '2026-11-06').map((p) => p.name)).toEqual(['Echoes'])
    expect(programsOn(week, '2026-11-07').map((p) => p.name)).toEqual(['BBC World'])
    expect(dayNames('2026-11-06')).toEqual({ short: 'Fri', long: 'Friday, November 6' })
  })
})
