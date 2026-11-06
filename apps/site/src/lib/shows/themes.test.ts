import { contrastRatio } from '@wuwf/design-tokens'
import { describe, expect, it } from 'vitest'

import { SHOW_THEMES, showThemeCss, showThemeOf } from './themes'

const AA = 4.5

describe('show themes', () => {
  for (const theme of Object.values(SHOW_THEMES)) {
    describe(theme.id, () => {
      const c = theme.colors
      // Every pair a themed component puts text on. A theme that fails one cannot ship.
      const pairs: [string, string, string][] = [
        ['text on the page', c.text, c.bg],
        ['text on a card', c.text, c.surface],
        ['text on a hovered card', c.text, c.raised],
        ['secondary text on the page', c.muted, c.bg],
        ['secondary text on a card', c.muted, c.surface],
        ['secondary text on a hovered card', c.muted, c.raised],
        ['accent text on the page', c.accent, c.bg],
        ['accent text on a card', c.accent, c.surface],
        ['accent hover text on the page', c.accentHover, c.bg],
        ['button text on the accent', c.onAccent, c.accent],
        ['button text on the hovered accent', c.onAccent, c.accentHover],
        ['the Free label on a card', c.free, c.surface],
      ]
      for (const [what, fg, bg] of pairs) {
        it(`${what} reads at 4.5:1 or better`, () => {
          expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA)
        })
      }

      it('emits its tokens under its own selector only', () => {
        const css = showThemeCss(theme)
        expect(css.startsWith(`[data-show-theme="${theme.id}"] {`)).toBe(true)
        expect(css).toContain(`--color-show-bg: ${c.bg};`)
        expect(css).toContain('--color-show-accent-hover:')
        expect(css).toContain('--font-show-display:')
      })
    })
  }

  it('falls back to the station look for no theme or an unknown one', () => {
    expect(showThemeOf(null)).toBeNull()
    expect(showThemeOf('')).toBeNull()
    expect(showThemeOf('retired-theme')).toBeNull()
    expect(showThemeOf('toString')).toBeNull()
    expect(showThemeOf('barefoot-mary')?.id).toBe('barefoot-mary')
  })
})
