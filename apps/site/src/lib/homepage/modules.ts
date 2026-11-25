// What is left of the home page's news modules (the old coded page, retired 2026-11-21; the News run block replaced it): the limits the retired global still names, and the
// lead row's layout classes that a news run uses. Pure.

/** The most modules the retired Home page global took (its field's row limit). */
export const MAX_NEWS_MODULES = 6
/**
 * How many stories a News run block holds: 3 to 7, and 5 when none is chosen. The lead has a row of its own and the rest fill an even grid, which three, four, five and seven
 * stories do whole (six ends in a short row of two); eight would leave one alone, so it is not offered. The block, its field and the converter all read this.
 */
export const NEWS_RUN_COUNT = { min: 3, max: 7, standard: 5 } as const
/** A stored count held to the News run's range, and the standard one when it is not a number. */
export const newsRunCount = (stored: number | null | undefined): number =>
  typeof stored === 'number' && Number.isFinite(stored) ? Math.min(NEWS_RUN_COUNT.max, Math.max(NEWS_RUN_COUNT.min, Math.round(stored))) : NEWS_RUN_COUNT.standard
/**
 * A news run's two layouts (2026-11-25, the homepage rethink): `lead` gives the first story a row of its own and the rest an even grid below it (the station's own
 * section, Local News); `row` is one row of cards with no lead, for a section that rarely has one story above the rest (Florida News, NPR News).
 */
export const NEWS_RUN_VARIANTS = [
  { label: 'Lead and cards: the first story on a row of its own', value: 'lead' },
  { label: 'One row: three cards, no lead', value: 'row' },
] as const
export type NewsRunVariant = (typeof NEWS_RUN_VARIANTS)[number]['value']
/** How many stories a one-row run shows: one row of three on a wide screen. */
export const NEWS_ROW_COUNT = 3
/** A stored variant, read safely: anything but `row` is the lead layout, so a run saved before the variant existed keeps its look. */
export const newsRunVariant = (stored: unknown): NewsRunVariant => (stored === 'row' ? 'row' : 'lead')
/** How many stories a run takes: a row takes one row, a lead run the editor's count. */
export const newsRunTake = (variant: unknown, stored: number | null | undefined): number => (newsRunVariant(variant) === 'row' ? NEWS_ROW_COUNT : newsRunCount(stored))
/**
 * The columns of a one-row run on a wide screen, written whole for Tailwind: three across, or as many as there are when a quiet day leaves fewer, so two stories fill the
 * row at half width each rather than leaving a hole where the third would be. Merged over `StoryGrid`'s own classes.
 */
export function rowGridClass(shown: number): string {
  const n = Math.max(0, Math.floor(shown))
  if (n === 1) return 'sm:grid-cols-1 lg:grid-cols-1'
  if (n === 2) return 'sm:grid-cols-2 lg:grid-cols-2'
  return 'sm:grid-cols-2 lg:grid-cols-3'
}
/** How many stories past the count a news run asks for, so what the page already shows above it cannot leave it short. */
export const MODULE_SLACK = 12

/** Whole Tailwind class names for the parts of a news run's lead row (`LEAD_ROW`). */
export interface LeadClasses {
  /** The card's own direction: a row (picture beside the words) or a column. */
  card: string
  /** The picture's frame. */
  frame: string
  /** The words' box. */
  body: string
  /** The headline's size. */
  title: string
}

/**
 * A news run's lead story, drawn on a row of its own (`StoryGrid` with `spanFirst`): a fixed 3:2 picture on the left, about two fifths of the row, and the story's words on the
 * right, vertically centred, with a larger headline. It is a row from a tablet up and the ordinary column on a phone. The picture keeps its shape, whatever sits near it, because
 * nothing shares the row. The page's own lead (`LeadArticle`) is bigger on every count (an `h1`, a 16:9 or taller picture, a longer summary, two actions), so the ranking stays
 * page lead, then a section's lead, then its cards. Whole class names, so Tailwind generates them.
 */
export const LEAD_ROW: LeadClasses = {
  card: 'sm:flex-row sm:items-center sm:gap-8',
  frame: 'sm:w-2/5 sm:shrink-0',
  body: 'sm:flex-1 sm:justify-center',
  title: 'sm:text-2xl lg:text-3xl',
}

/**
 * The columns of the grid under a news run's lead, for the stories that are left (`remaining`): two across on a tablet and three on a wide screen, except that two stories stay two
 * and four go four across, so the row is whole. Five left (a run of six) ends in a short row of two, and seven left (a run of eight) would end in one alone, which is why a run holds at most seven (`NewsRun`).
 * An odd number leaves one card alone on a tablet's last row; that is accepted. Whole class names, so Tailwind generates them. Pure.
 */
export function restGridClass(remaining: number): string {
  const n = Math.max(0, Math.floor(remaining))
  if (n === 2) return 'sm:grid-cols-2'
  if (n === 4) return 'sm:grid-cols-2 lg:grid-cols-4'
  return 'sm:grid-cols-2 lg:grid-cols-3'
}
