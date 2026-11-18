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

/** The stand-in when no module has anything: the newest stories nothing above shows, headed "Latest stories", linking to all of them. */
export function fallbackModule<T extends { id: Id }>(recent: readonly T[], shown: readonly { id: Id }[], count: number = MODULE_COUNT.fallback + 1): FilledModule<T> | null {
  const taken = new Set(shown.map((s) => String(s.id)))
  const stories = recent.filter((s) => !taken.has(String(s.id))).slice(0, Math.max(0, count))
  return stories.length > 0 ? { key: 'latest', heading: 'Latest stories', href: ALL_STORIES_HREF, stories } : null
}
