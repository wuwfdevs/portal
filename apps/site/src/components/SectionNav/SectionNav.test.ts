import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SectionNav } from './index'

const html = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(SectionNav, {
      label: 'The Voyager',
      homeHref: '/voyager',
      items: [
        { label: 'Front page', href: '#front' },
        { label: 'Campus', href: '/campus' },
        { label: 'About', href: '/voyager/about', current: true },
      ],
      ...props,
    } as never),
  )

describe('SectionNav', () => {
  it('marks a link to a place on the page with its anchor, so one whose section drew nothing can be hidden, and a link to a page with none', () => {
    const out = html()
    expect(out).toContain('data-anchor="front"')
    expect(out.match(/data-anchor=/g)?.length).toBe(1)
  })
  it('links the title to the set\'s home, not to a part of the page', () => {
    expect(html()).toMatch(/<a[^>]*href="\/voyager"[^>]*>The Voyager<\/a>/)
  })
  it('marks the current page and keeps one nav landmark named for the section', () => {
    const out = html()
    expect(out).toContain('aria-current="page"')
    expect(out).toContain('aria-label="The Voyager"')
  })
})
