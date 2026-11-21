import { describe, expect, it } from 'vitest'

import { expandImageUrl, expandUriTemplate } from './uri-template'

describe('expandUriTemplate', () => {
  it('expands query variables, leaving out the ones not given', () => {
    expect(expandUriTemplate('https://h/img{?width,quality,format}', { width: 640, format: 'webp' })).toBe('https://h/img?width=640&format=webp')
    expect(expandUriTemplate('https://h/img{?width}', {})).toBe('https://h/img')
  })

  it('continues an existing query with {&...}', () => {
    expect(expandUriTemplate('https://h/img?v=2{&width}', { width: 300 })).toBe('https://h/img?v=2&width=300')
  })

  it('encodes simple values and keeps reserved characters in {+var}', () => {
    expect(expandUriTemplate('https://h/{name}', { name: 'a b/c' })).toBe('https://h/a%20b%2Fc')
    expect(expandUriTemplate('https://h{+path}', { path: '/a b/c' })).toBe('https://h/a%20b/c')
  })

  it('cannot be made to inject a second parameter through a value', () => {
    expect(expandUriTemplate('https://h/img{?width}', { width: '1&evil=1' })).toBe('https://h/img?width=1%26evil%3D1')
  })
})

describe('expandImageUrl', () => {
  const image = { href: 'https://h/full.jpg', hrefTemplate: 'https://h/img{?width,quality,format}' }

  it('uses the template when there is one', () => {
    expect(expandImageUrl(image, { width: 800, quality: 80, format: 'webp' })).toBe('https://h/img?width=800&quality=80&format=webp')
  })

  it('falls back to the plain address with no template, or when the expansion is not https', () => {
    expect(expandImageUrl({ href: 'https://h/full.jpg', hrefTemplate: null }, { width: 800 })).toBe('https://h/full.jpg')
    expect(expandImageUrl({ href: 'https://h/full.jpg', hrefTemplate: 'javascript:alert(1){?width}' }, { width: 800 })).toBe('https://h/full.jpg')
  })
})
