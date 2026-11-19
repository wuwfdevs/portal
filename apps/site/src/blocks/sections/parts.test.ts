import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SectionActions, SectionLink, populatedMedia } from './parts'

describe('populatedMedia', () => {
  it('returns a populated record, and null for a bare id (a deleted or unpopulated relation), nothing, or a string', () => {
    const record = { id: 3, url: '/media/a.jpg' }
    expect(populatedMedia(record)).toBe(record)
    for (const v of [7, 0, '7', 'abc', null, undefined]) expect(populatedMedia(v as never)).toBeNull()
  })
})

describe('SectionActions and SectionLink', () => {
  const actions = (a: unknown) => renderToStaticMarkup(createElement(SectionActions, { actions: a as never }))
  it('draws the first button filled and the rest outlined, in order', () => {
    const out = actions([{ label: 'One', href: '/one' }, { label: 'Two', href: 'https://example.org/two' }])
    expect(out.indexOf('One')).toBeLessThan(out.indexOf('Two'))
    expect(out).toContain('--tone-button')
    expect(out).toContain('border-2')
    expect(out).toContain('rel="noopener noreferrer"')
  })
  it('draws nothing for no buttons, an unsafe address, a missing label, or an empty list', () => {
    for (const a of [null, undefined, [], [{ label: 'x', href: 'javascript:alert(1)' }], [{ label: ' ', href: '/ok' }], [null]]) expect(actions(a)).toBe('')
  })
  it('SectionLink draws a link only for a label and a safe address', () => {
    const link = (href: unknown, label: unknown) => renderToStaticMarkup(createElement(SectionLink, { href, label: label as never }))
    expect(link('/a', 'Go')).toContain('href="/a"')
    expect(link('#rates', 'Go')).toContain('href="#rates"')
    for (const [h, l] of [['javascript:x', 'Go'], ['/a', ''], ['/a', null], [null, 'Go'], ['//evil.example', 'Go']] as const) expect(link(h, l)).toBe('')
  })
})
