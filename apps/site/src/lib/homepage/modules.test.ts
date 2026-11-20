import { describe, expect, it } from 'vitest'

import { ALL_STORIES_HREF, fallbackModule, fillModules, leadFrameClass, leadSpanClass, MODULE_COUNT, moduleCount, newsBand } from './modules'

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

describe('newsBand', () => {
  it('is drawn with the rail and the all-stories link when the sections have no stories left but the page has news', () => {
    expect(newsBand({ sectionRuns: 0, railTiles: 9, hasNews: true })).toEqual({ show: true, allStoriesLink: true })
    expect(newsBand({ sectionRuns: 0, railTiles: 0, hasNews: true })).toEqual({ show: true, allStoriesLink: true })
  })
  it('is drawn with the sections, and with a rail and no news (placements need no stories), but links to all stories only when there is news', () => {
    expect(newsBand({ sectionRuns: 3, railTiles: 0, hasNews: true })).toEqual({ show: true, allStoriesLink: true })
    expect(newsBand({ sectionRuns: 0, railTiles: 2, hasNews: false })).toEqual({ show: true, allStoriesLink: false })
  })
  it('is not drawn on a site with no news, no sections and nothing in the rail', () => {
    expect(newsBand({ sectionRuns: 0, railTiles: 0, hasNews: false })).toEqual({ show: false, allStoriesLink: false })
  })
})

describe('leadSpanClass', () => {
  // The grid is two columns on a tablet and three on a wide screen; the first card spans so no row is left short.
  const fills = (count: number) => {
    const cls = leadSpanClass(count)
    const tabletLead = cls.includes('sm:col-span-2') ? 2 : 1
    const wideLead = cls.includes('lg:col-span-3') ? 3 : cls.includes('lg:col-span-2') ? 2 : 1
    return { tablet: (count - 1 + tabletLead) % 2 === 0, wide: (count - 1 + wideLead) % 3 === 0 }
  }
  it('leaves no short last row at either width for every count a section can hold', () => {
    for (let n = 3; n <= 8; n++) expect(fills(n), `${n} stories`).toEqual({ tablet: true, wide: true })
  })
  it('spans two columns for five and eight stories on a wide screen, all three for four and seven, and none for three and six', () => {
    expect(leadSpanClass(5)).toBe('sm:col-span-2 lg:col-span-2')
    expect(leadSpanClass(8)).toBe('lg:col-span-2')
    expect(leadSpanClass(4)).toBe('lg:col-span-3')
    expect(leadSpanClass(7)).toBe('sm:col-span-2 lg:col-span-3')
    expect(leadSpanClass(6)).toBe('')
    expect(leadSpanClass(3)).toBe('sm:col-span-2 lg:col-span-1')
  })
})

describe('leadFrameClass', () => {
  it('widens the lead\'s picture frame as the card spans columns, so it is not as tall as the row', () => {
    expect(leadFrameClass(5)).toBe('sm:aspect-[2/1] lg:aspect-[3/1]')
    expect(leadFrameClass(8)).toBe('lg:aspect-[3/1]')
    expect(leadFrameClass(4)).toBe('lg:aspect-[7/2]')
    expect(leadFrameClass(7)).toBe('sm:aspect-[2/1] lg:aspect-[7/2]')
    expect(leadFrameClass(6)).toBe('')
  })
  it('puts a lead that spans a tablet\'s row but not a wide screen\'s back to 3:2 there', () => {
    expect(leadFrameClass(3)).toBe('sm:aspect-[2/1] lg:aspect-[3/2]')
  })
  it('has a wider frame exactly when the lead spans, at both widths', () => {
    for (let n = 3; n <= 8; n++) {
      const span = leadSpanClass(n)
      const frame = leadFrameClass(n)
      expect(frame.includes('sm:aspect'), `${n} tablet`).toBe(span.includes('sm:col-span-2'))
      expect(/lg:aspect-\[(3\/1|7\/2)\]/.test(frame), `${n} wide`).toBe(/lg:col-span-[23]/.test(span))
    }
  })
})
