// What is left of the home page's news modules (the old coded page, retired 2026-11-21; the News run block replaced it): the limits the retired global still names, and the
// lead card's layout classes that every list of stories uses. Pure.

/** The most modules the retired Home page global took (its field's row limit). */
export const MAX_NEWS_MODULES = 6
/** How many stories past the count a news run asks for, so what the page already shows above it cannot leave it short. */
export const MODULE_SLACK = 12

/** Whole Tailwind class names for the parts of a news run's lead card (`leadCardClasses`). */
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

// A row: the picture takes the left half and fills the card's height, with at least a 3:2 of its own width so a card with little to say is not squat (the `before` spacer sets that
// minimum, and the picture stretches past it when the card is taller); the words take the right half, centred, with room and a larger headline.
const ROW = {
  sm: { card: 'sm:flex-row', frame: 'sm:w-1/2 sm:shrink-0 sm:aspect-auto sm:before:block sm:before:pt-[66.7%]', body: 'sm:flex-1 sm:justify-center sm:p-6', title: 'sm:text-2xl' },
  lg: { card: 'lg:flex-row', frame: 'lg:w-1/2 lg:shrink-0 lg:aspect-auto lg:before:block lg:before:pt-[66.7%]', body: 'lg:flex-1 lg:justify-center lg:p-6', title: 'lg:text-2xl' },
} as const
// Back to the ordinary card at a wide screen, for a lead that spans a tablet's row but sits in one column of three.
const COLUMN_LG = { card: 'lg:flex-col', frame: 'lg:w-full lg:aspect-[3/2] lg:before:hidden', body: 'lg:flex-none lg:justify-start lg:p-4', title: 'lg:text-xl' } as const

/**
 * How a news run's lead card is laid out where it spans columns (`leadSpanClass`). A 3:2 picture at two or three columns wide is as tall as the whole row, so the card
 * beside it stretches to match and leaves a blank panel, and any wider fixed frame makes the picture a thin strip. So a spanning lead is a ROW instead: the picture on the left
 * (near square beside a neighbour, 3:2 when the lead has the row to itself) and the headline and summary on the right, larger. A card that does not span, and every card on a phone,
 * is the ordinary column. Pure; whole class names, so Tailwind generates them.
 */
export function leadCardClasses(count: number): LeadClasses {
  const n = Math.max(0, Math.floor(count))
  const tabletRow = n % 2 === 1
  const wideRow = (n + 1) % 3 === 0 || n % 3 === 1
  const parts: Array<Pick<LeadClasses, keyof LeadClasses>> = []
  if (tabletRow) parts.push(ROW.sm)
  if (wideRow) parts.push(ROW.lg)
  else if (tabletRow) parts.push(COLUMN_LG)
  const join = (k: keyof LeadClasses) => parts.map((x) => x[k]).join(' ')
  return { card: join('card'), frame: join('frame'), body: join('body'), title: join('title') }
}

/**
 * The columns a news section's first (lead) story spans, so the card grid has no gap in its last row: two columns on a tablet and three on a wide screen.
 * An odd count spans two on a tablet; on a wide screen a count one more than a multiple of three spans two (5, 8), one that is one more than a multiple
 * of three on its own (4, 7) spans all three, and a multiple of three needs no span. Whole class names, so Tailwind generates them. Pure.
 */
export function leadSpanClass(count: number): string {
  const n = Math.max(0, Math.floor(count))
  const tablet = n % 2 === 1 ? 'sm:col-span-2' : ''
  const wide = (n + 1) % 3 === 0 ? 'lg:col-span-2' : n % 3 === 1 ? 'lg:col-span-3' : n % 2 === 1 ? 'lg:col-span-1' : ''
  return [tablet, wide].filter(Boolean).join(' ')
}
