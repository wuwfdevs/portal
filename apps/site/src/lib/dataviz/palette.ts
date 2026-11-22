// The colours a chart or map may use, taken from the WUWF design tokens and never typed here. A series colour has to be seen against the
// page (3:1, the rule for graphics) and told apart from its neighbours; `palette.test.ts` checks the first. Order matters: the first colour
// is the station's blue, so a one-series chart is on brand, and the next ones differ in lightness as well as hue.

import { colors } from '@wuwf/design-tokens'

export const SERIES_COLORS: readonly string[] = [
  colors['wuwf-blue-700'],
  colors['warning-fg'],
  colors['success-fg'],
  colors['wuwf-blue'],
  colors['ink-3'],
  colors['wuwf-teal'],
]

/** The colour a value with no value draws in. */
export const NO_DATA_COLOR: string = colors['surface-3']
export const BASE_SHAPE_COLOR: string = colors['wuwf-blue-100']
export const SHAPE_OUTLINE: string = colors['rule-strong']

function channels(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0').toUpperCase()

/** `steps` colours from the lightest blue to the station's deep blue, evenly spaced: a sequential ramp for one measure. */
export function blueRamp(steps: number): string[] {
  const from = channels(colors['wuwf-blue-100'])
  const to = channels(colors['wuwf-blue-700'])
  if (steps <= 1) return [colors['wuwf-blue-700']]
  return Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1)
    return `#${[0, 1, 2].map((c) => toHex(from[c]! + (to[c]! - from[c]!) * t)).join('')}`
  })
}
