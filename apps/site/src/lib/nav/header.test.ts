import { describe, expect, it } from 'vitest'

import { drawableItems, headerButtons, isHeaderHref, validateHeaderHref } from './header'

describe('headerButtons', () => {
  it('shows all three with their defaults when nothing is set', () => {
    expect(headerButtons(undefined, true)).toEqual({
      search: { label: 'Search' },
      signIn: { label: 'Sign in' },
      donate: { label: 'Donate', href: '/support' },
    })
  })

  it('hides what the editors hide, and relabels', () => {
    const buttons = headerButtons({ search: { show: false }, signIn: { label: 'My account' }, donate: { label: 'Give', href: 'https://give.example.org/wuwf' } }, true)
    expect(buttons.search).toBeNull()
    expect(buttons.signIn).toEqual({ label: 'My account' })
    expect(buttons.donate).toEqual({ label: 'Give', href: 'https://give.example.org/wuwf' })
  })

  it('never shows Sign in while sign-in is not configured', () => {
    expect(headerButtons({ signIn: { show: true } }, false).signIn).toBeNull()
  })

  it('falls back to the Give page for a bad Donate address, and to the default for a blank label', () => {
    expect(headerButtons({ donate: { href: 'javascript:alert(1)', label: '  ' } }, true).donate).toEqual({ label: 'Donate', href: '/support' })
  })
})

describe('isHeaderHref', () => {
  it('takes a site path or https', () => {
    expect(isHeaderHref('/support')).toBe(true)
    expect(isHeaderHref('https://example.org/give')).toBe(true)
  })

  it('refuses other schemes and protocol-relative addresses', () => {
    expect(isHeaderHref('http://example.org')).toBe(false)
    expect(isHeaderHref('//evil.example')).toBe(false)
    expect(isHeaderHref('javascript:alert(1)')).toBe(false)
    expect(validateHeaderHref('support')).not.toBe(true)
    expect(validateHeaderHref('')).toBe(true)
  })
})

describe('drawableItems', () => {
  it('keeps complete links and menus, in order, and drops the rest', () => {
    const items = [
      { kind: 'menu', label: 'News', links: [{}] },
      { kind: 'link', link: { label: 'Podcasts' } },
      { kind: 'menu', label: 'Empty', links: [] },
      { kind: 'menu', label: ' ', links: [{}] },
      { kind: 'link', link: { label: '' } },
      { link: { label: 'Older item, no kind' } },
    ]
    expect(drawableItems(items).map((i) => i.label ?? i.link?.label)).toEqual(['News', 'Podcasts', 'Older item, no kind'])
  })
})
