import { contrastRatio } from '@wuwf/design-tokens'
import { describe, expect, it } from 'vitest'

import { PAGE_THEMES, THEME_IDS, TONES, pageThemeCss, resolveTheme, themeColor, isTone } from './themes'

const built = Object.values(PAGE_THEMES).filter((t) => t.built)

describe('page themes: contrast', () => {
  it('has a built station theme', () => {
    expect(PAGE_THEMES.wuwf.built).toBe(true)
  })
  for (const theme of built) {
    for (const tone of TONES) {
      const s = theme.tones[tone]
      const c = (name: Parameters<typeof themeColor>[1]) => themeColor(theme, name)
      it(`${theme.id} / ${tone}: text and muted text are 4.5:1 on the ground`, () => {
        expect(contrastRatio(c(s.text), c(s.ground))).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(c(s.muted), c(s.ground))).toBeGreaterThanOrEqual(4.5)
      })
      it(`${theme.id} / ${tone}: the accent and the outlined button's colour are 4.5:1 on the ground (they are text)`, () => {
        expect(contrastRatio(c(s.accent), c(s.ground))).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(c(s.ghost), c(s.ground))).toBeGreaterThanOrEqual(4.5)
      })
      it(`${theme.id} / ${tone}: the button's text is 4.5:1 on its fill, and its fill is 3:1 against the ground`, () => {
        expect(contrastRatio(c(s.buttonText), c(s.buttonFill))).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(c(s.buttonFill), c(s.ground))).toBeGreaterThanOrEqual(3)
      })
    }
  }
})

describe('page themes: resolution and css', () => {
  it('names the four themes and every tone', () => {
    expect(THEME_IDS).toEqual(['wuwf', 'radiolive', 'voyager', 'unearthing'])
    expect([...TONES]).toEqual(['plain', 'grey', 'accent', 'dark', 'teal', 'lime'])
    expect(isTone('dark')).toBe(true)
    expect(isTone('#ff0000')).toBe(false)
  })
  it('falls back to the station theme for an unbuilt, unknown or missing theme', () => {
    expect(resolveTheme('radiolive').id).toBe('wuwf')
    expect(resolveTheme('nonsense', null, undefined).id).toBe('wuwf')
    expect(resolveTheme(undefined).id).toBe('wuwf')
  })
  it('prefers the first built candidate', () => {
    expect(resolveTheme('wuwf', 'radiolive').id).toBe('wuwf')
  })
  it('emits one rule per tone, scoped to the theme, using only token variables', () => {
    const css = pageThemeCss(PAGE_THEMES.wuwf)
    for (const tone of TONES) expect(css).toContain(`[data-page-theme="wuwf"] [data-tone="${tone}"]`)
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,6}/)
    expect(css).toContain('--tone-button: var(--color-wuwf-lime)')
  })
})
