import { colors, contrastRatio, fontFamilies, parseHex, radii } from '@wuwf/design-tokens'

/**
 * The admin's look, from the WUWF Design System's tokens. Payload's admin draws everything from a handful of CSS variables (a grey scale,
 * a blue/"success" scale, warning and error scales, a body font); this module builds those variables from `@wuwf/design-tokens`, so the
 * admin changes when the tokens do and no hex value is typed in a stylesheet. `scripts/generate-admin-theme-css.ts` writes the result to
 * `app/(payload)/_admin-theme.scss` (run `pnpm generate:admin-theme`); `theme.test.ts` fails when that file is stale, and checks contrast.
 *
 * Pure: no Payload, no React, no file access.
 */

type Rgb = [number, number, number]
const toHex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`

/** `t` of the way from colour `a` to colour `b`, in sRGB. */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [parseHex(a), parseHex(b)]
  return toHex([0, 1, 2].map((i) => x[i]! + (y[i]! - x[i]!) * t) as Rgb)
}

/** A scale from a few anchors: each step is a straight line between the two anchors around it. Steps outside the anchors take the nearest anchor. */
export function ramp(anchors: Record<number, string>, steps: readonly number[]): Record<number, string> {
  const keys = Object.keys(anchors).map(Number).sort((p, q) => p - q)
  const out: Record<number, string> = {}
  for (const step of steps) {
    const exact = anchors[step]
    if (exact) {
      out[step] = exact.toUpperCase()
      continue
    }
    const lo = [...keys].reverse().find((k) => k < step)
    const hi = keys.find((k) => k > step)
    if (lo === undefined) out[step] = anchors[hi!]!.toUpperCase()
    else if (hi === undefined) out[step] = anchors[lo]!.toUpperCase()
    else out[step] = mix(anchors[lo]!, anchors[hi]!, (step - lo) / (hi - lo))
  }
  return out
}

const GREY_STEPS = [0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000] as const
const HUE_STEPS = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950] as const

/**
 * The cool grey scale, from the page to the ink. Payload builds light and dark mode from this one scale (dark mode reads it
 * backwards), so both come out of the tokens. Muted text sits at 500 and darker, and is held to its contrast by the test.
 */
export const GREYS = ramp(
  {
    0: colors.surface,
    50: colors['surface-2'],
    100: colors['surface-3'],
    150: colors.rule,
    300: colors['rule-strong'],
    450: colors['ink-4'],
    650: colors['ink-3'],
    800: colors['ink-2'],
    900: colors['surface-dark'],
    1000: colors.ink,
  },
  GREY_STEPS,
)

/** Payload's "blue" and its "success" are one scale; here it is the station blue, from a pale wash to the navy. */
export const BLUES = ramp(
  {
    50: mix(colors['wuwf-blue-100'], colors.surface, 0.5),
    100: colors['wuwf-blue-100'],
    400: colors['wuwf-blue'],
    600: colors['wuwf-blue-600'],
    700: colors['wuwf-blue-700'],
    900: colors['surface-dark'],
    950: colors.ink,
  },
  HUE_STEPS,
)

export const WARNINGS = ramp(
  { 50: colors['warning-bg'], 300: colors['warning-border'], 600: colors['warning-fg'], 950: colors.ink },
  HUE_STEPS,
)

export const ERRORS = ramp(
  {
    50: mix(colors['on-air-red'], colors.surface, 0.92),
    500: colors['on-air-red'],
    700: mix(colors['on-air-red'], colors.ink, 0.35),
    950: colors.ink,
  },
  HUE_STEPS,
)

/** The colour of a primary button and of the current place, by mode. White text sits on it at 4.5:1 or better in both. */
export const ACTION = { light: colors['wuwf-blue-700'], dark: colors['wuwf-blue-600'] } as const
/** What a primary button turns on hover. */
export const ACTION_HOVER = { light: colors['surface-dark'], dark: colors['wuwf-blue'] } as const

const scale = (name: string, values: Record<number, string>) => Object.entries(values).map(([step, hex]) => `  --color-${name}-${step}: ${hex};`)

/** The generated stylesheet: custom properties only. Payload's own are in a lower cascade layer, so these win without `!important`. */
export function adminThemeCss(): string {
  const lines = [
    ...scale('base', GREYS),
    ...scale('blue', BLUES),
    ...scale('success', BLUES),
    ...scale('warning', WARNINGS),
    ...scale('error', ERRORS),
    `  --font-body: ${fontFamilies.sans};`,
    `  --style-radius-s: ${radii['r-2']};`,
    `  --style-radius-m: ${radii['r-2']};`,
    `  --style-radius-l: ${radii['r-3']};`,
    `  --wuwf-action: ${ACTION.light};`,
    `  --wuwf-action-hover: ${ACTION_HOVER.light};`,
    `  --wuwf-action-text: ${colors.surface};`,
    `  --theme-brand: var(--wuwf-action);`,
  ]
  const dark = [`  --wuwf-action: ${ACTION.dark};`, `  --wuwf-action-hover: ${ACTION_HOVER.dark};`]
  return [
    '// Generated from @wuwf/design-tokens by scripts/generate-admin-theme-css.ts. Do not edit; run `pnpm generate:admin-theme`.',
    `:root {\n${lines.join('\n')}\n}`,
    `html[data-theme='dark'] {\n${dark.join('\n')}\n}`,
    '',
  ].join('\n')
}

export const contrast = contrastRatio
