import { describe, expect, it } from 'vitest'

import { hubPath, postPath, uniquePaths } from './invalidate'

describe('paths', () => {
  it('builds story and hub paths', () => {
    expect(postPath('a-story')).toBe('/posts/a-story')
    expect(hubPath('fellowships', 'coastal-futures')).toBe('/fellowships/coastal-futures')
    expect(hubPath('series', 'after-isaias')).toBe('/series/after-isaias')
    expect(hubPath('productions', 'high-ground')).toBe('/productions/high-ground')
  })
  it('de-duplicates and sorts, so one change always refreshes the same list', () => {
    expect(uniquePaths(['/posts/b', '/posts/a'], ['/posts/a', '/fellowships/x'])).toEqual(['/fellowships/x', '/posts/a', '/posts/b'])
    expect(uniquePaths()).toEqual([])
  })
})
