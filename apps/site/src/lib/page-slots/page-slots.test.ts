import { describe, expect, it } from 'vitest'

import { claimInOrder, planSlots } from './index'

describe('planSlots', () => {
  const t = (n: number) => Array.from({ length: n }, (_, i) => `T${i + 1}`)
  it('puts a row of three after the first news run and after the third, and the top unit where the page draws it', () => {
    const plan = planSlots({ top: 'TOP', rail: t(6), fillers: [] }, 3)
    expect(plan.top).toBe('TOP')
    expect(plan.after.map((r) => r?.map((i) => i.tile) ?? null)).toEqual([['T1', 'T2', 'T3'], null, ['T4', 'T5', 'T6']])
    expect(plan.trailing).toEqual([])
  })
  it('never drops a tile that runs: rows past the last place follow the last run', () => {
    const plan = planSlots({ top: null, rail: t(9), fillers: [] }, 3)
    expect(plan.trailing.map((r) => r.map((i) => i.tile))).toEqual([['T7', 'T8', 'T9']])
    expect([...plan.after.flatMap((r) => r ?? []), ...plan.trailing.flat()].map((i) => i.tile)).toEqual(t(9))
  })
  it('with no run at all draws every row after the content', () => {
    const plan = planSlots({ top: null, rail: t(4), fillers: [] }, 0)
    expect(plan.after).toEqual([])
    expect(plan.trailing.flat().map((i) => i.tile)).toEqual(t(4))
  })
  it('completes a short last row with the promotions marked for it, and marks them', () => {
    const plan = planSlots({ top: null, rail: t(4), fillers: ['F1', 'F2'] }, 3)
    expect(plan.after[2]?.map((i) => [i.tile, i.filler])).toEqual([['T4', false], ['F1', true], ['F2', true]])
  })
})

describe('claimInOrder', () => {
  it('gives each section the newest of its candidates that nothing earlier took', () => {
    const out = claimInOrder([
      { key: 'a', candidates: [1, 2, 3, 4], take: 2 },
      { key: 'b', candidates: [2, 3, 5, 6, 7], take: 3 },
    ])
    expect(out.get('a')).toEqual([1, 2])
    expect(out.get('b')).toEqual([3, 5, 6])
  })
  it('leaves out what the page already shows above, whatever the type of the id', () => {
    const out = claimInOrder([{ key: 'a', candidates: [1, '2', 3], take: 3 }], [2])
    expect(out.get('a')).toEqual([1, 3])
  })
  it('keeps a pinned story first, in its place, and stops at the count', () => {
    const out = claimInOrder([
      { key: 'lead', pinned: [9], candidates: [1, 2, 3], take: 2 },
      { key: 'next', candidates: [9, 1, 2, 3, 4], take: 3 },
    ])
    expect(out.get('lead')).toEqual([9, 1])
    expect(out.get('next')).toEqual([2, 3, 4])
  })
  it('gives a section with nothing left an empty list, and takes nothing for a count of zero', () => {
    const out = claimInOrder([
      { key: 'a', candidates: [1], take: 1 },
      { key: 'b', candidates: [1], take: 3 },
      { key: 'c', candidates: [5], take: 0 },
    ])
    expect(out.get('b')).toEqual([])
    expect(out.get('c')).toEqual([])
  })
})
