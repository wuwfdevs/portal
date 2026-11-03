import { describe, expect, it } from 'vitest'

import { storyBodyMayBeEmpty } from './story-body'

describe('storyBodyMayBeEmpty', () => {
  it('lets a story with audio go without text', () => {
    expect(storyBodyMayBeEmpty({ featuredAudio: 12 })).toBe(true)
    expect(storyBodyMayBeEmpty({ featuredAudio: { id: 12 } })).toBe(true)
  })
  it('lets a story with a photo, gallery or video go without text', () => {
    expect(storyBodyMayBeEmpty({ featuredMedia: [{ blockType: 'mediaPhoto' }] })).toBe(true)
  })
  it('still requires text on a story with nothing attached', () => {
    expect(storyBodyMayBeEmpty({})).toBe(false)
    expect(storyBodyMayBeEmpty({ featuredAudio: null, featuredMedia: [] })).toBe(false)
    expect(storyBodyMayBeEmpty(undefined)).toBe(false)
    expect(storyBodyMayBeEmpty(null)).toBe(false)
  })
})
