import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CtaCard } from './CtaCard'

const html = (props: Partial<Parameters<typeof CtaCard>[0]> = {}) =>
  renderToStaticMarkup(createElement(CtaCard, { tone: 'plain', title: 'Give today', actions: [{ label: 'Give', href: '/support' }], ...props }))

describe('Call-to-action card', () => {
  it('draws the words, the action and the note, in a card that carries its own tone', () => {
    const out = html({ tone: 'dark', eyebrow: 'Join us', intro: 'Every gift counts.', note: 'Opens the form.' })
    for (const s of ['Join us', 'Give today', 'Every gift counts.', 'Give', 'Opens the form.']) expect(out).toContain(s)
    expect(out).toContain('data-tone="dark"')
    expect(out).toContain('rounded-4')
  })
  it('lifts a card on the page\'s ground with the tone\'s tint, and leaves a strong colour as it is', () => {
    expect(html({ tone: 'plain' })).toContain('[background-color:var(--tone-tint)]')
    expect(html({ tone: 'grey' })).toContain('[background-color:var(--tone-tint)]')
    for (const tone of ['dark', 'teal', 'lime']) expect(html({ tone })).not.toContain('[background-color:var(--tone-tint)]')
  })
  it('puts the action under the words, left-aligned, at every width: one column, no row beside the words', () => {
    const out = html({ note: 'Opens the form.' })
    expect(out.indexOf('Give today')).toBeLessThan(out.indexOf('>Give<'))
    expect(out).toContain('flex-col')
    expect(out).toContain('items-start')
    expect(out).not.toMatch(/flex-row|justify-between|@container|@3xl/)
    expect(out.indexOf('>Give<')).toBeLessThan(out.indexOf('Opens the form.'))
  })
  it('has the first action as the filled button and the next as an outline', () => {
    const out = html({ actions: [{ label: 'Start', href: '/a' }, { label: 'Call', href: '/b' }] })
    expect(out).toMatch(/<a[^>]*rounded-pill[^>]*>Start/)
    expect(out).toMatch(/<a[^>]*shadow-\[inset[^>]*>Call/)
  })
  it('is a heading for a title and a paragraph for a sentence that is not one', () => {
    expect(html()).toMatch(/<h2[^>]*>Give today<\/h2>/)
    const sentence = html({ as: 'p', size: 'md', title: 'Members make it possible.' })
    expect(sentence).toMatch(/<p[^>]*>Members make it possible\.<\/p>/)
    expect(sentence).not.toContain('<h2')
    expect(sentence).toContain('md:text-2xl')
  })
  it('falls back to the plain tone for a tone it does not know, and draws no button for an unsafe address', () => {
    const out = html({ tone: 'neon', actions: [{ label: 'Bad', href: 'javascript:alert(1)' }] })
    expect(out).toContain('data-tone="plain"')
    expect(out).not.toContain('Bad')
  })
  it('draws no action row when there is no action and no note', () => {
    expect(html({ actions: [] })).not.toContain('mt-auto')
  })
})
