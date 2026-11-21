/**
 * Desks: the four colour families a section can belong to (direction C2). A desk is a choice, never a colour: the section's `desk` select
 * names one, and everything drawn from it (chip, dot, number badge, heading mark) is a class of the design tokens listed here. Topics
 * (categories) have no desk and stay uncoloured.
 *
 * Every class is written out whole, so Tailwind sees it. The mark is a custom property the `.mark` rule in `globals.css` reads
 * (`--mk`); the coastal mark is the full lime, because the lime tint is too faint to read as a highlight on white (board 1l).
 */

export const DESK_IDS = ['news', 'coastal', 'arts', 'campus'] as const
export type DeskId = (typeof DESK_IDS)[number]

export const DEFAULT_DESK: DeskId = 'news'

export interface DeskStyle {
  /** What the desk is called where its name is drawn. */
  label: string
  /** A chip's fill. */
  tint: string
  /** An eyebrow's text, and a number badge's, on white. */
  text: string
  /** A pill chip's text on the tint. Equal to `text`, except Coastal: `success-fg` on `wuwf-lime-100` is 4.39:1, short of the 4.5:1 the site requires, so its pill is `ink-2`. */
  chipText: string
  /** The small round dot. */
  dot: string
  /** Sets `--mk`, the highlight under a section heading. */
  mark: string
}

export const DESKS: Record<DeskId, DeskStyle> = {
  news: { label: 'News', tint: 'bg-wuwf-blue-100', text: 'text-wuwf-blue-700', chipText: 'text-wuwf-blue-700', dot: 'bg-wuwf-blue', mark: '[--mk:var(--color-wuwf-blue-100)]' },
  coastal: { label: 'Coastal Futures', tint: 'bg-wuwf-lime-100', text: 'text-success-fg', chipText: 'text-ink-2', dot: 'bg-wuwf-lime', mark: '[--mk:var(--color-wuwf-lime)]' },
  arts: { label: 'Arts & Music', tint: 'bg-warning-bg', text: 'text-warning-fg', chipText: 'text-warning-fg', dot: 'bg-warning-border', mark: '[--mk:var(--color-warning-bg)]' },
  campus: { label: 'Campus', tint: 'bg-wuwf-teal-100', text: 'text-wuwf-teal', chipText: 'text-wuwf-teal', dot: 'bg-wuwf-teal', mark: '[--mk:var(--color-wuwf-teal-100)]' },
}

export const isDeskId = (value: unknown): value is DeskId => typeof value === 'string' && (DESK_IDS as readonly string[]).includes(value)

/** The desk a stored value names; anything else (nothing set, a value an older version wrote) is News. */
export const deskOf = (value: unknown): DeskId => (isDeskId(value) ? value : DEFAULT_DESK)
