import { describe, expect, it } from 'vitest'

import { currentPrograms, formatClock, formatSpan, isCadenceChannelId, nextChange, parseCadenceWidget } from './schedule'

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
