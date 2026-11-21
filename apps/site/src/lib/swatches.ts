/**
 * Swatches: the colour families an editor can give a section (direction C2). A section's colour tints its chip, its eyebrow, its number badge
 * and the highlight under its heading. It is chosen from this palette, never typed: each swatch is a set of design-token classes whose
 * contrast is tested (`swatches.test.ts`), so no choice can make an unreadable chip. A new family is one entry here, with its tokens
 * in `@wuwf/design-tokens` and a line in `SWATCH_LABELS`; editors then see it in the Sections admin without a deploy of their own.
 *
 * It is presentation only. A section is still just the first part of a story's address; its swatch decides how its name is drawn.
 * Topics (categories) have no swatch and stay uncoloured.
 *
 * Every class is written out whole, so Tailwind sees it. The mark is a custom property the `.mark` rule in `globals.css` reads (`--mk`).
 */

export const SWATCH_IDS = ['blue', 'lime', 'amber', 'teal', 'slate'] as const
export type SwatchId = (typeof SWATCH_IDS)[number]

export const DEFAULT_SWATCH: SwatchId = 'blue'

/** What the Sections admin offers, in order. */
export const SWATCH_LABELS: Record<SwatchId, string> = { blue: 'Blue', lime: 'Lime', amber: 'Amber', teal: 'Teal', slate: 'Slate' }

export interface SwatchStyle {
  /** A chip's fill. */
  tint: string
  /** An eyebrow's text on white. */
  text: string
  /** A pill chip's and a number badge's text on the tint. Equal to `text`, except Lime: `success-fg` on `wuwf-lime-100` is 4.39:1, short of the 4.5:1 the site requires, so its pill is `ink-2`. */
  chipText: string
  /** The small round dot. */
  dot: string
  /** Sets `--mk`, the highlight under a section heading. Lime's is the full lime, because its tint is too faint to read as a highlight on white (board 1l). */
  mark: string
}

export const SWATCHES: Record<SwatchId, SwatchStyle> = {
  blue: { tint: 'bg-wuwf-blue-100', text: 'text-wuwf-blue-700', chipText: 'text-wuwf-blue-700', dot: 'bg-wuwf-blue', mark: '[--mk:var(--color-wuwf-blue-100)]' },
  lime: { tint: 'bg-wuwf-lime-100', text: 'text-success-fg', chipText: 'text-ink-2', dot: 'bg-wuwf-lime', mark: '[--mk:var(--color-wuwf-lime)]' },
  amber: { tint: 'bg-warning-bg', text: 'text-warning-fg', chipText: 'text-warning-fg', dot: 'bg-warning-border', mark: '[--mk:var(--color-warning-bg)]' },
  teal: { tint: 'bg-wuwf-teal-100', text: 'text-wuwf-teal', chipText: 'text-wuwf-teal', dot: 'bg-wuwf-teal', mark: '[--mk:var(--color-wuwf-teal-100)]' },
  slate: { tint: 'bg-surface-3', text: 'text-ink-2', chipText: 'text-ink-2', dot: 'bg-ink-3', mark: '[--mk:var(--color-rule-strong)]' },
}

export const isSwatchId = (value: unknown): value is SwatchId => typeof value === 'string' && (SWATCH_IDS as readonly string[]).includes(value)

/** The swatch a stored value names; anything else (nothing set, a value an older version wrote) is the default. */
export const swatchOf = (value: unknown): SwatchId => (isSwatchId(value) ? value : DEFAULT_SWATCH)
