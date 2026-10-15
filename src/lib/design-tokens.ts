/**
 * The portal's colour and type tokens, in one place. `tailwind.config.ts` builds its theme from
 * this file, and the few places that cannot use a Tailwind class (SVG attributes, inline styles,
 * the affidavit PDF) import it directly — so a colour is spelled out here and nowhere else.
 * `design-tokens.test.ts` fails the build on a `#hex` or a `text-[Npx]` anywhere else in `src/`.
 *
 * These mirror the "Portal layer" of the WUWF Design System. Names follow the portal's, not the
 * design system's: brand-primary is wuwf-blue, ink-900/700/500/400 are ink/ink-2/ink-3/ink-4,
 * line is rule, panel-50/100 are surface-2/-3, danger is on-air-red.
 */

export const colors = {
  brand: {
    primary: "#3090D0",
    // Primary's hover and pressed state.
    hover: "#2278B8",
    link: "#185F95",
    surface: "#D5EAF6",
    // A faint wash of brand blue: the selected card, a drop zone, an info band.
    tint: "#F3F9FD",
    // The one lime accent on the affidavit PDF's masthead.
    lime: "#8DC63F",
  },
  // The dark navy: a filled badge, a modal scrim, the Resources "break" panel, newscasts on a clock.
  deep: {
    DEFAULT: "#0F2235",
    line: "#2A3F55",
    hover: "#16304A",
    text: "#C9D3DE",
  },
  ink: {
    900: "#0F1419",
    700: "#2B2F36",
    500: "#5A6068",
    // Disabled and de-emphasised text; below 4.5:1 on white, so never the only carrier of meaning.
    400: "#8A9099",
  },
  line: {
    DEFAULT: "#E2E5E9",
    // A control's border and a divider that must hold on a panel.
    strong: "#C9CED4",
  },
  panel: {
    50: "#F5F7F9",
    100: "#ECEFF2",
  },
  // Words that already belong to a clip. Deliberately not a brand blue:
  // ::selection and the follow-along line are both brand-surface, so a
  // blue mark here would be indistinguishable from "selected right now"
  // and "the playhead is on this line".
  clipped: {
    line: "#D7A21A",
    hover: "#FBF2D2",
    selected: "#FBEFC0",
  },
  // Words and blocks a data point points at (Sourcework analysis). Lime, so
  // it never reads as an excerpt (gold) or the playhead (blue).
  evidence: {
    line: "#C0E040",
    hover: "#F6FAE0",
    selected: "#EEF6CC",
    text: "#5D7A16",
  },
  danger: {
    DEFAULT: "#D63E2D",
    // Error and over-limit text: the red above is 4.2:1 on white, this is not.
    fg: "#8F3A3A",
    // A blackout, a closed hour, a bar that has run out.
    border: "#B45454",
  },
  success: {
    bg: "#EEF6CC",
    border: "#C0E040",
    fg: "#5D7A16",
  },
  warning: {
    bg: "#FCEFD3",
    border: "#E3A63D",
    fg: "#8A5A12",
  },
  // The categorical colours of the clock diagrams — data marks, not UI chrome.
  data: {
    teal: "#6B9B96",
    violet: "#8B6BC7",
    violetDark: "#5B3F94",
    rose: "#C74B6B",
    roseDark: "#8A2E45",
  },
} as const;

/**
 * Named type sizes. Each is a bare font-size (no line-height), so replacing `text-[13px]` with
 * `text-ui` changes nothing on screen. Tailwind's own `text-xs`/`text-sm`/`text-base` stay for
 * the places that want their line-height too.
 */
export const fontSize = {
  /** Count chips, tiny overlines. */
  badge: "10px",
  /** Uppercase column and field labels, stat captions. */
  label: "11px",
  /** Secondary and meta text. */
  meta: "12px",
  /** Controls, table cells, most interface text. */
  ui: "13px",
  /** Reading text in cards and panels. */
  body: "15px",
  /** A section's heading. */
  section: "17px",
  /** A page's title. */
  title: "20px",
  /** A large serif heading. */
  display: "22px",
  /** A big figure. */
  stat: "28px",
  /** The Resources hero. */
  hero: "32px",
} as const;
