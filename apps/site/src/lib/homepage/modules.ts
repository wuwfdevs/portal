// The news modules of the home page: a titled run of stories from one section, each linking to its section page. Editors choose which
// sections, in what order, and how many stories each shows; this file decides what each one holds. Pure: the loader hands it stories the
// public may already read.
//
// A story appears once on the page: the lead, the Briefing and the fellowship feature take theirs first, then each module in order
// takes the newest of its section that nothing above has shown. A module left with nothing is left out rather than drawn empty, and when
// no module has anything (no sections set up yet, or a fresh site) one "Latest stories" run stands in, so the page is never blank.

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
  count: number
  /** The section's newest published stories, newest first (more than `count`, to absorb what is shown above). */
  candidates: readonly T[]
}

export interface FilledModule<T> {
  key: string
  heading: string
  href: string | null
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
    if (stories.length > 0) filled.push({ key: r.key, heading: r.heading, href: r.href, stories })
  }
  return filled
}

/**
 * The picture frame of a lead card that spans columns (`leadSpanClass`), as a whole Tailwind class. A 3:2 frame at two or three columns wide would be as tall as the rest
 * of the row put together, and the card beside it would stretch to match and leave a blank panel; so the frame gets wider as the card does: 2:1 across a tablet's row, 3:1 over
 * two of three columns (measured: about as tall as its neighbour's picture and words) and 7:2 over all three, where nothing sits beside it. A card that does not span keeps 3:2, and a phone is always 3:2. Pure.
 */
export function leadFrameClass(count: number): string {
  const n = Math.max(0, Math.floor(count))
  const tablet = n % 2 === 1 ? 'sm:aspect-[2/1]' : ''
  const wide = (n + 1) % 3 === 0 ? 'lg:aspect-[3/1]' : n % 3 === 1 ? 'lg:aspect-[7/2]' : n % 2 === 1 ? 'lg:aspect-[3/2]' : ''
  return [tablet, wide].filter(Boolean).join(' ')
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
