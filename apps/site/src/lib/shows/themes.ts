import { themeCss } from '@wuwf/design-tokens'

/**
 * Per-show themes (phase 7a; boards 21-25). A show keeps its own identity on wuwf.org: its colours and type are a token set
 * defined here, in code, and checked for contrast by `themes.test.ts`. An editor only picks a theme on the show; no colour
 * or CSS is ever stored in the CMS (ROADMAP → Pages and templates). A show with no theme uses the station's look.
 *
 * Components read the theme through CSS variables (`--color-show-*`, `--font-show-*`) declared under
 * `[data-show-theme="<id>"]`, so one set of themed components serves every themed show.
 */
export interface ShowTheme {
  id: string
  label: string
  colors: {
    /** Page ground. */
    bg: string
    /** Cards and panels. */
    surface: string
    /** A card on hover. */
    raised: string
    /** Body and headline text. */
    text: string
    /** Secondary text and labels. */
    muted: string
    /** Eyebrows, links, the primary button's fill. */
    accent: string
    accentHover: string
    /** Text on the accent fill. */
    onAccent: string
    /** Section rules. */
    rule: string
    /** Card and control borders (decorative; the text never relies on them). */
    border: string
    /** The "Free" label. */
    free: string
  }
  /** CSS font stacks; the variables come from the faces loaded in `components/Show/themed/fonts.ts`. */
  fonts: { display: string; label: string; body: string }
}

export const SHOW_THEMES = {
  'barefoot-mary': {
    id: 'barefoot-mary',
    label: 'Barefoot Mary (amber on black)',
    // From the Barefoot Mary Design System. Its alpha colours (rules, borders) are flattened onto the page ground.
    colors: {
      bg: '#0e0c0a',
      surface: '#191612',
      raised: '#201d18',
      text: '#e8dfc8',
      muted: '#9e9278',
      accent: '#c49a3c',
      accentHover: '#d4b06a',
      onAccent: '#0e0c0a',
      rule: '#2f2513',
      border: '#221f1b',
      free: '#6aaca2',
    },
    // Chenier, the show's display face, is not licensed for the site yet (src/app/fonts/README.md): Lora stands in.
    fonts: {
      display: "var(--font-show-lora), Georgia, serif",
      label: "var(--font-show-league-gothic), 'Arial Narrow', sans-serif",
      body: "var(--font-show-lora), Georgia, serif",
    },
  },
} as const satisfies Record<string, ShowTheme>

export type ShowThemeId = keyof typeof SHOW_THEMES

/** The options for a show's theme field. The empty value is the station's own look. */
export const SHOW_THEME_OPTIONS = Object.values(SHOW_THEMES).map((t) => ({ label: t.label, value: t.id }))

/** A show's theme, or null for the station's look (also for an id no longer in the registry). */
export function showThemeOf(id: string | null | undefined): ShowTheme | null {
  return id && Object.hasOwn(SHOW_THEMES, id) ? SHOW_THEMES[id as ShowThemeId] : null
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

/** The CSS that scopes a theme's tokens under `[data-show-theme="<id>"]`. */
export function showThemeCss(theme: ShowTheme): string {
  return themeCss(`[data-show-theme="${theme.id}"]`, {
    colors: Object.fromEntries(Object.entries(theme.colors).map(([k, v]) => [`show-${kebab(k)}`, v])),
    fonts: Object.fromEntries(Object.entries(theme.fonts).map(([k, v]) => [`show-${k}`, v])),
  })
}
