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
    expect([...TONES]).toEqual(['plain', 'grey', 'accent', 'dark', 'teal', 'lime', 'softlime'])
    expect(isTone('dark')).toBe(true)
    expect(isTone('#ff0000')).toBe(false)
  })
  it('falls back to the station theme for an unknown or missing theme', () => {
    expect(resolveTheme('nonsense', null, undefined).id).toBe('wuwf')
    expect(resolveTheme(undefined).id).toBe('wuwf')
  })
  it('builds all four themes, so a page set naming one renders in it', () => {
    expect(Object.values(PAGE_THEMES).every((t) => t.built)).toBe(true)
    for (const id of ['radiolive', 'voyager', 'unearthing'] as const) expect(resolveTheme(id).id).toBe(id)
  })
  it('prefers the first built candidate', () => {
    expect(resolveTheme('wuwf', 'radiolive').id).toBe('wuwf')
    expect(resolveTheme(null, 'voyager', 'radiolive').id).toBe('voyager')
  })
  it('emits one rule per tone, scoped to the theme, using only token variables', () => {
    const css = pageThemeCss(PAGE_THEMES.wuwf)
    for (const tone of TONES) expect(css).toContain(`[data-page-theme="wuwf"] [data-tone="${tone}"]`)
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,6}/)
    expect(css).toContain('--tone-button: var(--color-wuwf-lime)')
  })
  it('gives every tone a heading highlight (`--tone-mark`), as the direction C2 table says', () => {
    const marks = Object.fromEntries(TONES.map((t) => [t, PAGE_THEMES.wuwf.tones[t].mark]))
    expect(marks).toEqual({ plain: 'wuwf-blue-100', grey: 'wuwf-blue-100', accent: 'wuwf-lime-100', dark: 'wuwf-lime', teal: 'wuwf-lime', lime: 'wuwf-lime-600', softlime: 'wuwf-blue-100' })
    const css = pageThemeCss(PAGE_THEMES.wuwf)
    expect(css).toContain('--tone-mark: var(--color-wuwf-lime-600)')
  })
  it('keeps the highlight apart from the band: it is never the ground itself', () => {
    for (const theme of built) for (const tone of TONES) expect(theme.tones[tone].mark, `${theme.id} / ${tone}`).not.toBe(theme.tones[tone].ground)
  })
})

describe('the hub themes (hubs redesign, 2026-11-23)', () => {
  const light = ['plain', 'grey', 'accent'] as const
  it('RadioLive marks headings in the full lime on every light band, and leaves dark, teal, lime and softlime as the station has them', () => {
    for (const t of light) expect(PAGE_THEMES.radiolive.tones[t].mark).toBe('wuwf-lime')
    for (const t of ['dark', 'teal', 'lime', 'softlime'] as const) expect(PAGE_THEMES.radiolive.tones[t]).toEqual(PAGE_THEMES.wuwf.tones[t])
    expect(PAGE_THEMES.radiolive.nav).toBe('dark')
  })
  it('the Voyager is teal: accent, outlined button and highlight on light bands, a teal navigation, and the station\'s blue for the primary button', () => {
    const v = PAGE_THEMES.voyager
    for (const t of ['plain', 'grey'] as const) {
      expect(v.tones[t]).toMatchObject({ accent: 'wuwf-teal', ghost: 'wuwf-teal', mark: 'wuwf-teal-100', buttonFill: 'wuwf-blue-700' })
    }
    expect(v.nav).toBe('teal')
    expect(v.tones.teal).toEqual(PAGE_THEMES.wuwf.tones.teal)
  })
  it('Unearthing is paper: plain is the warning-bg ground with a white highlight, grey is white, and the hero title is italic and in the accent', () => {
    const u = PAGE_THEMES.unearthing
    expect(u.tones.plain).toMatchObject({ ground: 'warning-bg', mark: 'surface', accent: 'warning-fg' })
    expect(u.tones.grey).toMatchObject({ ground: 'surface', mark: 'warning-bg' })
    expect(u.display).toEqual({ italic: true, accent: true })
    expect(u.nav).toBe('plain')
  })
  it('only Unearthing sets its display title in italics', () => {
    expect(Object.values(PAGE_THEMES).filter((t) => t.display.italic).map((t) => t.id)).toEqual(['unearthing'])
  })
  it('the navigation takes a tone every theme defines', () => {
    for (const t of Object.values(PAGE_THEMES)) expect(TONES).toContain(t.nav)
  })
  it('every theme\'s css uses only token variables, never a colour', () => {
    for (const t of Object.values(PAGE_THEMES)) expect(pageThemeCss(t)).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
  })
  it('the navigation hook carries the band\'s colours without the band\'s sibling spacing', () => {
    const css = pageThemeCss(PAGE_THEMES.voyager)
    expect(css).toContain('[data-page-theme="voyager"] [data-nav-tone="teal"] {')
    expect(css).not.toContain('[data-nav-tone="teal"] + ')
    expect(css).toContain('--tone-display-style: normal;')
    expect(pageThemeCss(PAGE_THEMES.unearthing)).toContain('--tone-display-style: italic;')
    expect(pageThemeCss(PAGE_THEMES.unearthing)).toContain('--tone-display: var(--tone-accent);')
  })
})
