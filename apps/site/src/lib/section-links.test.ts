import { describe, expect, it } from 'vitest'

import { isInternalHref, safeHref, validateHref } from './section-links'

describe('section links', () => {
  it('accepts site paths, page places, https, mailto and tel', () => {
    for (const ok of ['/sponsor', '/support/ways?way=mail', '#rates', 'https://example.org/a?b=1', 'mailto:a@b.org', 'tel:+18504747000', 'tel:850-474-7000'])
      expect(safeHref(ok)).toBe(ok)
  })
  it('refuses script, data and look-alike addresses, protocol-relative links, spaces and quotes', () => {
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', '//evil.example', 'http://insecure.example', 'example.org', '/a b', '/a"b', "/a'b", '#', 'https://', 'mailto:', '', '  ', null, 3])
      expect(safeHref(bad)).toBeNull()
  })
  it('tells a site link from an outside one', () => {
    expect(isInternalHref('/a')).toBe(true)
    expect(isInternalHref('#a')).toBe(true)
    expect(isInternalHref('https://a.org')).toBe(false)
  })
  it('validates a field: empty passes, a bad link explains itself', () => {
    expect(validateHref('')).toBe(true)
    expect(validateHref(undefined)).toBe(true)
    expect(validateHref('/ok')).toBe(true)
    expect(typeof validateHref('javascript:x')).toBe('string')
  })
})
