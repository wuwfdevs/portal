import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ImagePlaceholder } from './ImagePlaceholder'

describe('Image placeholder', () => {
  const out = renderToStaticMarkup(createElement(ImagePlaceholder, { className: 'absolute inset-0' }))
  it('is decoration: hidden from assistive technology, never an image and never a request', () => {
    expect(out).toContain('aria-hidden="true"')
    expect(out).not.toContain('<img')
    expect(out).not.toMatch(/src=|href=/)
  })
  it('fills the frame it is given, on the band\'s tint (or the station\'s neutral), and takes the caller\'s classes', () => {
    expect(out).toContain('size-full')
    expect(out).toContain('var(--tone-tint,var(--color-surface-3))')
    expect(out).toContain('absolute inset-0')
    expect(out).toContain('data-placeholder="picture"')
  })
})
