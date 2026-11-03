import { describe, expect, it } from 'vitest'

import { isLinkLineUrl, linkLineHref } from './link-line'

describe('where a link line may point', () => {
  it('accepts a path here, an http or https address, and a mailto', () => {
    for (const ok of ['/local-news/2024-11-14/a-story', '/support', 'https://example.org/a?b=1', 'http://www.example.org/plain', 'mailto:members@wuwf.org'])
      expect(isLinkLineUrl(ok), ok).toBe(true)
  })
  it('refuses anything that is not safe or not an address', () => {
    for (const bad of ['', '   ', null, undefined, 'javascript:alert(1)', 'data:text/html,x', '//evil.example', '/a b', '/a\\b', 'not a link', 'https://localhost', 'ftp://example.org/x', 'mailto:nobody'])
      expect(isLinkLineUrl(bad as string), String(bad)).toBe(false)
  })
  it('gives back the trimmed address, or null', () => {
    expect(linkLineHref(' /support ')).toBe('/support')
    expect(linkLineHref('javascript:alert(1)')).toBeNull()
  })
})
