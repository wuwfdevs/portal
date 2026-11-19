import { colors, themeCss, type ThemeOverrides } from '@wuwf/design-tokens'

/**
 * Page themes and tones (PAGE-BLOCKS.md → Themes). A page set picks a THEME: a small set of token overrides over the station's tokens
 * (`@wuwf/design-tokens`), the same mechanism the themed shows use (`lib/shows/themes.ts`). Within a page an editor picks a TONE for each
 * section: a named ground (`plain`, `grey`, `accent`, `dark`, `teal`, `lime`, `softlime`), never a colour. The theme decides what each tone looks
 * like, so the same block is a different hub in a different theme. Colours are tokens, in code; no colour or CSS is stored in the CMS.
 *
 * `themes.test.ts` checks every tone of every built theme: text 4.5:1 on its ground, muted text 4.5:1, button text 4.5:1 on its fill, and
 * the button fill 3:1 against its ground (RadioLive's lime button on white was 1.5:1; text contrast alone would not have caught it).
 *
 * Only `wuwf` is built. The other three are named so a page set can name them; until a theme is built a page set using it renders in
 * `wuwf` (`resolveTheme`). Their token values come with their hub, signed off by the owner (PAGE-BLOCKS.md, phase 6).
 */
export const THEME_IDS = ['wuwf', 'radiolive', 'voyager', 'unearthing'] as const
export type ThemeId = (typeof THEME_IDS)[number]

/** The named grounds an editor can give a section. `teal` and `lime` are the bands the built sponsor and giving pages already use. */
export const TONES = ['plain', 'grey', 'accent', 'dark', 'teal', 'lime', 'softlime'] as const
export type Tone = (typeof TONES)[number]

export function isTone(value: unknown): value is Tone {
  return typeof value === 'string' && (TONES as readonly string[]).includes(value)
}

type TokenName = keyof typeof colors

/** One tone in one theme, by colour token name. */
export interface ToneStyle {
  ground: TokenName
  /** Body text and headings. */
  text: TokenName
  /** Secondary text: eyebrows, captions, source lines. */
  muted: TokenName
  /** Dividers inside the band (decorative; text never relies on them). */
  rule: TokenName
  /** The band's primary button. */
  buttonFill: TokenName
  buttonText: TokenName
  /** The colour of an eyebrow, a figure's rule, a price and a link: the band's accent (blue on light grounds, lime on dark). Text, so 4.5:1. */
  accent: TokenName
  /** The outlined button's text and border. Text, so 4.5:1. */
  ghost: TokenName
  /** The ground of a card or tile drawn on the band (a CSS value built from tokens), and its border. */
  card: string
  cardRule: string
  /** A quiet tint on the band: a note, a chosen option. */
  tint: string
}

export interface PageTheme {
  id: ThemeId
  label: string
  /** Whether the theme's tokens exist. An unbuilt theme is a name only. */
  built: boolean
  overrides: ThemeOverrides
  tones: Record<Tone, ToneStyle>
}

const onLight = {
  text: 'ink', muted: 'ink-2', buttonFill: 'wuwf-blue-700', buttonText: 'surface', accent: 'wuwf-blue-700', ghost: 'wuwf-blue-700',
  card: 'var(--color-surface)', cardRule: 'var(--color-rule-strong)', tint: 'var(--color-wuwf-blue-100)',
} as const
const onDark = {
  text: 'surface', muted: 'surface-dark-text', buttonFill: 'wuwf-lime', buttonText: 'ink', accent: 'wuwf-lime', ghost: 'surface',
  card: 'color-mix(in srgb, var(--color-surface) 6%, transparent)', cardRule: 'color-mix(in srgb, var(--color-surface) 18%, transparent)', tint: 'color-mix(in srgb, var(--color-surface) 10%, transparent)',
} as const

const wuwf: PageTheme = {
  id: 'wuwf',
  label: 'WUWF',
  built: true,
  overrides: {},
  tones: {
    plain: { ground: 'surface', rule: 'rule', ...onLight, muted: 'ink-3' },
    grey: { ground: 'surface-2', rule: 'rule-strong', ...onLight, muted: 'ink-3' },
    accent: { ground: 'wuwf-blue-100', rule: 'rule-strong', ...onLight, tint: 'var(--color-surface)' },
    dark: { ground: 'surface-dark', rule: 'surface-dark-line', ...onDark },
    teal: { ground: 'wuwf-teal', rule: 'surface-dark-line', ...onDark },
    softlime: {
      ground: 'wuwf-lime-100', rule: 'ink-3', text: 'ink', muted: 'ink-2', buttonFill: 'wuwf-blue-700', buttonText: 'surface', accent: 'wuwf-blue-700', ghost: 'wuwf-blue-700',
      card: 'var(--color-surface)', cardRule: 'var(--color-wuwf-lime-600)', tint: 'color-mix(in srgb, var(--color-ink) 6%, transparent)',
    },
    lime: {
      ground: 'wuwf-lime', rule: 'ink-3', text: 'ink', muted: 'ink-2', buttonFill: 'ink', buttonText: 'surface', accent: 'ink', ghost: 'ink',
      card: 'var(--color-surface)', cardRule: 'var(--color-ink-3)', tint: 'color-mix(in srgb, var(--color-ink) 8%, transparent)',
    },
  },
}

/** A theme that is only named. Its tones are the station's, so nothing renders half-themed. */
const named = (id: ThemeId, label: string): PageTheme => ({ ...wuwf, id, label, built: false })

export const PAGE_THEMES: Readonly<Record<ThemeId, PageTheme>> = {
  wuwf,
  radiolive: named('radiolive', 'RadioLive'),
  voyager: named('voyager', 'The Voyager'),
  unearthing: named('unearthing', 'Unearthing Florida'),
}

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
}

/** The theme a page renders in: its own choice, else its set's, else the station's. An unbuilt theme falls back to the station's. */
export function resolveTheme(...candidates: Array<string | null | undefined>): PageTheme {
  for (const c of candidates) {
    if (isThemeId(c) && PAGE_THEMES[c].built) return PAGE_THEMES[c]
  }
  return PAGE_THEMES.wuwf
}

/** The theme's colours as hex, for a contrast check: the station's tokens with the theme's overrides on top. */
export function themeColor(theme: PageTheme, token: TokenName): string {
  const override = (theme.overrides.colors as Record<string, string | undefined> | undefined)?.[token]
  return override ?? colors[token]
}

/**
 * The CSS for one theme under `[data-page-theme="<id>"]`: its token overrides, then one rule per tone that sets the band's ground and the
 * variables its block reads (`--tone-text`, `--tone-muted`, `--tone-rule`, `--tone-button`, `--tone-button-text`, `--tone-accent`, `--tone-ghost`, `--tone-card`, `--tone-card-rule`, `--tone-tint`). Tones reference the
 * `--color-*` variables, so a theme's overrides reach them. Static, from code, so it is safe to inline.
 */
export function pageThemeCss(theme: PageTheme): string {
  const scope = `[data-page-theme="${theme.id}"]`
  const parts = [themeCss(scope, theme.overrides)]
  for (const tone of TONES) {
    const t = theme.tones[tone]
    parts.push(
      `${scope} [data-tone="${tone}"] {\n` +
        `  --tone-ground: var(--color-${t.ground});\n  --tone-text: var(--color-${t.text});\n  --tone-muted: var(--color-${t.muted});\n` +
        `  --tone-rule: var(--color-${t.rule});\n  --tone-button: var(--color-${t.buttonFill});\n  --tone-button-text: var(--color-${t.buttonText});\n` +
        `  --tone-accent: var(--color-${t.accent});\n  --tone-ghost: var(--color-${t.ghost});\n  --tone-card: ${t.card};\n  --tone-card-rule: ${t.cardRule};\n  --tone-tint: ${t.tint};\n` +
        `  background-color: var(--tone-ground);\n  color: var(--tone-text);\n}`,
      // Two bands of the same tone in a row read as one: the gap between them is a section gap, not two bands' padding.
      `${scope} [data-tone="${tone}"] + [data-tone="${tone}"] {\n  padding-top: 2rem;\n}\n${scope} [data-tone="${tone}"]:has(+ [data-tone="${tone}"]) {\n  padding-bottom: 0;\n}`,
    )
  }
  return parts.filter(Boolean).join('\n')
}
