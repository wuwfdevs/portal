import { describe, expect, it } from 'vitest'

import { bannerFor, bannerOf } from './index'

const on = { active: true, headline: 'Shelters open at noon' }

describe('bannerOf', () => {
  it('shows only while switched on and with a headline', () => {
    expect(bannerOf(on)).not.toBeNull()
    expect(bannerOf({ ...on, active: false })).toBeNull()
    expect(bannerOf({ active: true, headline: '  ' })).toBeNull()
    expect(bannerOf(null)).toBeNull()
  })
  it('defaults to the emergency look on the home page, with that look\'s label', () => {
    expect(bannerOf(on)).toMatchObject({ scope: 'home', style: 'emergency', label: 'Emergency coverage' })
  })
  it('takes the label from the style, unless the editor wrote one', () => {
    expect(bannerOf({ ...on, style: 'notice' })?.label).toBe('Notice')
    expect(bannerOf({ ...on, style: 'notice', label: ' Road closure ' })?.label).toBe('Road closure')
  })
  it('falls back for a scope or style it does not know', () => {
    expect(bannerOf({ ...on, scope: 'sidebar', style: 'loud' })).toMatchObject({ scope: 'home', style: 'emergency' })
    expect(bannerOf({ ...on, scope: 'all' })?.scope).toBe('all')
  })
  it('keeps a safe link, says "Read more" when it has no words, and drops an unsafe or label-only one', () => {
    expect(bannerOf({ ...on, linkHref: '/live-updates/storm', linkLabel: 'Live updates' })).toMatchObject({ linkHref: '/live-updates/storm', linkLabel: 'Live updates' })
    expect(bannerOf({ ...on, linkHref: 'https://example.org/x' })).toMatchObject({ linkLabel: 'Read more' })
    expect(bannerOf({ ...on, linkHref: 'javascript:alert(1)', linkLabel: 'Go' })).toMatchObject({ linkHref: null, linkLabel: null })
    expect(bannerOf({ ...on, linkLabel: 'Go' })).toMatchObject({ linkHref: null, linkLabel: null })
  })
})

describe('bannerFor: a banner is drawn in one place only', () => {
  const home = bannerOf(on)
  const all = bannerOf({ ...on, scope: 'all' })
  it('a home banner is drawn by the home page, not the layout', () => {
    expect(bannerFor(home, 'home-page')).toBe(home)
    expect(bannerFor(home, 'layout')).toBeNull()
  })
  it('an every-page banner is drawn by the layout, not again by the home page', () => {
    expect(bannerFor(all, 'layout')).toBe(all)
    expect(bannerFor(all, 'home-page')).toBeNull()
  })
  it('draws nothing when there is no banner', () => {
    expect(bannerFor(null, 'layout')).toBeNull()
    expect(bannerFor(null, 'home-page')).toBeNull()
  })
})
