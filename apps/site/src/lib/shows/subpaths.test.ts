import { describe, expect, it } from 'vitest'

import { parseShowSubpage, showPagePaths } from './subpaths'

describe('a themed show’s sub-pages', () => {
  it('lists the show page and its sub-pages', () => {
    expect(showPagePaths('/shows/barefoot-mary')).toEqual(['/shows/barefoot-mary', '/shows/barefoot-mary/field-notes', '/shows/barefoot-mary/archive', '/shows/barefoot-mary/support'])
  })
  it('splits a sub-page address, and nothing else', () => {
    expect(parseShowSubpage('/shows/barefoot-mary/support')).toEqual({ showPath: '/shows/barefoot-mary', subpage: 'support' })
    expect(parseShowSubpage('/show/old-slug/archive')).toEqual({ showPath: '/show/old-slug', subpage: 'archive' })
    expect(parseShowSubpage('/shows/barefoot-mary')).toBeNull()
    expect(parseShowSubpage('/support')).toBeNull()
    expect(parseShowSubpage('/shows/x/2026-01-01/support-me')).toBeNull()
  })
})
