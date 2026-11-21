import { colors, contrastRatio } from '@wuwf/design-tokens'
import { describe, expect, it } from 'vitest'

import { DEFAULT_DESK, DESKS, DESK_IDS, deskOf, isDeskId } from './desks'

/** `bg-wuwf-blue-100` → `wuwf-blue-100`; `[--mk:var(--color-wuwf-lime)]` → `wuwf-lime`. */
const tokenIn = (cls: string): string => (cls.match(/var\(--color-([a-z0-9-]+)\)/) ?? cls.match(/^(?:bg|text)-([a-z0-9-]+)$/))?.[1] ?? ''

describe('desks', () => {
  it('are the four of direction C2, News first and the default', () => {
    expect([...DESK_IDS]).toEqual(['news', 'coastal', 'arts', 'campus'])
    expect(DEFAULT_DESK).toBe('news')
  })
  it('name only classes of real colour tokens, so no desk can draw an unknown colour', () => {
    for (const id of DESK_IDS) {
      for (const key of ['tint', 'text', 'chipText', 'dot', 'mark'] as const) {
        const token = tokenIn(DESKS[id][key])
        expect(Object.keys(colors), `${id}.${key}: ${DESKS[id][key]}`).toContain(token)
      }
    }
  })
  it('keep a pill chip text at 4.5:1 on its tint, and an eyebrow at 4.5:1 on white', () => {
    const hex = (cls: string) => colors[tokenIn(cls) as keyof typeof colors]
    for (const id of DESK_IDS) {
      expect(contrastRatio(hex(DESKS[id].chipText), hex(DESKS[id].tint)), `${id} pill on its tint`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(hex(DESKS[id].text), colors.surface), `${id} on white`).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('name the Coastal pill text apart from its eyebrow text, because the eyebrow colour on the lime tint is 4.39:1', () => {
    expect(contrastRatio(colors['success-fg'], colors['wuwf-lime-100'])).toBeLessThan(4.5)
    expect(DESKS.coastal.chipText).not.toBe(DESKS.coastal.text)
  })
  it('read any stored value safely', () => {
    expect(deskOf('arts')).toBe('arts')
    for (const v of [undefined, null, '', 'sports', 4, {}]) expect(deskOf(v)).toBe('news')
    expect(isDeskId('campus')).toBe(true)
    expect(isDeskId('Campus')).toBe(false)
  })
})
