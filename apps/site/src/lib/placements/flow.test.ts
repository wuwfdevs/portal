import { describe, expect, it } from 'vitest'

import { FILLER_MAX, flowHomeRail, holdsPair } from './flow'

const paid = (n: number) => Array.from({ length: n }, (_, i) => `P${i + 1}`)
const fill = (n: number) => Array.from({ length: n }, (_, i) => `F${i + 1}`)
const foot = (f: ReturnType<typeof flowHomeRail<string>>) => f.foot.map((x) => (x.filler ? `${x.tile}@${x.from}` : x.tile))

describe('holdsPair', () => {
  it('is true for a section tall enough for two tiles', () => {
    expect(holdsPair(2)).toBe(false)
    expect(holdsPair(3)).toBe(true)
    expect(holdsPair(6)).toBe(true)
  })
})

describe('flowHomeRail: pairs beside sections', () => {
  it('gives each tall section a pair, in order, and keeps the rest for the foot row', () => {
    const f = flowHomeRail({ tiles: paid(7), fillers: [], slots: [true, true, true] })
    expect(f.beside).toEqual([['P1', 'P2'], ['P3', 'P4'], ['P5', 'P6']])
    expect(foot(f)).toEqual(['P7'])
  })
  it('skips a section that is too short, without losing a tile', () => {
    const f = flowHomeRail({ tiles: paid(4), fillers: [], slots: [false, true, true] })
    expect(f.beside).toEqual([null, ['P1', 'P2'], ['P3', 'P4']])
    expect(f.foot).toEqual([])
  })
  it('never gives a section a single tile: an odd one out goes to the foot row', () => {
    const f = flowHomeRail({ tiles: paid(3), fillers: [], slots: [true, true] })
    expect(f.beside).toEqual([['P1', 'P2'], null])
    expect(foot(f)).toEqual(['P3'])
  })
  it('puts every tile in the foot row when no section can hold a pair', () => {
    const f = flowHomeRail({ tiles: paid(5), fillers: [], slots: [] })
    expect(f.beside).toEqual([])
    expect(foot(f)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5'])
  })
  it('never loses or repeats a tile', () => {
    for (let n = 0; n <= 10; n++) {
      for (let s = 0; s <= 6; s++) {
        const f = flowHomeRail({ tiles: paid(n), fillers: fill(3), slots: Array(s).fill(true) })
        const shown = [...f.beside.flatMap((p) => (p ? [...p] : [])), ...f.foot.filter((x) => !x.filler).map((x) => x.tile)]
        expect(shown).toEqual(paid(n))
      }
    }
  })
})

describe('flowHomeRail: completing the foot row with promotions', () => {
  it('adds nothing when the foot row is empty or already whole', () => {
    expect(flowHomeRail({ tiles: paid(2), fillers: fill(3), slots: [true] }).foot).toEqual([])
    expect(foot(flowHomeRail({ tiles: paid(4), fillers: fill(3), slots: [] }))).toEqual(['P1', 'P2', 'P3', 'P4'])
    expect(foot(flowHomeRail({ tiles: paid(8), fillers: fill(3), slots: [] }))).toHaveLength(8)
  })
  it('one tile left needs three: the first also completes a tablet row of two, the others only a wide row of four', () => {
    expect(foot(flowHomeRail({ tiles: paid(1), fillers: fill(3), slots: [] }))).toEqual(['P1', 'F1@sm', 'F2@lg', 'F3@lg'])
  })
  it('two left needs two for a wide row and none on a tablet, where two already fill a row', () => {
    expect(foot(flowHomeRail({ tiles: paid(2), fillers: fill(3), slots: [] }))).toEqual(['P1', 'P2', 'F1@lg', 'F2@lg'])
  })
  it('three left needs one, which completes both the tablet row and the wide row', () => {
    expect(foot(flowHomeRail({ tiles: paid(3), fillers: fill(3), slots: [] }))).toEqual(['P1', 'P2', 'P3', 'F1@sm'])
  })
  it('five left needs three for a wide row and one for a tablet row', () => {
    expect(foot(flowHomeRail({ tiles: paid(5), fillers: fill(3), slots: [] }))).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'F1@sm', 'F2@lg', 'F3@lg'])
  })
  it('uses only as many promotions as there are, never inventing one, and never more than a row can need', () => {
    expect(foot(flowHomeRail({ tiles: paid(1), fillers: fill(1), slots: [] }))).toEqual(['P1', 'F1@sm'])
    expect(foot(flowHomeRail({ tiles: paid(1), fillers: [], slots: [] }))).toEqual(['P1'])
    expect(flowHomeRail({ tiles: paid(1), fillers: fill(9), slots: [] }).foot.filter((x) => x.filler)).toHaveLength(FILLER_MAX)
  })
  it('fills out every row at every width whenever there are enough promotions', () => {
    for (let n = 1; n <= 10; n++) {
      const f = flowHomeRail({ tiles: paid(n), fillers: fill(3), slots: [] })
      const wide = f.foot.length
      const tablet = f.foot.filter((x) => !x.filler || x.from === 'sm').length
      expect(wide % 4).toBe(0)
      expect(tablet % 2).toBe(0)
    }
  })
})
