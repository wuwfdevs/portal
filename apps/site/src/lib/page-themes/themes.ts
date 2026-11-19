import { colors, themeCss, type ThemeOverrides } from '@wuwf/design-tokens'

/**
 * Page themes and tones (PAGE-BLOCKS.md → Themes). A page set picks a THEME: a small set of token overrides over the station's tokens
 * (`@wuwf/design-tokens`), the same mechanism the themed shows use (`lib/shows/themes.ts`). Within a page an editor picks a TONE for each
 * section: a named ground (`plain`, `grey`, `accent`, `dark`, `teal`, `lime`), never a colour. The theme decides what each tone looks
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
export const TONES = ['plain', 'grey', 'accent', 'dark', 'teal', 'lime'] as const
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
}

export interface PageTheme {
  id: ThemeId
  label: string
  /** Whether the theme's tokens exist. An unbuilt theme is a name only. */
  built: boolean
  overrides: ThemeOverrides
  tones: Record<Tone, ToneStyle>
}

const onLight = { text: 'ink', muted: 'ink-2', buttonFill: 'wuwf-blue-700', buttonText: 'surface' } as const
const onDark = { text: 'surface', muted: 'surface-dark-text', buttonFill: 'wuwf-lime', buttonText: 'ink' } as const

const wuwf: PageTheme = {
  id: 'wuwf',
  label: 'WUWF',
  built: true,
  overrides: {},
  tones: {
    plain: { ground: 'surface', rule: 'rule', ...onLight, muted: 'ink-3' },
    grey: { ground: 'surface-2', rule: 'rule-strong', ...onLight, muted: 'ink-3' },
    accent: { ground: 'wuwf-blue-100', rule: 'rule-strong', ...onLight },
    dark: { ground: 'surface-dark', rule: 'surface-dark-line', ...onDark },
    teal: { ground: 'wuwf-teal', rule: 'surface-dark-line', ...onDark },
    lime: { ground: 'wuwf-lime', rule: 'ink-3', text: 'ink', muted: 'ink-2', buttonFill: 'ink', buttonText: 'surface' },
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
 * variables its block reads (`--tone-text`, `--tone-muted`, `--tone-rule`, `--tone-button`, `--tone-button-text`). Tones reference the
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
        `  background-color: var(--tone-ground);\n  color: var(--tone-text);\n}`,
    )
  }
  return parts.filter(Boolean).join('\n')
}
