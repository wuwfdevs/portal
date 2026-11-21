import { colors, contrastRatio } from '@wuwf/design-tokens'
import { describe, expect, it } from 'vitest'

import { DEFAULT_SWATCH, SWATCHES, SWATCH_IDS, SWATCH_LABELS, isSwatchId, swatchOf } from './swatches'

/** `bg-wuwf-blue-100` → `wuwf-blue-100`; `[--mk:var(--color-wuwf-lime)]` → `wuwf-lime`. */
const tokenIn = (cls: string): string => (cls.match(/var\(--color-([a-z0-9-]+)\)/) ?? cls.match(/^(?:bg|text)-([a-z0-9-]+)$/))?.[1] ?? ''
const hex = (cls: string) => colors[tokenIn(cls) as keyof typeof colors]

describe('swatches', () => {
  it('start with blue, the default, and every one has a label for the admin', () => {
    expect(SWATCH_IDS[0]).toBe('blue')
    expect(DEFAULT_SWATCH).toBe('blue')
    for (const id of SWATCH_IDS) expect(SWATCH_LABELS[id], id).toBeTruthy()
    expect(Object.keys(SWATCH_LABELS).sort()).toEqual([...SWATCH_IDS].sort())
    expect(Object.keys(SWATCHES).sort()).toEqual([...SWATCH_IDS].sort())
  })
  it('name only classes of real colour tokens, so no swatch can draw an unknown colour', () => {
    for (const id of SWATCH_IDS) {
      for (const key of ['tint', 'text', 'chipText', 'dot', 'mark'] as const) {
        expect(Object.keys(colors), `${id}.${key}: ${SWATCHES[id][key]}`).toContain(tokenIn(SWATCHES[id][key]))
      }
    }
  })
  it('keep a pill chip text at 4.5:1 on its tint, and an eyebrow at 4.5:1 on white, for every swatch', () => {
    for (const id of SWATCH_IDS) {
      expect(contrastRatio(hex(SWATCHES[id].chipText), hex(SWATCHES[id].tint)), `${id} pill on its tint`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(hex(SWATCHES[id].text), colors.surface), `${id} on white`).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('keep the highlight visible against white, so a heading mark can be seen', () => {
    for (const id of SWATCH_IDS) expect(contrastRatio(hex(SWATCHES[id].mark), colors.surface), id).toBeGreaterThan(1.1)
  })
  it('name the Lime pill text apart from its eyebrow text, because the eyebrow colour on the lime tint is 4.39:1', () => {
    expect(contrastRatio(colors['success-fg'], colors['wuwf-lime-100'])).toBeLessThan(4.5)
    expect(SWATCHES.lime.chipText).not.toBe(SWATCHES.lime.text)
  })
  it('read any stored value safely', () => {
    expect(swatchOf('amber')).toBe('amber')
    for (const v of [undefined, null, '', 'sports', 'Blue', 4, {}]) expect(swatchOf(v)).toBe('blue')
    expect(isSwatchId('teal')).toBe(true)
    expect(isSwatchId('news')).toBe(false)
  })
})
