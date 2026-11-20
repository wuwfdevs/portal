import { describe, expect, it } from 'vitest'

import { topUnitHeldBack } from './exclusions'

describe('topUnitHeldBack', () => {
  it('holds the top unit back while an emergency banner is on for that page', () => {
    expect(topUnitHeldBack({ scope: 'home', style: 'emergency' }, 'home')).toBe(true)
    expect(topUnitHeldBack({ scope: 'all', style: 'emergency' }, 'home')).toBe(true)
    expect(topUnitHeldBack({ scope: 'all', style: 'emergency' }, 'other')).toBe(true)
  })
  it('does not hold back a page the banner is not on', () => {
    expect(topUnitHeldBack({ scope: 'home', style: 'emergency' }, 'other')).toBe(false)
  })
  it('does not hold back for a quiet notice, or with no banner', () => {
    expect(topUnitHeldBack({ scope: 'all', style: 'notice' }, 'home')).toBe(false)
    expect(topUnitHeldBack(null, 'home')).toBe(false)
    expect(topUnitHeldBack(undefined, 'other')).toBe(false)
  })
})
