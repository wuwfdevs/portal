import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { PERIODS } from '@/lib/unearthing/periods'

import { PERIOD_YEARS, periodYears } from './period-years'
import { allowedYears, episodeSpan, formatSpan, formatYear, histogram, inWindow, positionOf, scaleFor, scaleTicks, snapYear, stepYear, validYear, yearAt } from './years'

const THIS_YEAR = 2026
const scale = scaleFor(THIS_YEAR)

describe('years', () => {
  it('writes a year the way the board does', () => {
    expect(formatYear(-10000)).toBe('10,000 BCE')
    expect(formatYear(-1000)).toBe('1,000 BCE')
    expect(formatYear(1)).toBe('1 CE')
    expect(formatYear(1513)).toBe('1513')
    expect(formatSpan(1513, 1821)).toBe('1513 – 1821')
    expect(formatSpan(1566, 1566)).toBe('1566')
  })
  it('accepts a whole year other than 0 within the scale', () => {
    for (const ok of [-10000, -1, 1, 1513, 2026]) expect(validYear(ok)).toBe(true)
    for (const bad of [0, 1.5, '1513', null, undefined, -10001, 5000, NaN]) expect(validYear(bad)).toBe(false)
  })
})

describe('an episode\'s span', () => {
  it('is its own years, read the right way round', () => {
    expect(episodeSpan({ yearStart: 1513, yearEnd: 1821 })).toEqual({ from: 1513, to: 1821 })
    expect(episodeSpan({ yearStart: 1821, yearEnd: 1513 })).toEqual({ from: 1513, to: 1821 })
    expect(episodeSpan({ yearStart: 1566 })).toEqual({ from: 1566, to: 1566 })
  })
  it('falls back to its period\'s span, then to nothing', () => {
    expect(episodeSpan({ period: 'first-spanish' })).toEqual({ from: 1513, to: 1763 })
    expect(episodeSpan({ yearStart: 1700, period: 'first-spanish' })).toEqual({ from: 1700, to: 1700 })
    expect(episodeSpan({ period: 'nonsense' })).toBeNull()
    expect(episodeSpan({})).toBeNull()
  })
  it('is in a window it overlaps, ends included, and an episode with no span is always in', () => {
    const w = { from: 1513, to: 1821 }
    expect(inWindow({ from: 1500, to: 1513 }, w)).toBe(true)
    expect(inWindow({ from: 1821, to: 1900 }, w)).toBe(true)
    expect(inWindow({ from: 1822, to: 1900 }, w)).toBe(false)
    expect(inWindow({ from: -5000, to: 1000 }, w)).toBe(false)
    expect(inWindow(null, w)).toBe(true)
  })
})

describe('the stepped scale', () => {
  it('changes grain at 1000 BCE and at 1500, and its shares fill the track', () => {
    expect(scale.map((s) => [s.from, s.to, s.step])).toEqual([[-10000, -1000, 500], [-1000, 1500, 25], [1500, 2026, 1]])
    expect(scale.reduce((n, s) => n + s.share, 0)).toBeCloseTo(1)
  })
  it('places years on the track, monotonically, from 0 to 1', () => {
    expect(positionOf(scale, -10000)).toBe(0)
    expect(positionOf(scale, -1000)).toBeCloseTo(0.2)
    expect(positionOf(scale, 1500)).toBeCloseTo(0.5)
    expect(positionOf(scale, THIS_YEAR)).toBeCloseTo(1)
    const years = [-9000, -2000, -500, 1, 1000, 1513, 1800, 2000]
    const pos = years.map((y) => positionOf(scale, y))
    expect([...pos].sort((a, b) => a - b)).toEqual(pos)
  })
  it('only offers years on a grid: 500 apart, then 25, then 1, with no year 0', () => {
    const allowed = allowedYears(scale)
    expect(allowed[0]).toBe(-10000)
    expect(allowed).toContain(-9500)
    expect(allowed).not.toContain(-9750)
    expect(allowed).toContain(-975)
    expect(allowed).not.toContain(0)
    expect(allowed).toContain(1)
    expect(allowed).toContain(1513)
    expect(allowed).toContain(1514)
    expect(allowed.at(-1)).toBe(THIS_YEAR)
    expect(new Set(allowed).size).toBe(allowed.length)
    expect([...allowed].sort((a, b) => a - b)).toEqual(allowed)
  })
  it('snaps a place on the track to such a year and reads it back', () => {
    expect(yearAt(scale, 0)).toBe(-10000)
    expect(yearAt(scale, 1)).toBe(THIS_YEAR)
    const y = yearAt(scale, positionOf(scale, 1566))
    expect(y).toBe(1566)
    expect(snapYear(allowedYears(scale), -9800)).toBe(-10000)
  })
  it('steps a handle one grain at a time, crossing into the next grain at an edge, and stops at the ends', () => {
    expect(stepYear(scale, -10000, 1)).toBe(-9500)
    expect(stepYear(scale, -1500, 1)).toBe(-1000)
    expect(stepYear(scale, -1000, 1)).toBe(-975)
    expect(stepYear(scale, -25, 1)).toBe(1)
    expect(stepYear(scale, 1, -1)).toBe(-25)
    expect(stepYear(scale, 1475, 1)).toBe(1500)
    expect(stepYear(scale, 1500, 1)).toBe(1501)
    expect(stepYear(scale, 1500, -1)).toBe(1475)
    expect(stepYear(scale, -10000, -1)).toBe(-10000)
    expect(stepYear(scale, THIS_YEAR, 1)).toBe(THIS_YEAR)
  })
  it('labels the track the way the board does', () => {
    expect(scaleTicks(scale, THIS_YEAR).map((t) => t.label)).toEqual(['10,000 BCE', '1,000 BCE', '1 CE', '1500', '1800', 'Today'])
  })
})

describe('the histogram', () => {
  it('counts the episodes that touch each slice of the track, ignores one with no span, and reports the tallest', () => {
    const { counts, max } = histogram([{ from: 1800, to: 1850 }, { from: 1810, to: 1812 }, null, { from: -10000, to: -9000 }], scale, 10)
    expect(counts).toHaveLength(10)
    expect(counts[0]).toBe(1)
    expect(counts.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(3)
    expect(max).toBe(Math.max(...counts))
    expect(histogram([], scale, 4)).toEqual({ counts: [0, 0, 0, 0], max: 0 })
  })
})

describe('the period table', () => {
  it('covers every period on the episode form, each a span that runs forwards', () => {
    for (const p of PERIODS) {
      const span = periodYears(p.value)
      expect(span, p.value).not.toBeNull()
      expect(span![0]).toBeLessThanOrEqual(span![1])
    }
    expect(Object.keys(PERIOD_YEARS).sort()).toEqual(PERIODS.map((p) => p.value).sort())
  })
  it('is the same table the migration seeds from', () => {
    const sql = readFileSync(path.resolve(process.cwd(), 'src/migrations/20261123_013206_unearthing_explore.ts'), 'utf8')
    for (const [period, [from, to]] of Object.entries(PERIOD_YEARS)) expect(sql, period).toContain(`('${period}', ${from}, ${to})`)
  })
})
