import { describe, expect, it } from 'vitest'

import { LEAD_ROW, NEWS_RUN_COUNT, newsRunCount, restGridClass } from './modules'

describe('restGridClass', () => {
  it('runs two stories two across, four stories four across on a wide screen, and the rest three across', () => {
    expect(restGridClass(2)).toBe('sm:grid-cols-2')
    expect(restGridClass(4)).toBe('sm:grid-cols-2 lg:grid-cols-4')
    for (const n of [1, 3, 5, 6, 7]) expect(restGridClass(n), `${n} left`).toBe('sm:grid-cols-2 lg:grid-cols-3')
  })
  it('is two across on a tablet in every case', () => {
    for (let n = 1; n <= 7; n++) expect(restGridClass(n), `${n} left`).toContain('sm:grid-cols-2')
  })
  it('leaves a whole last row on a wide screen for the runs of 3, 4, 5 and 7 stories (a lead and 2, 3, 4 or 6), and a short one only for 6', () => {
    const wide = (n: number) => (/lg:grid-cols-(\d)/.exec(restGridClass(n)) ?? [null, '2'])[1] as string
    const whole = (count: number) => (count - 1) % Number(wide(count - 1)) === 0
    expect([3, 4, 5, 7].map(whole)).toEqual([true, true, true, true])
    expect(whole(6)).toBe(false)
  })
})

describe('LEAD_ROW', () => {
  it('is a row from a tablet up, picture left at two fifths of the row and the words centred, with a larger headline', () => {
    expect(LEAD_ROW.card).toContain('sm:flex-row')
    expect(LEAD_ROW.frame).toContain('sm:w-2/5')
    expect(LEAD_ROW.body).toContain('sm:justify-center')
    expect(LEAD_ROW.title).toContain('lg:text-3xl')
  })
  it('keeps the picture\'s 3:2 shape: it never turns the frame to auto height', () => {
    expect(LEAD_ROW.frame).not.toContain('aspect-auto')
    expect(LEAD_ROW.frame).not.toContain('before:')
  })
})

describe('newsRunCount', () => {
  it('holds a count to 3 to 7, rounds it, and takes 5 for anything that is not a number', () => {
    expect([8, 20, 7, 3, 2, 0, 4.6].map(newsRunCount)).toEqual([7, 7, 7, 3, 3, 3, 5])
    for (const bad of [null, undefined, Number.NaN, Infinity]) expect(newsRunCount(bad as never), String(bad)).toBe(5)
    expect(NEWS_RUN_COUNT).toEqual({ min: 3, max: 7, standard: 5 })
  })
})
