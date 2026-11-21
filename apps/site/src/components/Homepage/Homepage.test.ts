import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Card } from '@/components/Card'
import { SectionHeader } from '@/components/SectionHeader'
import { MembershipAppeal } from '@/components/Article/Parts'
import { leadCardClasses } from '@/lib/homepage/modules'

import { Briefing, LeadArticle } from './FrontPage'

// The home page's look (direction C2): the editorial card with its section chip, the shared heading, the lead band and the Briefing.

const picture = { id: 1, url: '/media/1.jpg', alt: 'A picture', width: 800, height: 600, mimeType: 'image/jpeg', updatedAt: null, focalX: null, focalY: null, credit: 'WUWF' }
const section = (swatch: string) => ({ id: 7, title: 'Local News', slug: 'local-news', swatch })
const story = (over: Record<string, unknown> = {}) =>
  ({ id: 1, title: 'A story', path: '/local-news/2026-11-20/a-story', publishedAt: '2026-11-20T12:00:00.000Z', dek: 'The dek.', meta: { image: picture }, categories: [], contributors: [{ id: 3, name: 'Leigh Ostrander' }], featuredMedia: null, section: section('lime'), ...over }) as never
const draw = (el: React.ReactElement) => renderToStaticMarkup(el)

describe('Card, editorial', () => {
  it('has no border or shadow, a rounded-4 picture with the section as a chip in its colour, and a semibold headline', () => {
    const out = draw(createElement(Card, { doc: story(), fixedImage: true, variant: 'editorial' }))
    expect(out).not.toContain('border-rule')
    expect(out).not.toContain('shadow-1')
    expect(out).toContain('rounded-4')
    expect(out).toContain('Local News')
    expect(out).toContain('bg-wuwf-lime-100')
    expect(out).toContain('font-semibold')
    expect(out).not.toContain('font-bold leading-snug')
  })
  it('draws no chip for a story whose section was not loaded (a bare id) and no section at all', () => {
    expect(draw(createElement(Card, { doc: story({ section: 7 }), fixedImage: true, variant: 'editorial' }))).not.toContain('Local News')
    expect(draw(createElement(Card, { doc: story({ section: null }), fixedImage: true, variant: 'editorial' }))).not.toContain('rounded-pill')
  })
  it('falls back to the default swatch for a colour it does not know', () => {
    expect(draw(createElement(Card, { doc: story({ section: section('mauve') }), fixedImage: true, variant: 'editorial' }))).toContain('bg-wuwf-blue-100')
  })
  it('lays a spanning lead out as a row with the larger headline, with no padding in the column it falls back to', () => {
    const out = draw(createElement(Card, { doc: story(), fixedImage: true, lead: leadCardClasses(5), variant: 'editorial' }))
    expect(out).toContain('lg:flex-row')
    expect(out).toContain('lg:text-2xl')
    const column = draw(createElement(Card, { doc: story(), fixedImage: true, lead: leadCardClasses(3), variant: 'editorial' }))
    expect(column).toContain('lg:p-0')
    expect(column).not.toContain('lg:p-4')
  })
  it('keeps the bordered card for the list pages, with no chip', () => {
    const out = draw(createElement(Card, { doc: story(), fixedImage: true, showCategories: true }))
    expect(out).toContain('rounded-sm border border-rule')
    expect(out).not.toContain('bg-wuwf-lime-100')
  })
})

describe('SectionHeader', () => {
  it('draws through the Kit heading: serif 600, the swatch\'s mark, and no rule under it', () => {
    const out = draw(createElement(SectionHeader, { id: 'x', title: 'Local News', swatch: 'amber' }))
    expect(out).toContain('font-semibold')
    expect(out).toContain('class="mark')
    expect(out).toContain('--color-warning-bg')
    expect(out).not.toContain('border-b-2')
    expect(out).not.toContain('border-ink')
  })
  it('marks in the default blue for a section without a colour, and not at all when asked', () => {
    expect(draw(createElement(SectionHeader, { id: 'x', title: 'T' }))).toContain('--color-wuwf-blue-100')
    expect(draw(createElement(SectionHeader, { id: 'x', title: 'T', mark: false }))).not.toContain('class="mark')
  })
  it('keeps the eyebrow above, the title as a link, and the more link in the same row', () => {
    const out = draw(createElement(SectionHeader, { id: 'x', title: 'Local News', eyebrow: 'WUWF originals', href: '/local-news', more: { href: '/local-news', label: 'More from Local News' } }))
    expect(out).toContain('WUWF originals')
    expect(out).toContain('href="/local-news"')
    expect(out.indexOf('WUWF originals')).toBeLessThan(out.indexOf('Local News'))
    expect(out).toContain('More from Local News')
  })
})

describe('the lead band', () => {
  it('puts the eyebrow and the date on one line, then a semibold headline, with a rounded-4 picture and its credit as a chip', () => {
    const out = draw(createElement(LeadArticle, { lead: story() }))
    expect(out).toContain('rounded-4')
    expect(out).toContain('shadow-2')
    expect(out).toContain('font-semibold')
    expect(out).toContain('Photo: WUWF')
    expect(out.indexOf('Local News')).toBeLessThan(out.indexOf('Nov'))
    expect(out.indexOf('Nov')).toBeLessThan(out.indexOf('A story'))
  })
  it('has Read the story as a pill action, and the summary in sans', () => {
    const out = draw(createElement(LeadArticle, { lead: story() }))
    expect(out).toContain('Read the story')
    expect(out).toContain('rounded-pill')
    expect(out).toContain('The dek.')
    expect(out).not.toContain('font-serif text-lg text-ink-2')
  })
})

describe('the Briefing', () => {
  it('has the lime-marked heading and a numbered badge and section chip per story', () => {
    const out = draw(createElement(Briefing, { top: [story({ id: 1 }), story({ id: 2, title: 'Second' })] }))
    expect(out).toContain('The Briefing')
    expect(out).toContain('--color-wuwf-lime')
    expect(out).toContain('rounded-pill')
    expect(out).toContain('Local News')
    expect(out).toContain('Second')
  })
  it('draws nothing without stories', () => {
    expect(draw(createElement(Briefing, { top: [] }))).toBe('')
  })
})

describe('MembershipAppeal', () => {
  it('is a rounded-4 panel with a pill button and a semibold line, and nothing without words', () => {
    const out = draw(createElement(MembershipAppeal, { appeal: { text: 'Support us.', button: { label: 'Become a member', href: '/support' } } }))
    expect(out).toContain('rounded-4')
    expect(out).toContain('rounded-pill')
    expect(out).toContain('font-semibold')
    expect(out).not.toContain('rounded-sm')
    expect(draw(createElement(MembershipAppeal, { appeal: null }))).toBe('')
  })
})
