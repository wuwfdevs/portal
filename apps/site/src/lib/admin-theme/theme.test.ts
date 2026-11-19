import { readFileSync } from 'node:fs'
import path from 'node:path'

import { colors, relativeLuminance } from '@wuwf/design-tokens'
import { describe, expect, it } from 'vitest'

import { ACTION, ACTION_HOVER, BLUES, ERRORS, GREYS, WARNINGS, adminThemeCss, contrast, mix, ramp } from './theme'

const hex = /^#[0-9A-F]{6}$/

describe('ramp and mix', () => {
  it('goes in a straight line between anchors and keeps the anchors exactly', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080')
    const r = ramp({ 0: '#000000', 100: '#FFFFFF' }, [0, 25, 50, 100])
    expect(r).toEqual({ 0: '#000000', 25: '#404040', 50: '#808080', 100: '#FFFFFF' })
  })
  it('holds the nearest anchor outside the anchors', () => {
    expect(ramp({ 50: '#112233', 60: '#445566' }, [0, 100])).toEqual({ 0: '#112233', 100: '#445566' })
  })
})

describe('the admin theme comes from the design tokens', () => {
  it('puts the tokens at the grey scale\'s anchors', () => {
    expect(GREYS[0]).toBe(colors.surface)
    expect(GREYS[50]).toBe(colors['surface-2'])
    expect(GREYS[150]).toBe(colors.rule)
    expect(GREYS[300]).toBe(colors['rule-strong'])
    expect(GREYS[650]).toBe(colors['ink-3'])
    expect(GREYS[800]).toBe(colors['ink-2'])
    expect(GREYS[1000]).toBe(colors.ink)
  })

  it('gets darker at every step of the grey scale (dark mode reads it backwards, so a bump would show in both)', () => {
    const steps = Object.keys(GREYS).map(Number).sort((a, b) => a - b)
    for (let i = 1; i < steps.length; i++) {
      expect(relativeLuminance(GREYS[steps[i]!]!), `${steps[i - 1]} to ${steps[i]}`).toBeLessThan(relativeLuminance(GREYS[steps[i - 1]!]!))
    }
  })

  it('holds every colour to a plain six-digit hex, never a typed-in name', () => {
    for (const scale of [GREYS, BLUES, WARNINGS, ERRORS]) for (const v of Object.values(scale)) expect(v).toMatch(hex)
  })
})

describe('the admin theme: contrast', () => {
  it('light mode: text is 7:1, muted text 4.5:1, placeholder grey 3.5:1, on the page', () => {
    expect(contrast(GREYS[800]!, GREYS[0]!)).toBeGreaterThanOrEqual(7)
    expect(contrast(GREYS[600]!, GREYS[0]!)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(GREYS[500]!, GREYS[0]!)).toBeGreaterThanOrEqual(3.5)
  })

  it('dark mode (the scale read backwards: 0 is base-900, 600 is base-300): muted text 4.5:1, the mid grey 4:1', () => {
    expect(contrast(GREYS[300]!, GREYS[900]!)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(GREYS[500]!, GREYS[900]!)).toBeGreaterThanOrEqual(4)
    expect(contrast(GREYS[100]!, GREYS[900]!)).toBeGreaterThanOrEqual(10)
  })

  it('a primary button: white text 4.5:1 on its fill, and the fill 3:1 against the page, in both modes', () => {
    expect(contrast(colors.surface, ACTION.light)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(ACTION.light, GREYS[0]!)).toBeGreaterThanOrEqual(3)
    expect(contrast(colors.surface, ACTION.dark)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(ACTION.dark, GREYS[900]!)).toBeGreaterThanOrEqual(3)
  })

  it('a primary button keeps white text readable when the pointer is over it', () => {
    expect(contrast(colors.surface, ACTION_HOVER.light)).toBeGreaterThanOrEqual(4.5)
    // Dark mode turns the fill lighter on hover, so the white text needs a check of its own.
    expect(contrast(colors.surface, ACTION_HOVER.dark)).toBeGreaterThanOrEqual(3)
  })

  it('a danger button: white text on the on-air red is 4.5:1', () => {
    expect(contrast(colors.surface, ERRORS[500]!)).toBeGreaterThanOrEqual(4.5)
  })

  it('a warning\'s text (the deep step) is 4.5:1 on its pale wash', () => {
    expect(contrast(WARNINGS[600]!, WARNINGS[50]!)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('the generated stylesheet', () => {
  const css = adminThemeCss()
  it('is custom properties only, with the dark-mode action colour', () => {
    expect(css).toContain('--color-base-1000: #0F1419;')
    expect(css).toContain("html[data-theme='dark']")
    // Every line is a comment, one of two selectors, a closing brace, or a custom property: nothing else can slip into the file.
    for (const line of css.split('\n').filter(Boolean)) {
      expect(line, line).toMatch(/^(\/\/ .*|:root \{|html\[data-theme='dark'\] \{|\}|  --[a-z0-9-]+: [^;{}]+;)$/)
    }
  })
  it('is what is committed: run `pnpm generate:admin-theme` when the tokens change', () => {
    const committed = readFileSync(path.resolve(__dirname, '../../app/(payload)/_admin-theme.scss'), 'utf8')
    expect(committed).toBe(css)
  })
})
