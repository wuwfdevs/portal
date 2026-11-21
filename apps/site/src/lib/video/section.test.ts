import { describe, expect, it } from 'vitest'

import { clipsForSection } from './section'

const clip = (id: number, sectionId: number | string | null) => ({ id, sectionId })

describe('clipsForSection', () => {
  const clips = [clip(1, 7), clip(2, null), clip(3, 8), clip(4, '7'), clip(5, 7)]
  it('keeps the clips whose story is in the section, newest first', () => {
    expect(clipsForSection(clips, 7).map((c) => c.id)).toEqual([1, 4, 5])
  })
  it('leaves out a clip with no story (no section), and shows nothing for no section', () => {
    expect(clipsForSection(clips, null)).toEqual([])
    expect(clipsForSection(clips, undefined)).toEqual([])
    expect(clipsForSection([clip(2, null)], 7)).toEqual([])
  })
  it('stops at the count', () => {
    expect(clipsForSection(clips, 7, 2).map((c) => c.id)).toEqual([1, 4])
    expect(clipsForSection(clips, 7, 0)).toEqual([])
  })
})
