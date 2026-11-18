import { describe, expect, it } from 'vitest'

import { ALL_STORIES_HREF, fallbackModule, fillModules, MODULE_COUNT, moduleCount } from './modules'

const story = (id: number) => ({ id })
const run = (...ids: number[]) => ids.map(story)

describe('moduleCount', () => {
  it('keeps the count within three to eight, and uses the fallback for anything that is not a number', () => {
    expect(moduleCount(5)).toBe(5)
    expect(moduleCount(1)).toBe(MODULE_COUNT.min)
    expect(moduleCount(40)).toBe(MODULE_COUNT.max)
    expect(moduleCount(4.6)).toBe(5)
    expect(moduleCount(null)).toBe(MODULE_COUNT.fallback)
    expect(moduleCount(undefined)).toBe(MODULE_COUNT.fallback)
    expect(moduleCount(Number.NaN)).toBe(MODULE_COUNT.fallback)
  })
})

describe('fillModules', () => {
  const req = (key: string, count: number, candidates: { id: number }[], href: string | null = `/${key}`) => ({ key, heading: key, href, count, candidates })

  it('fills each module with the newest of its section, up to its count, in the order given', () => {
    const out = fillModules([req('local', 3, run(1, 2, 3, 4, 5)), req('arts', 2, run(10, 11, 12))], [])
    expect(out.map((m) => [m.key, m.stories.map((s) => s.id)])).toEqual([['local', [1, 2, 3]], ['arts', [10, 11]]])
  })

  it('shows a story once: not if the lead, Briefing or feature has it, and not twice across modules', () => {
    const out = fillModules([req('local', 3, run(1, 2, 3, 4, 5)), req('florida', 3, run(3, 4, 5, 6, 7))], run(1, 2))
    expect(out[0]!.stories.map((s) => s.id)).toEqual([3, 4, 5])
    // 3, 4 and 5 went to the first module, so the second takes what is left of its own section.
    expect(out[1]!.stories.map((s) => s.id)).toEqual([6, 7])
  })

  it('treats ids as the same whether a number or a string', () => {
    const out = fillModules([req('a', 3, [{ id: '1' }, { id: '2' }] as never)], [{ id: 1 }])
    expect(out[0]!.stories).toEqual([{ id: '2' }])
  })

  it('leaves out a module with nothing to show, and keeps the rest in order', () => {
    const out = fillModules([req('empty', 3, []), req('used', 3, run(1)), req('ok', 3, run(2, 3))], run(1))
    expect(out.map((m) => m.key)).toEqual(['ok'])
  })

  it('keeps the heading and the section address it was given', () => {
    const [m] = fillModules([{ key: 'k', heading: 'Music & Arts', href: '/music-arts', count: 3, candidates: run(1) }], [])
    expect(m).toMatchObject({ heading: 'Music & Arts', href: '/music-arts' })
  })

  it('takes nothing for a count of zero or less', () => {
    expect(fillModules([req('a', 0, run(1, 2))], [])).toEqual([])
  })
})

describe('fallbackModule', () => {
  it('stands in with the newest stories nothing above shows, linking to all of them', () => {
    const m = fallbackModule(run(1, 2, 3, 4), run(1), 2)
    expect(m).toEqual({ key: 'latest', heading: 'Latest stories', href: ALL_STORIES_HREF, stories: run(2, 3) })
  })
  it('is null when nothing is left, so no empty block is drawn', () => {
    expect(fallbackModule(run(1), run(1))).toBeNull()
    expect(fallbackModule([], [])).toBeNull()
  })
})
