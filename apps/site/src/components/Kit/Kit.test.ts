import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BUTTON_VARIANTS, Button, SectionChip, Eyebrow, NumberBadge, SectionHeading, buttonClasses, headingClasses } from './index'

const html = (el: React.ReactElement) => renderToStaticMarkup(el)

describe('buttonClasses', () => {
  it('is a pill at 44px by default and 48px when large, in every variant but the text link', () => {
    for (const variant of BUTTON_VARIANTS) {
      if (variant === 'link') continue
      expect(buttonClasses({ variant }), variant).toContain('rounded-pill')
      expect(buttonClasses({ variant }), variant).toContain('min-h-11')
      expect(buttonClasses({ variant, size: 'lg' }), variant).toContain('min-h-12')
    }
    expect(buttonClasses({ variant: 'link' })).not.toContain('rounded-pill')
  })
  it('puts lime under dark text for play and on-dark, and ink under white for primary', () => {
    expect(buttonClasses({ variant: 'play' })).toContain('bg-wuwf-lime text-surface-dark')
    expect(buttonClasses({ variant: 'onDark' })).toContain('bg-wuwf-lime text-surface-dark')
    expect(buttonClasses({ variant: 'primary' })).toContain('bg-ink text-surface')
    expect(buttonClasses({ variant: 'outline' })).toContain('border-2 border-ink')
  })
  it('reads the band for the tone variants, and fixed colours for none of the others', () => {
    expect(buttonClasses({ variant: 'tone' })).toContain('var(--tone-button)')
    expect(buttonClasses({ variant: 'tone' })).toContain('var(--tone-button-text)')
    expect(buttonClasses({ variant: 'toneOutline' })).toContain('var(--tone-ghost)')
    for (const variant of BUTTON_VARIANTS) if (!variant.startsWith('tone')) expect(buttonClasses({ variant })).not.toContain('--tone-')
  })
  it('lets the caller override a size and add layout, the last class winning', () => {
    const cls = buttonClasses({ variant: 'primary', className: 'min-h-12 px-[22px] self-start' })
    expect(cls).toContain('min-h-12')
    expect(cls).not.toContain('min-h-11')
    expect(cls).toContain('self-start')
  })
  it('writes no hex colour', () => {
    for (const variant of BUTTON_VARIANTS) expect(buttonClasses({ variant })).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })
})

describe('Button', () => {
  it('is a link to this site for a path, and a plain anchor with rel for any other address', () => {
    const own = html(createElement(Button, { href: '/support', variant: 'play' }, 'Give'))
    expect(own).toContain('href="/support"')
    expect(own).not.toContain('rel=')
    const out = html(createElement(Button, { href: 'https://example.org/x' }, 'Go'))
    expect(out).toContain('rel="noopener noreferrer"')
    expect(html(createElement(Button, { href: '//evil.example' }, 'Go'))).toContain('rel="noopener noreferrer"')
  })
  it('is a button that does not submit a form unless asked', () => {
    expect(html(createElement(Button, null, 'Save'))).toContain('type="button"')
    expect(html(createElement(Button, { type: 'submit' }, 'Send'))).toContain('type="submit"')
  })
})

describe('Eyebrow and SectionChip', () => {
  it('draws a dot and the words, in the swatch colour', () => {
    const out = html(createElement(Eyebrow, { swatch: 'lime' }, 'Fellowship'))
    expect(out).toContain('bg-wuwf-lime')
    expect(out).toContain('text-success-fg')
    expect(out).toContain('Fellowship')
    expect(out).toContain('aria-hidden="true"')
  })
  it('reads the band when told to, and is the default blue with no swatch or an unknown one', () => {
    expect(html(createElement(Eyebrow, { tone: true }, 'x'))).toContain('var(--tone-accent)')
    expect(html(createElement(Eyebrow, null, 'x'))).toContain('text-wuwf-blue-700')
    expect(html(createElement(Eyebrow, { swatch: 'sports' }, 'x'))).toContain('text-wuwf-blue-700')
  })
  it('is a tinted pill by default and a dot with the name as a dot chip; with no words it draws nothing', () => {
    const pill = html(createElement(SectionChip, { swatch: 'amber', label: 'Arts & Music' }))
    expect(pill).toContain('rounded-pill')
    expect(pill).toContain('bg-warning-bg')
    expect(pill).toContain('Arts &amp; Music')
    const dot = html(createElement(SectionChip, { swatch: 'teal', variant: 'dot', label: 'The Voyager' }))
    expect(dot).toContain('bg-wuwf-teal')
    expect(dot).toContain('The Voyager')
    for (const label of ['  ', '', null, undefined]) expect(html(createElement(SectionChip, { swatch: 'blue', label }))).toBe('')
  })
  it('draws a number in a round tinted badge, hidden from a screen reader (the list says the order)', () => {
    const out = html(createElement(NumberBadge, { n: 3, swatch: 'blue' }))
    expect(out).toContain('>3<')
    expect(out).toContain('aria-hidden="true"')
    expect(out).toContain('bg-wuwf-blue-100')
  })
})

describe('SectionHeading', () => {
  it('is serif at 600, never bold', () => {
    const cls = headingClasses('lg')
    expect(cls).toContain('font-serif')
    expect(cls).toContain('font-semibold')
    expect(cls).not.toContain('font-bold')
  })
  it('wraps the words in a mark from the swatch, or from the band, and in nothing without one', () => {
    const desk = html(createElement(SectionHeading, { mark: 'lime' }, 'Local News'))
    expect(desk).toContain('class="mark ')
    expect(desk).toContain('--mk:var(--color-wuwf-lime)')
    expect(html(createElement(SectionHeading, { mark: 'tone' }, 'x'))).toContain('--mk:var(--tone-mark)')
    expect(html(createElement(SectionHeading, null, 'Plain'))).not.toContain('mark')
    expect(html(createElement(SectionHeading, { mark: null }, 'Plain'))).not.toContain('mark')
  })
  it('keeps the element, id and size the caller names', () => {
    const out = html(createElement(SectionHeading, { as: 'h1', id: 'top', size: 'xl' }, 'Title'))
    expect(out.startsWith('<h1')).toBe(true)
    expect(out).toContain('id="top"')
    expect(out).toContain('text-[2.5rem]')
  })
})
