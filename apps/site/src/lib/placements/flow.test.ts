import { describe, expect, it } from 'vitest'

import { FILLER_MAX, flowHomeRail, ROW_SIZE } from './flow'

const paid = (n: number) => Array.from({ length: n }, (_, i) => `P${i + 1}`)
const fill = (n: number) => Array.from({ length: n }, (_, i) => `F${i + 1}`)
const show = (row: { tile: string; filler: boolean }[] | null) => (row ? row.map((x) => (x.filler ? `${x.tile}*` : x.tile)) : null)
const rows = (f: ReturnType<typeof flowHomeRail<string>>) => [...f.before.map(show), ...f.after.map(show)].filter((r) => r !== null)

describe('flowHomeRail: rows of three between sections', () => {
  it('puts a row of three above each section in order, starting above the first', () => {
    const f = flowHomeRail({ tiles: paid(9), fillers: [], sections: 5 })
    expect(f.before.map(show)).toEqual([['P1', 'P2', 'P3'], ['P4', 'P5', 'P6'], ['P7', 'P8', 'P9'], null, null])
    expect(f.after).toEqual([])
  })
  it('keeps the tiles of a short last row together, centered by the screen, when there is nothing to complete it', () => {
    const f = flowHomeRail({ tiles: paid(10), fillers: [], sections: 5 })
    expect(f.before.map(show)).toEqual([['P1', 'P2', 'P3'], ['P4', 'P5', 'P6'], ['P7', 'P8', 'P9'], ['P10'], null])
  })
  it('puts the rows that do not fit above a section after the last one, so no tile is lost', () => {
    const f = flowHomeRail({ tiles: paid(10), fillers: [], sections: 2 })
    expect(f.before.map(show)).toEqual([['P1', 'P2', 'P3'], ['P4', 'P5', 'P6']])
    expect(f.after.map(show)).toEqual([['P7', 'P8', 'P9'], ['P10']])
  })
  it('puts every row after the videos when there are no sections', () => {
    const f = flowHomeRail({ tiles: paid(4), fillers: [], sections: 0 })
    expect(f.before).toEqual([])
    expect(f.after.map(show)).toEqual([['P1', 'P2', 'P3'], ['P4']])
  })
  it('is empty with no tiles, and leaves every section without a row', () => {
    const f = flowHomeRail({ tiles: [], fillers: fill(2), sections: 3 })
    expect(f.before).toEqual([null, null, null])
    expect(f.after).toEqual([])
  })
  it('never loses, repeats or reorders a paid tile, whatever the counts', () => {
    for (let n = 0; n <= 12; n++) {
      for (let s = 0; s <= 6; s++) {
        const f = flowHomeRail({ tiles: paid(n), fillers: fill(2), sections: s })
        const drawn = [...f.before.flatMap((r) => r ?? []), ...f.after.flat()].filter((x) => !x.filler).map((x) => x.tile)
        expect(drawn).toEqual(paid(n))
        expect(f.before).toHaveLength(s)
      }
    }
  })
  it('never makes a row longer than three', () => {
    for (let n = 0; n <= 12; n++) {
      for (const r of rows(flowHomeRail({ tiles: paid(n), fillers: fill(2), sections: 3 }))) expect(r!.length).toBeLessThanOrEqual(ROW_SIZE)
    }
  })
})

describe('flowHomeRail: completing the last row with promotions', () => {
  it('adds nothing when every row is whole', () => {
    expect(rows(flowHomeRail({ tiles: paid(6), fillers: fill(2), sections: 4 }))).toEqual([['P1', 'P2', 'P3'], ['P4', 'P5', 'P6']])
  })
  it('one tile left takes two promotions, and two tiles left take one', () => {
    expect(rows(flowHomeRail({ tiles: paid(4), fillers: fill(2), sections: 4 }))).toEqual([['P1', 'P2', 'P3'], ['P4', 'F1*', 'F2*']])
    expect(rows(flowHomeRail({ tiles: paid(5), fillers: fill(2), sections: 4 }))).toEqual([['P1', 'P2', 'P3'], ['P4', 'P5', 'F1*']])
  })
  it('uses only the promotions there are, never inventing one, and never more than a row can need', () => {
    expect(rows(flowHomeRail({ tiles: paid(4), fillers: fill(1), sections: 4 }))).toEqual([['P1', 'P2', 'P3'], ['P4', 'F1*']])
    expect(rows(flowHomeRail({ tiles: paid(4), fillers: [], sections: 4 }))).toEqual([['P1', 'P2', 'P3'], ['P4']])
    expect(flowHomeRail({ tiles: paid(4), fillers: fill(9), sections: 4 }).before[1]).toHaveLength(ROW_SIZE)
    expect(FILLER_MAX).toBe(2)
  })
  it('completes the last row wherever it lands, above a section or after the last', () => {
    expect(flowHomeRail({ tiles: paid(4), fillers: fill(2), sections: 1 }).after.map(show)).toEqual([['P4', 'F1*', 'F2*']])
  })
  it('never makes a row of promotions alone: with no tiles there are no rows', () => {
    expect(rows(flowHomeRail({ tiles: [], fillers: fill(2), sections: 3 }))).toEqual([])
  })
})
