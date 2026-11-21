// The news modules of the home page: a titled run of stories from one section, each linking to its section page. Editors choose which
// sections, in what order, and how many stories each shows; this file decides what each one holds. Pure: the loader hands it stories the
// public may already read.
//
// A story appears once on the page: the lead, the Briefing and the fellowship feature take theirs first, then each module in order
// takes the newest of its section that nothing above has shown. A module left with nothing is left out rather than drawn empty, and when
// no module has anything (no sections set up yet, or a fresh site) one "Latest stories" run stands in, so the page is never blank.

import type { SwatchId } from '@/lib/swatches'

type Id = string | number

export const MODULE_COUNT = { min: 3, max: 8, fallback: 5 } as const
/** The most modules the page takes. The admin enforces it as the field's row limit; the loader enforces it again. */
export const MAX_NEWS_MODULES = 6
/** How many stories past the count each module asks for, so what the page already shows above it cannot leave it short. */
export const MODULE_SLACK = 12
/** The address of the list of every story, where the news band ends. */
export const ALL_STORIES_HREF = '/latest'

/** A module's story count, kept within bounds whatever is stored. */
export function moduleCount(stored: number | null | undefined): number {
  if (typeof stored !== 'number' || !Number.isFinite(stored)) return MODULE_COUNT.fallback
  return Math.min(MODULE_COUNT.max, Math.max(MODULE_COUNT.min, Math.round(stored)))
}

export interface ModuleRequest<T> {
  /** Stable for the page: the module's row id, or its position. */
  key: string
  heading: string
  /** The section's own page, "More from <heading>". */
  href: string | null
  /** The section's colour (`sections.swatch`), the mark under its heading. Absent: the default swatch. */
  swatch?: SwatchId | null
  count: number
  /** The section's newest published stories, newest first (more than `count`, to absorb what is shown above). */
  candidates: readonly T[]
}

export interface FilledModule<T> {
  key: string
  heading: string
  href: string | null
  swatch?: SwatchId | null
  stories: T[]
}

/**
 * Each module's stories: the newest of its candidates not shown above or by an earlier module, up to its count. Modules with nothing
 * left are dropped. `shown` is the stories already on the page (lead, Briefing, fellowship feature).
 */
export function fillModules<T extends { id: Id }>(requests: readonly ModuleRequest<T>[], shown: readonly { id: Id }[]): FilledModule<T>[] {
  const taken = new Set(shown.map((s) => String(s.id)))
  const filled: FilledModule<T>[] = []
  for (const r of requests) {
    const stories: T[] = []
    for (const s of r.candidates) {
      if (stories.length >= Math.max(0, r.count)) break
      if (taken.has(String(s.id))) continue
      taken.add(String(s.id))
      stories.push(s)
    }
    if (stories.length > 0) filled.push({ key: r.key, heading: r.heading, href: r.href, ...(r.swatch ? { swatch: r.swatch } : {}), stories })
  }
  return filled
}

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

/** The stand-in when no module has anything: the newest stories nothing above shows, headed "Latest stories", linking to all of them. */
export function fallbackModule<T extends { id: Id }>(recent: readonly T[], shown: readonly { id: Id }[], count: number = MODULE_COUNT.fallback + 1): FilledModule<T> | null {
  const taken = new Set(shown.map((s) => String(s.id)))
  const stories = recent.filter((s) => !taken.has(String(s.id))).slice(0, Math.max(0, count))
  return stories.length > 0 ? { key: 'latest', heading: 'Latest stories', href: ALL_STORIES_HREF, stories } : null
}

/**
 * Whether the news band (the sections, "All stories" and the sponsor rail beside them) is drawn, and whether it has an "All stories" link. The band
 * must not depend on there being stories left for the sections: when the lead, the Briefing and the feature have used every story there are no
 * section runs, but the page has news, so the link to all of it and any placements still belong on it. Pure.
 */
export function newsBand(input: { sectionRuns: number; railTiles: number; hasNews: boolean }): { show: boolean; allStoriesLink: boolean } {
  return { show: input.sectionRuns > 0 || input.railTiles > 0 || input.hasNews, allStoriesLink: input.hasNews }
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
