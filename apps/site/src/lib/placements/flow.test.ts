import { describe, expect, it } from 'vitest'

import { FILLER_MAX, flowHomeRail, ROW_SIZE } from './flow'

const paid = (n: number) => Array.from({ length: n }, (_, i) => `P${i + 1}`)
const fill = (n: number) => Array.from({ length: n }, (_, i) => `F${i + 1}`)
const show = (row: { tile: string; filler: boolean }[] | null) => (row ? row.map((x) => (x.filler ? `${x.tile}*` : x.tile)) : null)
const rows = (f: ReturnType<typeof flowHomeRail<string>>) => [...f.after.map(show), ...f.trailing.map(show)].filter((r) => r !== null)

describe('flowHomeRail: rows of three after every other news run', () => {
  it('puts a row after the first run, then the third, then the fifth', () => {
    const f = flowHomeRail({ tiles: paid(9), fillers: [], sections: 5 })
    expect(f.after.map(show)).toEqual([['P1', 'P2', 'P3'], null, ['P4', 'P5', 'P6'], null, ['P7', 'P8', 'P9']])
    expect(f.trailing).toEqual([])
  })
  it('gives the home page\'s three runs two bands, after the first and after the last: the zone\'s six', () => {
    const f = flowHomeRail({ tiles: paid(6), fillers: [], sections: 3 })
    expect(f.after.map(show)).toEqual([['P1', 'P2', 'P3'], null, ['P4', 'P5', 'P6']])
  })
  it('keeps the tiles of a short last row together, centered by the screen, when there is nothing to complete it', () => {
    const f = flowHomeRail({ tiles: paid(4), fillers: [], sections: 3 })
    expect(f.after.map(show)).toEqual([['P1', 'P2', 'P3'], null, ['P4']])
  })
  it('puts the rows that have no place after the last run, so no tile is lost', () => {
    const f = flowHomeRail({ tiles: paid(10), fillers: [], sections: 3 })
    expect(f.after.map(show)).toEqual([['P1', 'P2', 'P3'], null, ['P4', 'P5', 'P6']])
    expect(f.trailing.map(show)).toEqual([['P7', 'P8', 'P9'], ['P10']])
  })
  it('puts every row after the content when there are no runs', () => {
    const f = flowHomeRail({ tiles: paid(4), fillers: [], sections: 0 })
    expect(f.after).toEqual([])
    expect(f.trailing.map(show)).toEqual([['P1', 'P2', 'P3'], ['P4']])
  })
  it('is empty with no tiles, and leaves every run without a row', () => {
    const f = flowHomeRail({ tiles: [], fillers: fill(2), sections: 3 })
    expect(f.after).toEqual([null, null, null])
    expect(f.trailing).toEqual([])
  })
  it('never loses, repeats or reorders a paid tile, whatever the counts', () => {
    for (let n = 0; n <= 12; n++) {
      for (let s = 0; s <= 6; s++) {
        const f = flowHomeRail({ tiles: paid(n), fillers: fill(2), sections: s })
        const drawn = [...f.after.flatMap((r) => r ?? []), ...f.trailing.flat()].filter((x) => !x.filler).map((x) => x.tile)
        expect(drawn).toEqual(paid(n))
        expect(f.after).toHaveLength(s)
        // A row only ever follows the first, third, fifth... run.
        f.after.forEach((r, i) => (i % 2 === 1 ? expect(r).toBeNull() : undefined))
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
    expect(flowHomeRail({ tiles: paid(4), fillers: fill(9), sections: 4 }).after[2]).toHaveLength(ROW_SIZE)
    expect(FILLER_MAX).toBe(2)
  })
  it('completes the last row wherever it lands, after a run or past the last place', () => {
    expect(flowHomeRail({ tiles: paid(4), fillers: fill(2), sections: 1 }).trailing.map(show)).toEqual([['P4', 'F1*', 'F2*']])
  })
  it('never makes a row of promotions alone: with no tiles there are no rows', () => {
    expect(rows(flowHomeRail({ tiles: [], fillers: fill(2), sections: 3 }))).toEqual([])
  })
})
