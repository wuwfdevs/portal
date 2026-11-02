import { describe, expect, it } from 'vitest'

import { hubPath, postPath, uniquePaths } from './invalidate'

describe('paths', () => {
  it('builds story and hub paths', () => {
    expect(postPath('/local-news/2026-10-16/a-story')).toBe('/local-news/2026-10-16/a-story')
    expect(postPath(null)).toBeNull()
    expect(postPath(undefined)).toBeNull()
    expect(hubPath('fellowships', 'coastal-futures')).toBe('/fellowships/coastal-futures')
    expect(hubPath('series', 'after-isaias')).toBe('/series/after-isaias')
    expect(hubPath('productions', 'high-ground')).toBe('/productions/high-ground')
  })
  it('de-duplicates and sorts, so one change always refreshes the same list', () => {
    expect(uniquePaths(['/s/2026-01-01/b', '/s/2026-01-01/a'], ['/s/2026-01-01/a', '/fellowships/x'])).toEqual(['/fellowships/x', '/s/2026-01-01/a', '/s/2026-01-01/b'])
    expect(uniquePaths()).toEqual([])
  })
})
