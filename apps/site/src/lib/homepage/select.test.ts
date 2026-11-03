import { describe, expect, it } from 'vitest'

import { arrangeHomepage, leadPicture, remainingStories } from './select'

const s = (id: number) => ({ id, title: `Story ${id}` })
const recent = [1, 2, 3, 4, 5, 6, 7, 8].map(s)

describe('arrangeHomepage', () => {
  it('uses what the editor chose, in their order', () => {
    const a = arrangeHomepage({ curatedLead: s(5), curatedTop: [s(3), s(2)], recent, topCount: 5 })
    expect(a.lead?.id).toBe(5)
    expect(a.top.map((x) => x.id)).toEqual([3, 2, 1, 4, 6])
  })
  it('fills an empty lead and an empty list from the newest work', () => {
    const a = arrangeHomepage({ curatedLead: null, curatedTop: [], recent, topCount: 3 })
    expect(a.lead?.id).toBe(1)
    expect(a.top.map((x) => x.id)).toEqual([2, 3, 4])
  })
  it('never shows a story twice: not the lead again in the list, not a repeat in the choices', () => {
    const a = arrangeHomepage({ curatedLead: s(2), curatedTop: [s(2), s(3), s(3), s(4)], recent, topCount: 4 })
    expect(a.lead?.id).toBe(2)
    expect(a.top.map((x) => x.id)).toEqual([3, 4, 1, 5])
  })
  it('caps the choices at the list size (the story that leads is not repeated in it) and handles no stories at all', () => {
    const a = arrangeHomepage({ curatedLead: null, curatedTop: [1, 2, 3, 4, 5, 6].map(s), recent, topCount: 3 })
    expect(a.lead?.id).toBe(1)
    expect(a.top.map((x) => x.id)).toEqual([2, 3, 4])
    expect(arrangeHomepage({ curatedLead: null, curatedTop: [], recent: [], topCount: 5 })).toEqual({ lead: null, top: [] })
  })
  it('does not change its inputs', () => {
    const top = [s(3)]
    const before = JSON.stringify({ top, recent })
    arrangeHomepage({ curatedLead: null, curatedTop: top, recent, topCount: 5 })
    expect(JSON.stringify({ top, recent })).toBe(before)
  })
})

describe('remainingStories', () => {
  it('leaves out what is already shown and respects the limit', () => {
    expect(remainingStories(recent, [s(1), s(2)], 3).map((x) => x.id)).toEqual([3, 4, 5])
    expect(remainingStories(recent, [], 0)).toEqual([])
  })
})

describe('leadPicture', () => {
  const media = (id: number) => ({ id, url: `/m/${id}` })
  it('prefers the featured photo, then the first photo of a featured gallery, then the SEO image', () => {
    expect(leadPicture({ featuredMedia: [{ blockType: 'mediaBlock', media: media(1) }], meta: { image: media(9) } })?.id).toBe(1)
    expect(leadPicture({ featuredMedia: [{ blockType: 'gallery', images: [{ image: media(2) }, { image: media(3) }] }] })?.id).toBe(2)
    expect(leadPicture({ featuredMedia: [], meta: { image: media(9) } })?.id).toBe(9)
  })
  it('skips a video or embed lead and a picture that was not loaded, and is null when there is none', () => {
    expect(leadPicture({ featuredMedia: [{ blockType: 'videoPlayer' }, { blockType: 'mediaBlock', media: 7 }, { blockType: 'mediaBlock', media: media(4) }] })?.id).toBe(4)
    expect(leadPicture({ featuredMedia: [{ blockType: 'mediaBlock', media: 7 }], meta: { image: 8 } })).toBeNull()
    expect(leadPicture({})).toBeNull()
  })
})
