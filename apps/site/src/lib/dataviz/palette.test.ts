import { colors, contrastRatio } from '@wuwf/design-tokens'
import { describe, expect, it } from 'vitest'

import { equalSteps } from './classes'
import { MAX_SERIES } from './spec'
import { BASE_SHAPE_COLOR, NO_DATA_COLOR, SERIES_COLORS, blueRamp } from './palette'

describe('series colours', () => {
  it('has enough colours for the most series a chart may have', () => {
    expect(SERIES_COLORS.length).toBeGreaterThanOrEqual(MAX_SERIES)
    expect(new Set(SERIES_COLORS).size).toBe(SERIES_COLORS.length)
  })
  it.each(SERIES_COLORS)('%s reaches 3:1 against the page (graphics need 3:1)', (c) => {
    expect(contrastRatio(c, colors.surface)).toBeGreaterThanOrEqual(3)
  })
})

describe('the blue ramp', () => {
  it('runs from the light blue to the deep blue, with one colour per step, getting darker', () => {
    const r = blueRamp(5)
    expect(r[0]).toBe(colors['wuwf-blue-100'])
    expect(r.at(-1)).toBe(colors['wuwf-blue-700'])
    const lum = r.map((c) => contrastRatio(c, colors.surface))
    expect([...lum].sort((a, b) => a - b)).toEqual(lum)
  })
  it('keeps the no-data grey apart from every step', () => {
    expect(blueRamp(7)).not.toContain(NO_DATA_COLOR)
    expect(BASE_SHAPE_COLOR).toBeTruthy()
  })
})

describe('equal steps', () => {
  const ramp = blueRamp(5)
  it('sorts values into equal intervals and colours no value grey', () => {
    const c = equalSteps([0, 10, 20, 30, 40, 50, 100], 5, ramp, NO_DATA_COLOR)!
    expect(c.edges).toEqual([0, 20, 40, 60, 80, 100])
    expect(c.colorOf(0)).toBe(ramp[0])
    expect(c.colorOf(100)).toBe(ramp[4])
    expect(c.colorOf(null)).toBe(NO_DATA_COLOR)
  })
  it('gives one step when every value is the same, and nothing when there are no values', () => {
    expect(equalSteps([7, 7], 5, ramp, NO_DATA_COLOR)!.edges).toEqual([7, 7])
    expect(equalSteps([], 5, ramp, NO_DATA_COLOR)).toBeNull()
  })
})
