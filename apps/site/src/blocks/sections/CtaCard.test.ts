import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
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
  it('puts the action beside the words when the card is wide and under them when it is narrow (the card\'s own width, so a pair stacks)', () => {
    const out = html()
    expect(out).toContain('@container')
    expect(out).toContain('@3xl:flex-row')
  })
  it('falls back to the plain tone for a tone it does not know, and draws no button for an unsafe address', () => {
    const out = html({ tone: 'neon', actions: [{ label: 'Bad', href: 'javascript:alert(1)' }] })
    expect(out).toContain('data-tone="plain"')
    expect(out).not.toContain('Bad')
  })
})
