import { describe, expect, it } from 'vitest'

import { isVoyagerIdentity } from './identity'

describe('isVoyagerIdentity', () => {
  it('is true for the loaded Voyager identity', () => {
    expect(isVoyagerIdentity({ id: 3, slug: 'the-voyager', name: 'The Voyager' })).toBe(true)
  })
  it('is false for another identity, a bare id, or nothing', () => {
    expect(isVoyagerIdentity({ id: 1, slug: 'wuwf-news' })).toBe(false)
    expect(isVoyagerIdentity(3)).toBe(false)
    expect(isVoyagerIdentity(null)).toBe(false)
    expect(isVoyagerIdentity(undefined)).toBe(false)
  })
})
