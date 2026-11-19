import { describe, expect, it } from 'vitest'

import { duplicateAnchors, isValidAnchor } from './sections-anchors'

describe('section anchors', () => {
  it('accepts lower-case words and digits joined by single hyphens', () => {
    for (const ok of ['inquire', 'on-air-rates', 'step-2', '2026']) expect(isValidAnchor(ok)).toBe(true)
  })
  it('refuses capitals, spaces, underscores, edge or double hyphens and non-strings', () => {
    for (const bad of ['Inquire', 'on air', 'on_air', '-a', 'a-', 'a--b', '', '#a', 3, null]) expect(isValidAnchor(bad)).toBe(false)
  })
  it('finds an anchor used twice and ignores empty ones', () => {
    expect(duplicateAnchors([{ anchor: 'a' }, { anchor: 'b' }, { anchor: 'a' }, { anchor: '' }, { anchor: '' }, {}, null])).toEqual(['a'])
    expect(duplicateAnchors([{ anchor: 'a' }, { anchor: 'b' }])).toEqual([])
    expect(duplicateAnchors(undefined)).toEqual([])
  })
})
