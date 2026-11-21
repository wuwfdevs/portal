import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { bannerOf } from '@/lib/banner'

import { Banner } from './index'

const draw = (fields: Parameters<typeof bannerOf>[0]) => renderToStaticMarkup(createElement(Banner, { banner: bannerOf(fields) }))
const base = { active: true, headline: 'Shelters open at noon', body: 'Details below.', linkLabel: 'Live updates', linkHref: '/live-updates/storm' }

describe('Banner', () => {
  it('draws nothing without a banner', () => {
    expect(draw({ ...base, active: false })).toBe('')
  })
  it('draws the label, headline, body and an internal link', () => {
    const out = draw(base)
    expect(out).toContain('aria-label="Emergency coverage"')
    expect(out).toContain('Shelters open at noon')
    expect(out).toContain('Details below.')
    expect(out).toContain('href="/live-updates/storm"')
    expect(out).not.toContain('noopener')
  })
  it('opens another address safely', () => {
    expect(draw({ ...base, linkHref: 'https://example.org/storm' })).toContain('rel="noopener noreferrer"')
  })
  it('draws a notice quietly and an emergency strongly', () => {
    expect(draw({ ...base, style: 'emergency' })).toContain('border-b-4')
    const notice = draw({ ...base, style: 'notice' })
    expect(notice).toContain('data-banner="notice"')
    expect(notice).not.toContain('border-b-4')
  })
  it('draws no link for an unsafe address', () => {
    expect(draw({ ...base, linkHref: 'javascript:alert(1)' })).not.toContain('href=')
  })
})
